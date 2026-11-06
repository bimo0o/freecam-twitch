(function() {
	// src/extension-sei/content.mjs
	(() => {
		if (globalThis.FreecamSei) return;
		const patches = /* @__PURE__ */ new Map();
		let route = location.pathname;
		let decoder, video, host, shadow, canvas, ctx, cam, cc, wrap, frameCallback, enabled = true, needsKey = true, decoded = 0, received = 0, hits = 0, misses = 0, tap = {}, lastError = "", lastMatch = 0, drag, placement = {
			x: .04,
			y: .07,
			w: .28
		}, surface, sc;
		const key = (b) => {
			for (let i = 0; i < b.length - 4; i++) if (b[i] === 0 && b[i + 1] === 0 && (b[i + 2] === 1 && (b[i + 3] & 31) === 5 || b[i + 2] === 0 && b[i + 3] === 1 && (b[i + 4] & 31) === 5)) return true;
			return false;
		};
		function status() {
			return {
				enabled,
				received,
				decoded,
				hits,
				misses,
				cache: patches.size,
				tap,
				error: lastError,
				message: !enabled ? "Отключено" : lastMatch > 0 && performance.now() - lastMatch < 1500 ? "Восстановление работает" : received ? "Данные есть. Ожидается совпадающий кадр видео." : tap.appends ? "Буферы плеера доступны, пакетов Freecam пока нет. Выберите Source." : "Ожидаются буферы плеера. Обновите канал после установки. Плееры с MSE в worker пока не поддерживаются."
			};
		}
		function original() {
			if (host) host.hidden = true;
		}
		function attach() {
			if (route !== location.pathname) {
				route = location.pathname;
				video?.cancelVideoFrameCallback?.(frameCallback);
				host?.remove();
				host = null;
				video = null;
				if (decoder && decoder.state !== "closed") decoder.close();
				decoder = null;
				needsKey = true;
				jobs.length = 0;
				jobBytes = 0;
				inflight.clear();
				for (const p of patches.values()) p.bitmap.close();
				patches.clear();
			}
			const v = [...document.querySelectorAll("video")].filter((v) => v.clientWidth > 200).sort((a, b) => b.clientWidth * b.clientHeight - a.clientWidth * a.clientHeight)[0];
			if (!v || v === video) return;
			if (video) video.cancelVideoFrameCallback?.(frameCallback);
			host?.remove();
			video = v;
			host = document.createElement("div");
			host.dataset.freecamSei = "true";
			host.style.cssText = "position:absolute;inset:0;z-index:0;pointer-events:none";
			const parent = v.parentElement;
			if (getComputedStyle(parent).position === "static") parent.style.position = "relative";
			shadow = host.attachShadow({ mode: "open" });
			shadow.innerHTML = "<style>:host{pointer-events:none}.game{position:absolute;width:100%;height:100%;inset:0}.camera{position:absolute;pointer-events:auto;touch-action:none;cursor:grab;border:1px solid #c79aff;box-shadow:0 4px 16px #0006}.camera canvas{display:block;width:100%;height:100%}.camera{outline:2px solid transparent;outline-offset:2px;transition:box-shadow 140ms ease,outline-color 140ms ease;border-radius:6px;overflow:hidden}.camera:hover,.camera:focus-visible{outline-color:#c79aff;box-shadow:0 6px 24px #0009}.camera.dragging{cursor:grabbing;outline-color:#eadbff;box-shadow:0 10px 30px #000b}@media(prefers-reduced-motion:reduce){.camera{transition:none}}</style><canvas class=\"game\"></canvas><div class=\"camera\"><canvas></canvas></div>";
			canvas = shadow.querySelector(".game");
			canvas.width = 1920;
			canvas.height = 1080;
			ctx = canvas.getContext("2d");
			wrap = shadow.querySelector(".camera");
			wrap.tabIndex = 0;
			wrap.setAttribute("role", "group");
			wrap.setAttribute("aria-label", "Подвижная камера. Стрелки — перемещение, Shift — быстрый шаг.");
			wrap.onkeydown = (e) => {
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
				drag = null;
				wrap.classList.remove("dragging");
			};
			parent.append(host);
			original();
			frameCallback = video.requestVideoFrameCallback(draw);
		}
		const snapshot = document.createElement("canvas");
		snapshot.width = 1920;
		snapshot.height = 1080;
		const snap = snapshot.getContext("2d");
		function draw(_now, meta) {
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
					} else {
						snap.drawImage(video, 0, 0, 1920, 1080);
						ctx.drawImage(snapshot, 0, 0);
						ctx.drawImage(selected.bitmap, selected.rect.x, selected.rect.y, selected.rect.width, selected.rect.height);
						cc.drawImage(snapshot, selected.rect.x, selected.rect.y, selected.rect.width, selected.rect.height, 0, 0, 640, 360);
						host.hidden = false;
						lastMatch = performance.now();
						hits++;
						host.dataset.frames = String(hits);
					}
					for (const [id, p] of patches) if (p.t < meta.mediaTime - .15) {
						p.bitmap.close();
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
			surface = new OffscreenCanvas(640, 360);
			sc = surface.getContext("2d", { willReadFrequently: true });
			decoder = new VideoDecoder({
				output: (frame) => {
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
						const id = Math.round(t * 1e6);
						patches.get(id)?.bitmap.close();
						patches.set(id, {
							t,
							bitmap,
							rect: info
						});
						decoded++;
						while (patches.size > 120) {
							const oldest = patches.keys().next().value;
							patches.get(oldest).bitmap.close();
							patches.delete(oldest);
						}
					});
				},
				error: (e) => {
					lastError = String(e);
					needsKey = true;
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
			try {
				while (jobs.length && decoder.decodeQueueSize < 8) {
					const p = jobs.shift();
					jobBytes -= p.bytes.length;
					const isKey = key(p.bytes);
					if (needsKey && !isKey) continue;
					if (isKey) needsKey = false;
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
			if (jobs.length) setTimeout(pump, 10);
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
			if (!p.mediaUrl || !video || ![video.src, video.currentSrc].includes(p.mediaUrl)) return;
			if (!ArrayBuffer.isView(p.bytes) || p.bytes.length > 1048576 || ![
				p.x,
				p.y,
				p.width,
				p.height,
				p.presentationTime
			].every(Number.isFinite) || p.width < 1 || p.height < 1 || p.x < 0 || p.y < 0 || p.x + p.width > 1920 || p.y + p.height > 1080) return;
			received++;
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
		chrome.runtime.onMessage.addListener((m, _s, reply) => {
			if (m.type === "status") reply(status());
			if (m.type === "enabled") {
				enabled = !!m.value;
				if (!enabled) original();
				reply(status());
			}
		});
		globalThis.FreecamSei = { status };
		setInterval(attach, 500);
		window.addEventListener("pagehide", () => {
			decoder?.close();
			for (const p of patches.values()) p.bitmap.close();
			patches.clear();
			host?.remove();
		});
	})();
})();
