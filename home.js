/* ═══════════════════════════════════════════════════════════
   家 · 一只叫团子的猫
   ═══════════════════════════════════════════════════════════ */

(function (global) {
  'use strict';

  var CFG = global.OURSTORY_CONFIG || {};
  var NAME = CFG.petName || '团子';
  var START = (function () {
    var p = String(CFG.startDate || '2024-07-21').split('-');
    return new Date(+p[0], +p[1] - 1, +p[2]);
  })();

  var st = null;                 // 存储层（由 app.js 传进来）
  var pet = null;
  var who = null;
  var chat = [];
  var busy = false;
  var bubbleTimer = 0;

  function $(s) { return document.querySelector(s); }
  function pad(n) { return (n < 10 ? '0' : '') + n; }
  function ymd(d) { return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); }
  function pick(arr) { return arr[Math.floor(Math.random() * arr.length)]; }
  function daysTogether() {
    var t = new Date();
    var a = new Date(START.getFullYear(), START.getMonth(), START.getDate());
    var b = new Date(t.getFullYear(), t.getMonth(), t.getDate());
    return Math.round((b - a) / 86400000) + 1;
  }
  function hoursSince(iso) {
    if (!iso) return 99;
    return (Date.now() - new Date(iso).getTime()) / 3600000;
  }
  function hungerOf(p) {
    if (!p || !p.last_fed_at) return 8;
    return Math.max(0, Math.min(100, Math.round(100 - hoursSince(p.last_fed_at) * 3.2)));
  }

  /* ── 跟后端说话 ────────────────────────────────────────── */

  async function rq(method, path, body, tries) {
    tries = tries || 4;
    var last;
    for (var i = 0; i < tries; i++) {
      try {
        await st.ensure();
        var res = await fetch(st.base + path, {
          method: method,
          headers: {
            apikey: st.key,
            Authorization: 'Bearer ' + st.token,
            'Content-Type': 'application/json',
            Prefer: 'return=representation'
          },
          body: body ? JSON.stringify(body) : undefined
        });
        if (!res.ok) throw new Error('HTTP ' + res.status);
        return await res.json();
      } catch (e) {
        last = e;
        await new Promise(function (r) { setTimeout(r, 400 * (i + 1)); });
      }
    }
    throw last;
  }

  async function load() {
    var rows = await rq('GET', '/rest/v1/pet?id=eq.1&select=*');
    pet = (rows && rows[0]) || { id: 1, xp: 0, last_fed_at: null, fed_a: null, fed_b: null };
    var c = await rq('GET', '/rest/v1/pet_chat?select=*&order=at.desc&limit=10');
    chat = (c || []).reverse();
  }

  /* ── 它说的话 ──────────────────────────────────────────── */

  var INTENTS = [
    { k: ['饿', '吃', '饭', '喂', '口粮', '小鱼'], r: [
      '碗里空的时候，我就趴在窗台数外面的车。',
      '我不挑食的，真的。但你喂的时候我会更高兴一点。',
      '如果说实话……我现在能吃掉一整条鱼。',
      '你们俩谁喂都行，我记性好，都记得。'
    ]},
    { k: ['想你', '喜欢', '爱', '抱', '蹭', '亲'], r: [
      '我把尾巴绕过来搭在你手上了。就一下下。',
      '我不会说话的时候，就用脑袋顶你的手心。',
      '我知道的呀。我一直在屋子里等你们回来。',
      '别说得那么大声，我会不好意思，会躲到沙发底下。'
    ]},
    { k: ['晚安', '睡', '困', '做梦', '睡觉'], r: [
      '那我把灯留一点点。夜里醒了我就在这儿。',
      '（打了个哈欠，缩成一小团）',
      '睡吧，我数着你们在一起的天数睡着的。',
      '梦里也要回来看看我哦。'
    ]},
    { k: ['累', '烦', '难过', '哭', '压力', '加班', '不开心', '委屈', '崩溃'], r: [
      '我不太会安慰人。我先坐到你旁边，可以吗。',
      '难过的时候不用说话，我陪你趴一会儿。',
      '地板有点凉，我把尾巴放你脚上了。',
      '你们大人好辛苦。我不吵，我就看着你。'
    ]},
    { k: ['你好', '在吗', 'hi', 'hello', '嗨', '喂喂'], r: [
      '我在。刚睡醒，眼睛还没睁开。',
      '你回来啦。今天屋子里的光不一样。',
      '（耳朵动了一下）嗯？',
      '我一直都在的，就是有时候太安静了你没发现。'
    ]},
    { k: ['名字', '叫什么', '谁'], r: [
      '我叫' + NAME + '。是你们起的，我很喜欢。',
      NAME + '。叫我的时候声音轻一点，我会跑过来。'
    ]},
    { k: ['几岁', '多大', '生日', '多久'], r: [
      '我是这个屋子建好那天来的。那天开始有光。',
      '按你们的算法，我还很小。按猫的算法，我已经很懂事了。'
    ]},
    { k: ['照片', '回忆', '记得', '以前', '那天'], r: [
      '墙上那些照片我天天看，看久了像我也在场。',
      '我记得有一次屋子里特别吵，后来就很安静，那天你们都在。',
      '你们拍照片的时候，我一般躲在画面外面。'
    ]},
    { k: ['一起', '我们', '你们', '两个人'], r: [
      '你们俩一起回来的时候，屋子最暖。',
      '我不偏心。谁先摸我我就先蹭谁。',
      '一个喂我，一个陪我，我就很满足了。'
    ]},
    { k: ['乖', '棒', '厉害', '可爱', '好看', '漂亮'], r: [
      '（把胸口挺起来了一点，又假装不在意）',
      '我知道。但我还是要装作没听见。',
      '你这么说，我今天可以多绕你两圈。'
    ]},
    { k: ['天气', '下雨', '冷', '热', '外面'], r: [
      '窗外我看得见。天冷的时候地板更凉，我喜欢贴着人坐。',
      '下雨天最好，雨声能把屋子填满。'
    ]}
  ];

  var QUESTIONS = [
    '那你呢，今天过得怎么样？',
    '你今天有没有好好吃饭？',
    '她今天跟你说话了吗？',
    '你今天想我了吗？',
    '你们今天有吵架吗……我不问也行。'
  ];

  var OPENERS = [
    '你回来啦。',
    '（从窗台上跳下来）',
    '我听见门响了。',
    '今天屋子里的光挺好的。',
    '我正在看窗外，什么也没看见。'
  ];

  function ctx() {
    var t = new Date();
    var h = t.getHours();
    var today = ymd(t);
    return {
      hour: h,
      night: h >= 22 || h < 6,
      late: h >= 18,
      hunger: hungerOf(pet),
      fedMe: !!(who && pet && pet['fed_' + who] === today),
      fedOther: !!(who && pet && pet['fed_' + (who === 'a' ? 'b' : 'a')] === today),
      fedToday: !!(pet && pet.last_fed_at && String(pet.last_fed_at).slice(0, 10) === today),
      level: 1 + Math.floor((pet && pet.xp ? pet.xp : 0) / 100),
      days: daysTogether()
    };
  }

  function brain(msg) {
    var c = ctx();
    var text = String(msg || '').trim();
    var low = text.toLowerCase();

    // 找关键词
    var hit = null;
    for (var i = 0; i < INTENTS.length; i++) {
      for (var j = 0; j < INTENTS[i].k.length; j++) {
        if (low.indexOf(INTENTS[i].k[j]) >= 0) { hit = INTENTS[i]; break; }
      }
      if (hit) break;
    }

    var line = hit ? pick(hit.r) : null;

    // 记性：翻以前的聊天，看有没有同一个词
    if (!line && text.length >= 2) {
      var words = text.replace(/[，。！？,.!?\s]/g, ' ').split(' ').filter(function (w) { return w.length >= 2; });
      for (var k = 0; k < chat.length; k++) {
        var prev = chat[k].said || '';
        for (var w = 0; w < words.length; w++) {
          if (prev.indexOf(words[w]) >= 0 && words[w] !== text) {
            line = '你之前也说过「' + words[w] + '」。我记着呢。';
            break;
          }
        }
        if (line) break;
      }
    }

    if (!line) {
      line = pick([
        '嗯……我听着呢。你继续说。',
        '（歪了歪头，好像在努力听懂）',
        '这个词我不太懂。但我喜欢听你说话。',
        '我把你说的记在心里了，虽然我不知道放在哪儿。',
        '喵。我是说，我在。'
      ]);
    }

    // 说完之后，偶尔反问一句，让它像个会聊天的家伙
    var ask = Math.random() < 0.32 ? ' ' + pick(QUESTIONS) : '';

    // 情境修饰
    if (c.night && Math.random() < 0.45) line = '（声音很轻）' + line;
    if (c.hunger < 25 && Math.random() < 0.5) line += ' 对了……我有点饿了。';

    return line + ask;
  }

  function opener() {
    var c = ctx();
    if (c.hunger < 22 && !c.fedMe) return '你回来啦。我……有点饿了，碗里是空的。';
    if (c.fedOther && !c.fedMe) return '她今天来过了，给我添了饭。你还没喂我呢。';
    if (c.fedMe && c.fedOther) return '今天你们俩都喂过我了。我可以趴在你们中间。';
    if (c.night) return '这么晚还没睡？我陪你一会儿。';
    if (c.days > 800) return '你们在一起第 ' + c.days + ' 天了。我都看在眼里。';
    return pick(OPENERS);
  }

  /* ── 画面 ──────────────────────────────────────────────── */

  function say(text, hold) {
    var b = $('#pet-bubble');
    var t = $('#pet-bubble-text');
    if (!b || !t) return;
    t.textContent = text;
    b.hidden = false;
    b.style.animation = 'none';
    void b.offsetWidth;
    b.style.animation = '';
    clearTimeout(bubbleTimer);
    bubbleTimer = setTimeout(function () { b.hidden = true; }, hold || 11000);
  }

  function paintWindow() {
    var g = document.getElementById('sky');
    if (!g) return;
    var h = new Date().getHours();
    var stops = g.querySelectorAll('stop');
    var top = '#CFE0E6', bot = '#EBD9C4';
    if (h >= 6 && h < 9) { top = '#E7D5C4'; bot = '#F6E3CB'; }
    else if (h >= 9 && h < 16) { top = '#CFE0E6'; bot = '#EBD9C4'; }
    else if (h >= 16 && h < 19) { top = '#F0C9A8'; bot = '#E8B98D'; }
    else { top = '#544E70'; bot = '#8C7B85'; }
    if (stops[0]) stops[0].setAttribute('stop-color', top);
    if (stops[1]) stops[1].setAttribute('stop-color', bot);

    var night = document.getElementById('pet-night');
    if (night) night.setAttribute('opacity', (h >= 19 || h < 6) ? '1' : '0');
  }

  function paintFrames(c) {
    var a = document.getElementById('frame-a');
    var b = document.getElementById('frame-b');
    function set(g, on) {
      if (!g) return;
      g.style.opacity = on ? '1' : '0.42';
      var kids = g.querySelectorAll('circle, path');
      for (var i = 0; i < kids.length; i++) {
        kids[i].setAttribute('fill', on ? '#B0603F' : '#DCC7B4');
      }
    }
    set(a, c.fedMe);
    set(b, c.fedOther);
  }

  function render() {
    var c = ctx();
    paintWindow();
    paintFrames(c);

    var food = document.getElementById('pet-food');
    if (food) food.setAttribute('opacity', c.hunger > 55 ? '1' : (c.hunger > 25 ? '.5' : '0'));

    var tb = $('#feed-btn');
    if (tb) {
      tb.disabled = c.fedMe || busy;
      tb.textContent = c.fedMe ? '今天喂过了' : '喂它';
    }

    var s = $('#pet-status');
    if (s) {
      var bits = [];
      bits.push(c.hunger > 70 ? '它很饱' : c.hunger > 35 ? '它有点饿了' : '它饿坏了');
      if (c.fedMe && c.fedOther) bits.push('今天你们都喂过了');
      else if (c.fedMe) bits.push('今天你喂过了，她还没来');
      else if (c.fedOther) bits.push('她今天喂过了，你还没');
      else bits.push('今天还没人喂它');
      s.textContent = bits.join(' · ');
    }
  }

  /* ── 动作 ──────────────────────────────────────────────── */

  async function feed() {
    if (busy || !who) return;
    busy = true;
    render();
    try {
      var today = ymd(new Date());
      var patch = { last_fed_at: new Date().toISOString(), xp: (pet.xp || 0) + 12 };
      patch['fed_' + who] = today;
      var rows = await rq('PATCH', '/rest/v1/pet?id=eq.1', patch);
      pet = (rows && rows[0]) || pet;
      var cat = document.getElementById('pet-cat');
      if (cat) {
        cat.classList.remove('happy');
        void cat.offsetWidth;
        cat.classList.add('happy');
      }
      say(pick([
        '（埋头吃了很久，然后抬头看你一眼）',
        '谢谢。我今天可以多绕你两圈。',
        '碗满了。你也坐下来吧。',
        '我吃慢一点，这样你就多待一会儿。'
      ]));
    } catch (e) {
      say('碗……好像没放下来。再点一次？');
    }
    busy = false;
    render();
  }

  async function talk(text) {
    var reply = brain(text);
    say('…', 3000);
    setTimeout(function () { say(reply); }, 620);
    try {
      await rq('POST', '/rest/v1/pet_chat', { who: who, said: text, replied: reply });
      chat.push({ who: who, said: text, replied: reply, at: new Date().toISOString() });
      if (chat.length > 40) chat = chat.slice(-40);
    } catch (e) { /* 说不上去也不影响它回答 */ }
  }

  /* ── 入口 ──────────────────────────────────────────────── */

  function bindWho() {
    var box = $('#who');
    if (!box) return;
    box.querySelectorAll('[data-who]').forEach(function (b) {
      b.addEventListener('click', function () {
        who = b.getAttribute('data-who');
        localStorage.setItem('ourstory.who', who);
        box.hidden = true;
        render();
        setTimeout(function () { say(opener()); }, 500);
      });
    });
  }

  function bindOnce() {
    var fb = $('#feed-btn');
    if (fb && !fb.dataset.bound) {
      fb.addEventListener('click', feed);
      fb.dataset.bound = '1';
    }
    var form = $('#pet-form');
    if (form && !form.dataset.bound) {
      form.addEventListener('submit', function (e) {
        e.preventDefault();
        var input = $('#pet-input');
        var v = (input.value || '').trim();
        if (!v) return;
        input.value = '';
        talk(v);
      });
      form.dataset.bound = '1';
    }
    bindWho();
  }

  var entered = false;

  async function enter() {
    bindOnce();
    who = localStorage.getItem('ourstory.who');
    var box = $('#who');
    if (!who && box) box.hidden = false;
    if (!st) return;

    try {
      if (!pet) await load();
      render();
      if (!entered && who) {
        entered = true;
        setTimeout(function () { say(opener()); }, 600);
      }
    } catch (e) {
      var s = $('#pet-status');
      if (s) s.textContent = '它好像睡着了，等会儿再看看';
    }
  }

  global.Home = {
    init: function (store) { st = store; },
    enter: enter,
    reload: function () { pet = null; entered = false; return enter(); }
  };

})(window);
