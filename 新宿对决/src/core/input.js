/**
 * core/input.js —— 输入包（纯数据：可序列化 / 可 replay / 可进网络包）
 * ----------------------------------------------------------------------------
 * 相机相关的量属于本地表现，不进这个结构。
 * 每个字段只表示"这一帧是否按住"，按下边沿由 sim 自己算（固定帧里算才可复现）。
 */
var INPUT_KEYS = ["light", "heavy", "blue", "red", "purple", "heal", "domain", "parry", "dodge", "v"];

function emptyInput() {
  return {
    moveX: 0, moveZ: 0,
    light: false, heavy: false, blue: false, red: false, purple: false,
    heal: false, domain: false, parry: false, dodge: false, v: false
  };
}
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
function sameInput(a, b) {
  if (a.moveX !== b.moveX || a.moveZ !== b.moveZ) return false;
  for (var i = 0; i < INPUT_KEYS.length; i++) if (a[INPUT_KEYS[i]] !== b[INPUT_KEYS[i]]) return false;
  return true;
}
/** 输入快照（给网络包 / 探针用）：短字符串，只含非零字段 */
function packInput(inp) {
  var s = (inp.moveX || 0).toFixed(2) + "," + (inp.moveZ || 0).toFixed(2);
  for (var i = 0; i < INPUT_KEYS.length; i++) s += inp[INPUT_KEYS[i]] ? "1" : "0";
  return s;
}
