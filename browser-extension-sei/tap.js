(function() {
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
