// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (c) 2026 bimo0o. Native OBS module only.
// OBS SDK ABI: 33.0.1 only. The original scene is never modified.
#define WIN32_LEAN_AND_MEAN
// Windows headers have a required order; keep this block out of include sorting.
// clang-format off
#include <winsock2.h>
#include <windows.h>
#include <shellapi.h>
// clang-format on
#include <algorithm>
#include <atomic>
#include <chrono>
#include <cmath>
#include <condition_variable>
#include <deque>
#include <fstream>
#include <graphics/matrix4.h>
#include <map>
#include <mutex>
#include <obs-frontend-api.h>
#include <obs-module.h>
#include <string>
#include <thread>
#include <vector>
OBS_DECLARE_MODULE()
MODULE_EXPORT const char *obs_module_name() { return "Freecam live prototype"; }
MODULE_EXPORT const char *obs_module_description() {
  return "Private scene background capture and H.264 SEI transport";
}
namespace {
struct Rect {
  int x = 0, y = 0, w = 640, h = 360;
  bool valid = false;
};
struct Patch {
  Rect rect;
  std::vector<uint8_t> data;
};
struct Filter {
  obs_source_t *source;
  std::string camera;
  int64_t request = 0;
};
Filter *activeFilter = nullptr;
std::mutex mutex;
std::condition_variable arrived;
std::map<int64_t, Patch> patches;
std::map<int64_t, Rect> geometries;
obs_scene_t *originalScene = nullptr, *background = nullptr, *cropScene = nullptr;
obs_sceneitem_t *cameraItem = nullptr, *cropItem = nullptr;
std::map<obs_output_t *, int64_t> reorderOffsets;
obs_view_t *view = nullptr;
obs_output_t *sink = nullptr;
obs_encoder_t *encoder = nullptr;
std::vector<obs_output_t *> outputs;
std::atomic<bool> prepared{false}, serving{false}, sceneMatches{false}, sawReordering{false};
bool tickInstalled = false;
bool codecWarning = false;
bool wsaReady = false;
Filter *testFilter = nullptr;
obs_source_t *testBackground = nullptr;
int64_t testStarted = 0;
bool testStop = false;
std::atomic<uint64_t> paired{0}, missing{0};
std::string message = "Not prepared";
std::thread server;
SOCKET listener = INVALID_SOCKET;
unsigned port = 0;
struct Mirror {
  obs_sceneitem_t *original, *copy;
};
std::vector<Mirror> mirrored;
struct Rate {
  int64_t time;
  uint64_t all, extra;
  bool stream;
};
std::deque<Rate> rates;
int64_t clockUs() {
  return std::chrono::duration_cast<std::chrono::microseconds>(std::chrono::steady_clock::now().time_since_epoch())
      .count();
}
bool selfTestAllowed() {
  if (!getenv("FREECAM_OBS_SELFTEST"))
    return false;
  const char *binary = obs_get_module_binary_path(obs_current_module());
  char resolved[MAX_PATH]{};
  if (!binary || !GetFullPathNameA(binary, MAX_PATH, resolved, nullptr))
    return false;
  std::string path = resolved;
  std::replace(path.begin(), path.end(), '\\', '/');
  return path.find("/.tools/obs-sandbox/") != std::string::npos;
}
void publishStatus(Filter *f, const std::string &s) {
  if (!f)
    return;
  auto *settings = obs_source_get_settings(f->source);
  obs_data_set_string(settings, "freecamStatus", s.c_str());
  obs_data_set_bool(settings, "freecamReady", prepared);
  std::string url = "http://127.0.0.1:" + std::to_string(port) + "/";
  obs_data_set_string(settings, "freecamPanelUrl", port ? url.c_str() : "");
  obs_data_release(settings);
}
void status(const std::string &s) {
  std::lock_guard<std::mutex> lock(mutex);
  message = s;
  publishStatus(activeFilter, s);
  blog(LOG_INFO, "[Freecam] %s", s.c_str());
}
uint32_t crc(const uint8_t *p, size_t n) {
  uint32_t c = ~0u;
  for (size_t i = 0; i < n; i++) {
    c ^= p[i];
    for (int b = 0; b < 8; b++)
      c = (c >> 1) ^ ((c & 1) ? 0xedb88320u : 0);
  }
  return ~c;
}
void put(std::vector<uint8_t> &v, uint64_t n, int bytes) {
  for (int i = 0; i < bytes; i++)
    v.push_back(uint8_t(n >> (8 * i)));
}
std::vector<uint8_t> sei(const Patch &patch, uint32_t id, int64_t pts) {
  std::vector<uint8_t> payload = {'F', 'r', 'e', 'e', 'c', 'a', 'm', '-', 'S', 'E', 'I', '-', '0', '0', '0', '1'},
                       packet;
  put(packet, 0x31435346, 4);
  put(packet, id, 4);
  put(packet, std::max<int64_t>(0, pts), 8);
  for (int n : {patch.rect.x, patch.rect.y, patch.rect.w, patch.rect.h})
    put(packet, n, 2);
  put(packet, patch.data.size(), 4);
  packet.insert(packet.end(), patch.data.begin(), patch.data.end());
  put(packet, crc(packet.data(), packet.size()), 4);
  payload.insert(payload.end(), packet.begin(), packet.end());
  std::vector<uint8_t> rbsp = {5};
  size_t size = payload.size();
  while (size >= 255) {
    rbsp.push_back(255);
    size -= 255;
  }
  rbsp.push_back(uint8_t(size));
  rbsp.insert(rbsp.end(), payload.begin(), payload.end());
  rbsp.push_back(128);
  std::vector<uint8_t> result = {0, 0, 0, 1, 6};
  int zeros = 0;
  for (uint8_t byte : rbsp) {
    if (zeros >= 2 && byte <= 3) {
      result.push_back(3);
      zeros = 0;
    }
    result.push_back(byte);
    zeros = byte == 0 ? zeros + 1 : 0;
  }
  return result;
}
Rect geometry() {
  Rect r;
  if (!cameraItem || obs_sceneitem_get_scene(cameraItem) != originalScene || !obs_sceneitem_visible(cameraItem))
    return r;
  obs_transform_info info{};
  obs_sceneitem_get_info2(cameraItem, &info);
  if (std::fabs(info.rot) > .01f || info.bounds_type != OBS_BOUNDS_NONE || info.scale.x <= 0 || info.scale.y <= 0)
    return r;
  obs_sceneitem_force_update_transform(cameraItem);
  matrix4 box;
  obs_sceneitem_get_box_transform(cameraItem, &box);
  r.x = int(std::floor(box.t.x));
  r.y = int(std::floor(box.t.y));
  r.w = int(std::ceil(box.t.x + box.x.x)) - r.x;
  r.h = int(std::ceil(box.t.y + box.y.y)) - r.y;
  r.valid = r.x >= 0 && r.y >= 0 && r.w > 0 && r.h > 0 && r.x + r.w <= 1920 && r.y + r.h <= 1080;
  return r;
}
void tick(void *, float) {
  if (!prepared)
    return;
  if (testBackground && selfTestAllowed()) {
    const uint32_t palette[] = {0xffaa5500, 0xff22aa44, 0xffaa2288, 0xff2299aa};
    auto *settings = obs_data_create();
    obs_data_set_int(settings, "color", palette[(obs_get_video_frame_time() / 100000000) % 4]);
    obs_source_update(testBackground, settings);
    obs_data_release(settings);
  }
  if (testStarted && !testStop && clockUs() - testStarted > 8000000) {
    testStop = true;
    obs_queue_task(OBS_TASK_UI, [](void *) { obs_frontend_recording_stop(); }, nullptr, false);
  }
  Rect r = geometry();
  size_t index = 0;
  bool layout = true;
  std::pair<size_t *, bool *> context{&index, &layout};
  obs_scene_enum_items(
      originalScene,
      [](obs_scene_t *, obs_sceneitem_t *item, void *data) {
        auto *state = (std::pair<size_t *, bool *> *)data;
        size_t i = (*state->first)++;
        if (i >= mirrored.size() || mirrored[i].original != item)
          *state->second = false;
        return true;
      },
      &context);
  if (index != mirrored.size())
    layout = false;
  for (const auto &pair : mirrored) {
    if (obs_sceneitem_get_scene(pair.original) != originalScene) {
      layout = false;
      continue;
    }
    obs_transform_info info{};
    obs_sceneitem_get_info2(pair.original, &info);
    obs_sceneitem_set_info2(pair.copy, &info);
    obs_sceneitem_crop crop{};
    obs_sceneitem_get_crop(pair.original, &crop);
    obs_sceneitem_set_crop(pair.copy, &crop);
    obs_sceneitem_set_visible(pair.copy, pair.original != cameraItem && obs_sceneitem_visible(pair.original));
  }
  if (!layout)
    r.valid = false;
  if (r.valid && cropItem) {
    vec2 scale, pos;
    vec2_set(&scale, 640.f / r.w, 360.f / r.h);
    vec2_set(&pos, -r.x * scale.x, -r.y * scale.y);
    obs_sceneitem_set_scale(cropItem, &scale);
    obs_sceneitem_set_pos(cropItem, &pos);
  }
  std::lock_guard<std::mutex> lock(mutex);
  geometries[int64_t(obs_get_video_frame_time() / 1000)] = r;
  while (geometries.size() > 180)
    geometries.erase(geometries.begin());
}
int64_t stamp(const encoder_packet *p) {
  return p->sys_dts_usec + (p->pts - p->dts) * 1000000LL * p->timebase_num / p->timebase_den;
}
void patchPacket(void *, encoder_packet *p) {
  if (!p || p->type != OBS_ENCODER_VIDEO || !prepared)
    return;
  const int64_t time = stamp(p);
  Patch patch;
  {
    std::lock_guard<std::mutex> lock(mutex);
    auto it = geometries.lower_bound(time - 2);
    if (it == geometries.end() || std::llabs(it->first - time) > 2)
      return;
    patch.rect = it->second;
  }
  if (patch.rect.valid) {
    if (p->keyframe) {
      uint8_t *data = nullptr;
      size_t bytes = 0;
      if (obs_encoder_get_extra_data(encoder, &data, &bytes))
        patch.data.insert(patch.data.end(), data, data + bytes);
    }
    patch.data.insert(patch.data.end(), p->data, p->data + p->size);
    if (patch.data.size() > 1024 * 1024)
      patch.data.clear();
  }
  {
    std::lock_guard<std::mutex> lock(mutex);
    patches[time] = std::move(patch);
    while (patches.size() > 120)
      patches.erase(patches.begin());
  }
  arrived.notify_all();
}
bool sinkStart(void *data) {
  auto *output = (obs_output_t *)data;
  return obs_output_initialize_encoders(output, OBS_OUTPUT_VIDEO) &&
         obs_output_begin_data_capture(output, OBS_OUTPUT_VIDEO);
}
void packet(void *, encoder_packet *, encoder_packet_time *, void *);
// OBS 33.0.1's reference-counted packet layout is pinned here. No shared
// packet is reallocated in place. This must be replaced by a public allocator
// if OBS introduces one; the module refuses a different libobs version.
void replacePacket(encoder_packet *p, const std::vector<uint8_t> &data) {
  encoder_packet result = *p;
  auto *refs = (long *)bmalloc(sizeof(long) + data.size());
  *refs = 1;
  result.data = (uint8_t *)(refs + 1);
  result.size = data.size();
  memcpy(result.data, data.data(), data.size());
  obs_encoder_packet_release(p);
  *p = result;
}
void transport(obs_output_t *output, encoder_packet *p, encoder_packet_time *, void *) {
  if (!p || !prepared)
    return;
  const bool isH264 =
      p->type == OBS_ENCODER_VIDEO && p->encoder && strcmp(obs_encoder_get_codec(p->encoder), "h264") == 0;
  const bool annexB =
      p->size >= 4 && p->data[0] == 0 && p->data[1] == 0 && (p->data[2] == 1 || (p->data[2] == 0 && p->data[3] == 1));
  if (p->type == OBS_ENCODER_VIDEO && (!isH264 || !annexB) && !codecWarning) {
    codecWarning = true;
    status("Main encoder must produce H.264 Annex B; video remains unchanged");
  }
  const size_t before = p->size;
  size_t extra = 0;
  if (isH264 && p->pts != p->dts)
    sawReordering = true;
  if (isH264 && annexB) {
    int64_t offset = 0;
    {
      std::lock_guard<std::mutex> lock(mutex);
      auto it = reorderOffsets.find(output);
      if (it == reorderOffsets.end()) {
        if (!p->keyframe)
          return;
        it = reorderOffsets.emplace(output, (p->pts - p->dts) * 1000000LL * p->timebase_num / p->timebase_den).first;
      }
      offset = it->second;
    }
    const int64_t time = stamp(p) - offset;
    Patch patch;
    bool found = false;
    {
      std::unique_lock<std::mutex> lock(mutex);
      auto find = [&]() {
        auto it = patches.lower_bound(time - 2);
        if (it != patches.end() && std::llabs(it->first - time) <= 2) {
          patch = it->second;
          // Keep the bounded frame cache: streaming and recording may need
          // the same background frame on separate output callbacks.
          found = true;
          return true;
        }
        return false;
      };
      if (!find())
        arrived.wait_for(lock, std::chrono::milliseconds(4), find);
      if (!found) {
        auto it = geometries.lower_bound(time - 2);
        if (it != geometries.end() && std::llabs(it->first - time) <= 2)
          patch.rect = it->second;
      }
    }
    if (!sceneMatches)
      patch.data.clear();
    if (found && !patch.data.empty())
      paired++;
    else
      missing++;
    if (!patch.rect.valid) {
      patch.rect = {0, 0, 640, 360, true};
      patch.data.clear();
    }
    const int64_t pts = p->pts * 1000000LL * p->timebase_num / p->timebase_den;
    auto metadata = sei(patch, uint32_t(p->pts), pts);
    std::vector<uint8_t> packed;
    packed.reserve(p->size + metadata.size());
    packed.insert(packed.end(), metadata.begin(), metadata.end());
    packed.insert(packed.end(), p->data, p->data + p->size);
    replacePacket(p, packed);
    extra = metadata.size();
  }
  std::lock_guard<std::mutex> lock(mutex);
  const int64_t now = clockUs();
  rates.push_back({now, uint64_t(before + extra), extra, bool(obs_output_get_flags(output) & OBS_OUTPUT_SERVICE)});
  while (!rates.empty() && rates.front().time < now - 2000000)
    rates.pop_front();
}
void hook(obs_output_t *output) {
  if (!output)
    return;
  for (auto *p : outputs)
    if (p == output) {
      obs_output_release(output);
      return;
    }
  obs_output_add_packet_callback(output, transport, nullptr);
  outputs.push_back(output);
}
void stop() {
  prepared = false;
  sceneMatches = false;
  if (tickInstalled) {
    obs_remove_tick_callback(tick, nullptr);
    tickInstalled = false;
  }
  for (auto *output : outputs) {
    obs_output_remove_packet_callback(output, transport, nullptr);
    obs_output_release(output);
  }
  outputs.clear();
  if (sink) {
    obs_output_stop(sink);
    obs_output_release(sink);
    sink = nullptr;
  }
  if (encoder) {
    obs_encoder_release(encoder);
    encoder = nullptr;
  }
  if (view) {
    obs_view_remove(view);
    obs_view_destroy(view);
    view = nullptr;
  }
  for (auto pair : mirrored) {
    obs_sceneitem_release(pair.original);
    obs_sceneitem_release(pair.copy);
  }
  mirrored.clear();
  if (cropScene) {
    obs_scene_release(cropScene);
    cropScene = nullptr;
  }
  if (background) {
    obs_scene_release(background);
    background = nullptr;
  }
  if (cameraItem) {
    obs_sceneitem_release(cameraItem);
    cameraItem = nullptr;
  }
  if (originalScene) {
    obs_scene_release(originalScene);
    originalScene = nullptr;
  }
  std::lock_guard<std::mutex> lock(mutex);
  patches.clear();
  geometries.clear();
  reorderOffsets.clear();
  message = "Stopped";
  publishStatus(activeFilter, message);
  activeFilter = nullptr;
}
bool prepare(Filter *filter) {
  if (obs_frontend_streaming_active() || obs_frontend_recording_active()) {
    status("Stop streaming and recording before preparing");
    return false;
  }
  stop();
  activeFilter = filter;
  obs_source_t *parent = obs_filter_get_parent(filter->source);
  auto *scene = parent ? obs_scene_from_source(parent) : nullptr;
  obs_video_info video{};
  obs_get_video_info(&video);
  if (!scene || video.output_width != 1920 || video.output_height != 1080 || video.base_width != 1920 ||
      video.base_height != 1080 || video.fps_num != 30 * video.fps_den) {
    status("This build requires a 1920x1080 scene and 30 FPS");
    return false;
  }
  cameraItem = obs_scene_find_source(scene, filter->camera.c_str());
  if (!cameraItem) {
    status("Select a top-level camera in this scene");
    return false;
  }
  size_t cameraCount = 0;
  std::pair<obs_source_t *, size_t *> selection{obs_sceneitem_get_source(cameraItem), &cameraCount};
  obs_scene_enum_items(scene, [](obs_scene_t *, obs_sceneitem_t *item, void *data) {
    auto *selection = static_cast<std::pair<obs_source_t *, size_t *> *>(data);
    if (obs_sceneitem_get_source(item) == selection->first) ++*selection->second;
    return true;
  }, &selection);
  if (cameraCount != 1) {
    cameraItem = nullptr;
    status("Camera source must occur exactly once in this scene");
    return false;
  }
  obs_sceneitem_addref(cameraItem);
  originalScene = obs_scene_get_ref(scene);
  Rect r = geometry();
  if (!r.valid) {
    stop();
    status("Camera requires positive scale, no rotation or bounds, inside frame");
    return false;
  }
  background = obs_scene_duplicate(scene, "Freecam private background", OBS_SCENE_DUP_PRIVATE_REFS);
  auto *hidden = obs_scene_find_source(background, filter->camera.c_str());
  if (!hidden) {
    stop();
    return false;
  }
  obs_sceneitem_set_visible(hidden, false);
  std::vector<obs_sceneitem_t *> originals, copies;
  auto collect = [](obs_scene_t *, obs_sceneitem_t *item, void *data) {
    obs_sceneitem_addref(item);
    ((std::vector<obs_sceneitem_t *> *)data)->push_back(item);
    return true;
  };
  obs_scene_enum_items(originalScene, collect, &originals);
  obs_scene_enum_items(background, collect, &copies);
  if (originals.size() != copies.size()) {
    for (auto *i : originals)
      obs_sceneitem_release(i);
    for (auto *i : copies)
      obs_sceneitem_release(i);
    stop();
    return false;
  }
  for (size_t i = 0; i < originals.size(); i++)
    mirrored.push_back({originals[i], copies[i]});
  cropScene = obs_scene_create_private("Freecam private crop");
  cropItem = obs_scene_add(cropScene, obs_scene_get_source(background));
  obs_sceneitem_set_alignment(cropItem, OBS_ALIGN_LEFT | OBS_ALIGN_TOP);
  view = obs_view_create();
  obs_view_set_source(view, 0, obs_scene_get_source(cropScene));
  video.base_width = video.output_width = 640;
  video.base_height = video.output_height = 360;
  video.output_format = VIDEO_FORMAT_NV12;
  video_t *frames = obs_view_add2(view, &video);
  if (!frames) {
    stop();
    status("Cannot create background video view");
    return false;
  }
  obs_data_t *settings = obs_data_create();
  obs_data_set_string(settings, "rate_control", "CRF");
  obs_data_set_int(settings, "crf", 23);
  obs_data_set_string(settings, "preset", "veryfast");
  obs_data_set_string(settings, "profile", "high");
  obs_data_set_string(settings, "tune", "zerolatency");
  obs_data_set_int(settings, "keyint_sec", 1);
  obs_data_set_string(settings, "x264opts", "bframes=0 repeat-headers=1 annexb=1");
  encoder = obs_video_encoder_create("obs_x264", "Freecam background encoder", settings, nullptr);
  obs_data_release(settings);
  if (!encoder) {
    stop();
    status("OBS x264 encoder unavailable");
    return false;
  }
  obs_encoder_set_video(encoder, frames);
  sink = obs_output_create("freecam_patch_sink", "Freecam local background sink", nullptr, nullptr);
  obs_output_set_video_encoder(sink, encoder);
  prepared = true;
  tick(nullptr, 0);
  obs_add_tick_callback(tick, nullptr);
  tickInstalled = true;
  if (!obs_output_start(sink)) {
    stop();
    status("Background encoder did not start");
    return false;
  }
  obs_source_t *current = obs_frontend_get_current_scene();
  sceneMatches = current == parent;
  if (current)
    obs_source_release(current);
  paired = 0;
  missing = 0;
  sawReordering = false;
  codecWarning = false;
  status("Prepared. Start a LOCAL recording first.");
  return true;
}
void runSelftest(void *);
void frontend(obs_frontend_event event, void *) {
  if (event == OBS_FRONTEND_EVENT_FINISHED_LOADING && selfTestAllowed()) {
    obs_queue_task(OBS_TASK_UI, runSelftest, nullptr, false);
    return;
  }
  if (event == OBS_FRONTEND_EVENT_EXIT) {
    stop();
    return;
  }
  if (!prepared)
    return;
  if (event == OBS_FRONTEND_EVENT_SCENE_CHANGED) {
    obs_source_t *current = obs_frontend_get_current_scene();
    sceneMatches = current == obs_scene_get_source(originalScene);
    if (current)
      obs_source_release(current);
  }
  if (event == OBS_FRONTEND_EVENT_STREAMING_STARTING || event == OBS_FRONTEND_EVENT_STREAMING_STARTED)
    hook(obs_frontend_get_streaming_output());
  if (event == OBS_FRONTEND_EVENT_RECORDING_STARTING || event == OBS_FRONTEND_EVENT_RECORDING_STARTED)
    hook(obs_frontend_get_recording_output());
  if (event == OBS_FRONTEND_EVENT_SCENE_COLLECTION_CHANGING)
    stop();
  if (event == OBS_FRONTEND_EVENT_RECORDING_STOPPED && selfTestAllowed()) {
    const char *folder = getenv("FREECAM_OBS_SELFTEST_DIR");
    if (folder) {
      std::ofstream file(std::string(folder) + "/native-result.json");
      file << "{\"paired\":" << paired.load() << ",\"missing\":" << missing.load()
           << ",\"bFramesObserved\":" << (sawReordering ? "true" : "false") << "}";
    }
    if (!getenv("FREECAM_OBS_WIZARDTEST")) {
      stop();
      PostQuitMessage(0);
    }
  }
}

std::string json() {
  std::lock_guard<std::mutex> lock(mutex);
  const int64_t now = clockUs();
  uint64_t all = 0, extra = 0, stream = 0, streamExtra = 0, record = 0;
  for (const auto &r : rates)
    if (r.time >= now - 2000000) {
      all += r.all;
      extra += r.extra;
      if (r.stream) {
        stream += r.all;
        streamExtra += r.extra;
      } else
        record += r.all;
    }
  return std::string("{\"prepared\":") + (prepared ? "true" : "false") +
         ",\"totalMbps\":" + std::to_string(all * 8 / 2000000.) +
         ",\"freecamMbps\":" + std::to_string(extra * 8 / 2000000.) +
         ",\"streamMbps\":" + std::to_string(stream * 8 / 2000000.) +
         ",\"streamFreecamMbps\":" + std::to_string(streamExtra * 8 / 2000000.) +
         ",\"recordMbps\":" + std::to_string(record * 8 / 2000000.) +
         ",\"sharePercent\":" + std::to_string(all ? double(extra) * 100 / all : 0) +
         ",\"paired\":" + std::to_string(paired.load()) + ",\"missing\":" + std::to_string(missing.load()) + "}";
}
const char *page = R"HTML(<!doctype html><html lang="ru"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Freecam · расходы OBS</title><style>body{background:#100c17;color:#f5edff;font:16px system-ui;padding:24px;max-width:760px;margin:auto}h1,output{color:#c79aff}.card{padding:20px;border:1px solid #63447a;border-radius:14px;margin:16px 0}small{color:#beafcc;line-height:1.6}dl{display:grid;grid-template-columns:1fr auto;gap:12px}dd{margin:0;font-variant-numeric:tabular-nums}#state{color:#c79aff}</style><h1>freecam · OBS</h1><p>Панель расходов · 1080p30 · alpha</p><div class="card"><p id="state">Подключение…</p><dl id="data"></dl></div><small>Сжатые пакеты за последние две секунды, без сетевых накладных расходов. Профиль фона: 640×360. Ключ трансляции не используется.</small><script>async function poll(){try{const s=await(await fetch('/status')).json();document.getElementById('state').textContent=s.prepared?'Freecam подготовлен':'Freecam остановлен';const rows=[['Выходы суммарно',s.totalMbps.toFixed(2)+' Мбит/с'],['Данные Freecam',s.freecamMbps.toFixed(3)+' Мбит/с'],['Доля Freecam',s.sharePercent.toFixed(2)+'%'],['Трансляция',s.streamMbps.toFixed(2)+' Мбит/с'],['Freecam в трансляции',s.streamFreecamMbps.toFixed(3)+' Мбит/с'],['Запись',s.recordMbps.toFixed(2)+' Мбит/с'],['Кадров с фоном',s.paired],['Без точного фона',s.missing]];document.getElementById('data').replaceChildren(...rows.flatMap(([name,value])=>{const dt=document.createElement('dt'),dd=document.createElement('dd');dt.textContent=name;dd.textContent=value;return [dt,dd]}));}catch{document.getElementById('state').textContent='Связь с OBS закрыта';}}poll();setInterval(poll,1000)</script></html>)HTML";
void startServer() {
  WSADATA data;
  if (WSAStartup(MAKEWORD(2, 2), &data))
    return;
  wsaReady = true;
  listener = socket(AF_INET, SOCK_STREAM, IPPROTO_TCP);
  sockaddr_in address{};
  address.sin_family = AF_INET;
  address.sin_addr.s_addr = htonl(INADDR_LOOPBACK);
  if (bind(listener, (sockaddr *)&address, sizeof(address)) || listen(listener, 4)) {
    closesocket(listener);
    listener = INVALID_SOCKET;
    return;
  }
  int bytes = sizeof(address);
  getsockname(listener, (sockaddr *)&address, &bytes);
  port = ntohs(address.sin_port);
  serving = true;
  server = std::thread([]() {
    while (serving) {
      SOCKET client = accept(listener, nullptr, nullptr);
      if (client == INVALID_SOCKET)
        break;
      DWORD timeout = 1000;
      setsockopt(client, SOL_SOCKET, SO_RCVTIMEO, (char *)&timeout, sizeof(timeout));
      char request[2048] = {};
      int n = recv(client, request, sizeof(request) - 1, 0);
      std::string body = n > 0 && strncmp(request, "GET /status ", 12) == 0 ? json() : page;
      std::string response =
          "HTTP/1.1 200 OK\r\nConnection: close\r\nCache-Control: no-store\r\nContent-Type: " +
          std::string(n > 0 && strncmp(request, "GET /status ", 12) == 0 ? "application/json"
                                                                         : "text/html; charset=utf-8") +
          "\r\nContent-Length: " + std::to_string(body.size()) + "\r\n\r\n" + body;
      send(client, response.data(), int(response.size()), 0);
      closesocket(client);
    }
  });
}
void openPanel(void *) {
  std::string url = "http://127.0.0.1:" + std::to_string(port) + "/";
  ShellExecuteA(nullptr, "open", url.c_str(), nullptr, nullptr, SW_SHOWNORMAL);
}
const char *filterName(void *) { return "Freecam background · private prototype"; }
void *createFilter(obs_data_t *settings, obs_source_t *source) {
  auto *filter = new Filter{source, obs_data_get_string(settings, "camera"), obs_data_get_int(settings, "requestId")};
  if (strcmp(obs_source_get_name(source), "FreecamSelftestController") == 0)
    testFilter = filter;
  return filter;
}
void updateFilter(void *data, obs_data_t *settings) {
  auto *f = (Filter *)data;
  f->camera = obs_data_get_string(settings, "camera");
  const int64_t request = obs_data_get_int(settings, "requestId");
  if (request > 0 && request != f->request) {
    f->request = request;
    struct Task {
      Filter *f;
      obs_source_t *hold;
      bool start;
    };
    auto *task =
        new Task{f, obs_source_get_ref(f->source), strcmp(obs_data_get_string(settings, "command"), "prepare") == 0};
    obs_queue_task(
        OBS_TASK_UI,
        [](void *ptr) {
          auto *t = (Task *)ptr;
          if (t->start)
            prepare(t->f);
          else
            stop();
          obs_source_release(t->hold);
          delete t;
        },
        task, false);
  }
}
void destroyFilter(void *data) {
  auto *f = (Filter *)data;
  if (prepared && originalScene && obs_filter_get_parent(f->source) == obs_scene_get_source(originalScene))
    stop();
  if (activeFilter == f)
    activeFilter = nullptr;
  delete f;
}
obs_properties_t *properties(void *data) {
  auto *f = (Filter *)data;
  auto *props = obs_properties_create();
  auto *camera = obs_properties_add_list(props, "camera", "Camera source in this scene", OBS_COMBO_TYPE_LIST,
                                         OBS_COMBO_FORMAT_STRING);
  obs_source_t *parent = f ? obs_filter_get_parent(f->source) : nullptr;
  if (parent) {
    auto *scene = obs_scene_from_source(parent);
    if (scene)
      obs_scene_enum_items(
          scene,
          [](obs_scene_t *, obs_sceneitem_t *item, void *ptr) {
            const char *name = obs_source_get_name(obs_sceneitem_get_source(item));
            obs_property_list_add_string((obs_property_t *)ptr, name, name);
            return true;
          },
          camera);
  }
  obs_properties_add_button2(
      props, "prepare", "Prepare (does not start streaming)",
      [](obs_properties_t *, obs_property_t *, void *context) {
        prepare((Filter *)context);
        return true;
      },
      f);
  obs_properties_add_button2(
      props, "stop", "Stop Freecam",
      [](obs_properties_t *, obs_property_t *, void *) {
        stop();
        return true;
      },
      f);
  std::string text;
  {
    std::lock_guard<std::mutex> lock(mutex);
    text = message;
  }
  obs_properties_add_text(props, "status", text.c_str(), OBS_TEXT_INFO);
  return props;
}
} // namespace
MODULE_EXPORT bool obs_module_load() {
  if (obs_get_version() != MAKE_SEMANTIC_VERSION(33, 0, 1)) {
    blog(LOG_ERROR, "[Freecam] Private ABI-pinned build requires OBS 33.0.1");
    return false;
  }
  obs_output_info out{};
  out.id = "freecam_patch_sink";
  out.flags = OBS_OUTPUT_VIDEO | OBS_OUTPUT_ENCODED;
  out.get_name = [](void *) { return "Freecam local patch sink"; };
  out.create = [](obs_data_t *, obs_output_t *o) -> void * { return o; };
  out.destroy = [](void *) {};
  out.start = sinkStart;
  out.stop = [](void *p, uint64_t) { obs_output_end_data_capture((obs_output_t *)p); };
  out.encoded_packet = patchPacket;
  out.encoded_video_codecs = "h264";
  obs_register_output(&out);
  obs_source_info source{};
  source.id = "freecam_restore";
  source.type = OBS_SOURCE_TYPE_FILTER;
  source.output_flags = OBS_SOURCE_VIDEO;
  source.get_name = filterName;
  source.create = createFilter;
  source.destroy = destroyFilter;
  source.update = updateFilter;
  source.get_properties = properties;
  source.video_render = [](void *p, gs_effect_t *) { obs_source_skip_video_filter(((Filter *)p)->source); };
  obs_register_source(&source);
  obs_frontend_add_event_callback(frontend, nullptr);
  startServer();
  obs_frontend_add_tools_menu_item("Freecam · local bitrate panel", openPanel, nullptr);
  return true;
}
MODULE_EXPORT void obs_module_unload() {
  obs_frontend_remove_event_callback(frontend, nullptr);
  obs_remove_tick_callback(tick, nullptr);
  stop();
  serving = false;
  if (listener != INVALID_SOCKET) {
    shutdown(listener, SD_BOTH);
    closesocket(listener);
  }
  if (server.joinable())
    server.join();
  if (wsaReady)
    WSACleanup();
}

namespace {
void runSelftest(void *) {
  for (uint32_t channel = 1; channel < 6; channel++)
    obs_set_output_source(channel, nullptr);
  auto *scene = obs_scene_create("FreecamSelftest");
  auto *bgSettings = obs_data_create();
  obs_data_set_int(bgSettings, "width", 1920);
  obs_data_set_int(bgSettings, "height", 1080);
  obs_data_set_int(bgSettings, "color", 0xffaa5500);
  auto *bg = obs_source_create("color_source_v3", "FreecamSelftestBackground", bgSettings, nullptr);
  obs_data_release(bgSettings);
  testBackground = bg;
  auto *camSettings = obs_data_create();
  obs_data_set_int(camSettings, "width", 640);
  obs_data_set_int(camSettings, "height", 360);
  obs_data_set_int(camSettings, "color", 0xff0033ff);
  auto *cam = obs_source_create("color_source_v3", "FreecamSelftestCamera", camSettings, nullptr);
  obs_data_release(camSettings);
  if (!scene || !bg || !cam) {
    status("Selftest sources unavailable");
    return;
  }
  obs_scene_add(scene, bg);
  auto *item = obs_scene_add(scene, cam);
  vec2 pos;
  vec2_set(&pos, 1240, 680);
  obs_sceneitem_set_pos(item, &pos);
  obs_sceneitem_set_alignment(item, OBS_ALIGN_LEFT | OBS_ALIGN_TOP);
  obs_frontend_set_current_scene(obs_scene_get_source(scene));
  if (getenv("FREECAM_OBS_WIZARDTEST")) {
    obs_source_release(cam);
    obs_source_release(bg);
    obs_scene_release(scene);
    return;
  }
  auto *settings = obs_data_create();
  obs_data_set_string(settings, "camera", obs_source_get_name(cam));
  auto *filter = obs_source_create_private("freecam_restore", "FreecamSelftestController", settings);
  obs_data_release(settings);
  obs_source_filter_add(obs_scene_get_source(scene), filter);
  Filter *controller = testFilter;
  if (prepare(controller)) {
    testStarted = clockUs();
    obs_frontend_recording_start();
  }
  obs_source_release(filter);
  obs_source_release(cam);
  obs_source_release(bg);
  obs_scene_release(scene);
}
} // namespace
MODULE_EXPORT void obs_module_post_load() {}
