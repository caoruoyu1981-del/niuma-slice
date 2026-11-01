// web/analytics.js —— v1.13 埋点 + 分享裂变最小闭环（服务端见 analytics/beacon.php）
// 原则：匿名无 cookie；localStorage 匿名 ID；失败静默，绝不影响游戏。
// 触点只出现在「对局结束」这一情绪峰值，不是主菜单摆一个按钮。
(function () {
  'use strict';
  var ENDPOINT = 'https://stats.daoyou.ren/track.php';
  var KEY_ID = 'niuma_anon_id';
  var KEY_INST = 'niuma_anon_install';
  var KEY_VISITS = 'niuma_anon_visits';
  var KEY_REF = 'niuma_ref';

  var disabled = false;
  var fails = 0;
  function ls(k, v) {
    try {
      if (arguments.length === 2) { localStorage.setItem(k, v); return v; }
      return localStorage.getItem(k);
    } catch (e) { return null; }
  }

  var anonId = ls(KEY_ID);
  if (!anonId || !/^[A-Za-z0-9-]{8,64}$/.test(anonId)) {
    anonId = (crypto && crypto.randomUUID) ? crypto.randomUUID()
      : 'a-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 10);
    anonId = ls(KEY_ID, anonId) || anonId;
  }

  // 邀请归因：URL ?r=xxx 只认一次（首次进入即锚定，后续自刷空间小）
  var ref = ls(KEY_REF) || '';
  try {
    var q = new URLSearchParams(location.search).get('r');
    if (q && /^[A-Za-z0-9-]{8,64}$/.test(q) && q !== anonId) { ref = ls(KEY_REF, q) || q; }
  } catch (e) {}

  var today = new Date().toISOString().slice(0, 10);
  var installDay = ls(KEY_INST);
  if (!installDay) { installDay = ls(KEY_INST, today) || today; }
  var visits = parseInt(ls(KEY_VISITS) || '0', 10) + 1;
  ls(KEY_VISITS, String(visits));

  var channel = (typeof location !== 'undefined' && location.hostname) ? location.hostname : '';
  var ua = (navigator.userAgent || '');
  var platform = /MicroMessenger/i.test(ua) ? 'wx' : (/Mobi|Android|iPhone|iPad/i.test(ua) ? 'm' : 'pc');
  var refHost = '';
  try { refHost = document.referrer ? new URL(document.referrer).host.slice(0, 40) : ''; } catch (e) {}

  function send(p) {
    if (disabled) return;
    var payload = { anon_id: anonId, channel: channel, ref: ref, event: p.event, value: p.value | 0, meta: p.meta || '' };
    try {
      var blob = new Blob([JSON.stringify(payload)], { type: 'text/plain' });
      if (navigator.sendBeacon && navigator.sendBeacon(ENDPOINT, blob)) return;
      fetch(ENDPOINT, { method: 'POST', body: blob, keepalive: true, mode: 'cors' })
        .then(function () { fails = 0; })
        .catch(function () { if (++fails >= 5) disabled = true; });
    } catch (e) { if (++fails >= 5) disabled = true; }
  }

  var days = Math.floor((Date.parse(today) - Date.parse(installDay)) / 86400000);
  send({
    event: 'session_start', value: visits,
    meta: 'd' + days + ';p=' + platform + ';from=' + refHost
  });

  // ---------- 分享 ----------
  function shareUrl() {
    try {
      return location.origin + location.pathname + '?r=' + encodeURIComponent(anonId);
    } catch (e) { return 'https://niuma.daoyou.ren/'; }
  }
  function copyLink(url) {
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(url);
        return true;
      }
    } catch (e) {}
    try {
      var ta = document.createElement('textarea');
      ta.value = url; ta.style.position = 'fixed'; ta.style.opacity = '0';
      document.body.appendChild(ta); ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
      return true;
    } catch (e2) { return false; }
  }

  var bar = null, tipel = null;
  function tip_(msg) {
    if (!tipel) {
      tipel = document.createElement('div');
      tipel.style.cssText = 'position:fixed;left:50%;bottom:86px;transform:translateX(-50%);z-index:10000;' +
        'padding:10px 16px;border-radius:20px;background:rgba(43,39,48,.92);color:#fff;font:14px/1.4 system-ui;' +
        'opacity:0;transition:opacity .25s;pointer-events:none;max-width:80vw;text-align:center';
      document.body.appendChild(tipel);
    }
    tipel.textContent = msg;
    tipel.style.opacity = '1';
    clearTimeout(tipel._t);
    tipel._t = setTimeout(function () { tipel.style.opacity = '0'; }, 2600);
  }

  function hideBar() { if (bar) bar.style.display = 'none'; }

  function showShareBar(info) {
    if (!bar) {
      bar = document.createElement('div');
      bar.style.cssText = 'position:fixed;left:0;right:0;bottom:0;z-index:9999;display:none;' +
        'padding:14px 16px 22px;background:linear-gradient(0deg,rgba(0,0,0,.86),rgba(0,0,0,0));' +
        'text-align:center;font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif';
      bar.innerHTML =
        '<div style="color:#FFD700;font-size:15px;font-weight:700;margin-bottom:10px" id="ns_title"></div>' +
        '<div style="display:flex;gap:10px;justify-content:center;align-items:center">' +
        '<button id="ns_share" style="flex:0 0 auto;padding:12px 26px;border:0;border-radius:24px;' +
        'background:#FFD700;color:#2b2730;font-size:15px;font-weight:800">喊人来接刀</button>' +
        '<button id="ns_close" style="flex:0 0 auto;padding:12px 18px;border:1px solid rgba(255,255,255,.35);' +
        'border-radius:24px;background:transparent;color:#fff;font-size:14px">不了</button>' +
        '</div>';
      document.body.appendChild(bar);
      bar.querySelector('#ns_close').onclick = hideBar;
      bar.querySelector('#ns_share').onclick = doShare;
    }
    var t = (info && info.score != null) ? ('你切了 ' + info.score + ' 分，来试试能不能超我') : '来试试牛马切切切';
    bar.querySelector('#ns_title').textContent = t;
    bar.style.display = 'block';
    send({ event: 'share_view', value: (info && info.score) || 0, meta: 'p=' + platform });
  }

  function doShare() {
    var url = shareUrl();
    send({ event: 'share_click', value: 0, meta: 'p=' + platform });
    if (navigator.share) {
      navigator.share({
        title: '牛马切切切',
        text: '我刚在《牛马切切切》里砍了一把，来试试能不能超过我',
        url: url
      }).then(function () {
        send({ event: 'share_done', value: 0, meta: 'native' });
        hideBar();
      }).catch(function (err) {
        if (err && err.name === 'AbortError') return;   // 用户取消，不计入成功
        if (copyLink(url)) {
          send({ event: 'share_done', value: 0, meta: 'copy' });
          tip_('链接已复制，发给朋友就行'); hideBar();
        }
      });
      return;
    }
    if (copyLink(url)) {
      send({ event: 'share_done', value: 0, meta: 'copy' });
      tip_(platform === 'wx' ? '链接已复制 —— 也可以点右上角「…」分享给朋友' : '链接已复制，发给朋友就行');
    } else {
      tip_('复制失败，请手动复制地址栏链接');
    }
    hideBar();
  }

  // ---------- 对局生命周期：计算「离开时玩了几秒」----------
  var runActive = false, runStartTs = 0;
  function runStart() { runActive = true; runStartTs = Date.now(); }
  function runEnd(p) {
    if (!runActive) { runActive = false; return; }
    runActive = false;
    var score = (p && p.score) | 0;
    var meta = 'fin=1;cmb=' + ((p && p.maxCombo) | 0) + ';sec=' + ((p && p.elapsed) | 0) + ';rank=' + ((p && p.rank) || 0);
    send({ event: 'run_end', value: score, meta: meta });
  }
  function leaveBounce() {
    if (!runActive) return;
    var sec = Math.max(0, Math.round((Date.now() - runStartTs) / 1000));
    runActive = false;
    send({ event: 'mid_run_leave', value: sec, meta: 'p=' + platform });
  }
  if (typeof document !== 'undefined' && document.addEventListener) {
    document.addEventListener('visibilitychange', function () {
      if (document.visibilityState === 'hidden') leaveBounce();
    });
    if (typeof window !== 'undefined') window.addEventListener('pagehide', leaveBounce);
  }

  window.NiumaStats = {
    runStart: runStart,
    runEnd: runEnd,
    showShareBar: showShareBar
  };
})();
