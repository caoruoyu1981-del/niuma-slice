// web/adapter.js —— v1.2 变更B 浏览器适配壳（壳层允许 DOM；内核 game/*.js 零平台 API）
// 只经注入接口使用内核：存储 / 输入归一 / 渲染宿主 / 音频桩 / 随机源。内核零拷贝复用。
const C = require('../game/config.js');
const { createGame } = require('../game/scenes.js');
const audio = require('./audio.js');   // v1.7 L3：浏览器 WebAudio 程序合成（配方在 audio/synth-core.js）

// 可播种随机源（mulberry32）：同局同种子行为一致（B5 逻辑帧解耦验收）
function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// 存储适配：localStorage JSON（SaveStore 排污口唯一实现，浏览器侧）
// v1.5 H1：物理键 = 逻辑键（saveKeys 值本身已带 niuma_ 前缀）。
// 旧实现 `'niuma_' + k` 与 saveKeys 的 niuma_ 重复 → 实际落盘成 niuma_niuma_roster（双前缀 bug）。
// 本次去掉前缀拼接，并在 boot 时把双前缀旧键迁移到新键（老玩家名单不丢）。
const SAVE_KEYS = {
  roster: 'niuma_roster', coins: 'niuma_coins', weapons: 'niuma_weapons',
  equipped: 'niuma_equipped', shake: 'niuma_shake', rank: 'niuma_rank', customN: 'niuma_custom_n',
  // v1.7 L3/L4
  sound: 'niuma_sound', fs: 'niuma_fs', fsHint: 'niuma_fs_hint'
};
const LEGACY_KEY_PREFIX = 'niuma_';   // 旧物理键 = 该前缀 + 逻辑键

const storage = {
  get(k) {
    try {
      const v = localStorage.getItem(k);
      return v == null ? null : JSON.parse(v);
    } catch (e) { return null; }
  },
  set(k, v) {
    try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {}
  }
};

// v1.5 H1 迁移：读到双前缀旧键 → 原样复制到新键 → 读回校验一致才删旧键；重跑幂等，不产生脏数据
function migrateLegacyStorage(keys) {
  const migrated = [];
  const list = keys || Object.keys(SAVE_KEYS).map(k => SAVE_KEYS[k]);
  for (const k of list) {
    try {
      if (localStorage.getItem(k) != null) continue;          // 新键已存在：不覆盖（幂等）
      const raw = localStorage.getItem(LEGACY_KEY_PREFIX + k); // niuma_niuma_roster ...
      if (raw == null) continue;
      localStorage.setItem(k, raw);
      if (localStorage.getItem(k) === raw) {                   // 写成功才动旧键
        localStorage.removeItem(LEGACY_KEY_PREFIX + k);
        migrated.push(k);
      }
    } catch (e) { /* 存储不可用：保持原样，不抛错 */ }
  }
  return migrated;
}

// 模态框适配（对齐 wx.showModal 签名：{title, editable, content, placeholderText, success(res)}）
// v1.2.1 注记（N1）：editable 时 content 为预填原始输入，输入框 value 必须 = content
function domModal(opts) {
  const overlay = document.createElement('div');
  overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.55);display:flex;align-items:center;justify-content:center;z-index:9;';
  const box = document.createElement('div');
  box.style.cssText = 'background:#24242F;border-radius:14px;padding:24px;width:78%;max-width:420px;color:#EEE;font:16px sans-serif;';
  const title = document.createElement('div');
  title.textContent = opts.title || '';
  title.style.cssText = 'margin-bottom:14px;font-weight:bold;';
  box.appendChild(title);
  let input = null;
  if (opts.editable) {
    input = document.createElement('input');
    input.style.cssText = 'width:100%;box-sizing:border-box;padding:10px;border-radius:8px;border:1px solid #555;background:#16161f;color:#FFF;font-size:16px;';
    input.placeholder = opts.placeholderText || '';
    input.value = opts.content || ''; // N1：编辑态预填原始输入
    box.appendChild(input);
  }
  const row = document.createElement('div');
  row.style.cssText = 'margin-top:18px;display:flex;gap:12px;justify-content:flex-end;';
  const btnCancel = document.createElement('button');
  btnCancel.textContent = '取消';
  const btnOk = document.createElement('button');
  btnOk.textContent = '确定';
  btnOk.style.cssText = 'background:#C44536;color:#FFF;border:0;border-radius:8px;padding:10px 22px;';
  btnCancel.style.cssText = 'background:#3A3A4C;color:#FFF;border:0;border-radius:8px;padding:10px 22px;';
  row.appendChild(btnCancel); row.appendChild(btnOk);
  box.appendChild(row);
  overlay.appendChild(box);
  document.body.appendChild(overlay);
  function close(res) {
    document.body.removeChild(overlay);
    if (opts.success) opts.success(res);
  }
  btnOk.addEventListener('click', () => close({ confirm: true, content: input ? input.value : '' }));
  btnCancel.addEventListener('click', () => close({ confirm: false }));
}

function boot() {
  const canvas = document.getElementById('c');
  const ctx = canvas.getContext('2d');
  const dpr = window.devicePixelRatio || 1;

  // 逻辑分辨率 750x1334 等比缩放居中（锁竖屏，与小程序端同一换算）
  let viewScale = 1, offX = 0, offY = 0;
  function resize() {
    const w = window.innerWidth, h = window.innerHeight;
    canvas.width = w * dpr;
    canvas.height = h * dpr;
    canvas.style.width = w + 'px';
    canvas.style.height = h + 'px';
    viewScale = Math.min(w / C.VW, h / C.VH);
    offX = (w - C.VW * viewScale) / 2;
    offY = (h - C.VH * viewScale) / 2;
  }
  window.addEventListener('resize', resize);
  resize();

  // 随机源：URL ?seed= 固定种子复现，否则按会话时间播种
  let seed = (Date.now() >>> 0);
  try {
    const q = new URLSearchParams(window.location.search).get('seed');
    if (q) seed = parseInt(q, 10) >>> 0;
  } catch (e) {}
  const rand = mulberry32(seed);

  // v1.5 H1：开局先做旧键迁移（双前缀 → 单前缀），再读存档
  migrateLegacyStorage();

  // v1.7 L4：全屏（沉浸）能力对象 —— 内核只经 env.host 调用，不碰浏览器 API
  const UA = (typeof navigator !== 'undefined' && navigator.userAgent) || '';
  const IS_IOS = /iPad|iPhone|iPod/.test(UA) ||
    (typeof navigator !== 'undefined' && navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

  const host = {
    canFullscreen() {
      const el = document.documentElement;
      return !!(el.requestFullscreen || el.webkitRequestFullscreen || el.webkitRequestFullScreen);
    },
    isFullscreen() {
      return !!(document.fullscreenElement || document.webkitFullscreenElement);
    },
    requestFullscreen() {
      const el = document.documentElement;
      const fn = el.requestFullscreen || el.webkitRequestFullscreen || el.webkitRequestFullScreen;
      if (!fn) return false;
      try {
        const p = fn.call(el, { navigationUI: 'hide' });
        if (p && p.catch) p.catch(() => {});
        return true;
      } catch (e) { return false; }
    },
    exitFullscreen() {
      const fn = document.exitFullscreen || document.webkitExitFullscreen;
      if (!fn) return false;
      try {
        const p = fn.call(document);
        if (p && p.catch) p.catch(() => {});
        return true;
      } catch (e) { return false; }
    },
    // L4 ④：首局提示文案（iOS Safari 无元素全屏 API → 换口径，别给用户一个点不动的按钮）
    hintText: (IS_IOS && !document.documentElement.requestFullscreen)
      ? '添加到主屏幕后可全屏畅玩（Safari 内不支持网页全屏）'
      : '建议点右上「沉浸」开启全屏，滑动不会误触系统手势',
    // v1.7 L3：音频没跑起来时的可操作提示（iPhone 侧边静音键是头号嫌疑人）
    audioHint: IS_IOS
      ? '没声音？先把 iPhone 侧边静音键拨到响铃，再点一下屏幕'
      : '没声音？点一下屏幕任意处解锁声音后重试'
  };

  const game = createGame({
    ctx,
    storage,
    saveKeys: SAVE_KEYS,
    audio,
    host,
    modal: domModal,
    // v1.4 变更F 3.2：离屏画布工厂（壳层允许 DOM；内核只经注入接口使用）
    createCanvas: (w, h) => {
      try {
        const c = document.createElement('canvas');
        c.width = Math.ceil(w * dpr);
        c.height = Math.ceil(h * dpr);
        const cx = c.getContext('2d');
        if (cx && cx.scale) cx.scale(dpr, dpr);
        return c;
      } catch (e) { return null; }
    },
    rand
  });

  // 输入归一：鼠标 + 触摸 -> 750x1334 逻辑坐标
  function toLogic(clientX, clientY) {
    return { x: (clientX - offX) / viewScale, y: (clientY - offY) / viewScale };
  }
  let pointerDown = false;
  function down(e) {
    e.preventDefault();
    pointerDown = true;
    const p = toLogic(e.clientX, e.clientY);
    game.onTouchStart(p.x, p.y);
  }
  function move(e) {
    if (!pointerDown) return;
    e.preventDefault();
    const p = toLogic(e.clientX, e.clientY);
    game.onTouchMove(p.x, p.y);
  }
  function up() {
    if (!pointerDown) return;
    pointerDown = false;
    game.onTouchEnd();
  }
  canvas.addEventListener('mousedown', down);
  window.addEventListener('mousemove', move);
  window.addEventListener('mouseup', up);
  canvas.addEventListener('touchstart', (e) => { e.preventDefault(); const t = e.touches[0]; pointerDown = true; const p = toLogic(t.clientX, t.clientY); game.onTouchStart(p.x, p.y); }, { passive: false });
  canvas.addEventListener('touchmove', (e) => { e.preventDefault(); const t = e.touches[0]; const p = toLogic(t.clientX, t.clientY); game.onTouchMove(p.x, p.y); }, { passive: false });
  canvas.addEventListener('touchend', (e) => { e.preventDefault(); pointerDown = false; game.onTouchEnd(); }, { passive: false });
  window.addEventListener('blur', () => game.onHide());
  document.addEventListener('visibilitychange', () => { if (document.hidden) game.onHide(); });

  // v1.7 L3：浏览器自动播放策略 —— 在第一次用户手势里解锁 AudioContext
  if (audio && typeof audio.installAutoUnlock === 'function') audio.installAutoUnlock();

  // v1.7 L4②：系统手势拦截必须挂在 document 上。
  // 原来只在 canvas 上 preventDefault —— 手指滑出画布/事件冒泡到 document 后，
  // 浏览器仍会接管下拉刷新、侧滑返回、切 App，外链分享场景下等于"玩不了"。
  // 输入框/文本域豁免（模态框可正常打字）。
  document.addEventListener('touchmove', (e) => {
    const t = e.target;
    if (t && t.closest && t.closest('input, textarea, [contenteditable="true"]')) return;
    if (e.cancelable) e.preventDefault();
  }, { passive: false });
  // 双击缩放/长按菜单兜底（CSS 已加 touch-action / touch-callout，这里再挡一次事件层）
  document.addEventListener('gesturestart', (e) => { e.preventDefault(); }, { passive: false });
  document.addEventListener('dblclick', (e) => { e.preventDefault(); }, { passive: false });

  // B5 固定逻辑步长：渲染按 rAF，逻辑按 1/60 fixed timestep 累积推进
  const STEP = 1 / 60;
  const MAX_STEPS = 5; // 卡顿帧上限，防螺旋死亡
  let last = performance.now();
  let acc = 0;
  function frame(ts) {
    let dt = (ts - last) / 1000;
    last = ts;
    if (dt > 0.25) dt = 0.25;
    if (game.noteFrame) game.noteFrame(dt * 1000); // v1.4 12.6 B3：真实帧时驱动分档
    acc += dt;
    let n = 0;
    while (acc >= STEP && n < MAX_STEPS) { game.update(STEP); acc -= STEP; n++; }
    if (n === MAX_STEPS) acc = 0;
    ctx.save();
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.translate(offX, offY);
    ctx.scale(viewScale, viewScale);
    game.render(ctx);
    ctx.restore();
    window.requestAnimationFrame(frame);
  }
  window.requestAnimationFrame(frame);
}

module.exports = { boot, mulberry32, storage, SAVE_KEYS, migrateLegacyStorage };
