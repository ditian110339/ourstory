/* ═══════════════════════════════════════════════════════════
   存储层：同一套用法，两种后端
   - local  存在这台手机的浏览器里（IndexedDB）
   - cloud  存在 Supabase（两台手机共享）
   ═══════════════════════════════════════════════════════════ */

(function (global) {
  'use strict';

  var CFG = global.OURSTORY_CONFIG || {};
  var MAX_EDGE = 1600;      // 长边像素
  var QUALITY = 0.82;       // webp 质量

  function uid() {
    if (global.crypto && crypto.randomUUID) return crypto.randomUUID();
    return 'x' + Date.now().toString(36) + Math.random().toString(36).slice(2, 10);
  }

  /* 网络不稳的时候自动重试几次 */
  async function req(url, opts, tries) {
    tries = tries || 3;
    var lastErr;
    for (var i = 0; i < tries; i++) {
      try {
        return await fetch(url, opts);
      } catch (e) {
        lastErr = e;
        await new Promise(function (r) { setTimeout(r, 350 * (i + 1)); });
      }
    }
    throw lastErr;
  }

  /* ── 图片压缩 ──────────────────────────────────────────── */

  async function loadBitmap(file) {
    if (global.createImageBitmap) {
      try {
        return await createImageBitmap(file, { imageOrientation: 'from-image' });
      } catch (e) { /* 不支持这个选项时退回 */ }
      try {
        return await createImageBitmap(file);
      } catch (e) { /* 继续退回 */ }
    }
    return await new Promise(function (res, rej) {
      var url = URL.createObjectURL(file);
      var img = new Image();
      img.onload = function () { URL.revokeObjectURL(url); res(img); };
      img.onerror = function () { URL.revokeObjectURL(url); rej(new Error('图片读不出来')); };
      img.src = url;
    });
  }

  async function compress(file) {
    var bmp = await loadBitmap(file);
    var w = bmp.width, h = bmp.height;
    var scale = Math.min(1, MAX_EDGE / Math.max(w, h));
    var tw = Math.max(1, Math.round(w * scale));
    var th = Math.max(1, Math.round(h * scale));

    var canvas = document.createElement('canvas');
    canvas.width = tw; canvas.height = th;
    var ctx = canvas.getContext('2d');
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(bmp, 0, 0, tw, th);
    if (bmp.close) bmp.close();

    var blob = await new Promise(function (res) {
      canvas.toBlob(res, 'image/webp', QUALITY);
    });
    if (!blob) {
      blob = await new Promise(function (res) {
        canvas.toBlob(res, 'image/jpeg', 0.85);
      });
    }
    return { blob: blob || file, w: tw, h: th };
  }

  /* ── 从照片里读拍摄日期 ────────────────────────────────── */

  function parseTiffDate(view, tiffStart) {
    var little = view.getUint16(tiffStart) === 0x4949;
    function u16(o) { return view.getUint16(o, little); }
    function u32(o) { return view.getUint32(o, little); }

    var ifd0 = tiffStart + u32(tiffStart + 4);
    if (ifd0 + 2 > view.byteLength) return null;

    function readIfd(off) {
      var n = u16(off), entries = {}, exifOff = 0;
      for (var i = 0; i < n; i++) {
        var e = off + 2 + i * 12;
        if (e + 12 > view.byteLength) break;
        var tag = u16(e), type = u16(e + 2), count = u32(e + 4);
        if (tag === 0x8769) exifOff = tiffStart + u32(e + 8);
        if (tag === 0x9003 || tag === 0x9004 || tag === 0x0132) {
          var vOff = tiffStart + u32(e + 8);
          if (type === 2 && count < 64 && vOff + count <= view.byteLength) {
            var s = '';
            for (var k = 0; k < count - 1; k++) {
              var c = view.getUint8(vOff + k);
              if (c === 0) break;
              s += String.fromCharCode(c);
            }
            entries[tag] = s;
          }
        }
      }
      return { entries: entries, exifOff: exifOff };
    }

    var a = readIfd(ifd0);
    var b = a.exifOff ? readIfd(a.exifOff) : { entries: {} };
    var raw = b.entries[0x9003] || b.entries[0x9004] || a.entries[0x0132];
    if (!raw) return null;
    var m = raw.match(/^(\d{4})[:\-](\d{2})[:\-](\d{2})/);
    if (!m) return null;
    return m[1] + '-' + m[2] + '-' + m[3];
  }

  async function readExifDate(file) {
    try {
      var head = await file.slice(0, 1024 * 512).arrayBuffer();
      var view = new DataView(head);
      if (view.byteLength < 4) return null;
      if (view.getUint16(0) !== 0xFFD8) return null;
      var off = 2;
      while (off + 4 <= view.byteLength) {
        var marker = view.getUint16(off);
        if (marker === 0xFFDA || marker === 0xFFD9) break;
        if ((marker & 0xFF00) !== 0xFF00) break;
        var size = view.getUint16(off + 2);
        if (size < 2) break;
        if (marker === 0xFFE1) {
          var start = off + 4;
          if (start + 6 <= view.byteLength && view.getUint32(start) === 0x45786966) {
            var d = parseTiffDate(view, start + 6);
            if (d) return d;
          }
        }
        off += 2 + size;
      }
    } catch (e) { /* 读不出来就用文件时间 */ }
    return null;
  }

  /* ── 日期工具 ──────────────────────────────────────────── */

  function pad(n) { return (n < 10 ? '0' : '') + n; }
  function ymd(d) { return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); }
  function parseYMD(s) {
    var p = String(s).split('-');
    return new Date(+p[0], +p[1] - 1, +p[2]);
  }

  /* ── IndexedDB ─────────────────────────────────────────── */

  function openDB() {
    return new Promise(function (res, rej) {
      var req = indexedDB.open('ourstory', 1);
      req.onupgradeneeded = function () {
        var db = req.result;
        if (!db.objectStoreNames.contains('memories')) {
          db.createObjectStore('memories', { keyPath: 'id' });
        }
        if (!db.objectStoreNames.contains('blobs')) {
          db.createObjectStore('blobs');
        }
      };
      req.onsuccess = function () { res(req.result); };
      req.onerror = function () { rej(req.error); };
    });
  }

  function idbPut(db, store, value, key) {
    return new Promise(function (res, rej) {
      var tx = db.transaction(store, 'readwrite');
      var r = key === undefined ? tx.objectStore(store).put(value)
                                : tx.objectStore(store).put(value, key);
      r.onsuccess = function () { res(); };
      r.onerror = function () { rej(r.error); };
    });
  }

  function idbGet(db, store, key) {
    return new Promise(function (res, rej) {
      var r = db.transaction(store, 'readonly').objectStore(store).get(key);
      r.onsuccess = function () { res(r.result); };
      r.onerror = function () { rej(r.error); };
    });
  }

  function idbAll(db, store) {
    return new Promise(function (res, rej) {
      var r = db.transaction(store, 'readonly').objectStore(store).getAll();
      r.onsuccess = function () { res(r.result || []); };
      r.onerror = function () { rej(r.error); };
    });
  }

  function idbDel(db, store, key) {
    return new Promise(function (res, rej) {
      var r = db.transaction(store, 'readwrite').objectStore(store).delete(key);
      r.onsuccess = function () { res(); };
      r.onerror = function () { rej(r.error); };
    });
  }

  /* ── 本地后端 ──────────────────────────────────────────── */

  function LocalStore() {}

  LocalStore.prototype.init = async function () {
    this.db = await openDB();
    this._urls = {};
    return this;
  };

  LocalStore.prototype.list = async function () {
    var rows = await idbAll(this.db, 'memories');
    return rows.sort(function (a, b) { return a.day < b.day ? 1 : -1; });
  };

  LocalStore.prototype.add = async function (input) {
    var id = uid();
    var photos = [];
    for (var i = 0; i < input.files.length; i++) {
      var out = await compress(input.files[i]);
      var pid = uid();
      await idbPut(this.db, 'blobs', out.blob, pid);
      photos.push({ id: pid, w: out.w, h: out.h });
    }
    var mem = {
      id: id,
      day: input.day,
      text: input.text || '',
      photos: photos,
      created_at: new Date().toISOString()
    };
    await idbPut(this.db, 'memories', mem);
    return mem;
  };

  LocalStore.prototype.src = async function (photo) {
    if (this._urls[photo.id]) return this._urls[photo.id];
    var blob = await idbGet(this.db, 'blobs', photo.id);
    if (!blob) return '';
    var url = URL.createObjectURL(blob);
    this._urls[photo.id] = url;
    return url;
  };

  LocalStore.prototype.remove = async function (mem) {
    for (var i = 0; i < mem.photos.length; i++) {
      var p = mem.photos[i];
      if (this._urls[p.id]) { URL.revokeObjectURL(this._urls[p.id]); delete this._urls[p.id]; }
      await idbDel(this.db, 'blobs', p.id);
    }
    await idbDel(this.db, 'memories', mem.id);
  };

  LocalStore.prototype.warm = async function (mems) {
    for (var i = 0; i < mems.length; i++) {
      for (var j = 0; j < mems[i].photos.length; j++) {
        var p = mems[i].photos[j];
        if (this._urls[p.id]) continue;
        var blob = await idbGet(this.db, 'blobs', p.id);
        if (blob) this._urls[p.id] = URL.createObjectURL(blob);
      }
    }
    return mems;
  };

  LocalStore.prototype.urlOf = function (photo) {
    return this._urls[photo.id] || '';
  };

  /* ── 云端后端（Supabase REST，不依赖 SDK） ─────────────── */

  function CloudStore(cfg) {
    this.base = String(cfg.url || '').replace(/\/+$/, '');
    this.key = cfg.anonKey || '';
    this.email = cfg.email || '';
    this.bucket = 'photos';
    this.token = null;
    this.refreshToken = null;
    this.expiresAt = 0;
    this._urls = {};
    this._urlsAt = 0;
  }

  CloudStore.prototype.headers = function (auth) {
    var h = { 'apikey': this.key, 'Content-Type': 'application/json' };
    if (auth !== false && this.token) h['Authorization'] = 'Bearer ' + this.token;
    return h;
  };

  CloudStore.prototype.login = async function (password) {
    var r = await req(this.base + '/auth/v1/token?grant_type=password', {
      method: 'POST',
      headers: { 'apikey': this.key, 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: this.email, password: password })
    });
    if (!r.ok) {
      var t = await r.text();
      throw new Error('口令不对，或者账号还没建好（' + r.status + '）' + (t ? ' ' + t.slice(0, 120) : ''));
    }
    var j = await r.json();
    this.token = j.access_token;
    this.refreshToken = j.refresh_token;
    this.expiresAt = Date.now() + (j.expires_in || 3600) * 1000;
    return true;
  };

  CloudStore.prototype.restore = async function () {
    try {
      var saved = JSON.parse(localStorage.getItem('ourstory.session') || 'null');
      if (!saved || !saved.refresh_token) return false;
      this.refreshToken = saved.refresh_token;
      var r = await req(this.base + '/auth/v1/token?grant_type=refresh_token', {
        method: 'POST',
        headers: { 'apikey': this.key, 'Content-Type': 'application/json' },
        body: JSON.stringify({ refresh_token: saved.refresh_token })
      });
      if (!r.ok) return false;
      var j = await r.json();
      this.token = j.access_token;
      this.refreshToken = j.refresh_token;
      this.expiresAt = Date.now() + (j.expires_in || 3600) * 1000;
      localStorage.setItem('ourstory.session', JSON.stringify({ refresh_token: j.refresh_token }));
      return true;
    } catch (e) {
      return false;
    }
  };

  CloudStore.prototype.persist = function () {
    if (this.refreshToken) {
      localStorage.setItem('ourstory.session', JSON.stringify({ refresh_token: this.refreshToken }));
    }
  };

  CloudStore.prototype.ensure = async function () {
    if (this.token && Date.now() < this.expiresAt - 60000) return;
    var ok = await this.restore();
    if (!ok) throw new Error('需要重新输入口令');
  };

  CloudStore.prototype.init = async function () {
    return this;
  };

  CloudStore.prototype.list = async function () {
    await this.ensure();
    var r = await req(this.base + '/rest/v1/memories?select=*&order=day.desc', {
      headers: this.headers()
    });
    if (!r.ok) throw new Error('读取失败 ' + r.status);
    return await r.json();
  };

  CloudStore.prototype.add = async function (input) {
    await this.ensure();
    var id = uid();
    var photos = [];

    for (var i = 0; i < input.files.length; i++) {
      var out = await compress(input.files[i]);
      var pid = uid();
      var path = id + '/' + pid + '.webp';
      var up = await req(this.base + '/storage/v1/object/' + this.bucket + '/' + path, {
        method: 'POST',
        headers: {
          'apikey': this.key,
          'Authorization': 'Bearer ' + this.token,
          'Content-Type': 'image/webp',
          'x-upsert': 'true',
          'cache-control': '31536000'
        },
        body: out.blob
      });
      if (!up.ok) {
        var msg = await up.text();
        throw new Error('照片上传失败：' + msg.slice(0, 160));
      }
      photos.push({ id: pid, path: path, w: out.w, h: out.h });
    }

    var mem = { id: id, day: input.day, text: input.text || '', photos: photos };
    var r = await req(this.base + '/rest/v1/memories', {
      method: 'POST',
      headers: Object.assign(this.headers(), { 'Prefer': 'return=representation' }),
      body: JSON.stringify(mem)
    });
    if (!r.ok) {
      var t = await r.text();
      throw new Error('保存失败 ' + t.slice(0, 160));
    }
    var saved = await r.json();
    mem.created_at = (saved && saved[0] && saved[0].created_at) || new Date().toISOString();
    return mem;
  };

  CloudStore.prototype.warm = async function (mems) {
    await this.ensure();
    var need = [];
    for (var i = 0; i < mems.length; i++) {
      for (var j = 0; j < mems[i].photos.length; j++) {
        var p = mems[i].photos[j];
        if (!this._urls[p.id] && p.path) need.push(p);
      }
    }
    if (!need.length) return mems;

    // 每次最多签 100 张，分批
    for (var s = 0; s < need.length; s += 100) {
      var chunk = need.slice(s, s + 100);
      var r = await req(this.base + '/storage/v1/object/sign/' + this.bucket, {
        method: 'POST',
        headers: this.headers(),
        body: JSON.stringify({
          expiresIn: 3600,
          paths: chunk.map(function (p) { return p.path; })
        })
      });
      if (!r.ok) continue;
      var arr = await r.json();
      if (!Array.isArray(arr)) continue;
      for (var k = 0; k < arr.length; k++) {
        var item = arr[k];
        if (!item || !item.signedURL) continue;
        var path = (item.path || '').replace(/^\/?/, '');
        var target = chunk.filter(function (p) { return p.path === path || p.path === item.path; })[0];
        if (!target && arr.length === chunk.length) target = chunk[k];
        var url = this.base + '/storage/v1/' + String(item.signedURL).replace(/^\/+/, '');
        if (target) this._urls[target.id] = url;
      }
    }
    return mems;
  };

  CloudStore.prototype.src = async function (photo) {
    if (this._urls[photo.id]) return this._urls[photo.id];
    await this.warm([{ photos: [photo] }]);
    return this._urls[photo.id] || '';
  };

  CloudStore.prototype.urlOf = function (photo) {
    return this._urls[photo.id] || '';
  };

  CloudStore.prototype.remove = async function (mem) {
    await this.ensure();
    var paths = (mem.photos || []).filter(function (p) { return p.path; })
      .map(function (p) { return p.path; });
    if (paths.length) {
      await req(this.base + '/storage/v1/object/' + this.bucket, {
        method: 'DELETE',
        headers: this.headers(),
        body: JSON.stringify({ prefixes: paths })
      });
    }
    await req(this.base + '/rest/v1/memories?id=eq.' + encodeURIComponent(mem.id), {
      method: 'DELETE',
      headers: this.headers()
    });
  };

  /* ── 出口 ──────────────────────────────────────────────── */

  global.Store = {
    create: function () {
      if (CFG.mode === 'cloud' && CFG.supabase && CFG.supabase.url) {
        return new CloudStore(CFG.supabase);
      }
      return new LocalStore();
    },
    isCloud: function () { return CFG.mode === 'cloud' && !!(CFG.supabase && CFG.supabase.url); },
    compress: compress,
    readExifDate: readExifDate,
    ymd: ymd,
    parseYMD: parseYMD,
    uid: uid
  };

})(window);
