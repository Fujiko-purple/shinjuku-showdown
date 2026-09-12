/**
 * core/events.js —— 逻辑 → 表现的单向事件流
 * ----------------------------------------------------------------------------
 * sim 只负责"发生了什么"，view / HUD / 音频 / 探针都订阅事件。
 * 这样表现层随便改，逻辑层不用动；探针也能直接断言"第 N 帧发生了 hit"。
 */
function createEvents() {
  var list = [];
  return {
    push: function (type, data) {
      if (list.length < 128) list.push({ type: type, data: data || {}, frame: 0 });
      return list[list.length - 1];
    },
    /** 每帧末尾由 main 取走（sim 内部自己也用一遍做规则判定） */
    drain: function () {
      var out = list;
      list = [];
      return out;
    },
    /** ⚠ 必须"清空同一个对象"，不能靠外部重新赋值：否则持有旧引用的调用方会永远读到空数组 */
    clear: function () { list.length = 0; },
    peek: function () { return list; }
  };
}
