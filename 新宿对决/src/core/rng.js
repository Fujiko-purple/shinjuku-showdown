/**
 * core/rng.js —— 定种子随机
 * ----------------------------------------------------------------------------
 * 铁律 5：sim 层只许用这里的随机。表现层（VFX/音频）可以各自 Math.random。
 * mulberry32：32 位状态、极快、足够均匀，跨浏览器结果一致（只有整数运算与一次除法）。
 */
var RNG = {
  make: function (seed) {
    var s = (seed >>> 0) || 1;
    var api = {
      seed: s,
      next: function () {
        s = (s + 0x6D2B79F5) >>> 0;
        var t = s;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t = (t ^ (t + Math.imul(t ^ (t >>> 7), t | 61))) >>> 0;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
      },
      range: function (a, b) { return a + (b - a) * api.next(); },
      int: function (a, b) { return a + Math.floor(api.next() * (b - a + 1)); },
      pick: function (arr) { return arr[Math.floor(api.next() * arr.length) % arr.length]; },
      /** 供确定性断言用的快照 */
      snapshot: function () { return s >>> 0; }
    };
    return api;
  }
};
