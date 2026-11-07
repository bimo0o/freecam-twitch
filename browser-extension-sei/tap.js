(function() {
	// src/extension-sei/worker-bridge.mjs
	function installWorkerBridge(workerSource, post, stats) {
		if (!globalThis.Worker || !workerSource) return () => {};
		let enabled = false;
		const NativeWorker = Worker, handleKeys = /* @__PURE__ */ new WeakMap(), workers = /* @__PURE__ */ new Map(), blobs = /* @__PURE__ */ new Map();
		const createUrl = URL.createObjectURL.bind(URL), revokeUrl = URL.revokeObjectURL.bind(URL);
		URL.createObjectURL = function(value) {
			const url = createUrl(value);
			if (value instanceof Blob && value.size <= 8388608 && !/^(video|audio|image|font)\//i.test(value.type)) {
				if (blobs.size >= 128) blobs.delete(blobs.keys().next().value);
				blobs.set(url, value);
			}
			return url;
		};
		URL.revokeObjectURL = function(url) {
			blobs.delete(String(url));
			return revokeUrl(url);
		};
		const descriptor = Object.getOwnPropertyDescriptor(HTMLMediaElement.prototype, "srcObject");
		if (descriptor?.set && descriptor.configurable) Object.defineProperty(HTMLMediaElement.prototype, "srcObject", {
			...descriptor,
			set(value) {
				descriptor.set.call(this, value);
				const key = value && handleKeys.get(value);
				if (key) this.dataset.freecamSeiMediaKey = key;
				else delete this.dataset.freecamSeiMediaKey;
			}
		});
		const collect = (value, result = [], seen = /* @__PURE__ */ new Set(), depth = 0) => {
			if (!value || typeof value !== "object" || seen.has(value) || depth > 5 || seen.size > 200) return result;
			seen.add(value);
			if (Object.prototype.toString.call(value) === "[object MediaSourceHandle]") result.push(value);
			else if (!ArrayBuffer.isView(value) && !(value instanceof ArrayBuffer)) for (const key of Object.keys(value)) collect(value[key], result, seen, depth + 1);
			return result;
		};
		function WrappedWorker(url, options) {
			if (!new.target) throw new TypeError("Worker constructor requires new");
			const absolute = new URL(String(url), document.baseURI);
			if (!enabled || absolute.origin !== location.origin) return Reflect.construct(NativeWorker, [url, options], new.target || NativeWorker);
			const token = crypto.randomUUID();
			const owned = absolute.protocol === "blob:" && blobs.has(absolute.href) ? createUrl(blobs.get(absolute.href)) : null;
			const entry = owned || absolute.href;
			const load = options?.type === "module" ? `await import(${JSON.stringify(entry)})` : `importScripts(${JSON.stringify(entry)})`;
			const bootstrap = `self.__freecamWorkerToken=${JSON.stringify(token)};\n${workerSource}\n${options?.type === "module" ? "" : "(async()=>{"}const early=[];const hold=e=>{early.push(e);e.stopImmediatePropagation()};addEventListener('message',hold);const nativeScripts=self.importScripts?.bind(self);if(nativeScripts)self.importScripts=(...urls)=>nativeScripts(...urls.map(url=>new URL(String(url),${JSON.stringify(absolute.href)}).href));const nativeFetch=fetch;self.fetch=(url,...args)=>{if(typeof url==='string'){try{url=new URL(url,${JSON.stringify(absolute.href)}).href}catch{}}return nativeFetch(url,...args)};try{${load};removeEventListener('message',hold);for(const e of early)dispatchEvent(new MessageEvent('message',{data:e.data,ports:e.ports}));}catch(error){postMessage({__freecamWorker:${JSON.stringify(token)},type:'error',error:'Worker bootstrap: '+String(error)});throw error;}${options?.type === "module" ? "" : "})()"}`;
			const blob = URL.createObjectURL(new Blob([bootstrap], { type: "text/javascript" }));
			let worker;
			try {
				worker = Reflect.construct(NativeWorker, [blob, options], new.target || NativeWorker);
			} catch (error) {
				URL.revokeObjectURL(blob);
				if (owned) revokeUrl(owned);
				stats.lastError = String(error);
				return Reflect.construct(NativeWorker, [url, options], new.target || NativeWorker);
			}
			if (workers.size >= 32) workers.delete(workers.keys().next().value);
			workers.set(token, {
				appends: 0,
				packets: 0
			});
			const terminate = worker.terminate.bind(worker);
			worker.terminate = () => {
				workers.delete(token);
				URL.revokeObjectURL(blob);
				if (owned) revokeUrl(owned);
				terminate();
			};
			worker.addEventListener("error", () => {
				stats.lastError = "Worker compatibility bootstrap failed. Disable the mode and reload the page.";
			});
			let pending = [];
			worker.addEventListener("message", (event) => {
				const value = event.data;
				if (value?.__freecamWorker === token) {
					event.stopImmediatePropagation();
					if (value.type === "handles") pending = value.ids;
					if (value.type === "packet") post("packet", { packet: value.packet });
					if (value.type === "error") stats.lastError = String(value.error).slice(0, 200);
					if (value.type === "stats") {
						workers.set(token, value);
						stats.workerAppends = [...workers.values()].reduce((n, w) => n + w.appends, 0);
						stats.workerPackets = [...workers.values()].reduce((n, w) => n + w.packets, 0);
					}
					return;
				}
				const found = collect(value);
				for (let i = 0; i < found.length && i < pending.length; i++) handleKeys.set(found[i], token + ":" + pending[i]);
				if (found.length) pending = [];
			});
			setTimeout(() => {
				URL.revokeObjectURL(blob);
				if (owned) revokeUrl(owned);
			}, 6e4);
			return worker;
		}
		WrappedWorker.prototype = NativeWorker.prototype;
		Object.setPrototypeOf(WrappedWorker, NativeWorker);
		globalThis.Worker = WrappedWorker;
		window.addEventListener("message", (event) => {
			if (event.source === window && event.origin === location.origin && event.data?.tag === "freecam-worker-config") enabled = event.data.enabled === true;
		});
		return (value) => {
			enabled = !!value;
		};
	}
	Object.freeze({
		maxArea: 1,
		resumeArea: 1
	});
	// shared/covert-primitives.mjs
	var crcTable = Uint32Array.from({ length: 256 }, (_, value) => {
		let c = value;
		for (let bit = 0; bit < 8; bit++) c = c >>> 1 ^ (c & 1 ? 3988292384 : 0);
		return c >>> 0;
	});
	function crc32(bytes) {
		let c = 4294967295;
		for (let i = 0; i < bytes.length; i++) c = c >>> 8 ^ crcTable[(c ^ bytes[i]) & 255];
		return (c ^ 4294967295) >>> 0;
	}
	// shared/covert-sei.mjs
	var UUID = Uint8Array.from([
		70,
		114,
		101,
		101,
		99,
		97,
		109,
		45,
		83,
		69,
		73,
		45,
		48,
		48,
		48,
		49
	]);
	var unescape = (b) => {
		const out = new Uint8Array(b.length);
		let length = 0;
		for (let i = 0; i < b.length; i++) {
			if (i >= 2 && b[i] === 3 && b[i - 1] === 0 && b[i - 2] === 0) continue;
			out[length++] = b[i];
		}
		return out.subarray(0, length);
	};
	function readSei(nal) {
		if ((nal[0] & 31) !== 6) return [];
		const r = unescape(nal.subarray(1)), packets = [];
		let at = 0;
		while (at < r.length - 1) {
			let type = 0, size = 0;
			while (at < r.length && r[at] === 255) {
				type += 255;
				at++;
			}
			if (at >= r.length) break;
			type += r[at++];
			while (at < r.length && r[at] === 255) {
				size += 255;
				at++;
			}
			if (at >= r.length) break;
			size += r[at++];
			if (at + size > r.length) break;
			const b = r.subarray(at, at + size);
			at += size;
			if (type !== 5 || b.length < 48 || !UUID.every((v, i) => b[i] === v)) continue;
			const p = b.subarray(16), v = new DataView(p.buffer, p.byteOffset, p.byteLength);
			if (v.getUint32(0, true) !== 826495814 || v.getUint32(24, true) !== p.length - 32 || v.getUint32(p.length - 4, true) !== crc32(p.subarray(0, -4))) continue;
			const packet = {
				id: v.getUint32(4, true),
				timestamp: Number(v.getBigUint64(8, true)),
				x: v.getUint16(16, true),
				y: v.getUint16(18, true),
				width: v.getUint16(20, true),
				height: v.getUint16(22, true),
				bytes: p.slice(28, -4)
			};
			if (packet.width > 0 && packet.height > 0 && packet.x + packet.width <= 1920 && packet.y + packet.height <= 1080) packets.push(packet);
		}
		return packets;
	}
	function avccNals(sample, size = 4) {
		const out = [];
		let at = 0;
		while (at + size <= sample.length) {
			let n = 0;
			for (let i = 0; i < size; i++) n = n * 256 + sample[at++];
			if (n < 1 || at + n > sample.length) throw Error("Invalid AVC sample length");
			out.push(sample.subarray(at, at + n));
			at += n;
		}
		if (at !== sample.length) throw Error("Trailing AVC sample data");
		return out;
	}
	// shared/covert-fragments.mjs
	var text = (b, i) => String.fromCharCode(...b.subarray(i, i + 4));
	function boxes(b, start = 0, end = b.length) {
		const v = new DataView(b.buffer, b.byteOffset, b.byteLength), out = [];
		for (let p = start; p + 8 <= end;) {
			let size = v.getUint32(p), head = 8;
			if (size === 1) {
				if (p + 16 > end) break;
				size = Number(v.getBigUint64(p + 8));
				head = 16;
			}
			if (size === 0) size = end - p;
			if (size < head || !Number.isSafeInteger(size)) throw Error("Invalid box");
			if (p + size > end) break;
			out.push({
				type: text(b, p + 4),
				start: p,
				data: p + head,
				end: p + size
			});
			p += size;
		}
		return out;
	}
	var child = (b, parent, type) => boxes(b, parent.data, parent.end).find((x) => x.type === type);
	var FragmentReader = class {
		constructor(onPacket) {
			this.onPacket = onPacket;
			this.pending = /* @__PURE__ */ new Uint8Array();
			this.group = [];
			this.track = null;
			this.stats = {
				appends: 0,
				inits: 0,
				fragments: 0,
				samples: 0,
				packets: 0,
				errors: 0
			};
		}
		init(b, moov) {
			for (const t of boxes(b, moov.data, moov.end).filter((x) => x.type === "trak")) {
				const mdia = child(b, t, "mdia"), handler = mdia && child(b, mdia, "hdlr");
				if (!handler || text(b, handler.data + 8) !== "vide") continue;
				const tkhd = child(b, t, "tkhd"), mdhd = child(b, mdia, "mdhd"), stsd = child(b, child(b, child(b, mdia, "minf"), "stbl"), "stsd"), entry = boxes(b, stsd.data + 8, stsd.end)[0], v = new DataView(b.buffer, b.byteOffset, b.byteLength);
				if (!entry || !["avc1", "avc3"].includes(entry.type)) continue;
				const conf = boxes(b, entry.data + 78, entry.end).find((x) => x.type === "avcC");
				if (!conf) continue;
				const id = v.getUint32(tkhd.data + (b[tkhd.data] === 1 ? 20 : 12)), scale = v.getUint32(mdhd.data + (b[mdhd.data] === 1 ? 20 : 12));
				this.track = {
					id,
					scale,
					lengthSize: (b[conf.data + 4] & 3) + 1,
					duration: 0,
					size: 0
				};
				const mvex = child(b, moov, "mvex");
				if (mvex) {
					for (const trex of boxes(b, mvex.data, mvex.end).filter((x) => x.type === "trex")) if (v.getUint32(trex.data + 4) === id) {
						this.track.duration = v.getUint32(trex.data + 12);
						this.track.size = v.getUint32(trex.data + 16);
					}
				}
				this.stats.inits++;
			}
		}
		fragment(b, offset) {
			if (!this.track) return;
			const v = new DataView(b.buffer, b.byteOffset, b.byteLength), moof = boxes(b).find((x) => x.type === "moof");
			if (!moof) return;
			this.stats.fragments++;
			for (const traf of boxes(b, moof.data, moof.end).filter((x) => x.type === "traf")) {
				const h = child(b, traf, "tfhd");
				if (!h || v.getUint32(h.data + 4) !== this.track.id) continue;
				const flags = v.getUint32(h.data) & 16777215;
				let at = h.data + 8, base = moof.start, duration = this.track.duration, size = this.track.size;
				if (flags & 1) {
					base = Number(v.getBigUint64(at));
					at += 8;
				}
				if (flags & 2) at += 4;
				if (flags & 8) {
					duration = v.getUint32(at);
					at += 4;
				}
				if (flags & 16) {
					size = v.getUint32(at);
					at += 4;
				}
				const tfdt = child(b, traf, "tfdt");
				let time = tfdt ? b[tfdt.data] === 1 ? Number(v.getBigUint64(tfdt.data + 4)) : v.getUint32(tfdt.data + 4) : 0, previousEnd = null;
				for (const run of boxes(b, traf.data, traf.end).filter((x) => x.type === "trun")) {
					const f = v.getUint32(run.data) & 16777215, count = v.getUint32(run.data + 4);
					if (count > 1e4) throw Error("Too many samples");
					let p = run.data + 8, pos = previousEnd;
					if (f & 1) {
						pos = base + v.getInt32(p);
						p += 4;
					}
					if (f & 4) p += 4;
					if (pos === null) throw Error("Missing data offset");
					for (let i = 0; i < count; i++) {
						let d = duration, n = size, cts = 0;
						if (f & 256) {
							d = v.getUint32(p);
							p += 4;
						}
						if (f & 512) {
							n = v.getUint32(p);
							p += 4;
						}
						if (f & 1024) p += 4;
						if (f & 2048) {
							cts = b[run.data] === 1 ? v.getInt32(p) : v.getUint32(p);
							p += 4;
						}
						if (n < 1 || pos < 0 || pos + n > b.length) throw Error("Sample outside fragment");
						this.stats.samples++;
						for (const nal of avccNals(b.subarray(pos, pos + n), this.track.lengthSize)) for (const packet of readSei(nal)) {
							this.stats.packets++;
							this.onPacket({
								...packet,
								presentationTime: (time + cts) / this.track.scale + offset
							});
						}
						pos += n;
						time += d;
					}
					previousEnd = pos;
				}
			}
		}
		feed(input, offset = 0) {
			this.stats.appends++;
			const data = new Uint8Array(this.pending.length + input.length);
			data.set(this.pending);
			data.set(input, this.pending.length);
			if (data.length > 16777216) throw Error("Fragment buffer limit");
			let consumed = 0;
			for (const box of boxes(data)) {
				const bytes = data.slice(box.start, box.end);
				if (box.type === "moov") this.init(bytes, boxes(bytes)[0]);
				if (box.type === "moof") this.group = [bytes];
				else if (this.group.length) {
					this.group.push(bytes);
					if (box.type === "mdat") {
						const group = new Uint8Array(this.group.reduce((n, b) => n + b.length, 0));
						let at = 0;
						for (const p of this.group) {
							group.set(p, at);
							at += p.length;
						}
						this.fragment(group, offset);
						this.group = [];
					}
				}
				consumed = box.end;
			}
			this.pending = data.slice(consumed);
		}
	};
	// src/extension-sei/tap.mjs
	(() => {
		if (globalThis.__freecamSeiTap) return;
		globalThis.__freecamSeiTap = true;
		const readers = /* @__PURE__ */ new WeakMap(), stats = {
			ready: true,
			sourceBufferAvailable: !!globalThis.SourceBuffer,
			appends: 0,
			videoAppends: 0,
			audioAppends: 0,
			bufferTypes: [],
			packets: 0,
			payloadBytes: 0,
			errors: 0,
			lastError: ""
		}, post = (type, data) => window.postMessage({
			tag: "freecam-sei-v1",
			type,
			...data
		}, location.origin, type === "packet" ? [data.packet.bytes.buffer] : []);
		installWorkerBridge("(function() {\n	Object.freeze({\n		maxArea: 1,\n		resumeArea: 1\n	});\n	// shared/covert-primitives.mjs\n	var crcTable = Uint32Array.from({ length: 256 }, (_, value) => {\n		let c = value;\n		for (let bit = 0; bit < 8; bit++) c = c >>> 1 ^ (c & 1 ? 3988292384 : 0);\n		return c >>> 0;\n	});\n	function crc32(bytes) {\n		let c = 4294967295;\n		for (let i = 0; i < bytes.length; i++) c = c >>> 8 ^ crcTable[(c ^ bytes[i]) & 255];\n		return (c ^ 4294967295) >>> 0;\n	}\n	// shared/covert-sei.mjs\n	var UUID = Uint8Array.from([\n		70,\n		114,\n		101,\n		101,\n		99,\n		97,\n		109,\n		45,\n		83,\n		69,\n		73,\n		45,\n		48,\n		48,\n		48,\n		49\n	]);\n	var unescape = (b) => {\n		const out = new Uint8Array(b.length);\n		let length = 0;\n		for (let i = 0; i < b.length; i++) {\n			if (i >= 2 && b[i] === 3 && b[i - 1] === 0 && b[i - 2] === 0) continue;\n			out[length++] = b[i];\n		}\n		return out.subarray(0, length);\n	};\n	function readSei(nal) {\n		if ((nal[0] & 31) !== 6) return [];\n		const r = unescape(nal.subarray(1)), packets = [];\n		let at = 0;\n		while (at < r.length - 1) {\n			let type = 0, size = 0;\n			while (at < r.length && r[at] === 255) {\n				type += 255;\n				at++;\n			}\n			if (at >= r.length) break;\n			type += r[at++];\n			while (at < r.length && r[at] === 255) {\n				size += 255;\n				at++;\n			}\n			if (at >= r.length) break;\n			size += r[at++];\n			if (at + size > r.length) break;\n			const b = r.subarray(at, at + size);\n			at += size;\n			if (type !== 5 || b.length < 48 || !UUID.every((v, i) => b[i] === v)) continue;\n			const p = b.subarray(16), v = new DataView(p.buffer, p.byteOffset, p.byteLength);\n			if (v.getUint32(0, true) !== 826495814 || v.getUint32(24, true) !== p.length - 32 || v.getUint32(p.length - 4, true) !== crc32(p.subarray(0, -4))) continue;\n			const packet = {\n				id: v.getUint32(4, true),\n				timestamp: Number(v.getBigUint64(8, true)),\n				x: v.getUint16(16, true),\n				y: v.getUint16(18, true),\n				width: v.getUint16(20, true),\n				height: v.getUint16(22, true),\n				bytes: p.slice(28, -4)\n			};\n			if (packet.width > 0 && packet.height > 0 && packet.x + packet.width <= 1920 && packet.y + packet.height <= 1080) packets.push(packet);\n		}\n		return packets;\n	}\n	function avccNals(sample, size = 4) {\n		const out = [];\n		let at = 0;\n		while (at + size <= sample.length) {\n			let n = 0;\n			for (let i = 0; i < size; i++) n = n * 256 + sample[at++];\n			if (n < 1 || at + n > sample.length) throw Error(\"Invalid AVC sample length\");\n			out.push(sample.subarray(at, at + n));\n			at += n;\n		}\n		if (at !== sample.length) throw Error(\"Trailing AVC sample data\");\n		return out;\n	}\n	// shared/covert-fragments.mjs\n	var text = (b, i) => String.fromCharCode(...b.subarray(i, i + 4));\n	function boxes(b, start = 0, end = b.length) {\n		const v = new DataView(b.buffer, b.byteOffset, b.byteLength), out = [];\n		for (let p = start; p + 8 <= end;) {\n			let size = v.getUint32(p), head = 8;\n			if (size === 1) {\n				if (p + 16 > end) break;\n				size = Number(v.getBigUint64(p + 8));\n				head = 16;\n			}\n			if (size === 0) size = end - p;\n			if (size < head || !Number.isSafeInteger(size)) throw Error(\"Invalid box\");\n			if (p + size > end) break;\n			out.push({\n				type: text(b, p + 4),\n				start: p,\n				data: p + head,\n				end: p + size\n			});\n			p += size;\n		}\n		return out;\n	}\n	var child = (b, parent, type) => boxes(b, parent.data, parent.end).find((x) => x.type === type);\n	var FragmentReader = class {\n		constructor(onPacket) {\n			this.onPacket = onPacket;\n			this.pending = /* @__PURE__ */ new Uint8Array();\n			this.group = [];\n			this.track = null;\n			this.stats = {\n				appends: 0,\n				inits: 0,\n				fragments: 0,\n				samples: 0,\n				packets: 0,\n				errors: 0\n			};\n		}\n		init(b, moov) {\n			for (const t of boxes(b, moov.data, moov.end).filter((x) => x.type === \"trak\")) {\n				const mdia = child(b, t, \"mdia\"), handler = mdia && child(b, mdia, \"hdlr\");\n				if (!handler || text(b, handler.data + 8) !== \"vide\") continue;\n				const tkhd = child(b, t, \"tkhd\"), mdhd = child(b, mdia, \"mdhd\"), stsd = child(b, child(b, child(b, mdia, \"minf\"), \"stbl\"), \"stsd\"), entry = boxes(b, stsd.data + 8, stsd.end)[0], v = new DataView(b.buffer, b.byteOffset, b.byteLength);\n				if (!entry || ![\"avc1\", \"avc3\"].includes(entry.type)) continue;\n				const conf = boxes(b, entry.data + 78, entry.end).find((x) => x.type === \"avcC\");\n				if (!conf) continue;\n				const id = v.getUint32(tkhd.data + (b[tkhd.data] === 1 ? 20 : 12)), scale = v.getUint32(mdhd.data + (b[mdhd.data] === 1 ? 20 : 12));\n				this.track = {\n					id,\n					scale,\n					lengthSize: (b[conf.data + 4] & 3) + 1,\n					duration: 0,\n					size: 0\n				};\n				const mvex = child(b, moov, \"mvex\");\n				if (mvex) {\n					for (const trex of boxes(b, mvex.data, mvex.end).filter((x) => x.type === \"trex\")) if (v.getUint32(trex.data + 4) === id) {\n						this.track.duration = v.getUint32(trex.data + 12);\n						this.track.size = v.getUint32(trex.data + 16);\n					}\n				}\n				this.stats.inits++;\n			}\n		}\n		fragment(b, offset) {\n			if (!this.track) return;\n			const v = new DataView(b.buffer, b.byteOffset, b.byteLength), moof = boxes(b).find((x) => x.type === \"moof\");\n			if (!moof) return;\n			this.stats.fragments++;\n			for (const traf of boxes(b, moof.data, moof.end).filter((x) => x.type === \"traf\")) {\n				const h = child(b, traf, \"tfhd\");\n				if (!h || v.getUint32(h.data + 4) !== this.track.id) continue;\n				const flags = v.getUint32(h.data) & 16777215;\n				let at = h.data + 8, base = moof.start, duration = this.track.duration, size = this.track.size;\n				if (flags & 1) {\n					base = Number(v.getBigUint64(at));\n					at += 8;\n				}\n				if (flags & 2) at += 4;\n				if (flags & 8) {\n					duration = v.getUint32(at);\n					at += 4;\n				}\n				if (flags & 16) {\n					size = v.getUint32(at);\n					at += 4;\n				}\n				const tfdt = child(b, traf, \"tfdt\");\n				let time = tfdt ? b[tfdt.data] === 1 ? Number(v.getBigUint64(tfdt.data + 4)) : v.getUint32(tfdt.data + 4) : 0, previousEnd = null;\n				for (const run of boxes(b, traf.data, traf.end).filter((x) => x.type === \"trun\")) {\n					const f = v.getUint32(run.data) & 16777215, count = v.getUint32(run.data + 4);\n					if (count > 1e4) throw Error(\"Too many samples\");\n					let p = run.data + 8, pos = previousEnd;\n					if (f & 1) {\n						pos = base + v.getInt32(p);\n						p += 4;\n					}\n					if (f & 4) p += 4;\n					if (pos === null) throw Error(\"Missing data offset\");\n					for (let i = 0; i < count; i++) {\n						let d = duration, n = size, cts = 0;\n						if (f & 256) {\n							d = v.getUint32(p);\n							p += 4;\n						}\n						if (f & 512) {\n							n = v.getUint32(p);\n							p += 4;\n						}\n						if (f & 1024) p += 4;\n						if (f & 2048) {\n							cts = b[run.data] === 1 ? v.getInt32(p) : v.getUint32(p);\n							p += 4;\n						}\n						if (n < 1 || pos < 0 || pos + n > b.length) throw Error(\"Sample outside fragment\");\n						this.stats.samples++;\n						for (const nal of avccNals(b.subarray(pos, pos + n), this.track.lengthSize)) for (const packet of readSei(nal)) {\n							this.stats.packets++;\n							this.onPacket({\n								...packet,\n								presentationTime: (time + cts) / this.track.scale + offset\n							});\n						}\n						pos += n;\n						time += d;\n					}\n					previousEnd = pos;\n				}\n			}\n		}\n		feed(input, offset = 0) {\n			this.stats.appends++;\n			const data = new Uint8Array(this.pending.length + input.length);\n			data.set(this.pending);\n			data.set(input, this.pending.length);\n			if (data.length > 16777216) throw Error(\"Fragment buffer limit\");\n			let consumed = 0;\n			for (const box of boxes(data)) {\n				const bytes = data.slice(box.start, box.end);\n				if (box.type === \"moov\") this.init(bytes, boxes(bytes)[0]);\n				if (box.type === \"moof\") this.group = [bytes];\n				else if (this.group.length) {\n					this.group.push(bytes);\n					if (box.type === \"mdat\") {\n						const group = new Uint8Array(this.group.reduce((n, b) => n + b.length, 0));\n						let at = 0;\n						for (const p of this.group) {\n							group.set(p, at);\n							at += p.length;\n						}\n						this.fragment(group, offset);\n						this.group = [];\n					}\n				}\n				consumed = box.end;\n			}\n			this.pending = data.slice(consumed);\n		}\n	};\n	// src/extension-sei/worker-tap.mjs\n	var token = self.__freecamWorkerToken;\n	var send = self.postMessage.bind(self);\n	var owners = /* @__PURE__ */ new WeakMap();\n	var ids = /* @__PURE__ */ new WeakMap();\n	var handles = /* @__PURE__ */ new WeakMap();\n	var readers = /* @__PURE__ */ new WeakMap();\n	var next = 0;\n	var appends = 0;\n	var packets = 0;\n	var id = (source) => {\n		if (!ids.has(source)) ids.set(source, ++next);\n		return ids.get(source);\n	};\n	var report = (type, data, transfer = []) => send({\n		__freecamWorker: token,\n		type,\n		...data\n	}, transfer);\n	var collect = (value, result = [], seen = /* @__PURE__ */ new Set(), depth = 0) => {\n		if (!value || typeof value !== \"object\" || seen.has(value) || depth > 5 || seen.size > 200) return result;\n		seen.add(value);\n		if (handles.has(value)) result.push(id(handles.get(value)));\n		else if (!ArrayBuffer.isView(value) && !(value instanceof ArrayBuffer)) for (const key of Object.keys(value)) collect(value[key], result, seen, depth + 1);\n		return result;\n	};\n	if (globalThis.MediaSource && globalThis.SourceBuffer) {\n		const descriptor = Object.getOwnPropertyDescriptor(MediaSource.prototype, \"handle\");\n		if (descriptor?.get && descriptor.configurable) Object.defineProperty(MediaSource.prototype, \"handle\", {\n			...descriptor,\n			get() {\n				const handle = descriptor.get.call(this);\n				handles.set(handle, this);\n				id(this);\n				return handle;\n			}\n		});\n		const add = MediaSource.prototype.addSourceBuffer, append = SourceBuffer.prototype.appendBuffer;\n		MediaSource.prototype.addSourceBuffer = function(type) {\n			const buffer = Reflect.apply(add, this, [type]);\n			owners.set(buffer, this);\n			return buffer;\n		};\n		SourceBuffer.prototype.appendBuffer = function(input) {\n			try {\n				appends++;\n				let reader = readers.get(this);\n				if (!reader) {\n					const source = id(owners.get(this));\n					reader = new FragmentReader((packet) => {\n						packets++;\n						report(\"packet\", { packet: {\n							...packet,\n							mediaKey: token + \":\" + source\n						} }, [packet.bytes.buffer]);\n					});\n					readers.set(this, reader);\n				}\n				reader.feed(input instanceof ArrayBuffer ? new Uint8Array(input) : new Uint8Array(input.buffer, input.byteOffset, input.byteLength), this.timestampOffset || 0);\n			} catch (error) {\n				report(\"error\", { error: String(error) });\n			}\n			return Reflect.apply(append, this, [input]);\n		};\n		self.postMessage = function(value, ...args) {\n			const found = collect(value);\n			if (found.length) report(\"handles\", { ids: found });\n			return send(value, ...args);\n		};\n		setInterval(() => report(\"stats\", {\n			appends,\n			packets\n		}), 1e3);\n	}\n})();\n", post, stats);
		const report = () => post("status", { stats: {
			...stats,
			hookIntact: !!globalThis.SourceBuffer && SourceBuffer.prototype.appendBuffer === hook
		} });
		let hook;
		setInterval(report, 1500);
		if (!globalThis.SourceBuffer) {
			post("status", { stats: {
				...stats,
				lastError: "MediaSource в основном окне недоступен"
			} });
			return;
		}
		const original = SourceBuffer.prototype.appendBuffer, sources = /* @__PURE__ */ new WeakMap(), owners = /* @__PURE__ */ new WeakMap(), create = URL.createObjectURL, add = MediaSource.prototype.addSourceBuffer;
		URL.createObjectURL = function(value) {
			const url = Reflect.apply(create, this, [value]);
			if (value instanceof MediaSource) sources.set(value, url);
			return url;
		};
		MediaSource.prototype.addSourceBuffer = function(type) {
			const buffer = Reflect.apply(add, this, [type]);
			owners.set(buffer, this);
			const mime = String(type).trim();
			if (!stats.bufferTypes.includes(mime) && stats.bufferTypes.length < 6) stats.bufferTypes.push(mime.slice(0, 160));
			if (/^audio\//i.test(mime)) readers.set(buffer, null);
			return buffer;
		};
		hook = SourceBuffer.prototype.appendBuffer = function(input) {
			stats.appends++;
			if (readers.has(this) && readers.get(this) === null) {
				stats.audioAppends++;
				return Reflect.apply(original, this, [input]);
			}
			try {
				let reader = readers.get(this);
				if (!reader) {
					const buffer = this;
					reader = new FragmentReader((p) => {
						stats.packets++;
						stats.payloadBytes += p.bytes.byteLength;
						post("packet", { packet: {
							...p,
							mediaUrl: sources.get(owners.get(buffer)) || ""
						} });
					});
					readers.set(this, reader);
				}
				const view = input instanceof ArrayBuffer ? new Uint8Array(input) : new Uint8Array(input.buffer, input.byteOffset, input.byteLength);
				stats.videoAppends++;
				reader.feed(view, this.timestampOffset || 0);
			} catch (e) {
				stats.errors++;
				stats.lastError = String(e).slice(0, 150);
			}
			return Reflect.apply(original, this, [input]);
		};
		report();
	})();
})();
