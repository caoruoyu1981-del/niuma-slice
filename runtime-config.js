/*
 * runtime-config.js —— 牛马宇宙 · 唯一运行时环境开关（v1，2026-11-08 预埋）
 *
 * 【为什么有这个文件】
 * 目前埋点服务架在合伙人服务器上，将来盈利后会整体迁到自有服务器。
 * 没有这层时，端点/域名散落在 analytics.js 里，迁移要翻代码、逐个改、逐个验证。
 * 有这层后：**迁移时只改本文件**（或由新服务器下发同名覆盖对象），游戏内核与 bundle.js 一行不动。
 *
 * 【加载顺序】必须在 analytics.js 之前（见 index.html）。
 * 【覆盖方式】先加载 runtime-config.local.js 定义 window.NIUMA_CONFIG 即可按环境覆盖；
 *            本文件只填缺失字段，不会覆盖已设置的值。
 * 【小程序阶段】换成 wx 适配层时，同样读这份契约（beaconUrl / game / shareFallback）。
 */
(function () {
  'use strict';
  var DEFAULTS = {
    // ① 埋点主端点。迁到自有服务器时，只改这一行。
    beaconUrl: 'https://stats.daoyou.ren/track.php',
    // ② 迁移过渡专用：填上新端点即「双写」——同一事件同时发旧库和新库。
    //    验证新库落库正常后，把 beaconUrl 换成新端点、本项清空，即可无感切换。
    beaconMirrorUrl: '',
    // ③ 分享兜底链接（location 不可用时的降级地址）。换域名时同步改。
    shareFallback: 'https://niuma.daoyou.ren/',
    // ④ 载体标识：写入 events.game。**换域名/换服务器都不改它**，这是跨载体归因的稳定维度。
    game: 'slice',
    // ⑤ 部署环境标签（仅排查用，不入库）：h5-partner-bt / h5-own / wx-minigame
    stage: 'h5-partner-bt',
    schema: 1
  };
  if (typeof window === 'undefined') return;
  var cfg = window.NIUMA_CONFIG || (window.NIUMA_CONFIG = {});
  for (var k in DEFAULTS) {
    if (!Object.prototype.hasOwnProperty.call(DEFAULTS, k)) continue;
    if (!Object.prototype.hasOwnProperty.call(cfg, k)) cfg[k] = DEFAULTS[k];
  }
})();
