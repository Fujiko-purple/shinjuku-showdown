/**
 * sim/hit.js —— 判定原语（纯函数，无状态）
 * ----------------------------------------------------------------------------
 * 只用两种形状：**垂直线段**（角色胶囊）与**水平线段**（攻击扫掠）。
 * 全部是解析解，没有物理引擎、没有 Math.random —— 这样两台机器/两次重放的结果一致。
 */
function segSegDistSq(ax, az, bx, bz, cx, cz, dx, dz) {
  // 2D 版本：A(x,z) -> B(x,z) 与 C -> D 的最近距离平方（角色都在地面上，高度差单独判）
  var ux = bx - ax, uz = bz - az;
  var vx = dx - cx, vz = dz - cz;
  var wx = ax - cx, wz = az - cz;
  var a = ux * ux + uz * uz;
  var e = vx * vx + vz * vz;
  var f = vx * wx + vz * wz;
  var s = 0, t = 0;
  var EPS = 1e-9;
  if (a <= EPS && e <= EPS) return wx * wx + wz * wz;
  if (a <= EPS) { t = clamp01(-f / e); }
  else {
    var c = ux * wx + uz * wz;
    if (e <= EPS) { s = clamp01(-c / a); }
    else {
      var b = ux * vx + uz * vz;
      var denom = a * e - b * b;
      s = denom > EPS ? clamp01((b * f - c * e) / denom) : 0;
      t = (b * s + f) / e;
      if (t < 0) { t = 0; s = clamp01(-c / a); }
      else if (t > 1) { t = 1; s = clamp01((b - c) / a); }
    }
  }
  var px = ax + ux * s - (cx + vx * t);
  var pz = az + uz * s - (cz + vz * t);
  return px * px + pz * pz;
}
function clamp01(v) { return v < 0 ? 0 : v > 1 ? 1 : v; }
function distXZ(a, b) { var dx = a.x - b.x, dz = a.z - b.z; return Math.sqrt(dx * dx + dz * dz); }

/** 角色胶囊半径（判定用，和外观解耦） */
var BODY_R = 0.45;

/** 攻击扫掠线：从攻击者中心沿朝向，前 0.55m 到 reach */
function attackSegment(attacker, move, out) {
  var fx = Math.sin(attacker.facing), fz = Math.cos(attacker.facing);
  out.ax = attacker.x + fx * 0.55; out.az = attacker.z + fz * 0.55;
  out.bx = attacker.x + fx * move.reach; out.bz = attacker.z + fz * move.reach;
  return out;
}

/** 攻击扫掠是否命中防守者的身体胶囊（垂直线段的水平投影是一个半径 BODY_R 的圆） */
function sweepHits(attacker, move, defender, tmp) {
  attackSegment(attacker, move, tmp);
  var d2 = segSegDistSq(tmp.ax, tmp.az, tmp.bx, tmp.bz, defender.x, defender.z, defender.x, defender.z);
  var r = move.hitR + BODY_R;
  return d2 <= r * r;
}
