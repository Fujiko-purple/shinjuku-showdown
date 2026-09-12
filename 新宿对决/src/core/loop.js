/**
 * core/loop.js —— 固定步长循环
 * ----------------------------------------------------------------------------
 * 铁律 2：逻辑永远按 1/60 走。rAF 的 dt 只用来"攒帧"，不参与任何计算。
 * 顿帧 / 慢镜属于表现层，不许改这里的时间轴。
 */
var FIXED_DT = 1 / 60;
var FIXED_HZ = 60;

function createFixedLoop(opts) {
  var step = opts.step;                 // step(frameIndex, dt)
  var maxSteps = opts.maxSteps || 5;    // 一帧最多补几步（防止切后台回来炸掉）
  var acc = 0;
  var frame = 0;
  return {
    frame: function () { return frame; },
    /** dt 单位秒；返回这一帧实际跑了几步逻辑 */
    advance: function (dt) {
      if (!(dt > 0)) return 0;
      if (dt > 0.25) dt = 0.25;
      acc += dt;
      var n = 0;
      while (acc >= FIXED_DT && n < maxSteps) {
        acc -= FIXED_DT;
        step(frame, FIXED_DT);
        frame++;
        n++;
      }
      if (n === maxSteps) acc = 0;      // 攒太多就丢掉，宁可跳帧也不要雪崩
      return n;
    },
    reset: function () { acc = 0; frame = 0; }
  };
}
