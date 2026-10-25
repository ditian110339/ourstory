/* ═══════════════════════════════════════════════════════════
   我们 · 主程序
   ═══════════════════════════════════════════════════════════ */

(function () {
  'use strict';

  var CFG = window.OURSTORY_CONFIG || {};
  var $ = function (s) { return document.querySelector(s); };
  var WEEK = ['日', '一', '二', '三', '四', '五', '六'];
  var CN_NUM = ['零', '一', '二', '三', '四', '五', '六', '七', '八', '九', '十'];

  var state = {
    store: null,
    mems: [],
    today: startOfDay(new Date()),
    view: 'today',
    calY: 0,
    calM: 0,
    selDay: null,
    draft: { files: [], objs: [] }
  };

  /* ── 小工具 ───────────────────────────────────────────── */

  function pad2(n) { return (n < 10 ? '0' : '') + n; }
  function startOfDay(d) { return new Date(d.getFullYear(), d.getMonth(), d.getDate()); }
  function parseYMD(s) {
    var p = String(s).split('-');
    return new Date(+p[0], +p[1] - 1, +p[2]);
  }
  function ymd(d) { return d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate()); }
  function daysBetween(a, b) {
    return Math.round((startOfDay(b) - startOfDay(a)) / 86400000);
  }
  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }
  function cnNum(n) {
    if (n <= 10) return CN_NUM[n];
    if (n < 20) return '十' + (n % 10 ? CN_NUM[n % 10] : '');
    if (n < 100) return CN_NUM[Math.floor(n / 10)] + '十' + (n % 10 ? CN_NUM[n % 10] : '');
    return String(n);
  }
  function fmtDay(d) {
    return (d.getMonth() + 1) + '月' + d.getDate() + '日';
  }
  function fmtFull(d) {
    return d.getFullYear() + '年' + fmtDay(d);
  }

  var START = parseYMD(CFG.startDate || '2024-07-21');

  /* ── 启动 ─────────────────────────────────────────────── */

  function boot() {
    var td = state.today;
    $('#topbar-date').textContent = fmtFull(td) + ' 星期' + WEEK[td.getDay()];

    if (CFG.siteName) document.title = CFG.siteName;
    if (CFG.me && CFG.you) {
      var k = document.querySelector('.gate-kicker');
      if (k) k.textContent = '只开给 ' + CFG.me + ' 和 ' + CFG.you;
    }

    var isCloud = window.Store.isCloud();
    if (!isCloud) {
      $('#topbar-mode').hidden = false;
      $('#topbar-mode').textContent = '本机';
    }

    state.store = window.Store.create();
    if (window.Home) window.Home.init(state.store);
    state.calY = td.getFullYear();
    state.calM = td.getMonth();

    if (isCloud) {
      $('#gate').hidden = false;
      state.store.restore().then(function (ok) {
        if (ok) { state.store.persist(); enter(); }
        else { bindGate(); }
      }).catch(function () { bindGate(); });
    } else if (CFG.passcode) {
      if (sessionStorage.getItem('ourstory.open') === '1') { enter(); }
      else {
        $('#gate').hidden = false;
        bindGate();
      }
    } else {
      enter();
    }
  }

  function bindGate() {
    $('#gate').hidden = false;
    var form = $('#gate-form');
    var input = $('#gate-input');
    var msg = $('#gate-msg');
    setTimeout(function () { input.focus(); }, 300);

    form.addEventListener('submit', async function (e) {
      e.preventDefault();
      var v = input.value.trim();
      if (!v) return;
      if (window.Store.isCloud()) {
        msg.textContent = '正在开门…';
        msg.classList.add('show');
        try {
          await state.store.login(v);
          state.store.persist();
          msg.classList.remove('show');
          enter();
        } catch (err) {
          msg.textContent = err.message || '进不去';
          msg.classList.add('show');
          $('#gate').classList.add('shake');
          setTimeout(function () { $('#gate').classList.remove('shake'); }, 420);
          input.select();
        }
      } else {
        if (v === String(CFG.passcode)) {
          sessionStorage.setItem('ourstory.open', '1');
          enter();
        } else {
          msg.textContent = '口令不对';
          msg.classList.add('show');
          $('#gate').classList.add('shake');
          setTimeout(function () { $('#gate').classList.remove('shake'); }, 420);
          input.select();
        }
      }
    });
  }

  async function enter() {
    $('#gate').hidden = true;
    $('#app').hidden = false;
    await reload();
    route();
    window.addEventListener('hashchange', route);
    bindAdd();
  }

  async function reload() {
    try {
      await state.store.init();
      var list = await state.store.list();
      await state.store.warm(list);
      state.mems = list;
    } catch (e) {
      console.error(e);
      state.mems = [];
      flash('读取回忆失败：' + (e.message || e));
    }
    renderToday();
    renderCalendar();
    renderAlbum();
  }

  /* ── 路由 ─────────────────────────────────────────────── */

  function route() {
    var v = (location.hash || '#today').replace('#', '') || 'today';
    if (['today', 'calendar', 'album', 'home', 'add'].indexOf(v) < 0) v = 'today';
    if (state.view === v && v !== 'add') { /* 仍重绘，保证数据最新 */ }
    state.view = v;

    ['today', 'calendar', 'album', 'home', 'add'].forEach(function (name) {
      var el = $('#view-' + name);
      if (!el) return;
      el.hidden = name !== v;
    });
    document.querySelectorAll('.tab').forEach(function (t) {
      t.classList.toggle('on', t.getAttribute('data-tab') === v);
    });

    if (v === 'today') { renderToday(); }
    if (v === 'calendar') { renderCalendar(); }
    if (v === 'album') { renderAlbum(); }
    if (v === 'home' && window.Home) { window.Home.enter(); }
    window.scrollTo({ top: 0, behavior: 'auto' });
  }

  /* ── 今天 ─────────────────────────────────────────────── */

  function renderToday() {
    var n = daysBetween(START, state.today) + 1;
    if (!$('#day-count').dataset.done) {
      countUp($('#day-count'), n);
      $('#day-count').dataset.done = '1';
    } else {
      $('#day-count').textContent = n;
    }
    $('#today-line').textContent = '从 ' + fmtFull(START) + ' 算起';
    renderMilestones(n);
    renderThenNow();
  }

  function countUp(el, target) {
    var reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduce) { el.textContent = String(target); return; }
    var t0 = performance.now();
    var dur = 1150;
    function step(t) {
      var p = Math.min(1, (t - t0) / dur);
      var e = 1 - Math.pow(1 - p, 4);
      el.textContent = Math.round(target * e).toLocaleString('en-US').replace(/,/g, ' ');
      if (p < 1) requestAnimationFrame(step);
      else el.textContent = String(target);
    }
    requestAnimationFrame(step);
  }

  function nextAnniversary(today) {
    var y = today.getFullYear();
    var d = new Date(y, START.getMonth(), START.getDate());
    if (d < today) d = new Date(y + 1, START.getMonth(), START.getDate());
    var years = d.getFullYear() - START.getFullYear();
    return { date: d, years: years, days: daysBetween(today, d) };
  }

  function nextRoundDay(dayNum, today) {
    var step = dayNum < 1000 ? 100 : 1000;
    var next = Math.ceil((dayNum + 1) / step) * step;
    return {
      n: next,
      days: next - dayNum,
      date: new Date(START.getFullYear(), START.getMonth(), START.getDate() + next - 1)
    };
  }

  function renderMilestones(dayNum) {
    var box = $('#milestones');
    var ann = nextAnniversary(state.today);
    var round = nextRoundDay(dayNum, state.today);

    var rows = [];

    if (ann.days === 0) {
      rows.push('<div class="milestone"><span class="ms-label">' +
        cnNum(ann.years) + '周年</span><span class="ms-value is-today">就是今天</span></div>');
    } else {
      rows.push('<div class="milestone"><span class="ms-label">' +
        cnNum(ann.years) + '周年 · ' + fmtFull(ann.date) + '</span>' +
        '<span class="ms-value">还有 <em>' + ann.days + '</em> 天</span></div>');
    }

    if (round.n !== 1000 || true) {
      rows.push('<div class="milestone"><span class="ms-label">第 ' + round.n + ' 天</span>' +
        '<span class="ms-value">还有 <em>' + round.days + '</em> 天</span></div>');
    }

    box.innerHTML = rows.join('');
  }

  function renderThenNow() {
    var box = $('#thennow');
    var t = state.today;
    var md = pad2(t.getMonth() + 1) + '-' + pad2(t.getDate());

    var same = state.mems.filter(function (m) {
      return m.day.slice(5) === md && m.day.slice(0, 4) !== String(t.getFullYear());
    });

    var pick = null, kicker = '';
    if (same.length) {
      pick = same[Math.floor(Math.random() * same.length)];
      kicker = '那年今天';
    } else if (state.mems.length) {
      pick = state.mems[0];
      kicker = '最近的一条';
    }

    if (!pick) {
      box.innerHTML =
        '<div class="empty">' +
        '<svg class="empty-mark" viewBox="0 0 48 48" aria-hidden="true">' +
        '<rect x="8" y="10" width="32" height="28" rx="2" fill="none" stroke="currentColor" stroke-width="1.4"/>' +
        '<path d="M10 32l9-8 6 5 5-4 8 6" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linejoin="round"/>' +
        '</svg>' +
        '<p class="empty-title">这里还空着</p>' +
        '<p class="empty-sub">放一张照片进来，<br>它就会出现在这里。</p>' +
        '<a class="empty-btn" href="#add">添第一条</a>' +
        '</div>';
      return;
    }

    box.innerHTML = '<div class="tn-head"><span class="tn-kicker">' + kicker + '</span></div>' +
      memCard(pick, { showYear: true });
  }

  /* ── 记忆卡片 ─────────────────────────────────────────── */

  function memCard(m, opts) {
    opts = opts || {};
    var d = parseYMD(m.day);
    var meta = '<div class="mem-meta"><b>' +
      (opts.showYear ? fmtFull(d) : fmtDay(d)) + '</b><span>星期' + WEEK[d.getDay()] + '</span></div>';

    var photos = m.photos || [];
    var html = '<div class="mem">' + meta;

    if (photos.length) {
      var mode = photos.length === 2 ? ' pair' : (photos.length > 2 ? ' strip' : '');
      html += '<div class="mem-photos' + mode + '">';
      for (var i = 0; i < photos.length; i++) {
        var p = photos[i];
        var url = state.store.urlOf(p) || '';
        var dims = (p.w && p.h) ? ' width="' + p.w + '" height="' + p.h + '"' : '';
        html += '<button class="frame" data-lb="' + esc(m.id) + '" data-pi="' + i + '">' +
          (url ? '<img src="' + esc(url) + '" alt=""' + dims + ' loading="lazy" decoding="async">' : '<div class="skeleton" style="height:180px"></div>') +
          '</button>';
      }
      html += '</div>';
    }

    if (m.text) html += '<p class="mem-text">' + esc(m.text) + '</p>';
    html += '</div>';
    return html;
  }

  /* ── 日历 ─────────────────────────────────────────────── */

  function daySet() {
    var s = {};
    for (var i = 0; i < state.mems.length; i++) s[state.mems[i].day] = true;
    return s;
  }

  function renderCalendar() {
    var y = state.calY, mo = state.calM;
    $('#cal-title').textContent = y + ' 年 ' + (mo + 1) + ' 月';

    var wd = $('#cal-weekdays');
    if (!wd.dataset.done) {
      wd.innerHTML = ['一', '二', '三', '四', '五', '六', '日']
        .map(function (d) { return '<span>' + d + '</span>'; }).join('');
      wd.dataset.done = '1';
    }

    var first = new Date(y, mo, 1);
    var lead = (first.getDay() + 6) % 7;      // 周一为第一列
    var daysInMonth = new Date(y, mo + 1, 0).getDate();
    var has = daySet();
    var todayKey = ymd(state.today);
    var annivMD = pad2(START.getMonth() + 1) + '-' + pad2(START.getDate());

    var cells = [];
    for (var i = 0; i < lead; i++) cells.push('<div class="cal-cell blank"></div>');
    for (var d = 1; d <= daysInMonth; d++) {
      var key = y + '-' + pad2(mo + 1) + '-' + pad2(d);
      var cls = 'cal-cell';
      if (has[key]) cls += ' has';
      if (key === todayKey) cls += ' today';
      if (key.slice(5) === annivMD) cls += ' anniv';
      if (state.selDay === key) cls += ' sel';
      cells.push('<button class="' + cls + '" data-day="' + key + '">' + d + '</button>');
    }
    $('#cal-grid').innerHTML = cells.join('');

    if (!$('#cal-grid').dataset.bound) {
      $('#cal-grid').addEventListener('click', function (e) {
        var b = e.target.closest('.cal-cell[data-day]');
        if (!b) return;
        state.selDay = b.getAttribute('data-day');
        renderCalendar();
        var panel = $('#cal-day');
        if (panel) {
          var top = panel.getBoundingClientRect().top + window.scrollY - 90;
          window.scrollTo({ top: top, behavior: 'smooth' });
        }
      });
      $('#cal-grid').dataset.bound = '1';
    }

    var panel = $('#cal-day');
    if (!state.selDay) {
      if (!state.mems.length) {
        panel.innerHTML = '<div class="empty" style="padding:44px 20px 20px">' +
          '<p class="empty-title">还没有故事</p>' +
          '<p class="empty-sub">日子一天天过，<br>记下来的才会留下来。</p>' +
          '<a class="empty-btn" href="#add">添第一条</a></div>';
        return;
      }
      var mk = y + '-' + pad2(mo + 1);
      var inMonth = state.mems.filter(function (m) { return m.day.slice(0, 7) === mk; });
      if (!inMonth.length) {
        panel.innerHTML = '<div class="album-month"><span>这个月</span></div>' +
          '<div class="empty" style="padding:26px 20px 10px">' +
          '<p class="empty-sub">这个月还没有留下什么。</p>' +
          '<a class="empty-btn" href="#add">添一条</a></div>';
        return;
      }
      panel.innerHTML = '<div class="album-month"><span>这个月 · ' + inMonth.length + ' 条</span></div>' +
        inMonth.map(function (m) { return memCard(m); }).join('');
      return;
    }

    var d0 = parseYMD(state.selDay);
    var items = state.mems.filter(function (m) { return m.day === state.selDay; });
    var head = '<div class="album-month"><span>' + fmtFull(d0) + ' 星期' + WEEK[d0.getDay()] + '</span></div>';
    if (!items.length) {
      panel.innerHTML = head +
        '<div class="empty" style="padding:34px 20px">' +
        '<p class="empty-title">这天没有留下什么</p>' +
        '<p class="empty-sub">想起来的话，现在还补得上。</p>' +
        '<a class="empty-btn" href="#add" data-prefill="' + state.selDay + '">补一条</a>' +
        '</div>';
    } else {
      panel.innerHTML = head + items.map(function (m) { return memCard(m); }).join('');
    }
  }

  /* ── 回忆录 ───────────────────────────────────────────── */

  function renderAlbum() {
    var box = $('#album-list');
    var photoCount = state.mems.reduce(function (a, m) { return a + (m.photos || []).length; }, 0);

    if (!state.mems.length) {
      $('#album-stats').textContent = '还什么都没有';
      box.innerHTML =
        '<div class="empty">' +
        '<svg class="empty-mark" viewBox="0 0 48 48" aria-hidden="true">' +
        '<rect x="7" y="12" width="28" height="24" rx="2" fill="none" stroke="currentColor" stroke-width="1.4"/>' +
        '<path d="M12 8h26a2 2 0 0 1 2 2v22" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/>' +
        '</svg>' +
        '<p class="empty-title">回忆录还是空的</p>' +
        '<p class="empty-sub">从今天开始，一张照片一句话，<br>慢慢就有了厚度。</p>' +
        '<a class="empty-btn" href="#add">添第一条</a>' +
        '</div>';
      return;
    }

    var span = Math.abs(daysBetween(START, state.today)) + 1;
    $('#album-stats').textContent = state.mems.length + ' 条记忆 · ' + photoCount + ' 张照片 · 走过 ' + span + ' 天';

    var html = '';
    var curKey = '';
    state.mems.forEach(function (m, idx) {
      var d = parseYMD(m.day);
      var key = d.getFullYear() + '-' + d.getMonth();
      if (key !== curKey) {
        curKey = key;
        html += '<div class="album-month"><span>' + d.getFullYear() + ' 年 ' + (d.getMonth() + 1) + ' 月</span></div>';
      }
      html += memCard(m);
    });
    box.innerHTML = html;
  }

  /* ── 大图 ─────────────────────────────────────────────── */

  document.addEventListener('click', function (e) {
    var btn = e.target.closest('[data-lb]');
    if (!btn) return;
    var id = btn.getAttribute('data-lb');
    var pi = +btn.getAttribute('data-pi');
    var mem = state.mems.filter(function (m) { return m.id === id; })[0];
    if (!mem) return;
    var p = mem.photos[pi];
    if (!p) return;
    openLightbox(mem, p);
  });

  function openLightbox(mem, photo) {
    var lb = $('#lightbox');
    var url = state.store.urlOf(photo);
    $('#lb-inner').innerHTML =
      (url ? '<img src="' + esc(url) + '" alt="">' : '') +
      '<p class="lb-caption">' + (mem.text ? esc(mem.text) + '<br>' : '') +
      '<span style="opacity:.55">' + fmtFull(parseYMD(mem.day)) + '</span>' +
      '<br><button class="btn-ghost" style="margin-top:16px;padding:8px 18px;font-size:11.5px;color:rgba(255,255,255,.5);border-color:rgba(255,255,255,.25)" data-del="' + esc(mem.id) + '">删掉这条</button>' +
      '</p>';
    lb.hidden = false;
    document.body.style.overflow = 'hidden';
  }

  function closeLightbox() {
    $('#lightbox').hidden = true;
    document.body.style.overflow = '';
  }

  $('#lb-close').addEventListener('click', closeLightbox);
  $('#lightbox').addEventListener('click', function (e) {
    if (e.target === $('#lightbox')) closeLightbox();
  });

  document.addEventListener('click', async function (e) {
    var del = e.target.closest('[data-del]');
    if (!del) return;
    e.preventDefault();
    if (!confirm('删掉这条回忆？照片也会一起删掉，找不回来。')) return;
    var id = del.getAttribute('data-del');
    var mem = state.mems.filter(function (m) { return m.id === id; })[0];
    if (!mem) return;
    del.textContent = '正在删…';
    try {
      await state.store.remove(mem);
      state.mems = state.mems.filter(function (m) { return m.id !== id; });
      closeLightbox();
      renderToday(); renderCalendar(); renderAlbum();
    } catch (err) {
      del.textContent = '没删掉，再试一次';
    }
  });

  /* ── 添加 ─────────────────────────────────────────────── */

  function bindAdd() {
    var input = $('#file-input');
    var draftEl = $('#draft');

    if (!input.dataset.bound) {
      $('#picker').addEventListener('click', function (e) {
        if (e.target === input) return;
        input.click();
      });
      input.addEventListener('change', async function () {
        var files = Array.prototype.slice.call(input.files || []);
        if (!files.length) return;
        state.draft.files = state.draft.files.concat(files);
        await refreshDraft();
        input.value = '';
      });
      input.dataset.bound = '1';
    }

    if (!docBound('#draft-cancel')) {
      $('#draft-cancel').addEventListener('click', function () {
        clearDraft();
      });
    }
    if (!docBound('#draft-save')) {
      $('#draft-save').addEventListener('click', saveDraft);
    }

    // 从日历补一条时带过来的日期
    document.addEventListener('click', function (e) {
      var a = e.target.closest('[data-prefill]');
      if (!a) return;
      var day = a.getAttribute('data-prefill');
      state.draft.files = [];
      state.draft.objs = [];
      refreshDraft().then(function () {
        var di = $('#draft-date');
        if (di) di.value = day;
      });
    });

    draftEl.hidden = true;
  }

  var _bound = {};
  function docBound(sel) {
    if (_bound[sel]) return true;
    _bound[sel] = true;
    return false;
  }

  async function refreshDraft() {
    var th = $('#draft-thumbs');
    state.draft.objs.forEach(function (u) { URL.revokeObjectURL(u); });
    state.draft.objs = [];
    th.innerHTML = '';

    var has = state.draft.files.length > 0;
    $('#picker').hidden = has;
    $('#draft').hidden = !has;
    if (!has) return;

    state.draft.files.forEach(function (f, i) {
      var el = document.createElement('div');
      el.className = 'thumb';
      var url = URL.createObjectURL(f);
      state.draft.objs.push(url);
      el.innerHTML = '<img src="' + url + '" alt="">' +
        '<button class="thumb-del" data-rm="' + i + '" type="button" aria-label="去掉">×</button>';
      th.appendChild(el);
    });

    var more = document.createElement('label');
    more.className = 'thumb thumb-add';
    more.setAttribute('for', 'file-input');
    more.textContent = '+';
    th.appendChild(more);

    th.querySelectorAll('[data-rm]').forEach(function (b) {
      b.addEventListener('click', function () {
        var i = +b.getAttribute('data-rm');
        state.draft.files.splice(i, 1);
        refreshDraft();
      });
    });

    var di = $('#draft-date');
    if (!di.value) {
      var exif = await window.Store.readExifDate(state.draft.files[0]);
      di.value = exif || ymd(state.today);
    }
  }

  function clearDraft() {
    state.draft.files = [];
    state.draft.objs.forEach(function (u) { URL.revokeObjectURL(u); });
    state.draft.objs = [];
    $('#draft-thumbs').innerHTML = '';
    $('#draft-text').value = '';
    $('#draft-date').value = '';
    $('#draft-status').textContent = '';
    $('#draft-status').classList.remove('err');
    $('#draft').hidden = true;
    $('#picker').hidden = false;
  }

  async function saveDraft() {
    var btn = $('#draft-save');
    var st = $('#draft-status');
    var files = state.draft.files;
    var day = $('#draft-date').value || ymd(state.today);
    var text = $('#draft-text').value.trim();

    if (!files.length) { st.textContent = '还没选照片'; st.classList.add('err'); return; }

    btn.disabled = true;
    st.classList.remove('err');
    st.textContent = '正在收好…';

    try {
      var mem = await state.store.add({ day: day, text: text, files: files });
      state.mems.unshift(mem);
      state.mems.sort(function (a, b) {
        return a.day === b.day ? 0 : (a.day < b.day ? 1 : -1);
      });
      await state.store.warm([mem]);
      clearDraft();
      st.textContent = '';
      renderToday(); renderCalendar(); renderAlbum();
      location.hash = '#album';
    } catch (e) {
      console.error(e);
      var msg = String(e.message || e);
      if (/fetch|network|load failed/i.test(msg)) {
        st.textContent = '网络没连上。照片还在这儿，再点一次「存进回忆录」就行。';
      } else if (/口令|401|403/.test(msg)) {
        st.textContent = '登录过期了，关掉重开一次再试。';
      } else {
        st.textContent = '没存上：' + msg.slice(0, 60);
      }
      st.classList.add('err');
    } finally {
      btn.disabled = false;
    }
  }

  /* ── 月份切换 ─────────────────────────────────────────── */

  $('#cal-prev').addEventListener('click', function () {
    state.calM--;
    if (state.calM < 0) { state.calM = 11; state.calY--; }
    state.selDay = null;
    renderCalendar();
  });
  $('#cal-next').addEventListener('click', function () {
    state.calM++;
    if (state.calM > 11) { state.calM = 0; state.calY++; }
    state.selDay = null;
    renderCalendar();
  });

  /* ── 轻提示 ───────────────────────────────────────────── */

  function flash(msg) {
    var d = document.createElement('div');
    d.textContent = msg;
    d.style.cssText = 'position:fixed;left:50%;bottom:calc(88px + env(safe-area-inset-bottom));' +
      'transform:translateX(-50%);z-index:300;max-width:86vw;padding:11px 18px;' +
      'background:rgba(42,36,32,.92);color:#FAF6EF;font-size:12.5px;line-height:1.6;' +
      'border-radius:3px;text-align:center';
    document.body.appendChild(d);
    setTimeout(function () { d.remove(); }, 4200);
  }

  /* ── 开跑 ─────────────────────────────────────────────── */

  document.addEventListener('DOMContentLoaded', boot);
  if (document.readyState === 'interactive' || document.readyState === 'complete') boot();

  // 注册离线外壳
  if ('serviceWorker' in navigator && location.protocol === 'https:') {
    window.addEventListener('load', function () {
      navigator.serviceWorker.register('sw.js').catch(function () {});
    });
  }

})();
