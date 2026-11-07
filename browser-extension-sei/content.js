(function() {
	// src/extension-sei/player-controls.mjs
	function guardPlayerControls({ host, camera, root }) {
		const saved = /* @__PURE__ */ new Map();
		let closed = false, pending = false;
		const selectors = "button,a[href],input,select,[role=\"button\"],[role=\"slider\"],[role=\"menu\"],[role=\"menuitem\"],[data-a-target=\"player-controls\"],.player-controls";
		function set(element, name, value) {
			let record = saved.get(element);
			if (!record) {
				record = /* @__PURE__ */ new Map();
				saved.set(element, record);
			}
			if (!record.has(name)) record.set(name, {
				before: element.style.getPropertyValue(name),
				priority: element.style.getPropertyPriority(name),
				value
			});
			element.style.setProperty(name, value);
		}
		function restore(element, record) {
			for (const [name, p] of record) if (element.style.getPropertyValue(name) === p.value) {
				if (p.before) element.style.setProperty(name, p.before, p.priority);
				else element.style.removeProperty(name);
			}
		}
		function update() {
			pending = false;
			if (closed) return;
			camera.style.clipPath = "none";
			const active = /* @__PURE__ */ new Set();
			if (!host.hidden) for (const element of root.querySelectorAll(selectors)) {
				if (host.contains(element) || !element.getClientRects().length) continue;
				let layer = element;
				while (layer.parentElement && layer.parentElement !== root && !layer.parentElement.contains(host)) layer = layer.parentElement;
				if (layer.contains(host)) continue;
				active.add(layer);
				active.add(element);
				if (getComputedStyle(layer).position === "static") set(layer, "position", "relative");
				set(layer, "z-index", "2147483646");
				if (layer !== element) set(layer, "pointer-events", "none");
				set(element, "pointer-events", "auto");
			}
			for (const [element, record] of saved) if (!active.has(element)) {
				restore(element, record);
				saved.delete(element);
			}
		}
		function schedule() {
			if (!closed && !pending) {
				pending = true;
				requestAnimationFrame(update);
			}
		}
		root.addEventListener("pointermove", schedule, true);
		root.addEventListener("focusin", schedule, true);
		window.addEventListener("resize", schedule);
		document.addEventListener("fullscreenchange", schedule);
		const timer = setInterval(schedule, 150);
		schedule();
		return {
			schedule,
			close() {
				closed = true;
				clearInterval(timer);
				root.removeEventListener("pointermove", schedule, true);
				root.removeEventListener("focusin", schedule, true);
				window.removeEventListener("resize", schedule);
				document.removeEventListener("fullscreenchange", schedule);
				for (const [element, record] of saved) restore(element, record);
				saved.clear();
				camera.style.clipPath = "none";
			}
		};
	}
	Object.freeze({
		maxArea: 1,
		resumeArea: 1
	});
	function restorationArea(rect, frame = {
		width: 1920,
		height: 1080
	}) {
		if (![
			frame.width,
			frame.height,
			rect.x,
			rect.y,
			rect.width,
			rect.height
		].every(Number.isFinite) || frame.width <= 0 || frame.height <= 0 || rect.x < 0 || rect.y < 0 || rect.width <= 0 || rect.height <= 0 || rect.x + rect.width > frame.width || rect.y + rect.height > frame.height) throw Error("Invalid restoration rectangle");
		return rect.width * rect.height / (frame.width * frame.height);
	}
	function restorationPercent(value) {
		return Number.isInteger(value) && value >= 1 && value <= 100 ? value : 25;
	}
	function viewerAllowsRestoration(rect, percent) {
		return restorationArea(rect) <= restorationPercent(percent) / 100;
	}
	// src/extension-sei/content.mjs
	(() => {
		if (globalThis.FreecamSei) return;
		const patches = /* @__PURE__ */ new Map(), startedAt = performance.now();
		let appearance = {
			width: 28,
			radius: 0,
			x: .04,
			y: .07
		}, controlGuard;
		const profileKey = () => "camera:" + location.pathname.split("/")[1];
		function applyAppearance(value = {}) {
			appearance = {
				width: Math.max(10, Math.min(70, Number(value.width) || 28)),
				radius: Math.max(0, Math.min(48, Number(value.radius) || 0)),
				x: Math.max(0, Math.min(1, Number.isFinite(value.x) ? value.x : .04)),
				y: Math.max(0, Math.min(1, Number.isFinite(value.y) ? value.y : .07))
			};
			placement = {
				x: appearance.x,
				y: appearance.y,
				w: appearance.width / 100
			};
			if (wrap) {
				wrap.style.width = appearance.width + "%";
				wrap.style.borderRadius = appearance.radius + "px";
				const w = host.clientWidth, h = host.clientHeight;
				placement.x = Math.min(placement.x, Math.max(0, 1 - wrap.offsetWidth / (w || 1)));
				placement.y = Math.min(placement.y, Math.max(0, 1 - wrap.offsetHeight / (h || 1)));
				wrap.style.left = placement.x * 100 + "%";
				wrap.style.top = placement.y * 100 + "%";
				controlGuard?.schedule();
			}
		}
		function loadAppearance() {
			const key = profileKey();
			chrome.storage.local.get(key).then((v) => {
				if (key === profileKey()) applyAppearance(v[key]);
			}).catch(() => {});
		}
		function saveAppearance() {
			chrome.storage.local.set({ [profileKey()]: {
				...appearance,
				x: placement.x,
				y: placement.y,
				width: placement.w * 100
			} }).catch(() => {});
		}
		let workerCompatibility = false;
		const configureWorker = () => window.postMessage({
			tag: "freecam-worker-config",
			enabled: workerCompatibility
		}, location.origin);
		let route = location.pathname;
		let decoder, video, host, shadow, canvas, ctx, cam, cc, wrap, frameCallback, enabled = true, needsKey = true, decoded = 0, received = 0, hits = 0, misses = 0, tap = {}, lastError = "", lastMatch = 0, drag, placement = {
			x: .04,
			y: .07,
			w: .28
		}, surface, sc, epoch = 0, pumpTimer, disposed = false, restorationPaused = false, restorationPauseReason = "", maxRestorationPercent = 25, lastPresentedTime = null, nextAuxId = null, lastAuxTime = -Infinity;
		const key = (b) => {
			for (let i = 0; i < b.length - 4; i++) if (b[i] === 0 && b[i + 1] === 0 && (b[i + 2] === 1 && (b[i + 3] & 31) === 5 || b[i + 2] === 0 && b[i + 3] === 1 && (b[i + 4] & 31) === 5)) return true;
			return false;
		};
		function status() {
			return {
				workerCompatibility,
				workerBound: !!video?.dataset.freecamSeiMediaKey,
				maxPairDeltaMs,
				tapMissing: !tap.ready && performance.now() - startedAt > 5e3,
				sourceKind: video?.srcObject ? Object.prototype.toString.call(video.srcObject) : video?.currentSrc?.startsWith("blob:") ? "blob" : "other",
				enabled,
				restorationPaused,
				restorationPauseReason,
				maxRestorationPercent,
				received,
				decoded,
				hits,
				misses,
				cache: patches.size,
				queue: jobs.length,
				queueBytes: jobBytes,
				renderPixels: canvas ? canvas.width * canvas.height + cam.width * cam.height : 0,
				paused: !!video?.paused,
				tap,
				error: lastError,
				message: !enabled ? "Отключено" : restorationPaused ? "Восстановление приостановлено" : lastMatch > 0 && performance.now() - lastMatch < 1500 ? "Восстановление работает" : received ? "Данные есть. Ожидается совпадающий кадр видео." : tap.appends ? "Буферы плеера доступны, пакетов Freecam пока нет. Выберите Source." : "Ожидаются буферы плеера. Обновите канал после установки. Для MSE в worker включите режим совместимости и обновите канал."
			};
		}
		function original() {
			if (host) host.hidden = true;
		}
		function reset() {
			epoch++;
			clearTimeout(pumpTimer);
			pumpTimer = null;
			if (decoder && decoder.state !== "closed") decoder.close();
			decoder = null;
			needsKey = true;
			jobs.length = 0;
			jobBytes = 0;
			inflight.clear();
			for (const p of patches.values()) p.bitmap?.close();
			patches.clear();
			lastMatch = 0;
			lastError = "";
			restorationPaused = false;
			restorationPauseReason = "";
			lastPresentedTime = null;
			nextAuxId = null;
			lastAuxTime = -Infinity;
		}
		function attach() {
			if (disposed) return;
			if (route !== location.pathname) {
				route = location.pathname;
				loadAppearance();
				video?.cancelVideoFrameCallback?.(frameCallback);
				controlGuard?.close();
				host?.remove();
				host = null;
				video = null;
				reset();
				received = decoded = hits = misses = 0;
			}
			const v = [...document.querySelectorAll("video")].filter((v) => v.clientWidth > 200).sort((a, b) => b.clientWidth * b.clientHeight - a.clientWidth * a.clientHeight)[0];
			if (!v || v === video) return;
			reset();
			if (video) video.cancelVideoFrameCallback?.(frameCallback);
			controlGuard?.close();
			host?.remove();
			video = v;
			host = document.createElement("div");
			host.dataset.freecamSei = "true";
			host.style.cssText = "position:absolute;inset:0;z-index:0;pointer-events:none";
			const parent = v.parentElement;
			if (getComputedStyle(parent).position === "static") parent.style.position = "relative";
			shadow = host.attachShadow({ mode: "open" });
			shadow.innerHTML = "<style>:host{pointer-events:none}.game{position:absolute;inset:0;width:100%;height:100%;pointer-events:none}.camera{position:absolute;pointer-events:auto;touch-action:none;cursor:grab;border:0;box-shadow:none}.camera canvas{display:block;width:100%;height:100%}.camera{outline:2px solid transparent;outline-offset:2px;transition:box-shadow 140ms ease,outline-color 140ms ease;border-radius:0;overflow:hidden}.camera:hover,.camera:focus-visible{outline-color:transparent;box-shadow:none}.camera-tools{position:absolute;right:5px;top:5px;display:flex;gap:3px;padding:3px;background:#100c17d9;border-radius:7px;opacity:0;pointer-events:none;transition:opacity 120ms}.camera:hover .camera-tools,.camera:focus-within .camera-tools{opacity:1;pointer-events:auto}.camera-tools button{width:22px;height:22px;padding:0;border:0;border-radius:4px;background:#ffffff12;color:#f5edff;font:15px system-ui;cursor:pointer}.camera-tools button:hover,.camera-tools button:focus-visible{background:#c79aff;color:#170d21}.camera.dragging{cursor:grabbing;outline-color:transparent;box-shadow:none}@media(prefers-reduced-motion:reduce){.camera{transition:none}}</style><canvas class=\"game\"></canvas><div class=\"camera\"><canvas></canvas></div>";
			canvas = shadow.querySelector(".game");
			canvas.width = 1920;
			canvas.height = 1080;
			ctx = canvas.getContext("2d");
			wrap = shadow.querySelector(".camera");
			wrap.tabIndex = 0;
			wrap.setAttribute("role", "group");
			wrap.setAttribute("aria-label", "Подвижная камера. Стрелки — перемещение, Shift — быстрый шаг. Плюс и минус — размер.");
			wrap.onkeydown = (e) => {
				if (e.target !== wrap) return;
				if ([
					"+",
					"=",
					"-",
					"_"
				].includes(e.key)) {
					e.preventDefault();
					applyAppearance({
						...appearance,
						x: placement.x,
						y: placement.y,
						width: placement.w * 100 + (["-", "_"].includes(e.key) ? -5 : 5)
					});
					saveAppearance();
					return;
				}
				const d = {
					ArrowLeft: [-1, 0],
					ArrowRight: [1, 0],
					ArrowUp: [0, -1],
					ArrowDown: [0, 1]
				}[e.key];
				if (!d) return;
				e.preventDefault();
				const w = host.clientWidth, h = host.clientHeight, n = e.shiftKey ? 20 : 4;
				placement.x = Math.max(0, Math.min(w - wrap.clientWidth, wrap.offsetLeft + d[0] * n)) / w;
				placement.y = Math.max(0, Math.min(h - wrap.clientHeight, wrap.offsetTop + d[1] * n)) / h;
				wrap.style.left = placement.x * 100 + "%";
				wrap.style.top = placement.y * 100 + "%";
				saveAppearance();
			};
			cam = wrap.querySelector("canvas");
			cam.width = 640;
			cam.height = 360;
			cc = cam.getContext("2d");
			Object.assign(wrap.style, {
				left: placement.x * 100 + "%",
				top: placement.y * 100 + "%",
				width: placement.w * 100 + "%",
				aspectRatio: "16/9"
			});
			wrap.onpointerdown = (e) => {
				if (e.target.closest?.("button")) return;
				if (e.button !== 0) return;
				e.preventDefault();
				wrap.classList.add("dragging");
				wrap.setPointerCapture(e.pointerId);
				drag = {
					x: e.clientX,
					y: e.clientY,
					l: wrap.offsetLeft,
					t: wrap.offsetTop
				};
			};
			wrap.onpointermove = (e) => {
				if (!drag) return;
				const w = host.clientWidth, h = host.clientHeight;
				placement.x = Math.max(0, Math.min(w - wrap.clientWidth, drag.l + e.clientX - drag.x)) / w;
				placement.y = Math.max(0, Math.min(h - wrap.clientHeight, drag.t + e.clientY - drag.y)) / h;
				wrap.style.left = placement.x * 100 + "%";
				wrap.style.top = placement.y * 100 + "%";
			};
			wrap.onpointerup = wrap.onpointercancel = wrap.onlostpointercapture = () => {
				if (drag) {
					const w = host.clientWidth, h = host.clientHeight;
					for (const [axis, size, extent] of [[
						"x",
						w,
						wrap.offsetWidth
					], [
						"y",
						h,
						wrap.offsetHeight
					]]) {
						const end = Math.max(0, 1 - extent / (size || 1));
						if (placement[axis] * size < 18) placement[axis] = 0;
						else if ((end - placement[axis]) * size < 18) placement[axis] = end;
					}
					wrap.style.left = placement.x * 100 + "%";
					wrap.style.top = placement.y * 100 + "%";
					saveAppearance();
				}
				drag = null;
				wrap.classList.remove("dragging");
			};
			const tools = document.createElement("div");
			tools.className = "camera-tools";
			tools.setAttribute("role", "toolbar");
			tools.setAttribute("aria-label", "Настройки камеры");
			for (const [text, label, action] of [
				[
					"−",
					"Уменьшить",
					() => ({ width: placement.w * 100 - 5 })
				],
				[
					"+",
					"Увеличить",
					() => ({ width: placement.w * 100 + 5 })
				],
				[
					"◜",
					"Скругление",
					() => ({ radius: appearance.radius ? 0 : 24 })
				],
				[
					"↖",
					"Вернуть в угол",
					() => ({
						x: .04,
						y: .07
					})
				]
			]) {
				const button = document.createElement("button");
				button.textContent = text;
				button.title = label;
				button.setAttribute("aria-label", label);
				button.onpointerdown = (e) => e.stopPropagation();
				button.onclick = (e) => {
					e.stopPropagation();
					applyAppearance({
						...appearance,
						x: placement.x,
						y: placement.y,
						...action()
					});
					saveAppearance();
				};
				tools.append(button);
			}
			wrap.append(tools);
			parent.append(host);
			applyAppearance(appearance);
			const guards = [wrap, canvas].map((camera) => guardPlayerControls({
				host,
				camera,
				root: video.closest("[data-a-target=video-player],.video-player") || parent
			}));
			const resizeObserver = new ResizeObserver(() => applyAppearance({
				...appearance,
				x: placement.x,
				y: placement.y
			}));
			resizeObserver.observe(parent);
			controlGuard = {
				schedule: () => guards.forEach((g) => g.schedule()),
				close: () => {
					resizeObserver.disconnect();
					guards.forEach((g) => g.close());
				}
			};
			original();
			frameCallback = video.requestVideoFrameCallback(draw);
		}
		const snapshot = document.createElement("canvas");
		snapshot.width = 1920;
		snapshot.height = 1080;
		const snapshotContext = snapshot.getContext("2d");
		let maxPairDeltaMs = 0;
		function draw(_now, meta) {
			lastPresentedTime = meta.mediaTime;
			if (!video?.isConnected) {
				original();
				return;
			}
			try {
				const blocked = [...document.querySelectorAll("[data-a-target=\"video-ad-label\"], [data-a-target=\"video-ad-countdown\"]")].some((el) => el.getClientRects().length);
				if (!enabled || video.mediaKeys || blocked || Math.abs(video.videoWidth / video.videoHeight - 16 / 9) > .01) original();
				else {
					let selected;
					for (const p of patches.values()) if (Math.abs(p.t - meta.mediaTime) < .001) {
						selected = p;
						break;
					}
					if (!selected) {
						misses++;
						original();
					} else if (selected.paused || !viewerAllowsRestoration(selected.rect, maxRestorationPercent)) {
						restorationPaused = true;
						restorationPauseReason = selected.paused ? "source" : "viewer";
						original();
					} else {
						restorationPaused = false;
						restorationPauseReason = "";
						const r = selected.rect;
						maxPairDeltaMs = Math.max(maxPairDeltaMs, Math.abs(selected.t - meta.mediaTime) * 1e3);
						snapshotContext.drawImage(video, 0, 0, 1920, 1080);
						ctx.drawImage(snapshot, 0, 0);
						ctx.drawImage(selected.bitmap, r.x, r.y, r.width, r.height);
						cc.drawImage(snapshot, r.x, r.y, r.width, r.height, 0, 0, 640, 360);
						if (host.hidden) {
							host.hidden = false;
							controlGuard?.schedule();
						}
						lastMatch = performance.now();
						hits++;
						host.dataset.frames = String(hits);
					}
					for (const [id, p] of patches) if (p.t < meta.mediaTime - .15) {
						p.bitmap?.close();
						patches.delete(id);
					}
				}
			} catch (e) {
				lastError = String(e);
				original();
			}
			frameCallback = video.requestVideoFrameCallback(draw);
		}
		function initialize() {
			const generation = epoch;
			surface = new OffscreenCanvas(640, 360);
			sc = surface.getContext("2d", { willReadFrequently: true });
			decoder = new VideoDecoder({
				output: (frame) => {
					if (generation !== epoch || !enabled) {
						frame.close();
						return;
					}
					const t = frame.timestamp / 1e6, info = inflight.get(frame.timestamp);
					inflight.delete(frame.timestamp);
					if (!info) {
						frame.close();
						return;
					}
					sc.drawImage(frame, 0, 0, 640, 360);
					const image = sc.getImageData(0, 0, 640, 360);
					frame.close();
					createImageBitmap(image).then((bitmap) => {
						if (generation !== epoch || !enabled || disposed) {
							bitmap.close();
							return;
						}
						const id = Math.round(t * 1e6);
						patches.get(id)?.bitmap?.close();
						patches.set(id, {
							t,
							bitmap,
							rect: info
						});
						decoded++;
						while (patches.size > 120) {
							const oldest = patches.keys().next().value;
							patches.get(oldest).bitmap?.close();
							patches.delete(oldest);
						}
					}).catch((e) => {
						if (generation === epoch) lastError = String(e);
					});
				},
				error: (e) => {
					if (generation === epoch) {
						lastError = String(e);
						needsKey = true;
					}
				}
			});
			decoder.configure({
				codec: "avc1.64001e",
				optimizeForLatency: true
			});
		}
		const jobs = [];
		let jobBytes = 0, pumping = false;
		function pump() {
			if (pumping || !decoder || decoder.state !== "configured") return;
			pumping = true;
			jobs.sort((a, b) => a.presentationTime - b.presentationTime);
			try {
				while (jobs.length && decoder.decodeQueueSize < 8) {
					const p = jobs[0], isKey = key(p.bytes);
					if (p.presentationTime <= lastAuxTime + 1e-6) {
						jobs.shift();
						jobBytes -= p.bytes.length;
						continue;
					}
					if (!p.paused && !needsKey && !isKey && p.id !== nextAuxId) {
						const recovery = jobs.findIndex((job, index) => index > 0 && !job.paused && key(job.bytes));
						if (recovery < 0) break;
						for (const skipped of jobs.splice(0, recovery)) jobBytes -= skipped.bytes.length;
						needsKey = true;
						continue;
					}
					jobs.shift();
					jobBytes -= p.bytes.length;
					if (p.paused) {
						needsKey = true;
						continue;
					}
					if (p.presentationTime <= lastAuxTime + 1e-6) continue;
					if (needsKey && !isKey) continue;
					if (isKey) needsKey = false;
					nextAuxId = p.id + 1 >>> 0;
					lastAuxTime = p.presentationTime;
					const timestamp = Math.round(p.presentationTime * 1e6);
					inflight.set(timestamp, {
						x: p.x,
						y: p.y,
						width: p.width,
						height: p.height
					});
					decoder.decode(new EncodedVideoChunk({
						type: isKey ? "key" : "delta",
						timestamp,
						data: p.bytes
					}));
				}
			} catch (e) {
				lastError = String(e);
				needsKey = true;
			} finally {
				pumping = false;
			}
			if (jobs.length && !pumpTimer) pumpTimer = setTimeout(() => {
				pumpTimer = null;
				pump();
			}, 10);
		}
		const inflight = /* @__PURE__ */ new Map();
		window.addEventListener("message", (e) => {
			if (e.source !== window || e.origin !== location.origin || e.data?.tag !== "freecam-sei-v1") return;
			if (e.data.type === "status") {
				tap = e.data.stats;
				return;
			}
			if (e.data.type !== "packet" || !enabled) return;
			const p = e.data.packet;
			attach();
			if (!video || !(p.mediaUrl && [video.src, video.currentSrc].includes(p.mediaUrl) || p.mediaKey && video.dataset.freecamSeiMediaKey === p.mediaKey)) return;
			if (!Number.isInteger(p.id) || p.id < 0 || p.id > 4294967295 || !ArrayBuffer.isView(p.bytes) || p.bytes.length > 1048576 || ![
				p.x,
				p.y,
				p.width,
				p.height,
				p.presentationTime
			].every(Number.isFinite) || p.width < 1 || p.height < 1 || p.x < 0 || p.y < 0 || p.x + p.width > 1920 || p.y + p.height > 1080) return;
			received++;
			if (!p.bytes.length) {
				const id = Math.round(p.presentationTime * 1e6);
				patches.get(id)?.bitmap?.close();
				patches.set(id, {
					t: p.presentationTime,
					paused: true
				});
				while (patches.size > 120) {
					const oldest = patches.keys().next().value;
					patches.get(oldest).bitmap?.close();
					patches.delete(oldest);
				}
				if (decoder && jobs.length < 180) {
					jobs.push({
						paused: true,
						bytes: /* @__PURE__ */ new Uint8Array(),
						id: p.id,
						presentationTime: p.presentationTime
					});
					pump();
				}
				return;
			}
			try {
				if (!decoder || decoder.state === "closed") initialize();
				if (jobs.length >= 180 || jobBytes + p.bytes.length > 8388608) {
					jobs.length = 0;
					jobBytes = 0;
					needsKey = true;
					lastError = "Переполнена ограниченная очередь";
					return;
				}
				jobs.push(p);
				jobBytes += p.bytes.length;
				pump();
			} catch (e) {
				lastError = String(e);
				needsKey = true;
			}
		});
		function applyPreference(value) {
			maxRestorationPercent = restorationPercent(value);
			if (video?.paused && lastPresentedTime !== null) {
				video.cancelVideoFrameCallback?.(frameCallback);
				draw(performance.now(), { mediaTime: lastPresentedTime });
			}
		}
		loadAppearance();
		chrome.storage.local.get("workerCompatibility").then((value) => {
			workerCompatibility = value.workerCompatibility === true;
			configureWorker();
		}).catch(() => {});
		let preferenceRevision = 0;
		const initialRevision = preferenceRevision;
		chrome.storage.local.get("maxRestorationPercent").then((value) => {
			if (initialRevision === preferenceRevision) applyPreference(value.maxRestorationPercent);
		}).catch(() => {});
		chrome.storage.onChanged.addListener((changes, area) => {
			if (area === "local" && changes.workerCompatibility) {
				workerCompatibility = changes.workerCompatibility.newValue === true;
				configureWorker();
			}
			if (area === "local" && changes[profileKey()]) applyAppearance(changes[profileKey()].newValue);
			if (area === "local" && changes.maxRestorationPercent) {
				preferenceRevision++;
				applyPreference(changes.maxRestorationPercent.newValue);
			}
		});
		chrome.runtime.onMessage.addListener((m, _s, reply) => {
			if (m.type === "status") reply(status());
			if (m.type === "enabled") {
				enabled = !!m.value;
				if (!enabled) {
					original();
					reset();
				}
				reply(status());
			}
		});
		globalThis.FreecamSei = { status };
		const attachmentTimer = setInterval(attach, 500);
		window.addEventListener("pagehide", (e) => {
			reset();
			original();
			if (!e.persisted) {
				disposed = true;
				clearInterval(attachmentTimer);
				video?.cancelVideoFrameCallback?.(frameCallback);
				controlGuard?.close();
				host?.remove();
			}
		});
	})();
})();
