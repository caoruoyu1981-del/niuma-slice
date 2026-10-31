// web/analytics.js —— v1.12 轻量埋点客户端（自托管 beacon，服务端见 analytics/beacon.php）
// 设计：匿名无 cookie；localStorage 匿名 ID；sendBeacon 优先，失败静默，绝不影响游戏。
// 部署后把 ENDPOINT 改成宝塔站点实际地址（与 beacon.php 同步）。
(function () {
  'use strict';
  var ENDPOINT = 'https://stats.daoyou.ren/track.php';
  var KEY_ID = 'niuma_anon_id';
  var KEY_INST = 'niuma_anon_install';
  var KEY_VISITS = 'niuma_anon_visits';

  var disabled = false;
  function ls(k, v) {
    try {
      if (arguments.length === 2) { localStorage.setItem(k, v); return v; }
      return localStorage.getItem(k);
    } catch (e) { return null; }
  }

  // 匿名 ID（不涉个人信息；丢失即视为新用户，可接受）
  var anonId = ls(KEY_ID);
  if (!anonId || !/^[A-Za-z0-9-]{8,64}$/.test(anonId)) {
    anonId = (crypto && crypto.randomUUID) ? crypto.randomUUID()
      : 'a-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 10);
    anonId = ls(KEY_ID, anonId) || anonId;
  }

  // 安装日 / 访问次数（次日留存判据）
  var today = new Date().toISOString().slice(0, 10);
  var installDay = ls(KEY_INST);
  if (!installDay) { installDay = ls(KEY_INST, today) || today; }
  var visits = parseInt(ls(KEY_VISITS) || '0', 10) + 1;
  ls(KEY_VISITS, String(visits));

  var channel = (typeof location !== 'undefined' && location.hostname) ? location.hostname : '';

  function send(payload) {
    if (disabled) return;
    payload.anon_id = anonId;
    payload.channel = channel;
    try {
      var blob = new Blob([JSON.stringify(payload)], { type: 'text/plain' });
      if (navigator.sendBeacon && navigator.sendBeacon(ENDPOINT, blob)) return;
      fetch(ENDPOINT, {
        method: 'POST', body: JSON.stringify(payload), keepalive: true, mode: 'cors'
      }).catch(function () {});
    } catch (e) { /* 埋点失败不影响游戏 */ }
  }
  // 连续失败即熔断（防弱网环境刷请求）
  var fails = 0;
  function sendGuarded(p) {
    if (disabled) return;
    try {
      var before = fails;
      var blob = new Blob([JSON.stringify(Object.assign({ anon_id: anonId, channel: channel }, p))], { type: 'text/plain' });
      if (navigator.sendBeacon && navigator.sendBeacon(ENDPOINT, blob)) { fails = 0; return; }
      fetch(ENDPOINT, { method: 'POST', body: blob, keepalive: true, mode: 'cors' })
        .then(function () { fails = 0; })
        .catch(function () { if (++fails >= 5) disabled = true; });
      void before;
    } catch (e) { if (++fails >= 5) disabled = true; }
  }

  // 会话开始：value=第几次访问，meta=安装后天数
  var daysSinceInstall = Math.floor((Date.parse(today) - Date.parse(installDay)) / 86400000);
  sendGuarded({ event: 'session_start', value: visits, meta: 'd' + daysSinceInstall });

  // 对局结束（由 adapter 经 env.analytics 转发）
  window.NiumaStats = {
    trackRun: function (p) {
      if (!p || p.type !== 'run_end') return;
      sendGuarded({
        event: 'run_end',
        value: p.score | 0,
        meta: 'fin=' + (p.finished ? 1 : 0) + ';pts=' + (p.points | 0) +
              ';cmb=' + (p.maxCombo | 0) + ';sec=' + (p.elapsed | 0) + ';rank=' + (p.rank || 0)
      });
    }
  };
})();
