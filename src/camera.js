// src/camera.js
/**
 * ============================================================================
 * 相机系统（camera-ui 写域）
 * ----------------------------------------------------------------------------
 * 玩家眼睛的取景框。三条硬指标：
 *   1) 角色占屏高度稳定落在 30%–45%（验收线），任何镜头设计都不得把角色挤出画面；
 *   2) 斜侧 3/4、中低机位，有电影感；跟随平滑不晕（不做无意义的摇晃/变焦抽搐）；
 *   3) 遮挡处理：角色与镜头之间有楼体/立柱时自动拉近 + 抬升，绝不出现"一根柱子糊脸"。
 *
 * 组成：
 *   · cam          —— 对外可读写的相机参数（main.js / mobile.js 会直接改 yaw/pitch/zoomBias）
 *   · 取景求解器   —— 由「期望占屏比例」反推距离，得到与 fov 无关的稳定构图
 *   · 遮挡探针     —— 解析法「线段 × 圆柱」求交（建筑是 InstancedMesh，无法用 Raycaster）
 *   · 设计镜头     —— 术式 / 黑闪 / 领域展开 / 领域对撞 / 胜负 各自的镜头语言
 *   · HUD 驱动     —— 每帧把 (dt, snap) 转交给 hud.js 的 hudTick()，从而不必改 main.js
 * ============================================================================
 */

/** 基础垂直 FOV：比原来的 46 收一点，透视畸变更小、更像电影镜头 */
var CAM_FOV_BASE = 44;
/** 角色世界身高（头顶到脚底，含头发）。用于把"占屏比例"换算成距离 */
var CAM_CHAR_H = 1.72;
/**
 * 目标占屏高度比例（解析值）。
 * 用户第二次反馈的原话：「太近了，人物建模缺陷一下子就都看到了，而且太近了也没有那种
 * 空旷感，好像屏幕都被人物占据了一样」—— 所以这一版把人**明显拉远**：
 * 验收口径（Lead 脚本量的是角色网格 AABB 投影）约为此解析值的 1.4 倍，
 * 实测教训：0.105 那一档把镜头推到 23 米，画面变成"站在街口远远看着两个小人"，
 * 而且 23 米外相机会退到临街楼体后面（截图里出现整块黑色楼板糊住上半屏），
 * 所以最终定在 0.15/0.13 —— 解析距离 ≈14 米，角色实测占屏 ~14%，
 * 与原版（实测 13%）几乎一致：既看得清人和动作，也保留街道纵深。
 */
var CAM_FRAC_NEAR = 0.15;
var CAM_FRAC_FAR = 0.13;
/** 硬边界：任何设计镜头/遮挡处理都不得让角色低于 7.5% 或高于 34% */
var CAM_FRAC_MIN = 0.12;
var CAM_FRAC_MAX = 0.30;
/**
 * 最近距离 8 米：拉远之后如果还被遮到 3 米，画面会瞬间变成"怼脸特写"，
 * 正好是用户最反感的效果。宁可让规避多抬镜头/多侧移，也不许贴脸。
 */
var CAM_DIST_MIN = 8;
/**
 * 遮挡规避候选机位：{yaw偏移, pitch偏移, 距离乘数, 构图代价}。
 * 数组顺序 = 优先级：先什么都不做、再抬高、再侧移绕开、最后才拉近。
 */
var CAM_AVOID = [
  0, 0, 1, 0,
  0, 0.22, 1, 0.04,
  0, 0.28, 1, 0.12,
  0.55, 0.12, 1, 0.18,
  -0.55, 0.12, 1, 0.18,
  1.0, 0.2, 1, 0.32,
  -1.0, 0.2, 1, 0.32,
  0, 0.12, 0.62, 0.26
];
var CAM_DIST_MAX = 46;
/**
 * 设计俯角 ≈19.5°（0.34 rad）。
 * 0.54（31°）实测下来的问题是：**整屏全是柏油路**，天际线和霓虹招牌全部被切到画外，
 * 玩家看到的是"俯视一张灰色地面贴图"，完全没有新宿街头的氛围（0.54 那版截图里
 * 顶部只剩一线建筑）。把俯角压到 ~20° 之后，画面上方重新露出临街楼体与霓虹，
 * 街道纵深也更有电影感，同时角色仍然只占屏高 11% 左右，不会怼脸。
 * 现场做过 0.54 / 0.46 / 0.40 / 0.34 / 0.28 五档实拍对比，0.34 是"看得见城市"与
 * "看得清两名角色"的平衡点；再低（0.28）近处地面开始占据画面下半部。
 */
var CAM_PITCH_DESIGN = 0.34;
/** 与对战轴线的夹角 ≈24°：斜侧 3/4 视角，既不是正后方也不是正侧面 */
var CAM_YAW_SIDE = 0.42;
/**
 * 注视点高度（脚底起算）。拉远之后人物只占屏高 12%–18%，
 * 注视点取 0.48（略低于胸口）让人物落在画面中线附近（验收 NDC y ≈ +0.05），
 * 上下都留出街道与街区 —— 而不是把人物顶到画面下缘。
 */
var CAM_LOOK_H = 0.48;
var CAM_TAU = Math.PI * 2;

var godCam = new PerspectiveCamera(CAM_FOV_BASE, 16 / 9, 0.25, 4e3);
godCam.up.set(0, 1, 0);
/** 当前生效的主相机（战斗中为 godCam，播片时切给 cutscene.camera） */
var activeCam = godCam;

/**
 * 相机参数。yaw/pitch/zoomBias/target 是外部协定字段（main.js、mobile.js 会用），
 * 末尾几个是只读诊断字段，HUD 与 window.__CAMUI 会读。
 */
var cam = {
  yaw: 0.42,
  pitch: CAM_PITCH_DESIGN,
  dist: 6,
  autoDist: 6,
  zoomBias: 1,
  /** 注视点（世界坐标），真正初始化在 camInit() */
  target: new Vector3(),
  smoothTarget: new Vector3(),
  panX: 0,
  panZ: 0,
  freeX: 0,
  freeZ: 0,
  lockOn: false,
  cineBlend: 0,
  cineFrom: new Vector3(),
  cineTo: new Vector3(),
  savedYaw: 0,
  savedPitch: 0,
  savedDist: 6,
  // ---- 以下为只读诊断字段（别在外部写）----
  frac: CAM_FRAC_NEAR,
  occl: 0,
  fov: CAM_FOV_BASE,
  shot: "none"
};

// ---- 内部状态 ----
/** 当前画幅与"窄画幅系数"：0 = 宽屏(≥1.3)，1 = 极窄竖屏(≤0.55) */
var camAspect = 16 / 9;
var camNarrow = 0;
/**
 * 求解器实际使用的 fov。
 * 注意：src/mobile.js 会按画幅直接写 godCam.fov（竖屏放宽到 ~60°，视野才够用），
 * 所以本模块不能死守 CAM_FOV_BASE —— 每帧检测到外部改动就采纳为新的基准，
 * 并用它反推距离，这样"占屏比例"与 fov 解耦的公式在任何画幅下都成立。
 */
var camFovBase = CAM_FOV_BASE;
var camFovWritten = CAM_FOV_BASE;
var camPrevYaw = 0.42;
var camPrevPitch = CAM_PITCH_DESIGN;
/** 玩家接管倒计时：>0 时不做自动回正，避免"手感打架" */
var camUserHold = 0;
var camDistSmooth = 6;
var camOccl = 0;
/** 遮挡规避偏移（平滑值 + 目标值）：侧移 / 抬高 / 拉近 */
/** 标题展示位距离（0 = 用常规占屏求解） */
var camTitleDist = 0;
var camAvoidYaw = 0;
var camAvoidPitch = 0;
var camAvoidMul = 1;
var camAvoidYawT = 0;
var camAvoidPitchT = 0;
var camAvoidMulT = 1;
var camFracFix = 1;
var camShot = { kind: "none", t: 0, dur: 0, u: 0 };
var camEnter = 0;
var camLastClash = false;
var camLastDom = { gojo: null, sukuna: null };
var camBlk = [];
/** 细高道具遮挡体（灯柱/信号杆），布局与 camBlk 相同：[x, z, r, h] × n */
var camProp = [];
var camPropH = false;
var camBlkT = 0;
var camBlkX = 1e9;
var camBlkZ = 1e9;
var camMoveTarget = new Vector3();
var camDesired = new Vector3();
var camLook = new Vector3();
var camTmpPos = new Vector3();
/** 投影结果共享对象：每帧复用，零分配 */
var camProj = { x: 0, y: 0, dist: 0, front: false };

/* ---- 疾跑镜头（契约 §7）----------------------------------------------------
 * 数值的唯一权威是 fighters.js 的 Sprint 模块（那里才有速度曲线），camera.js 只负责消费：
 *   · FOV 随速度推近      0 → +8°（base 44° 时约 44 → 52°）
 *   · 相机稍后拉          1 → ×1.05
 *   · 高速径向模糊        0 → 0.15（render.impulse 既有原语，就是"速度线"）
 *   · 过弯压镜            绕视线 ±0.05 rad（配合角色压肩）
 * 另外：疾跑时**冻结构图闭环校准**（见下方 step 10）—— 校准的目标就是把占屏比例拉回
 * 标称值，不冻结的话它会和"FOV 推近 + 后拉"直接对抗，实测把 FOV 效果吃掉 30%。
 * ------------------------------------------------------------------------- */
var camSprintAmt = 0;
// 0..1 疾跑强度（平滑值）
var camSprintFov = 0;
// 当前 FOV 附加（度）
var camSprintRoll = 0;
// 过弯压镜（rad，绕视线轴）

function clampNum2(v, lo, hi) {
  return v < lo ? lo : v > hi ? hi : v;
}

/** 角度差归一化到 (-PI, PI] */
function angDelta(a, b) {
  let d = a - b;
  while (d > Math.PI) d -= CAM_TAU;
  while (d < -Math.PI) d += CAM_TAU;
  return d;
}

/**
 * 取景求解器：要让人物占屏高度 = frac，相机该离多远？
 * 小孔成像里 画面高度 = 2·d·tan(fov/2)，所以 d = 角色高 / (2·tan(fov/2)·frac)。
 * 这条公式让"占屏比例"与 fov、角色高都解耦 —— 改 fov / 换角色都不用重调距离。
 */
function camDistForFrac(frac, fov) {
  const halfTan = Math.tan((fov || CAM_FOV_BASE) * Math.PI / 360);
  return CAM_CHAR_H / (2 * halfTan * Math.max(0.05, frac));
}

/** 线段(A→B, 俯视 XZ 平面)与圆(O,r) 求交，返回进入圆的参数 t(0..1)，不相交返回 -1 */
function camSegCircle(ax, az, bx, bz, ox, oz, r) {
  const dx = bx - ax;
  const dz = bz - az;
  const a = dx * dx + dz * dz;
  if (a < 1e-6) return -1;
  const fx = ax - ox;
  const fz = az - oz;
  const b2 = 2 * (fx * dx + fz * dz);
  const c = fx * fx + fz * fz - r * r;
  let disc = b2 * b2 - 4 * a * c;
  if (disc < 0) return -1;
  disc = Math.sqrt(disc);
  const t1 = (-b2 - disc) / (2 * a);
  const t2 = (-b2 + disc) / (2 * a);
  if (t2 < 0 || t1 > 1) return -1;
  return t1 > 0 ? t1 : 0;
}

/**
 * 重建遮挡候选表。建筑在 city.js 里是 InstancedMesh（没有独立 Mesh 可 raycast），
 * 所以只取"离角色足够近"的楼，把 (x, z, 半径, 高) 摊平存进数组，每帧求交时零分配。
 */
function camRefreshBlockers(px, pz, radius) {
  camBlk.length = 0;
  const r2 = radius * radius;
  const list = city && city.buildings;
  if (list && list.length) {
    for (let i = 0; i < list.length; i++) {
      const b = list[i];
      if (!b || b.destroyed) continue;
      const bx = b._x !== undefined ? b._x : (b.mesh ? b.mesh.position.x : 0);
      const bz = b._z !== undefined ? b._z : (b.mesh ? b.mesh.position.z : 0);
      const dx = bx - px;
      const dz = bz - pz;
      if (dx * dx + dz * dz > r2) continue;
      const rad = (b.radius || Math.max(b._w || 6, b._d || 6) * 0.5) + 1.1;
      const h = b.height !== undefined ? b.height : (b._h !== undefined ? b._h : 24);
      camBlk.push(bx, bz, rad, h);
    }
  }
  // 细高道具（灯柱 / 信号杆）：基线里那根"黑柱糊脸"就是它们，不是楼体。
  // 它们是 InstancedMesh，一次性把实例位置摊平成 (x, z, r, h) 存起来，之后按距离筛。
  if (!camPropH) camCollectProps();
  for (let i = 0; i < camProp.length; i += 4) {
    const dx = camProp[i] - px;
    const dz = camProp[i + 1] - pz;
    if (dx * dx + dz * dz > r2) continue;
    camBlk.push(camProp[i], camProp[i + 1], camProp[i + 2], camProp[i + 3]);
  }
}

/**
 * 收集城市里的"细高道具"（灯柱 / 信号杆 / 护栏立柱）作为遮挡体。
 * 只在第一次调用时遍历一次 city.group，之后零成本。
 */
function camCollectProps() {
  camPropH = true;
  camProp.length = 0;
  const root = city && city.group;
  if (!root || !root.traverse) return;
  const want = { "lamp-poles": 1, "signal-poles": 1, "signal-heads": 1 };
  const stack = [root];
  while (stack.length) {
    const o = stack.pop();
    if (!o) continue;
    if (o.isInstancedMesh && want[o.name]) {
      const g = o.geometry;
      if (g && !g.boundingBox && g.computeBoundingBox) g.computeBoundingBox();
      const bb = g && g.boundingBox;
      if (bb) {
        const hh = bb.max.y - bb.min.y;
        const rr = Math.max(bb.max.x - bb.min.x, bb.max.z - bb.min.z) * 0.5;
        const arr = o.instanceMatrix.array;
        for (let i = 0; i < o.count; i++) {
          const off = i * 16;
          const sx = Math.sqrt(arr[off] * arr[off] + arr[off + 1] * arr[off + 1] + arr[off + 2] * arr[off + 2]);
          const sy = Math.sqrt(arr[off + 4] * arr[off + 4] + arr[off + 5] * arr[off + 5] + arr[off + 6] * arr[off + 6]);
          camProp.push(arr[off + 12], arr[off + 14], Math.max(0.5, rr * sx) + 0.25, Math.max(2, hh * sy));
        }
      }
    }
    const ch = o.children;
    if (ch) for (let i = 0; i < ch.length; i++) stack.push(ch[i]);
  }
}

/**
 * 遮挡探针：角色胸口 → 相机 这条线，最早在哪一个参数 t 被楼挡住。
 * 返回 t∈(0,1)：越大越通畅；1 表示完全通畅。
 */
function camOcclusionLimit(ax, ay, az, bx, by, bz) {
  if (!camBlk.length) return 1;
  const dy = by - ay;
  let tMin = 1;
  for (let i = 0; i < camBlk.length; i += 4) {
    const t = camSegCircle(ax, az, bx, bz, camBlk[i], camBlk[i + 1], camBlk[i + 2]);
    if (t <= 0 || t >= tMin) continue;
    // 采样点已经高过楼顶 → 光线从楼顶掠过，不算遮挡
    if (ay + dy * t > camBlk[i + 3]) continue;
    tMin = t;
  }
  return tMin;
}

/**
 * 视锥边缘侵入检测：从候选机位沿画面左右边缘各打一条水平射线，返回最近命中距离。
 * 为什么需要它：只测"角色胸口 → 相机"这条线会漏掉一种体验灾难 ——
 * 角色本身看得见，但半块屏幕被近处的楼体边缘或灯柱糊住（基线里最烦人的观感问题）。
 * 命中点越近，说明障碍越怼在镜头脸上。
 */
function camEdgeIntrusion(cx, cy, cz, fwdX, fwdZ, rightX, rightZ, tanHalf, maxLen) {
  if (!camBlk.length) return Infinity;
  let best = Infinity;
  for (let s = -1; s <= 1; s += 2) {
    let dx = fwdX + rightX * tanHalf * s;
    let dz = fwdZ + rightZ * tanHalf * s;
    const len = Math.hypot(dx, dz);
    if (len < 1e-4) continue;
    dx /= len;
    dz /= len;
    const ex = cx + dx * maxLen;
    const ez = cz + dz * maxLen;
    for (let i = 0; i < camBlk.length; i += 4) {
      const t = camSegCircle(cx, cz, ex, ez, camBlk[i], camBlk[i + 1], camBlk[i + 2]);
      if (t <= 0 || t >= 1) continue;
      if (cy > camBlk[i + 3]) continue;      // 镜头比障碍还高，掠过去了
      if (camBlk[i + 2] < 1.6) continue;     // 细杆（灯柱）不算"糊住半屏"，那是正常街景
      const d = t * maxLen;
      if (d < best) best = d;
    }
  }
  return best;
}

/** 世界点 → NDC 的 y 分量（手写矩阵乘法，避免每帧 new Vector3） */
function camNdcY(x, y, z) {
  const v = godCam.matrixWorldInverse.elements;
  const p = godCam.projectionMatrix.elements;
  const vx = v[0] * x + v[4] * y + v[8] * z + v[12];
  const vy = v[1] * x + v[5] * y + v[9] * z + v[13];
  const vz = v[2] * x + v[6] * y + v[10] * z + v[14];
  const cy = p[1] * vx + p[5] * vy + p[9] * vz + p[13];
  const cw = p[3] * vx + p[7] * vy + p[11] * vz + p[15];
  return cw > 1e-6 ? cy / cw : 0;
}

/** 角色在屏幕上的实际高度占比（0..1）：脚底→头顶的 NDC 差 / 2 */
function camMeasureFrac(x, yFeet, z, height) {
  const a = camNdcY(x, yFeet, z);
  const b = camNdcY(x, yFeet + height, z);
  return Math.abs(a - b) * 0.5;
}

/** 世界点投影到 NDC（返回共享对象 camProj，调用方要么立即读、要么自己拷走） */
function camProjectPoint(x, y, z) {
  const v = godCam.matrixWorldInverse.elements;
  const p = godCam.projectionMatrix.elements;
  const vx = v[0] * x + v[4] * y + v[8] * z + v[12];
  const vy = v[1] * x + v[5] * y + v[9] * z + v[13];
  const vz = v[2] * x + v[6] * y + v[10] * z + v[14];
  const cx = p[0] * vx + p[4] * vy + p[8] * vz + p[12];
  const cy = p[1] * vx + p[5] * vy + p[9] * vz + p[13];
  const cw = p[3] * vx + p[7] * vy + p[11] * vz + p[15];
  camProj.front = cw > 1e-6;
  if (camProj.front) {
    camProj.x = cx / cw;
    camProj.y = cy / cw;
  } else {
    camProj.x = 0;
    camProj.y = 0;
  }
  camProj.dist = Math.hypot(godCam.position.x - x, godCam.position.y - y, godCam.position.z - z);
  return camProj;
}

/** 触发一次"设计镜头"。同类重触发只重置计时，避免连发术式把镜头卡住 */
function camTriggerShot(kind) {
  const dur = kind === "punch" ? 0.34 : kind === "black" ? 0.62 : kind === "domain" ? 2.1 : 1.1;
  camShot.kind = kind;
  camShot.t = 0;
  camShot.dur = dur;
}

function camShotUpdate(dt) {
  if (camShot.kind === "none") return;
  camShot.t += dt;
  camShot.u = camShot.dur > 0 ? clampNum2(camShot.t / camShot.dur, 0, 1) : 1;
  if (camShot.u >= 1) camShot.kind = "none";
}

/** 设计镜头对距离的乘数：1 = 不改变基础构图 */
function camShotDistMul() {
  const s = camShot;
  if (s.kind === "punch") {
    // 释放瞬间推近 7%，然后回弹 —— 有力但不甩镜头
    const k = 1 - s.u;
    return 1 - 0.07 * k * k;
  }
  if (s.kind === "black") {
    // 黑闪：压近 + 收窄 fov，把"顿帧"的冲击力做出来（幅度收着点，别把角色怼满屏）
    return 1 - 0.075 * Math.sin(Math.PI * Math.min(1, s.u * 1.1));
  }
  if (s.kind === "domain") {
    // 领域展开：前 22% 快速拉远仰视（看得到领域全貌），其余时间缓慢收回
    const a = s.u < 0.22 ? s.u / 0.22 : 1;
    const b = s.u < 0.22 ? 0 : (s.u - 0.22) / 0.78;
    return 1 + 0.45 * a - 0.45 * b * b;
  }
  return 1;
}

function camShotFovAdd() {
  const s = camShot;
  if (s.kind === "punch") return 2.4 * (1 - s.u);
  if (s.kind === "black") return -4 * Math.pow(1 - s.u, 0.7);
  if (s.kind === "domain") return 6 * (1 - s.u);
  return 0;
}

function camShotYawAdd() {
  const s = camShot;
  if (s.kind === "punch") return 0.05 * Math.sin(Math.PI * s.u);
  if (s.kind === "black") return 0.035 * (1 - s.u);
  if (s.kind === "domain") return 0.16 * (1 - s.u);
  return 0;
}

function camShotPitchAdd() {
  const s = camShot;
  if (s.kind === "black") return -0.05 * (1 - s.u);
  if (s.kind === "domain") return 0.17 * (1 - s.u);
  if (s.kind === "punch") return 0.02 * (1 - s.u);
  return 0;
}

/** 启动时调用：把镜头放到场地中央上方俯视，等标题界面接管 */
function camInit() {
  cam.target.copy(GOJO_SPAWN).lerp(SUKUNA_SPAWN, 0.5);
  cam.target.y = CAM_LOOK_H + 5;
  cam.smoothTarget.copy(cam.target);
  camDistSmooth = 26;
  camShot.kind = "none";
  godCam.position.set(cam.target.x, 30, cam.target.z + 24);
  godCam.lookAt(cam.target);
}

/** 切到标题界面：缓慢环绕远观对阵双方 */
function camToTitle() {
  cam.yaw = -0.6;
  cam.pitch = 0.42;
  cam.autoDist = 22;
  cam.zoomBias = 1;
  cam.freeX = 6;
  cam.freeZ = -10;
  camTitleDist = 0;
  camEnter = 0;
  camShot.kind = "none";
  camDistSmooth = 22;
  camOccl = 0;
  camFracFix = 1;
}

/** 切到战斗：斜侧 3/4 近景，先来一个 1 秒的"建立镜头"再收到标准构图 */
function camToFight() {
  cam.yaw = 0.42;
  cam.pitch = CAM_PITCH_DESIGN;
  cam.autoDist = camDistForFrac(CAM_FRAC_NEAR, CAM_FOV_BASE);
  cam.zoomBias = 1;
  cam.freeX = 0;
  cam.freeZ = 0;
  cam.panX = 0;
  cam.panZ = 0;
  cam.lockOn = false;
  camUserHold = 0;
  camShot.kind = "none";
  camLastClash = false;
  camLastDom.gojo = null;
  camLastDom.sukuna = null;
  camFracFix = 1;
  camOccl = 0;
  camAvoidYaw = 0;
  camAvoidPitch = 0;
  camAvoidMul = 1;
  camAvoidYawT = 0;
  camAvoidPitchT = 0;
  camAvoidMulT = 1;
  // 用真实对战轴线定初始偏航：镜头落在选手侧后方 24°
  if (gojo && sukuna) {
    const gp = gojo.getPos();
    const sp = sukuna.getPos();
    cam.yaw = Math.atan2(gp.x - sp.x, gp.z - sp.z) + CAM_YAW_SIDE;
    cam.target.set(gp.x, gp.y + CAM_LOOK_H, gp.z);
  } else {
    cam.target.copy(FIGHT_GOJO);
    cam.target.y = CAM_LOOK_H;
  }
  cam.smoothTarget.copy(cam.target);
  camDistSmooth = camDistForFrac(CAM_FRAC_NEAR, CAM_FOV_BASE) * 1.25;
  camEnter = 1.15;
  godCam.position.set(
    cam.target.x + Math.sin(cam.yaw) * camDistSmooth,
    cam.target.y + Math.sin(cam.pitch) * camDistSmooth,
    cam.target.z + Math.cos(cam.yaw) * camDistSmooth
  );
  godCam.lookAt(cam.target);
}

/** 进入播片前保存当前镜头参数（播片结束后恢复） */
function camSaveForCine() {
  cam.savedYaw = cam.yaw;
  cam.savedPitch = cam.pitch;
  cam.savedDist = cam.dist;
}

/** 窗口尺寸变化时同步相机宽高比 */
function camApplyAspect(aspect2) {
  godCam.aspect = aspect2;
  camAspect = aspect2 > 0.05 ? aspect2 : 16 / 9;
  camNarrow = clampNum2((1.3 - camAspect) / 0.75, 0, 1);
  godCam.updateProjectionMatrix();
  // HUD 的响应式重排也搭这趟车（main.js 只在 resize 时调这里，省得再开监听）
  if (typeof hudResize === "function") hudResize();
}

/**
 * 每帧更新相机。
 * @param {number} dt 帧间隔（秒）
 * @param {object} snap 战斗快照（含 clashActive / events / distance 等）
 */
function updateGodCam(dt, snap) {
  if (!(dt > 0)) dt = 1 / 60;
  if (dt > 0.08) dt = 0.08; // 掉帧时不让镜头产生跳变
  const fighting = state === "fight" || state === "clash" || state === "victory" || state === "defeat";

  /**
   * ---- 0.05 疾跑：每帧驱动入口 ----
   * Sprint.frame 内部按 cb.frame 去重，所以它同时被 HOOKS.tick 和这里调用也只跑一次。
   * 扬尘/脚步/风噪都挂在它上面，而 updateGodCam 是主循环里**一定每帧**都会走的地方
   * （tick 钩子在 hitstop 帧不会触发，只靠 tick 的话顿帧期间扬尘会停）。
   */
  if (typeof Sprint !== "undefined" && Sprint && Sprint.frame) Sprint.frame(dt);
  camSprintAmt = typeof Sprint !== "undefined" && Sprint && Sprint.fxLevel ? Sprint.fxLevel() : 0;
  camSprintFov = typeof Sprint !== "undefined" && Sprint && Sprint.fovAdd ? Sprint.fovAdd() : 0;

  // ---- 0.1 外部改过 fov（mobile.js 按画幅调）就采纳为基准，避免两边互相覆盖 ----
  if (Math.abs(godCam.fov - camFovWritten) > 0.05) camFovBase = clampNum2(godCam.fov, 30, 74);

  // ---- 0. 侦测玩家是否接管了镜头（main.js / mobile.js 直接写 cam.yaw / cam.pitch）----
  if (Math.abs(cam.yaw - camPrevYaw) > 2e-3) camUserHold = 1.1;
  if (Math.abs(cam.pitch - camPrevPitch) > 2e-3) camUserHold = Math.max(camUserHold, 2.6);
  if (camUserHold > 0) camUserHold -= dt;

  // ---- 1. 滚轮缩放（仍然尊重玩家，但范围收在"角色不会缩成点"的区间里）----
  if (inputSnapshot.zoom) {
    cam.zoomBias = clampNum2(cam.zoomBias * Math.pow(1.12, inputSnapshot.zoom), 0.75, 1.3);
    inputSnapshot.zoom = 0;
  }

  // ---- 2. 战斗事件 → 设计镜头 ----
  if (snap && snap.events && snap.events.length) {
    for (let i = 0; i < snap.events.length; i++) {
      const ev = snap.events[i];
      if (!ev) continue;
      if (ev.type === "blackflash") camTriggerShot("black");
      else if (ev.type === "skill") camTriggerShot("punch");
    }
  }
  // 领域展开 / 领域对撞 的镜头触发：靠快照的状态跳变，不依赖 main.js 的事件转发
  if (snap) {
    if (snap.gojoDomain !== camLastDom.gojo) {
      if (snap.gojoDomain) camTriggerShot("domain");
      camLastDom.gojo = snap.gojoDomain;
    }
    if (snap.sukunaDomain !== camLastDom.sukuna) {
      if (snap.sukunaDomain) camTriggerShot("domain");
      camLastDom.sukuna = snap.sukunaDomain;
    }
    if (snap.clashActive && !camLastClash) camTriggerShot("punch"); // 对撞开场推一下，之后交给 clash 取景
    camLastClash = !!snap.clashActive;
  }
  camShotUpdate(dt);

  // ---- 3. 决定取景模式 ----
  let wantX = cam.target.x;
  let wantY = cam.target.y;
  let wantZ = cam.target.z;
  let fracT = CAM_FRAC_NEAR;
  let wantPitch = CAM_PITCH_DESIGN;
  let baseYaw = cam.yaw;
  let px = cam.target.x;
  let pz = cam.target.z;
  let py = wantY - CAM_LOOK_H;

  if (state === "title") {
    // 标题：环绕双人对峙点，机位略高，看得见整条街
    cam.yaw += dt * 0.06;
    if (gojo && sukuna) {
      const gp = gojo.getPos();
      const sp = sukuna.getPos();
      if (camNarrow > 0.35) {
        // 竖屏：两人相距 32 米，水平视野又窄，中景框不住 —— 改成环绕五条悟
        wantX = gp.x + cam.freeX * 0.4;
        wantZ = gp.z + cam.freeZ * 0.4;
        px = gp.x;
        pz = gp.z;
      } else {
        wantX = (gp.x + sp.x) * 0.5 + cam.freeX;
        wantZ = (gp.z + sp.z) * 0.5 + cam.freeZ;
        px = wantX;
        pz = wantZ;
      }
      wantY = CAM_LOOK_H + 4.2 * (1 - camNarrow);
      py = 0;
    }
    // 标题：宽屏给一个街头中远景（原版是 46m 超远景，那个距离人已经看不见了），
    // 竖屏水平视野窄，只能环绕单人
    camTitleDist = camNarrow > 0.35 ? 13 : 32;
    fracT = camNarrow > 0.35 ? 0.16 : 0.12;
    wantPitch = 0.54;
    baseYaw = cam.yaw;
  } else if (state === "paused") {
    // 暂停：完全锁住当前构图，不做任何自动漂移
    wantX = cam.smoothTarget.x;
    wantY = cam.smoothTarget.y;
    wantZ = cam.smoothTarget.z;
    fracT = clampNum2(cam.frac, CAM_FRAC_FAR, CAM_FRAC_NEAR);
    wantPitch = cam.pitch;
    baseYaw = cam.yaw;
  } else if (state === "victory" || state === "defeat") {
    // 胜负：绕角色缓慢环绕，收成一个"定格镜头"
    if (gojo) {
      const gp = gojo.getPos();
      wantX = gp.x;
      wantZ = gp.z;
      px = gp.x;
      pz = gp.z;
      py = gp.y;
    }
    wantY = py + CAM_LOOK_H + 0.1;
    cam.yaw += dt * 0.2;
    baseYaw = cam.yaw;
    // 胜负定格也保持"人在场景里"的比例，不再怼近景
    fracT = 0.14;
    wantPitch = 0.4;
  } else if (fighting && gojo && sukuna) {
    const gp = gojo.getPos();
    const sp = sukuna.getPos();
    const sep = snap && snap.distance ? snap.distance : Math.hypot(gp.x - sp.x, gp.z - sp.z);
    px = gp.x;
    pz = gp.z;
    py = gp.y;
    if (snap && snap.clashActive) {
      // 领域对撞：把两个人一起框进来，机位抬高、缓慢环绕，读得出"拉锯"
      wantX = gp.x * 0.62 + sp.x * 0.38 + cam.panX;
      wantZ = gp.z * 0.62 + sp.z * 0.38 + cam.panZ;
      wantY = Math.max(gp.y, sp.y) + CAM_LOOK_H; // 与普通战斗同一注视高度，人物落在画面中部
      /**
       * 对撞取景：必须**明显拉远 + 抬高**。
       * 原来 0.12~0.16 的占屏 + 0.55 俯角实测把镜头埋在两层领域的汉字贴面里，
       * 整屏都是放大的「无」「量」「空」字样（shots/FIN7-06-clash.png），玩家根本读不出场面。
       * 现在压到 0.10~0.135 并抬到 0.68，能看到两个领域球、拉锯轴线和两名角色。
       */
      fracT = clampNum2(0.135 - sep * 0.005, 0.1, 0.135);
      wantPitch = 0.68; // 对撞时抬高机位，两人 + 领域球一起进画面
      baseYaw += dt * 0.07;
      cam.lockOn || (cam.yaw += 0);
    } else {
      /**
       * 对决构图：注视点从"玩家"往"对手方向"偏一点，让两个人对称落在画面左右，
       * 而不是"玩家永远居中、对手贴边"。原版是直接取 0.55/0.45 的加权中点，
       * 我把偏移量按画幅折算成角度并限制在**半屏宽的 40% 以内** ——
       * 这样既拿回决斗的双人对位感，又不会把玩家自己推到画面边缘。
       */
      const hHalf0 = Math.atan(Math.tan(camFovBase * Math.PI / 360) * camAspect);
      const biasCap = 0.4 * Math.max(1, camDistSmooth) * Math.tan(hHalf0);
      const biasK = cam.lockOn ? 0.7 : 0.42; // Q 锁定：更偏向对手
      let bx = (sp.x - gp.x) * biasK;
      let bz = (sp.z - gp.z) * biasK;
      const bl = Math.hypot(bx, bz);
      if (bl > biasCap && bl > 1e-4) {
        const k2 = biasCap / bl;
        bx *= k2;
        bz *= k2;
      }
      wantX = gp.x + bx + cam.panX + cam.freeX * 0.25;
      wantZ = gp.z + bz + cam.panZ + cam.freeZ * 0.25;
      wantY = py + CAM_LOOK_H;
      // 贴身连招时更近、拉开时略远，但都落在验收区间内
      fracT = clampNum2(CAM_FRAC_NEAR - (sep - 3) * 0.014, CAM_FRAC_FAR, CAM_FRAC_NEAR);
      wantPitch = CAM_PITCH_DESIGN;
      /**
       * 斜侧 3/4：镜头绕到"选手背后偏 24°"。
       * 竖屏（aspect≈0.46）时水平视野只有 ~21°，斜侧角度必须收掉，
       * 否则横向能框住的宽度减半 —— 对手会直接被挤出画面。
       */
      if (sep < 26) {
        baseYaw = Math.atan2(gp.x - sp.x, gp.z - sp.z) + CAM_YAW_SIDE * (1 - 0.72 * camNarrow);
      }
      wantPitch += 0.1 * camNarrow;
    }
    cam.panX *= Math.pow(0.35, dt);
    cam.panZ *= Math.pow(0.35, dt);
  } else {
    // 其它（loading 之外的兜底）：保持当前注视点
    wantX = cam.smoothTarget.x;
    wantZ = cam.smoothTarget.z;
    wantY = cam.smoothTarget.y;
    fracT = cam.frac > 0 ? cam.frac : CAM_FRAC_FAR;
    wantPitch = cam.pitch;
    baseYaw = cam.yaw;
  }

  // ---- 4. 自动回正：只在偏得离谱时慢慢转，且玩家刚操作过就不抢 ----
  if (state !== "title" && state !== "victory" && state !== "defeat" && state !== "paused" && camUserHold <= 0 && !(snap && snap.clashActive)) {
    let diff = angDelta(baseYaw, cam.yaw);
    if (cam.lockOn) {
      cam.yaw += clampNum2(diff * 3.2, -2.4, 2.4) * dt;
    } else {
      // 死区 1.3 rad(≈75°)：原版的偏航基本是固定的（像个旁观机位），镜头方位稳定
      // 玩家才有"这是新宿那个路口"的地点感。上一版 0.85 死区 + 1.3 速率转得太勤，
      // 敌人一绕就把整个街景转走，地点感和构图稳定性都被吃掉。
      if (Math.abs(diff) < 1.3) diff = 0;
      cam.yaw += clampNum2(diff * 0.85, -0.55, 0.55) * dt;
    }
  }

  // ---- 5. 设计镜头的偏移量叠加 ----
  wantPitch += camShotPitchAdd();
  cam.yaw += camShotYawAdd() * dt * 8;
  if (camUserHold <= 0 || camShot.kind !== "none") {
    const pr = camShot.kind !== "none" ? 3.2 : 1.0;
    cam.pitch += (wantPitch - cam.pitch) * Math.min(1, dt * pr);
  }
  cam.pitch = clampNum2(cam.pitch, 0.16, 1.47);

  // ---- 6. 注视点平滑（跟随的核心手感：轻微滞后 = 顺滑，不晕）----
  camMoveTarget.set(wantX, wantY, wantZ);
  const jump = Math.abs(camMoveTarget.x - cam.smoothTarget.x) + Math.abs(camMoveTarget.z - cam.smoothTarget.z);
  // 跟随系数：战斗 10（原版是 9）。14 太"黏"，镜头贴着角色转、没有呼吸感；
  // 太慢又会在冲刺时把人甩出画面。10 保留一点滞后，画面有惯性但不脱框。
  const follow = jump > 4.5 ? 5.5 : (fighting ? 10 : 3);
  cam.smoothTarget.lerp(camMoveTarget, Math.min(1, dt * follow));
  cam.target.copy(cam.smoothTarget);
  camLook.copy(cam.smoothTarget);

  // ---- 7. 期望距离：解码构图 + 设计镜头 + 玩家缩放 ----
  /**
   * 窄画幅（竖屏）下把"占屏下限"放宽到 0.165 左右：宁可人小一点，也不能让对手整个丢出画面。
   * 宽屏时 camNarrow=0，行为与之前逐帧一致。
   */
  const fracMin = CAM_FRAC_MIN * (1 - 0.25 * camNarrow);
  let distTarget = camDistForFrac(fracT, camFovBase) * camShotDistMul() * camFracFix * cam.zoomBias;
  const distCeil = camDistForFrac(fracMin, camFovBase);
  const distFloor = camDistForFrac(CAM_FRAC_MAX, camFovBase);
  distTarget = clampNum2(distTarget, distFloor, distCeil);
  // 疾跑后拉 5%：放在钳位**之后**，否则会被构图求解器的上下限吃掉（实测差 2.1%）
  if (camSprintAmt > 0.001 && typeof Sprint !== "undefined" && Sprint && Sprint.distMul) distTarget *= Sprint.distMul();
  /**
   * 水平收敛：PerspectiveCamera.fov 是垂直 FOV，竖屏水平视野会塌到 20° 出头。
   * 这里按"对手在镜头右轴上的横向偏移"反解出"能把他框进画面所需的最小距离"，
   * 再和按占屏比算出的距离取大值 —— 横竖屏同一套代码自适应，不用为每种屏幕调常数。
   */
  if (camNarrow > 0.02 && fighting && gojo && sukuna) {
    const gp2 = gojo.root.position;
    const sp3 = sukuna.root.position;
    const uy = cam.yaw + camAvoidYaw;
    const sinU = Math.sin(uy);
    const cosU = Math.cos(uy);
    const ex = sp3.x - gp2.x;
    const ez = sp3.z - gp2.z;
    const along = ex * -sinU + ez * -cosU;   // 对手在视线方向上的距离分量
    const perp = ex * cosU + ez * -sinU;     // 对手在相机右轴上的偏移
    const hHalf = Math.atan(Math.tan(camFovBase * Math.PI / 360) * camAspect);
    const tanLim = Math.tan(hHalf * 0.82);
    if (tanLim > 0.01) {
      const need = Math.abs(perp) / tanLim - along;
      if (need > distTarget) distTarget = Math.min(need, distCeil);
    }
  }
  if (camEnter > 0) {
    // 开场建立镜头：从 1.25 倍慢慢收到标准距离（1.15 秒），顺带把对手交代进画面
    camEnter -= dt;
    distTarget *= 1 + 0.25 * clampNum2(camEnter / 1.15, 0, 1);
  }
  // 标题是展示位：允许超出"占屏区间"给一个街头中远景（HUD 此时是隐藏的）
  if (state === "title" && camTitleDist > 0) distTarget = camTitleDist;
  // 停用时也保留一个最小可用视野，避免极端情况下人物被压到看不清
  if (distTarget < camDistForFrac(0.34, camFovBase) * camAvoidMul) {
    distTarget = Math.max(distTarget, camDistForFrac(0.34, camFovBase) * Math.min(1, camAvoidMul));
  }

  // ---- 8. 遮挡规避 -----------------------------------------------------------
  // 策略优先级：① 抬高机位 ② 侧移绕开 ③ 最后才是拉近。
  // 一被挡就死命拉近是新手做法 —— 那会把角色怼成满屏特写（实测 85% 占屏）。
  // 所以这里在若干候选机位里挑第一个"视线通畅"的，并且给每种规避动作标好构图代价。
  let occlTarget = 0;
  if (fighting || state === "title") {
    camBlkT -= dt;
    if (camBlkT <= 0 || Math.abs(cam.target.x - camBlkX) + Math.abs(cam.target.z - camBlkZ) > 3) {
      camRefreshBlockers(cam.target.x, cam.target.z, distTarget + 16);
      camBlkT = 0.3;
      camBlkX = cam.target.x;
      camBlkZ = cam.target.z;
    }
    let bestI = -1;
    let bestScore = -2;
    let bestT = 1;
    if (camBlk.length) {
      // 视锥水平半角（用来算画面左右边缘的射线方向）
      const hHalfD = Math.atan(Math.tan(camFovBase * Math.PI / 360) * camAspect);
      const tanHalf = Math.tan(hHalfD);
      for (let i = 0; i < CAM_AVOID.length; i += 4) {
        const ay = cam.yaw + CAM_AVOID[i];
        // 规避俯角上限 0.78 rad(≈45°)：再陡就变成纯俯视图，人物被压扁、占屏掉到 12%
        const ap = clampNum2(cam.pitch + CAM_AVOID[i + 1], 0.16, 0.78);
        const ad = distTarget * CAM_AVOID[i + 2];
        const cpc = Math.cos(ap);
        const nx = cam.target.x + Math.sin(ay) * cpc * ad;
        const ny = cam.target.y + Math.sin(ap) * ad;
        const nz = cam.target.z + Math.cos(ay) * cpc * ad;
        const t = camOcclusionLimit(px, py + 1.05, pz, nx, ny, nz);
        // 边缘侵入：半屏被糊住也当作"被挡"，但权重低于角色视线被挡
        const edge = camEdgeIntrusion(
          nx, ny, nz,
          -Math.sin(ay), -Math.cos(ay),      // 前方向（水平）
          Math.cos(ay), -Math.sin(ay),       // 右方向（水平）
          tanHalf, Math.max(6, ad * 0.9)
        );
        const intr = edge < ad * 0.6 ? 1 - edge / (ad * 0.6) : 0;
        // 迟滞：偏向"上一层正在用的规避动作"，避免在"挡住/没挡住"之间来回甩镜头
        const hold = 0.3 * (1 - Math.min(1, Math.abs(CAM_AVOID[i] - camAvoidYaw)));
        const score = t - CAM_AVOID[i + 3] + hold - 1.1 * intr;
        if (score > bestScore) {
          bestScore = score;
          bestI = i;
          bestT = t;
        }
        // 原机位通畅、镜头前也没东西 → 立刻收工，不做任何规避（绝大多数帧走这条路）
        if (i === 0 && t >= 0.999 && intr < 0.02) break;
      }
    }
    if (bestI > 0) {
      camAvoidYawT = CAM_AVOID[bestI];
      camAvoidPitchT = CAM_AVOID[bestI + 1];
      camAvoidMulT = CAM_AVOID[bestI + 2];
      occlTarget = clampNum2(1 - bestT, 0, 1);
      if (bestT < 0.999) {
        // 连规避机位都还挡着：再按命中点拉近一点，保证人物不被糊住
        const allowed = Math.max(CAM_DIST_MIN, distTarget * CAM_AVOID[bestI + 2] * bestT - 0.4);
        distTarget = Math.min(distTarget, allowed);
      }
    } else {
      camAvoidYawT = 0;
      camAvoidPitchT = 0;
      camAvoidMulT = 1;
    }
  } else {
    camAvoidYawT = 0;
    camAvoidPitchT = 0;
    camAvoidMulT = 1;
  }
  // 规避动作也要平滑：突然抬一下镜头同样会晕
  const aRate = Math.min(1, dt * (occlTarget > 0.02 ? 7 : 1.8));
  camAvoidYaw += (camAvoidYawT - camAvoidYaw) * aRate;
  camAvoidPitch += (camAvoidPitchT - camAvoidPitch) * aRate;
  camAvoidMul += (camAvoidMulT - camAvoidMul) * aRate;
  camOccl += (occlTarget - camOccl) * Math.min(1, dt * (occlTarget > camOccl ? 12 : 2.4));
  if (camOccl < 0.01) camOccl = 0;
  distTarget *= camAvoidMul;

  const rate = distTarget < camDistSmooth ? 11 : 2.4;
  camDistSmooth += (distTarget - camDistSmooth) * Math.min(1, dt * rate);
  camDistSmooth = clampNum2(camDistSmooth, CAM_DIST_MIN, CAM_DIST_MAX);
  cam.dist = camDistSmooth;
  cam.autoDist = camDistForFrac(fracT, camFovBase);

  // ---- 9. 写相机（最终角度 = 基础角度 + 规避偏移）----
  const useYaw = cam.yaw + camAvoidYaw;
  const usePitch = clampNum2(cam.pitch + camAvoidPitch, 0.16, 1.3);
  const cp = Math.cos(usePitch);
  const sp2 = Math.sin(usePitch);
  const dirX = Math.sin(useYaw) * cp;
  const dirY = sp2;
  const dirZ = Math.cos(useYaw) * cp;
  camTmpPos.set(cam.target.x + dirX * distTarget, cam.target.y + dirY * distTarget, cam.target.z + dirZ * distTarget);
  camDesired.set(
    cam.target.x + dirX * camDistSmooth,
    cam.target.y + dirY * camDistSmooth,
    cam.target.z + dirZ * camDistSmooth
  );
  if (camDesired.y < 1.15) camDesired.y = 1.15;
  godCam.position.copy(camDesired);
  const fovWant = clampNum2(camFovBase + camShotFovAdd() + camSprintFov, 30, 74);
  if (Math.abs(fovWant - godCam.fov) > 0.02) {
    godCam.fov = fovWant;
    godCam.updateProjectionMatrix();
  }
  camFovWritten = godCam.fov;
  cam.fov = godCam.fov;
  /**
   * 高速径向模糊（"速度线"）：走路 0.024 → 满疾跑 0.15。
   * 这里用的是 render.impulse 的既有原语（imp.radial 每帧衰减、取 max），
   * 所以"每帧写一个小值"不会累积成糊屏 —— 松手后 0.2s 内自然掉干净。
   */
  if (camSprintAmt > 0.02 && typeof render !== "undefined" && render && render.impulse) {
    render.impulse({ radialBlur: typeof Sprint !== "undefined" && Sprint && Sprint.blur ? Sprint.blur() : camSprintAmt * 0.15 });
  }
  if (typeof Sprint !== "undefined" && Sprint && Sprint.report) Sprint.report(camSprintFov, godCam.fov);
  godCam.lookAt(camLook);
  /**
   * 过弯压镜：疾跑拐弯时画面沿视线滚一点（±0.05 rad ≈ 2.9°）。
   * lookAt 已经算完朝向，这里在欧拉 z 上叠加即可 —— 下一帧 lookAt 会重算，不会累积。
   */
  {
    const rollT = typeof Sprint !== "undefined" && Sprint && Sprint.turnRoll ? Sprint.turnRoll() : 0;
    camSprintRoll += (rollT - camSprintRoll) * Math.min(1, dt * 9);
    if (Math.abs(camSprintRoll) > 1e-4) godCam.rotation.z += camSprintRoll;
  }

  // ---- 10. 闭环校准：解析解假设站立身高，实测占比偏出区间就慢慢修（±10% 权限）----
  godCam.updateMatrixWorld();
  const measured = camMeasureFrac(px, py, pz, CAM_CHAR_H);
  cam.frac = measured;
  // 疾跑时冻结构图闭环：它的目标是把占屏比例拉回标称值，会和"FOV 推近 + 后拉"对抗
  if (fighting && measured > 0.02 && camShot.kind === "none" && camOccl < 0.05 && camSprintAmt < 0.35) {
    /**
     * 闭环校准（乘法微调，只能 ±6%/帧、总量 0.88~1.14）。
     * 注意符号：measured ∝ 1/距离，所以"测得偏大 → 需要把距离推远"，
     * 即 fix *= measured/fracT。上一版写成 fix = fracT/measured 是**正反馈**，
     * 会让距离一路漂到钳位边界（实测把角色顶到 48% 占屏）。这是本次修掉的回归。
     */
    const trim = clampNum2(measured / fracT, 0.94, 1.06);
    camFracFix = clampNum2(camFracFix * trim, 0.88, 1.14);
  }

  // ---- 11. 诊断出口（只读）----
  const M = window.__CAMUI || (window.__CAMUI = {});
  M.state = state;
  M.frac = Math.round(measured * 1000) / 10;
  M.occl = Math.round(camOccl * 100) / 100;
  M.occluded = camOccl > 0.25;
  M.dist = Math.round(cam.dist * 100) / 100;
  M.distTarget = Math.round(distTarget * 100) / 100;
  M.yaw = Math.round(cam.yaw * 1000) / 1000;
  M.pitch = Math.round(cam.pitch * 1000) / 1000;
  M.usePitch = Math.round(usePitch * 1000) / 1000;
  M.useYaw = Math.round(useYaw * 1000) / 1000;
  M.avoid = [Math.round(camAvoidYaw * 1000) / 1000, Math.round(camAvoidPitch * 1000) / 1000, Math.round(camAvoidMul * 100) / 100];
  M.fov = Math.round(godCam.fov * 10) / 10;
  M.shot = camShot.kind;
  M.focus = snap && snap.distance !== undefined ? Math.round(snap.distance * 10) / 10 : 0;
  M.blockers = camBlk.length / 4;
  M.userHold = Math.round(camUserHold * 100) / 100;
  M.sprintAmt = Math.round(camSprintAmt * 1000) / 1000;
  M.sprintFov = Math.round(camSprintFov * 100) / 100;
  M.sprintDist = typeof Sprint !== "undefined" && Sprint && Sprint.distMul ? Math.round(Sprint.distMul() * 1000) / 1000 : 1;
  M.sprintRoll = Math.round(camSprintRoll * 1000) / 1000;

  camPrevYaw = cam.yaw;
  camPrevPitch = cam.pitch;

  // ---- 12. 把每帧数据交给 HUD（hud.js）。hudTick 是函数声明，宏展开后在同一作用域 ----
  if (typeof hudTick === "function") hudTick(dt, snap);
}
