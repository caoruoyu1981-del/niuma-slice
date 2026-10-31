// web/audio.js —— 浏览器音频适配层（v1.7 L3）
// 内核零平台 API：本文件属于壳层，允许触碰 window/AudioContext。
// 合成配方全部在 audio/synth-core.js（平台无关），这里只负责：
//   ① 提供 AudioContext 工厂 ② 首次用户手势自动 unlock ③ 暴露与 audio-stub 同形的接口。
const { createSynth } = require('../audio/synth-core.js');

let actx = null;

function factory() {
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return null;
  if (!actx) actx = new AC();
  return actx;
}

const synth = createSynth(factory);

const UA = (typeof navigator !== 'undefined' && navigator.userAgent) || '';
const IS_WECHAT = /MicroMessenger/i.test(UA);
const IS_IOS = /iPad|iPhone|iPod/.test(UA) ||
  (typeof navigator !== 'undefined' && navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

// 浏览器自动播放策略：AudioContext 创建时必为 suspended，必须在用户手势里 resume。
// 关键细节（实测踩坑）：resume() 在第一次手势里可能被浏览器静默忽略（激活时序），
// 所以**不能一次性触发后就摘监听**——否则玩家永久静音。改为「每次手势都试，直到真的 running」。
let hooked = false;
function installAutoUnlock() {
  if (hooked || typeof document === 'undefined') return;
  hooked = true;
  const EVS = ['touchstart', 'pointerdown', 'keydown', 'click'];
  const kick = () => {
    synth.unlock();
    // iOS：每次手势都试，直到那段静音 <audio> 真的在播（播放成功 = 会话已成 playback）
    if (!silentEl || silentEl.paused) primeIOSAudioSession();
    if (synth.running) {
      for (const ev of EVS) document.removeEventListener(ev, kick, true);
    }
  };
  for (const ev of EVS) document.addEventListener(ev, kick, { capture: true, passive: true });
  installWeChatHook();
}

// iOS 专用：拨到「静音」时 Web Audio 会被系统整体静音（iOS 既定行为，非 bug）。
// 已知绕行：先播一个几乎无声的 HTML5 <audio>（音量 0.001），把页面的音频会话
// 切到 playback 类别 —— 之后 WebAudio 在静音键打开时也有机会出声。
// 音频数据在运行时用 44 字节 WAV 头 + 全 0 采样生成，仍然零外部素材。
let silentEl = null;
function silentWavUrl() {
  const sr = 8000, n = 400;                 // 8000Hz × 0.05s，8bit 单声道静音
  const buf = new ArrayBuffer(44 + n);
  const v = new DataView(buf);
  const ws = (o, s) => { for (let i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i)); };
  ws(0, 'RIFF'); v.setUint32(4, 36 + n, true); ws(8, 'WAVE'); ws(12, 'fmt ');
  v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true);
  v.setUint32(24, sr, true); v.setUint32(28, sr, true);
  v.setUint16(32, 1, true); v.setUint16(34, 8, true);
  ws(36, 'data'); v.setUint32(40, n, true);
  for (let i = 0; i < n; i++) v.setUint8(44 + i, 128);   // 8bit 无符号，128 = 静音
  return URL.createObjectURL(new Blob([buf], { type: 'audio/wav' }));
}
function primeIOSAudioSession() {
  if (!IS_IOS || typeof document === 'undefined') return;
  try {
    if (!silentEl) {
      silentEl = document.createElement('audio');
      silentEl.src = silentWavUrl();
      silentEl.loop = true;
      silentEl.volume = 0.001;              // 听不见，但足以让系统把会话切成 playback
      silentEl.setAttribute('playsinline', '');
      silentEl.setAttribute('webkit-playsinline', '');
      silentEl.style.display = 'none';
      document.body.appendChild(silentEl);
    }
    const p = silentEl.play();
    if (p && p.catch) p.catch(() => {});
  } catch (e) { /* 不支持则忽略，退回普通 WebAudio 路径 */ }
}

// 微信内置浏览器（尤其 iOS）：音频上下文在 WeixinJSBridge 就绪前 Resume 往往无效，
// 必须等 WeixinJSBridgeReady 再解一次。外链分享后朋友多数在微信里打开，这条不能少。
function installWeChatHook() {
  if (!IS_WECHAT || typeof document === 'undefined') return;
  const kick = () => { synth.unlock(); };
  try {
    if (window.WeixinJSBridge) { kick(); return; }
    document.addEventListener('WeixinJSBridgeReady', kick, false);
  } catch (e) { /* 非微信环境忽略 */ }
}

const audio = {
  get enabled() { return synth.enabled; },
  get supported() { return synth.supported; },
  get running() { return synth.running; },
  play(event, opts) { return synth.play(event, opts); },
  unlock() { return synth.unlock(); },
  setEnabled(v) { return synth.setEnabled(v); },
  events: synth.events,
  installAutoUnlock,
  _synth: synth
};

module.exports = audio;
