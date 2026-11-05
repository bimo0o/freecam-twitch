(() => {
  const layout = Object.freeze({
    width: 1920, height: 1080,
    game: { x: 0, y: 0, width: 1600, height: 900 },
    camera: { x: 1600, y: 900, width: 320, height: 180 },
    marker: { x: 1504, y: 1016, width: 48, height: 48 }
  });
  const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
  function placement(value) {
    const finite = (n, fallback) => typeof n === 'number' && Number.isFinite(n) ? n : fallback;
    return { x: clamp(finite(value?.x, .96), 0, 1), y: clamp(finite(value?.y, .94), 0, 1), width: clamp(finite(value?.width, .28), .12, .65), hidden: value?.hidden === true };
  }
  function rect(p, w, h) {
    const width = Math.min(w * p.width, h * 16 / 9), height = width * 9 / 16;
    return { width, height, left: p.x * Math.max(0, w - width), top: p.y * Math.max(0, h - height) };
  }
  function crop(region, w, h) {
    return [region.x * w / layout.width, region.y * h / layout.height, region.width * w / layout.width, region.height * h / layout.height];
  }
  function quality(w,h) { return { gameWidth:Math.round(layout.game.width*w/layout.width),gameHeight:Math.round(layout.game.height*h/layout.height),cameraWidth:Math.round(layout.camera.width*w/layout.width),cameraHeight:Math.round(layout.camera.height*h/layout.height) }; }
  function markerMatches(data, size = 8) {
    const samples = [[2, 2, [0, 255, 0]], [6, 2, [255, 0, 255]], [2, 6, [0, 255, 255]], [6, 6, [255, 255, 255]]];
    return samples.every(([x, y, color]) => color.every((v, i) => Math.abs(data[(y * size + x) * 4 + i] - v) < 65));
  }
  globalThis.FreecamPackedCore = Object.freeze({ layout, clamp, placement, rect, crop, markerMatches, quality });
})();
