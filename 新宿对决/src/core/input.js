/**
 * core/input.js —— 输入包
 * ----------------------------------------------------------------------------
 * 输入是**纯数据**：可以序列化、可以 replay、可以直接塞进网络包（联机要用，见 research/D-netcode.md §6.3）。
 * 相机相关的量（鼠标位移等）属于本地表现，不进这个结构。
 */
var INPUT_KEYS = ["light", "heavy", "parry", "dodge"];

function emptyInput() {
  return { moveX: 0, moveZ: 0, light: false, heavy: false, parry: false, dodge: false };
}

/** 从任意来源（键盘/触屏/AI/网络包）归一化成输入包 */
function normalizeInput(src) {
  var o = emptyInput();
  if (!src) return o;
  o.moveX = Number(src.moveX) || 0;
  o.moveZ = Number(src.moveZ) || 0;
  var m = Math.hypot(o.moveX, o.moveZ);
  if (m > 1) { o.moveX /= m; o.moveZ /= m; }
  for (var i = 0; i < INPUT_KEYS.length; i++) o[INPUT_KEYS[i]] = !!src[INPUT_KEYS[i]];
  return o;
}

/** 两个输入包是否逐字段相同（判定边沿用） */
function sameInput(a, b) {
  if (a.moveX !== b.moveX || a.moveZ !== b.moveZ) return false;
  for (var i = 0; i < INPUT_KEYS.length; i++) if (a[INPUT_KEYS[i]] !== b[INPUT_KEYS[i]]) return false;
  return true;
}

/**
 * 输入缓冲：任意来源每帧写一次，sim 每帧取一次。
 * 不用 KeyboardEvent 直接驱动 sim —— 事件是异步的，固定帧必须只认"这一帧的采样值"。
 */
function createInputBuffer() {
  var cur = emptyInput();
  var pending = emptyInput();
  var pressed = { light: false, heavy: false, parry: false, dodge: false };
  return {
    /** 外部（键盘/触屏/AI/网络）调用：设置这一帧的输入 */
    set: function (src) { pending = normalizeInput(src); },
    /** sim 在每帧开头调用：把 pending 固定成 cur，并算出按下边沿 */
    latch: function () {
      var prev = cur;
      cur = pending;
      for (var i = 0; i < INPUT_KEYS.length; i++) {
        var k = INPUT_KEYS[i];
        pressed[k] = !!cur[k] && !prev[k];
      }
      return cur;
    },
    cur: function () { return cur; },
    /** 按下边沿：只在按下的那一帧为 true */
    pressed: function (k) { return !!pressed[k]; },
    /** 直接看按住状态 */
    down: function (k) { return !!cur[k]; }
  };
}
