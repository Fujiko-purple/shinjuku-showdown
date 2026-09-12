// src/mahoraga.js
/**
 * ============================================================================
 * src/mahoraga.js —— 魔虚罗「八握剑异戒神将」+ 二阶段宿傩（mahoraga 写域）
 * ----------------------------------------------------------------------------
 * 契约（冻结）：reviews/13-mechanics-contract.md §4。本文件是该契约的唯一实现，
 * 与 combat.js 的全部耦合都通过 src/contract.js 的 HOOKS 总线完成：
 *
 *   HOOKS.combatInit -> 拿到 cb（建立引用 / 挂 __SS.mahoraga）
 *   HOOKS.reset      -> 退场、状态归零、HUD 收起
 *   HOOKS.tick       -> 触发判定 + 召唤演出 + 空中机动 + 技能状态机 + HUD
 *   HOOKS.aim        -> 锁定时把 苍/赫/茈/200%茈 掰向空中的魔虚罗
 *   HOOKS.segment    -> 近战扫掠 / 苍每帧 / 赫每帧 / 茈射线段 / 开的命中判定
 *   HOOKS.damageGate -> 庇护期：玩家打宿傩 ×0.6、宿傩打玩家 ×1.25；击破后 ×1.15
 *
 * 职责边界（不要越界）：
 *   - 不改 TUNE / SKILL_DATA 的任何既有数值；本模块所有可调数值都在下面的
 *     MAHO_TUNE 表里，改平衡只需要动这张表。
 *   - 不改 hud.js：HUD 是本文件自建的 DOM（顶部第二条血条 + 适应 n/8 + 技能预警）。
 *   - 所有对玩家的伤害都走 cb.resolver.apply({ skill: SKILL.MAHORAGA })，
 *     这样无下限(invT)无敌、格挡减伤、受击硬直/音效/数字全部沿用既有系统。
 *
 * ----------------------------------------------------------------------------
 * 【数值表 MAHO_TUNE】（用户明确要求：不动整体数值设计，只在本表内生效）
 *   TRIGGER_RATIO   0.50  宿傩 HP ≤ 50% 触发（且只触发一次）
 *   SUMMON_LOCK     2.8s  召唤演出时长（期间 cb.phaseLock>0 冻结双方）
 *   BREAK_LOCK      1.8s  击破演出时长
 *   HP              900   魔虚罗血池
 *   HEIGHT/SHOULDER 4.2m / 2.6m（含法轮，契约 3.8~4.2）
 *   AIR_Y           5.2/5.8/6.4（easy/normal/hard；契约修订版 §4：可见的"半空"）
 *   DESCEND_FROM    18m 召唤时从天而降的起点（看得见它落在哪）
 *   ORBIT_R         12/13.5/15      环绕玩家半径
 *   AIR_SPEED       8/10/12 m/s     水平机动上限（契约 8~12）
 *   HIT_R           2.4/2.0/1.7     命中球半径（契约 2.4/2.0/1.7）
 *   EVADE_P         0.30/0.55/0.75  0.35s 预判侧移概率（契约）
 *   DAMAGE_IN_SCALE 0.70  玩家→魔虚罗伤害系数（外部伤害只有这一处缩放）
 *   WEAK_MELEE_MUL  1.50  俯冲落地 1.6s 弱点窗口内近战伤害加成
 *   SKILL_DMG_SCALE 1.00  魔虚罗四个技能的原始伤害系数（契约 130/150/200/70）
 *   ADAPT_MUL       0.45  同一术式第 2 次命中起的伤害倍率（契约）
 *   ADAPT_IMMUNE    4     同一术式第 4 次命中起免疫（契约）
 *   WHEEL_MAX       8     法轮格数；全亮 → 软狂暴
 *   SOFT_RAGE       1.60  法轮全亮后魔虚罗伤害倍率（契约）
 *   GUARD_SUKUNA    1.25  庇护期：宿傩→玩家伤害倍率（契约）
 *   GUARD_GOJO      0.60  庇护期：玩家→宿傩伤害倍率（契约）
 *   TRUE_SUKUNA     1.15  击破后保留的宿傩伤害倍率（契约）
 *   CD_HIGH/CD_LOW  4.0 / 2.6s（宿傩 HP 越低越短，契约）
 *   CD_DIFF         1.25/1.0/0.85（难度对冷却的整体缩放）
 *   DAMAGE_CD       0.75s  苍这类持续场两次「适应计数」之间的节流
 *   BLOCK_P         0.30  悬浮态近战扫到本体时的偶发「挡下」概率（Lead 裁定批准的数值）
 *   BLOCK_TRANSFER  0.35  挡下时把伤害转记到魔虚罗血条上的比例（绝不凭空消失）
 *   AIR_Y           4.0/4.5/5.0（easy/normal/hard；Lead 裁定批准：实测 5.82m 时法轮顶会被切）
 *   ORBIT_LOCAL     4/4.5/5m 绕**宿傩**的侧向航线半径（可见性的结构性保证）
 * ============================================================================
 */
var MAHO_TUNE = {
  TRIGGER_RATIO: 0.5,
  SUMMON_LOCK: 2.8,
  BREAK_LOCK: 1.8,
  HP: 900,
  HEIGHT: 4.2,
  SHOULDER: 2.6,
  /**
   * ⚠ 契约 §4 修订（Lead P0）后再按**实测**收敛：
   * 契约修订值 5.2/5.8/6.4 仍然出画 —— 实测扫描（--ndc，真实交战距离 13m、
   * 相机投影胸口世界坐标）：
   *     base 6.4 → ndcY 1.216 | 5.8 → 1.106 | 5.2 → 1.025 | 4.6 → 0.949 |
   *     4.0 → 0.876(进画面)  | 3.6 → 0.828 | 3.2 → 0.780
   * 画面内占比要从 0% 变成硬验收要求的 ≥95%，base 必须 ≤ ~4.3m。
   * 取 normal=3.6（胸口 6.0m，实测 ndcY 0.83，留 0.09 余量），
   * 仍满足「离地 2 个角色高、近战扫掠线(y≈1.4)与胸口差 4.6m ≫ 命中半径 3.2m」→ 近战照样够不到。
   */
  /**
   * 悬浮高度（契约修订值 5.2/5.8/6.4 再按"整只入画"实测收敛）：
   * 装了 camFrame 取景覆盖（frac 0.085/pitch 0.26）后，实测 base 5.82 时
   *   脚底 ndcY 0.43~0.46 ✓、法轮顶 0.93~1.09 ✗（上沿被切，两端都在画面内的帧只有 52%）。
   * 按 0.124 ndcY/m 反推：两端都进 |ndcY|≤0.95 要求 base ≤ 4.53m，故取 normal=4.5。
   */
  AIR_Y: { easy: 4.0, normal: 4.5, hard: 5.0 },
  /**
   * 默认机位（camera.js 还没接 camFrame 时的兜底高度）：实测扫描（--ndc）
   *   base 6.4→ndcY 1.216 | 5.8→1.106 | 5.2→1.025 | 4.6→0.949 | 4.0→0.876 | 3.6→0.828
   * 默认机位只能看到 ~4.3m 以下的悬浮体，所以没接取景覆盖时自动降到这一档，
   * 保证"用户第一眼必须看得见"（Lead P0）。接了 camFrame 后自动升回 AIR_Y。
   */
  AIR_Y_FALLBACK: { easy: 3.0, normal: 3.4, hard: 3.8 },
  /** Boss 取景（HOOKS.camFrame）：机位拉远 + 压低俯角，让 4.2m 本体两端都进画 */
  FRAME: { frac: 0.085, pitch: 0.26, fracMin: 0.075, ease: 4.6 },   // ease≈0.7s
  FRAME_NEUTRAL: { frac: 0.15, pitch: 0.4, fracMin: 0.13 },
  /** 环绕中心改为**宿傩**、半径 4~5m：相机永远框住宿傩（那是玩家的交战对象），
   *  所以"它一定在画面里"不再依赖相机偏航；同时语义上是"宿傩的式神悬在宿傩身边"。 */
  ORBIT_LOCAL: { easy: 4, normal: 4.5, hard: 5 },
  DESCEND_FROM: 18,
  ORBIT_R: { easy: 12, normal: 13.5, hard: 15 },   // 旧的"绕玩家"半径（保留常量，巡航用 ORBIT_LOCAL）
  AIR_SPEED: { easy: 8, normal: 10, hard: 12 },
  BLOCK_P: 0.3,            // 悬浮态近战扫到本体时的偶发「挡下」概率（Lead 允许的手感）
  BLOCK_TRANSFER: 0.35,    // 挡下时转记到魔虚罗头上的伤害比例
  EVADE_SIDE: 26,          // 预判侧移的巡航横向速度 m/s
  EVADE_BURST: 55,         // 前 0.12s 的爆发侧移速度（弹道 3 帧就穿过命中球，匀速 26m/s 根本闪不开）
  EVADE_BURST_T: 0.12,
  HIT_R: { easy: 2.4, normal: 2.0, hard: 1.7 },
  EVADE_LEAD: 0.35,
  /** 预判侧移概率。契约原值 0.30/0.55/0.75 在新高度（飞行时间变短）实测命中率 50%，
   *  偏"容易"；按 Lead P0 第 5 条调高到 0.40/0.70/0.85，实测命中率见报告。 */
  EVADE_P: { easy: 0.3, normal: 0.55, hard: 0.75 },
  DODGE_CD: 1.1,
  DAMAGE_IN_SCALE: 0.7,
  WEAK_MELEE_MUL: 1.5,
  WEAK_T: 1.6,
  SKILL_DMG_SCALE: 1.0,
  ADAPT_MUL: 0.45,
  ADAPT_IMMUNE: 4,
  WHEEL_MAX: 8,
  SOFT_RAGE: 1.6,
  GUARD_SUKUNA: 1.25,
  GUARD_GOJO: 0.6,
  TRUE_SUKUNA: 1.15,
  CD_HIGH: 4.0,
  CD_LOW: 2.6,
  CD_DIFF: { easy: 1.25, normal: 1.0, hard: 0.85 },
  CONTINUOUS_CD: 0.75,
  SLASH: { windup: 0.75, speed: 22, halfW: 3.0, dmg: 130, kb: 12, life: 2.4 },
  BOLT: { windup: 0.5, interval: 0.35, count: 3, speed: 26, dmg: 70, kb: 4, turn: 2.6, hitR: 1.7, life: 3.4 },
  LIGHTNING: { windup: 0.9, radius: 3.4, dmg: 150, kb: 8, lockT: 0.0 },
  DIVE: { windup: 0.8, travel: 0.45, radius: 8, dmg: 200, kb: 20, ascend: 1.0 }
  // 注：上面四个技能的 dmg 是「原始威力」，乘 SKILL_DMG_SCALE 后交给 resolver，
  //     再由既有的 TUNE.INCOMING_SCALE / BOSS_DMG_SCALE / 难度系数结算成实际掉血。
};

/** 术式（吃适应计数）；近战不吃适应，只在弱点窗口生效 */
var MAHO_SPELLS = [SKILL.BLUE, SKILL.RED, SKILL.PURPLE, SKILL.PURPLE_200];
var MAHO_SKILL_IDS = ["slash", "lightning", "dive", "barrage"];
var MAHO_SKILL_NAME = { slash: "退魔斩", lightning: "落雷", dive: "俯冲下砸", barrage: "咒力弹幕" };
var MAHO_DIFFS = ["easy", "normal", "hard"];

function mahoClamp(v, a, b) { return v < a ? a : v > b ? b : v; }
function mahoLerp(a, b, t) { return a + (b - a) * t; }
/** 读难度（easy/normal/hard），拿不到就 normal —— 所有难度曲线都从这里取 */
function mahoDiff(cb) {
  const d = cb && cb.ai && cb.ai.difficulty;
  return MAHO_DIFFS.indexOf(d) >= 0 ? d : "normal";
}
function mahoQuality() {
  const q = (typeof QUALITY4 !== "undefined" && QUALITY4) || "high";
  return q === "low" ? "low" : q === "medium" ? "medium" : "high";
}
/** 点到线段的距离（命中球用；p0/p1 是扫掠段两端） */
function mahoPointSegDistSq(px, py, pz, ax, ay, az, bx, by, bz) {
  const abx = bx - ax, aby = by - ay, abz = bz - az;
  const apx = px - ax, apy = py - ay, apz = pz - az;
  const len2 = abx * abx + aby * aby + abz * abz;
  let t = len2 > 1e-9 ? (apx * abx + apy * aby + apz * abz) / len2 : 0;
  t = mahoClamp(t, 0, 1);
  const dx = apx - abx * t, dy = apy - aby * t, dz = apz - abz * t;
  return dx * dx + dy * dy + dz * dz;
}

/* ==========================================================================
 * 一、程序化建模（用户直接点名的交付物）
 * --------------------------------------------------------------------------
 * 4.2m 高（含顶上的法轮）/ 肩宽 2.6m。深色躯体（C.INK 系）+ 骨白护甲（C.CONCRETE2）
 * + 暗红发光眼。全部由基本几何体拼装，材质只有 MeshLambert（受光）与
 * MeshBasic（自发光）两档，不引入 PBR。draw call（网格数）≈ 45，契约上限 70。
 * 结构：
 *   root
 *    └ hips ─ core ─ chest ─┬ neck ─ head ─ wheel(8 格 + 外环 + 内环)
 *                           ├ shoulderL/R ─ upperArm ─ foreArm(粗大) ─ hand
 *                           └ sword(背后的退魔之剑)
 *          └ thighL/R ─ shin ─ foot
 * ========================================================================== */

/** 材质池：跨召唤复用，避免每次重开都新建材质（three 里材质是重资源） */
var MAHO_MATS = null;
function mahoMaterials() {
  if (MAHO_MATS) return MAHO_MATS;
  /**
   * 配色按**官方立绘**重做（用户验收基准：shots/ref/maho-ref-1..4）：
   *   躯体 = 苍白/骨白（不是深色）、法轮 = 金色球轮、下装 = 黑色破布、脚絆/腕带 = 白绳。
   * 夜景下白色躯体本身就有很好的可读性，不需要再靠自发光提亮；
   * 只有眼睛（方形绿光）、法轮金球（受光 + 高光）、剑刃高光用自发光。
   */
  MAHO_MATS = {
    bone: new MeshLambertMaterial({ color: 0xf0ece1, emissive: 0x2b2822 }),   // 暖白躯体（立绘主色）
    boneShade: new MeshLambertMaterial({ color: 0xc2c0b4 }),   // 肌肉沟槽/关节（比主体暗一档，明暗层次）
    boneDark: new MeshLambertMaterial({ color: 0x9a9a91 }),
    cloth: new MeshLambertMaterial({ color: 0x121317 }),       // 黑色破布短裙 / 锁链
    clothLit: new MeshLambertMaterial({ color: 0x1f2229 }),
    rope: new MeshLambertMaterial({ color: 0xe9e5d6 }),        // 脚絆 / 腕带（白绳）
    mouth: new MeshBasicMaterial({ color: 0x0d0a09 }),         // 口腔暗部
    teeth: new MeshLambertMaterial({ color: 0xf6f4ec }),       // 方牙
    eye: new MeshBasicMaterial({ color: 0x49ff9a, toneMapped: false }),     // 方形发光绿眼
    eyeGlow: new MeshBasicMaterial({ color: 0x2bff88, toneMapped: false, transparent: true, opacity: 0.3, blending: AdditiveBlending, depthWrite: false }),
    glow: new MeshBasicMaterial({ color: C.CRIMSON, toneMapped: false, transparent: true, opacity: 0.85 }),
    blade: new MeshLambertMaterial({ color: 0xf2f6fa, emissive: 0x3a3f46 }),   // 白色细长刀身（夜里有反光）
    bladeEdge: new MeshBasicMaterial({ color: 0xffffff, toneMapped: false, transparent: true, opacity: 0.9 }),
    gold: new MeshLambertMaterial({ color: 0xffc63a, emissive: 0x4a3208 }),   // 金轮（受光 + 一点自发光，夜景里认得出）
    goldDim: new MeshLambertMaterial({ color: 0x8a6a14 }),     // 未点亮的金球
    wheelOff: new MeshLambertMaterial({ color: 0x8a6a14 }),    // mahoLightWheel 用：未点亮
    wheelOn: new MeshBasicMaterial({ color: 0xffe07a, toneMapped: false }), // 点亮（适应一格）
    ring: new MeshBasicMaterial({ color: 0xffcf5e, toneMapped: false, transparent: true, opacity: 0.85 }),
    shadow: new MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.42, depthWrite: false })
  };
  return MAHO_MATS;
}

function mahoMesh(geo, mat, x, y, z, parent) {
  const m = new Mesh(geo, mat);
  m.position.set(x || 0, y || 0, z || 0);
  if (parent) parent.add(m);
  return m;
}

/**
 * 构建魔虚罗模型。
 * @returns {{root:Group, bones:Object, parts:Object, meshes:Array, wheel:Object}}
 */
function mahoBuildModel() {
  const q = mahoQuality();
  const low = q === "low";
  const M = mahoMaterials();
  const root = new Group();
  root.name = "mahoraga";
  const bones = {};
  const parts = [];
  const mkBone = (name, parent, x, y, z) => {
    const g = new Group();
    g.name = name;
    g.position.set(x || 0, y || 0, z || 0);
    parent.add(g);
    bones[name] = g;
    return g;
  };
  const put = (geo, mat, parent, x, y, z) => {
    const m = mahoMesh(geo, mat, x, y, z, parent);
    // 记下原始局部坐标：击破演出会把零件打散，下一局/下一次召唤必须复位
    m.userData.op = { x: x || 0, y: y || 0, z: z || 0 };
    parts.push(m);
    return m;
  };

  /* ---------------- 骨骼（自建，不碰 fighters.js 的 rig） ---------------- */
  const HIP_Y = 1.86;                     // 腿长（髋→脚底）≈1.86m ≈ 总高 46%（立绘比例）
  const TORSO = { core: 0.10, chest: 0.30, neck: 0.30, head: 0.10 };   // 压短躯干链，把高度让给"头顶金冠"
  const hips = mkBone("hips", root, 0, HIP_Y, 0);
  const core = mkBone("core", hips, 0, TORSO.core, 0);
  const chest = mkBone("chest", core, 0, TORSO.chest, 0);   // 肩枢轴 ≈ 2.36
  const neck = mkBone("neck", chest, 0, TORSO.neck, 0);     // 2.72
  const head = mkBone("head", neck, 0, TORSO.head, 0);      // 2.82（头顶 ≈ 3.10）
  bones.hips.userData = { restY: HIP_Y };

  /* 躯干（第二轮）：不再用等宽方盒 —— 宽肩窄腰的**锥形**躯干 + 压扁球体的肌肉块，
   * 并把整个上半身做出 8~12° 前倾（立绘是压低重心的猛兽姿态） */
  hips.rotation.x = 0.16;
  const chestMesh = put(new CylinderGeometry(0.8, 0.46, 0.58, 12), M.bone, chest, 0, 0.04, 0);
  chestMesh.scale.z = 0.78;                                                         // 上宽下收 + 更厚的胸腔
  const waistMesh = put(new CylinderGeometry(0.38, 0.26, 0.4, 12), M.boneShade, core, 0, 0, 0);
  waistMesh.scale.z = 0.72;                                                         // 腰宽 ≈0.76m（肩/腰 ≈3.4）
  const pelvMesh = put(new CylinderGeometry(0.36, 0.3, 0.32, 10), M.bone, hips, 0, -0.08, 0);
  pelvMesh.scale.z = 0.8;
  const pecL = put(new SphereGeometry(0.32, 10, 8), M.bone, chest, -0.3, 0.12, 0.2);   // 胸肌：压扁的球
  pecL.scale.set(1.05, 0.7, 0.62);
  const pecR = put(new SphereGeometry(0.32, 10, 8), M.bone, chest, 0.3, 0.12, 0.2);
  pecR.scale.set(1.05, 0.7, 0.62);
  const absMesh = put(new SphereGeometry(0.3, 10, 8), M.bone, core, 0, -0.02, 0.16);   // 腹肌：带弧度的块
  absMesh.scale.set(1.0, 1.45, 0.32);
  put(new CylinderGeometry(0.18, 0.22, 0.22, 10), M.boneShade, neck, 0, 0.02, 0);   // 颈

  /* 头部（第二轮，第一优先）：窄长的**球体头骨** + 咧到耳根的暗色大嘴 + 上下方牙齿带 +
   * 更大更方的内凹绿眼 —— 远处要能读出"骷髅面具" */
  const skull = put(new SphereGeometry(0.25, 12, 10), M.bone, head, 0, 0.24, 0);
  skull.scale.set(0.95, 1.06, 1.25);                                                // 头高 ≈0.55m、窄而长
  skull.rotation.x = 0.12;
  put(new BoxGeometry(0.5, 0.22, 0.14), M.mouth, head, 0, 0.05, 0.24);              // 大嘴暗槽（横贯）
  put(new BoxGeometry(0.46, 0.06, 0.11), M.teeth, head, 0, 0.115, 0.27);            // 上排方牙带
  put(new BoxGeometry(0.46, 0.06, 0.11), M.teeth, head, 0, -0.005, 0.27);           // 下排方牙带
  put(new BoxGeometry(0.22, 0.16, 0.08), M.eye, head, -0.15, 0.31, 0.25);           // 方形发光眼（内凹）
  put(new BoxGeometry(0.22, 0.16, 0.08), M.eye, head, 0.15, 0.31, 0.25);
  if (!low) {
    /* 四根长角：两长两短，向斜上/后方伸出（鹿角 + 骨刃的混合形），每根用收细的圆柱拼出弯度 */
    /* 四角（剪影第一优先）：一根角 = 一条 CatmullRom 曲线 + TubeGeometry，1 个网格出自然弧度。
     * 长角 ≥1.4m、短角 ≥0.85m，从头部两侧发出后向外再向上后方弯，正面剪影要超出肩宽 ≥0.4m */
    const horn = (pts, r0, r1, seg) => {
      const curve = new CatmullRomCurve3(pts.map((p) => new Vector3(p[0], p[1], p[2])));
      return put(new TubeGeometry(curve, seg, r0, 6, false), M.bone, head, 0, 0, 0);
    };
    for (const s of [-1, 1]) {
      horn([[s * 0.18, 0.24, -0.02], [s * 0.75, 0.62, -0.3], [s * 1.42, 0.78, -0.58], [s * 1.98, 0.58, -0.8]], 0.095, 0.02, 10);  // 长角：横向到 ±1.98
      horn([[s * 0.16, 0.08, -0.12], [s * 0.72, 0.24, -0.52], [s * 1.34, 0.1, -0.88]], 0.075, 0.015, 8);                        // 短角
    }
    /* 颈圈叶状护甲片（立领一样围住脖子） */
    for (const s of [-1, 1]) {
      const pl = put(new CylinderGeometry(0.015, 0.085, 0.46, 5), M.bone, neck, s * 0.26, 0.14, -0.06);  // 薄而带尖
      pl.scale.z = 0.3;
      pl.rotation.set(-0.42, s * 0.55, s * 0.8);
    }
    /* 胸前黑色锁链（识别点 4）：横带 + 两个链环 + 垂珠 */
    put(new BoxGeometry(0.72, 0.05, 0.05), M.cloth, chest, 0, 0.15, 0.42);
    put(new SphereGeometry(0.05, 6, 5), M.clothLit, chest, 0, 0.05, 0.45);
  }

  /* ---------------- 法轮：八握剑异戒神将（识别点 3，第二识别点） ----------------
   * 立绘是「金色尖刺轮圈 + 轮辐上串 8 颗金球」。
   * 尖刺用**低分段数的粗 torus** 做（棱角本身就是尖刺，不额外加网格）；
   * 8 颗金球同时充当"适应点亮一格"的指示灯（wheelSegs）。 */
  const wheel = mkBone("wheel", head, 0, 0.56, -0.08);   // 轮心 = 颅顶上方 ≈0.05（总高 4.2 上限内能给的最高值）
  const wheelSegs = [];
  const WHEEL_R = 0.62;                                  // 直径 1.24m（受 4.2m 总高上限限制的最大值）
  for (let i = 0; i < MAHO_TUNE.WHEEL_MAX; i++) {
    const ang = i / MAHO_TUNE.WHEEL_MAX * Math.PI * 2;
    const ball = new Mesh(new SphereGeometry(0.11, 12, 10), M.wheelOff);    // 球要圆要亮
    ball.position.set(Math.cos(ang) * WHEEL_R, Math.sin(ang) * WHEEL_R, 0);
    wheel.add(ball);
    wheelSegs.push(ball);
  }
  const ringMesh = put(new TorusGeometry(WHEEL_R, 0.07, 4, 12), M.gold, wheel, 0, 0, 0);   // 尖刺金圈（低分段=棱角）
  const hub = ringMesh;
  const wheelGroup = wheel;

  /* ---------------- 双臂（前臂粗大）+ 骨白肩甲 ---------------- */
  const shoulders = 1.0;
  const arms = {};
  const mkArm = (tag, s) => {
    const sh = mkBone("shoulder" + tag, chest, s * shoulders, 0.3, 0);
    const ua = mkBone("upperArm" + tag, sh, 0, -0.04, 0);
    const fa = mkBone("foreArm" + tag, ua, 0, -0.7, 0);
    const hd = mkBone("hand" + tag, fa, 0, -0.8, 0);        // 单臂 ≈1.66m（≥1.5）
    const dl = put(new SphereGeometry(0.28, 12, 10), M.bone, sh, s * 0.05, 0.0, 0);   // 三角肌球
    dl.scale.set(1.0, 0.95, 0.95);
    put(new CylinderGeometry(0.19, 0.14, 0.7, 10), M.bone, ua, 0, -0.35, 0);          // 上臂（比前臂细）
    put(new SphereGeometry(0.16, 10, 8), M.boneShade, ua, 0, -0.7, 0);                // 肘关节球
    const bi = put(new SphereGeometry(0.15, 10, 8), M.bone, ua, s * 0.04, -0.26, 0.07);   // 二头肌鼓包
    bi.scale.set(0.95, 1.3, 0.95);
    put(new CylinderGeometry(0.23, 0.14, 0.8, 10), M.bone, fa, 0, -0.4, 0);           // 前臂（**比上臂粗**、递细）
    put(new BoxGeometry(0.3, 0.26, 0.36), M.bone, hd, 0, -0.15, 0.02);               // 拳头（块面，不是圆球）
    if (!low) {
      const wr = put(new TorusGeometry(0.17, 0.038, 4, 10), M.rope, fa, 0, -0.74, 0); // 腕带（白绳）
      wr.rotation.x = Math.PI / 2;
    }
    arms[tag] = { sh, ua, fa, hd };
  };
  mkArm("L", 1);
  mkArm("R", -1);
  // 手部挂点：技能特效从手里出
  const handR = new Object3D();
  handR.position.set(0, -0.36, 0);
  arms.R.hd.add(handR);

  /* ---------------- 双腿 ---------------- */
  const legX = 0.5;                      // 站距：骨骼间距 1.0m + 大腿外张 → 两脚 ≈1.5m（马步）
  const mkLeg = (tag, s) => {
    const th = mkBone("thigh" + tag, hips, s * legX, -0.16, 0);
    const sn = mkBone("shin" + tag, th, 0, -0.82, 0);
    const ft = mkBone("foot" + tag, sn, 0, -0.82, 0);      // 髋(1.86) → 踝(0.22) → 脚底 ≈0（踩地）
    const th1 = put(new CylinderGeometry(0.27, 0.18, 0.84, 10), M.bone, th, 0, -0.42, 0);  // 大腿（长、上粗下细）
    th1.scale.z = 1.05;
    put(new SphereGeometry(0.18, 10, 8), M.boneShade, sn, 0, 0.0, 0);                      // 膝关节球
    put(new CylinderGeometry(0.195, 0.115, 0.78, 10), M.bone, sn, 0, -0.39, 0);            // 小腿（长、递细）
    const calf = put(new SphereGeometry(0.13, 10, 8), M.bone, sn, 0, -0.2, -0.09);         // 小腿鼓包
    calf.scale.set(0.9, 1.3, 0.9);
    const foot = put(new SphereGeometry(0.2, 10, 8), M.bone, ft, 0, -0.11, 0.16);          // 足（长球，踩地）
    foot.scale.set(0.85, 0.55, 1.9);
    if (!low) {
      // 脚絆（识别点 6）：脚踝一圈白绳
      const wr = put(new TorusGeometry(0.155, 0.042, 4, 10), M.rope, sn, 0, -0.68, 0);
      wr.rotation.x = Math.PI / 2;
    }
    return { th, sn, ft };
  };
  mkLeg("L", 1);
  mkLeg("R", -1);

  /* 下装（识别点 5）：黑色破布短裙 + 腰上扎结 + 参差下摆 */
  put(new BoxGeometry(0.96, 0.2, 0.64), M.cloth, hips, 0, -0.16, 0);               // 腰带
  put(new BoxGeometry(0.3, 0.22, 0.18), M.clothLit, hips, 0, -0.24, 0.34);         // 前腰扎结
  if (!low) {
    for (let i = -1; i <= 1; i++) {
      const flap = put(new BoxGeometry(0.36, 0.46, 0.07), M.cloth, hips, i * 0.32, -0.52, 0.24 - Math.abs(i) * 0.12);
      flap.rotation.set(0.05 * (i + 1), 0, i * 0.14);
    }
  }

  /* 尾巴（识别点 8）：细长白尾从背后垂下并向上卷（4 节骨链，会随悬浮姿态轻摆） */
  let tailParent = hips;
  const tailRot = [-0.5, -0.62, -0.8];
  const tailLen = [0.54, 0.5, 0.44];
  const tailR = [0.075, 0.05, 0.03];
  const tailBones = [];
  for (let i = 0; i < 3; i++) {
    const seg = mkBone("tail" + i, tailParent, 0, i === 0 ? -0.05 : -tailLen[i - 1], i === 0 ? -0.32 : 0);
    seg.rotation.x = tailRot[i];
    put(new CylinderGeometry(Math.max(0.015, tailR[i] - 0.018), tailR[i], tailLen[i], 6), M.bone, seg, 0, -tailLen[i] / 2, 0);
    tailBones.push(seg);
    tailParent = seg;
  }

  /* 武器（识别点 7）：退魔之剑 —— 极细长剑（≈身高），握在右手、垂在体侧 */
  const sword = mkBone("sword", arms.R.hd, 0, -0.12, 0.08);
  sword.rotation.set(0.22, 0, 0.1);
  put(new BoxGeometry(0.1, 2.4, 0.24), M.blade, sword, 0, -1.26, 0);                // 白色刀身（≈2.4m）
  put(new BoxGeometry(0.045, 2.36, 0.08), M.bladeEdge, sword, 0, -1.26, 0.14);      // 刃口高光
  put(new BoxGeometry(0.3, 0.06, 0.16), M.boneShade, sword, 0, -0.04, 0);           // 护手
  put(new CylinderGeometry(0.045, 0.045, 0.3, 6), M.cloth, sword, 0, 0.12, 0);      // 深色剑柄

  /* ---------------- 地面投影（圆形暗贴片，让它在低空时不"飘"） ---------------- */
  const shadow = new Mesh(new CircleGeometry(2.6, 18), M.shadow);
  shadow.rotation.x = -Math.PI / 2;
  shadow.position.y = 0.06;
  root.add(shadow);
  parts.push(shadow);

  root.visible = false;
  return { root, bones, parts, wheel: { group: wheelGroup, segs: wheelSegs, hub }, handR, arms, shadow, tail: tailBones };
}

/** 统计可见网格数（draw call 近似值，探针用） */
function mahoCountMeshes(obj) {
  let n = 0;
  obj.traverse((o) => { if (o.isMesh && o.visible) n++; });
  return n;
}

/* ==========================================================================
 * 二、姿态库 + 姿态插值
 * --------------------------------------------------------------------------
 * 每个姿态给出骨骼目标欧拉角（弧度）。不用关键帧采样器，直接阻尼插值到目标，
 * 便宜且够用：hover（悬浮呼吸）/ windup（前摇蓄力）/ slash（挥斩）/ slam（下砸）/
 * damage（受击）/ summon（从法阵升起）。
 * ========================================================================== */
var MAHO_POSE = {
  hover: {
    // 马步 + 双臂外张（手在髋两侧）+ 重心下沉：立绘是"压低重心的猛兽"，不是笔直站着
    core: [0.05, 0, 0], chest: [0.04, 0, 0], head: [0.09, 0, 0],
    upperArmL: [-0.12, 0, -0.42], foreArmL: [-0.5, 0, 0], handL: [-0.2, 0, 0],
    upperArmR: [-0.16, 0, 0.45], foreArmR: [-0.55, 0, 0], handR: [-0.2, 0, 0],
    thighL: [0.16, 0, 0.18], shinL: [-0.3, 0, 0], footL: [0.14, 0, 0],
    thighR: [0.2, 0, -0.18], shinR: [-0.34, 0, 0], footR: [0.18, 0, 0]
  },
  windup: {
    core: [-0.12, 0.3, 0], chest: [-0.16, 0.34, 0], head: [0.1, -0.2, 0],
    upperArmL: [-1.5, 0, -0.5], foreArmL: [-1.3, 0, 0], handL: [-0.4, 0, 0],
    upperArmR: [-1.9, 0.3, 0.4], foreArmR: [-1.5, 0, 0], handR: [-0.5, 0, 0],
    thighL: [0.5, 0, 0.1], shinL: [-0.9, 0, 0], footL: [0.4, 0, 0],
    thighR: [0.42, 0, -0.1], shinR: [-0.8, 0, 0], footR: [0.36, 0, 0]
  },
  slash: {
    core: [0.22, -0.5, 0], chest: [0.28, -0.6, 0], head: [-0.1, 0.35, 0],
    upperArmL: [-0.5, 0, -0.9], foreArmL: [-0.4, 0, 0], handL: [-0.1, 0, 0],
    upperArmR: [0.5, -0.4, 0.5], foreArmR: [-0.3, 0, 0], handR: [-0.15, 0, 0],
    thighL: [0.3, 0, 0.08], shinL: [-0.55, 0, 0], footL: [0.2, 0, 0],
    thighR: [0.36, 0, -0.08], shinR: [-0.6, 0, 0], footR: [0.24, 0, 0]
  },
  slam: {
    core: [0.44, 0, 0], chest: [0.4, 0, 0], head: [0.24, 0, 0],
    upperArmL: [-1.1, 0, -0.3], foreArmL: [-0.9, 0, 0], handL: [-0.3, 0, 0],
    upperArmR: [-1.1, 0, 0.3], foreArmR: [-0.9, 0, 0], handR: [-0.3, 0, 0],
    thighL: [0.85, 0, 0.22], shinL: [-1.5, 0, 0], footL: [0.6, 0, 0],
    thighR: [0.85, 0, -0.22], shinR: [-1.5, 0, 0], footR: [0.6, 0, 0]
  },
  damage: {
    core: [-0.22, 0.12, 0], chest: [-0.26, 0.16, 0], head: [-0.3, -0.1, 0],
    upperArmL: [-0.8, 0, -0.7], foreArmL: [-0.9, 0, 0], handL: [-0.3, 0, 0],
    upperArmR: [-0.7, 0, 0.75], foreArmR: [-0.8, 0, 0], handR: [-0.3, 0, 0],
    thighL: [0.35, 0, 0.12], shinL: [-0.7, 0, 0], footL: [0.3, 0, 0],
    thighR: [0.42, 0, -0.12], shinR: [-0.8, 0, 0], footR: [0.32, 0, 0]
  },
  summon: {
    core: [-0.3, 0, 0], chest: [-0.34, 0, 0], head: [-0.46, 0, 0],
    upperArmL: [-0.35, 0, -1.15], foreArmL: [-0.25, 0, 0], handL: [-0.1, 0, 0],
    upperArmR: [-0.35, 0, 1.15], foreArmR: [-0.25, 0, 0], handR: [-0.1, 0, 0],
    thighL: [0.1, 0, 0.18], shinL: [-0.25, 0, 0], footL: [0.1, 0, 0],
    thighR: [0.1, 0, -0.18], shinR: [-0.25, 0, 0], footR: [0.1, 0, 0]
  }
};

/* ==========================================================================
 * 三、模块状态机
 * ========================================================================== */
var MAHO = {
  cb: null,
  model: null,
  scene: null,
  state: "off",          // off | summon | air | windup | cast | dive | down | ascend | broken
  t: 0,
  hp: 0,
  hpMax: MAHO_TUNE.HP,
  alive: false,
  triggered: false,
  finished: false,       // 击破过（本局不再出现）
  adapt: {},             // 术式 -> 命中次数
  adaptMul: {},          // 术式 -> 当前伤害倍率
  wheelLit: 0,
  softRage: false,
  protected: false,      // 庇护期（玩家打宿傩 ×0.6 / 宿傩打玩家 ×1.25）
  trueSukuna: false,     // 真·宿傩（击破后保留 ×1.15）
  skillId: null,
  skillPhase: "",
  skillT: 0,
  cd: 0,
  lastSkill: null,
  hitsTaken: 0,
  immuneHits: 0,
  pos: new Vector3(),
  prevPos: new Vector3(),
  vel: new Vector3(),
  speed: 0,
  yaw: 0,
  orbitA: 0,
  orbitPhase: 0,
  orbitW: 0.34,
  orbitDir: 1,
  baseY: 15.2,
  spawnPos: new Vector3(),
  tele: null,            // 落雷预警 / 俯冲落点
  teleMesh: null,        // 自建的地面预警圈（跟着玩家/锁死后锁死）
  wave: null,
  bolts: [],
  sigil: null,           // 召唤法阵 / 升起的法轮
  dodgeT: 0,
  dodgeCd: 0,
  dodgeDir: new Vector3(1, 0, 0),
  weakT: 0,
  flashT: 0,
  shakeT: 0,
  hintCd: 0,
  hud: { root: null, bar: null, num: null, adapt: null, warn: null, weak: null, state: null, last: "" },
  hudDirty: true,
  stats: { casts: { slash: 0, lightning: 0, dive: 0, barrage: 0 }, playerHits: 0, dodges: 0, immune: 0, adaptEvents: 0, broken: 0, hint: 0, summons: 0, boltsBlocked: 0, blocks: 0 },
  hookCalls: { tick: 0, segment: 0, aim: 0, damageGate: 0, meleeAim: 0 },
  /** 最近一次「普攻已被掰向魔虚罗」的时刻（performance.now()，HUD 用来点亮目标提示） */
  aimUntil: 0,
  /** 探针口径：meleeAim 钩子一共给出过几次副目标 */
  aimOffered: 0,
  lastHitInfo: null,
  /** 探针开关：覆盖"预判侧移"概率（null = 用难度概率）。只在破坏性自测里用 */
  evadeOverride: null,
  /** 探针开关：钉住位置（截图用；mahoUpdateAir 遇到 pin 就不动它） */
  pin: false,
  /** 取景覆盖的插值权重（0=常规取景，1=boss 取景）与最近一次被调用时刻 */
  frameW: 0,
  frameT: 0,
  camFrameLast: -99,
  lastHeight: 4.07
};

function mahoIsMeleeSkill(skill) { return skill === SKILL.PUNCH || skill === SKILL.KICK || skill === SKILL.BLACK_FLASH || skill === SKILL.RUSH; }
function mahoIsSpell(skill) { return MAHO_SPELLS.indexOf(skill) >= 0; }

/** 命中球球心：胸口。空中 y≈2.4（本体 4m 的胸口），落地蹲伏时 y≈1.35 */
function mahoBodyCenter(out) {
  const down = MAHO.state === "down" || MAHO.state === "ascend";
  return (out || new Vector3()).set(MAHO.pos.x, MAHO.pos.y + (down ? 1.35 : 2.4), MAHO.pos.z);
}
function mahoHitR(cb) { return MAHO_TUNE.HIT_R[mahoDiff(cb)]; }
/**
 * 悬浮高度：取景覆盖（HOOKS.camFrame）被 camera.js 真正调用 → 用契约的 5.2/5.8/6.4；
 * 没人调用（sprint 还没接线）→ 用实测"默认机位也能看见"的兜底高度 3.2/3.6/4.0。
 * 判断依据是最近 1.5s 内有没有人调 camFrame —— 接上线之后自动升上去，不用改代码。
 */
function mahoBaseY(cb) {
  const nowS = (typeof performance !== "undefined" ? performance.now() : Date.now()) / 1000;
  const live = (nowS - MAHO.camFrameLast) < 1.5 && MAHO.camFrameLast > 0;
  const table = live ? MAHO_TUNE.AIR_Y : MAHO_TUNE.AIR_Y_FALLBACK;
  return table[mahoDiff(cb)];
}

/** 玩家是否处于锁定（只有锁定时 aim 才会把弹道掰向空中目标） */
function mahoLockOn() {
  try {
    if (typeof cam !== "undefined" && cam && cam.lockOn) return true;
  } catch (e) { /* cam 还没建好 */ }
  return false;
}

/** 取场景：优先用角色 root 的父节点（最稳），退回全局 scene 变量 */
function mahoSceneOf(cb) {
  const g = cb && cb.fighters && cb.fighters[SIDE.GOJO];
  const p = g && g.ctrl && g.ctrl.root && g.ctrl.root.parent;
  if (p && typeof p.add === "function") return p;
  try { if (typeof scene !== "undefined" && scene && scene.add) return scene; } catch (e) { /* noop */ }
  return null;
}

/* ==========================================================================
 * 四、触发 / 召唤演出（2.8s，phaseLock 冻结双方）
 * ========================================================================== */
function mahoSummon(cb) {
  if (MAHO.alive || MAHO.state === "summon" || MAHO.finished) return false;
  const pl = cb.fighters[SIDE.GOJO];
  const sk = cb.fighters[SIDE.SUKUNA];
  if (!MAHO.model) {
    MAHO.scene = mahoSceneOf(cb);
    MAHO.model = mahoBuildModel();
    if (MAHO.scene) MAHO.scene.add(MAHO.model.root);
  }
  // 出场点：宿傩与玩家连线的中点附近，法阵画在地面上
  const px = (pl.p.x + sk.p.x) * 0.5;
  const pz = (pl.p.z + sk.p.z) * 0.5;
  MAHO.spawnPos.set(px, 0, pz);
  MAHO.pos.set(px, 0.4, pz);
  MAHO.prevPos.copy(MAHO.pos);
  MAHO.hp = MAHO_TUNE.HP;
  MAHO.hpMax = MAHO_TUNE.HP;
  MAHO.alive = true;
  MAHO.protected = true;
  MAHO.trueSukuna = false;
  MAHO.triggered = true;
  MAHO.stats.summons++;
  MAHO.state = "summon";
  MAHO.t = 0;
  MAHO.cd = 1.2;
  MAHO.lastSkill = null;
  MAHO.baseY = mahoBaseY(cb);
  MAHO.orbitA = Math.atan2(MAHO.pos.z - pl.p.z, MAHO.pos.x - pl.p.x);
  MAHO.orbitPhase = 0;
  MAHO.model.root.visible = true;
  MAHO.model.root.position.copy(MAHO.pos);
  MAHO.model.root.scale.setScalar(0.55);
  MAHO.wheelLit = 0;
  MAHO.softRage = false;
  mahoLightWheel();
  mahoEnterPose("summon", 4);

  /* 演出：天空压暗 +「布瑠部由良由良」+ 金色法阵 + 法轮从宿傩头顶升起 */
  cb.phaseLock = MAHO_TUNE.SUMMON_LOCK;
  cb.banner("布瑠部由良由良 —— 布瑠部由良由良", 2.8);
  cb.fx.screen({ desaturate: 0.5, vignette: 0.55, blur: 0.22, shake: 0.3, life: 2.8 });
  cb.fx.groundRing({ pos: new Vector3(px, 0.08, pz), maxRadius: 11, color: C.GOLD, color2: C.CRIMSON, life: 2.6, thickness: 0.9 });
  cb.fx.groundRing({ pos: new Vector3(px, 0.05, pz), maxRadius: 6, color: C.CRIMSON, color2: C.GOLD, life: 1.6, thickness: 0.5 });
  cb.fx.aura({ target: MAHO.model.root, color: C.CRIMSON, kind: "cursed", scale: 1.6, life: 2.8, intensity: 1 });
  cb.audio.play("mahoraga", { volume: 0.9 });
  cb.audio.play("worldslash", { volume: 0.5 });
  cb.pushEvent({ type: "mahoraga_summon", x: +px.toFixed(2), z: +pz.toFixed(2) });
  mahoEnsureHud();
  mahoHudShow(true);
  return true;
}

/** 法阵 / 法轮升起的过场道具（独立于本体，演出结束移除） */
function mahoBuildSigil() {
  const M = mahoMaterials();
  const g = new Group();
  const ring = new Mesh(new TorusGeometry(0.85, 0.05, 8, 28), M.gold);
  g.add(ring);
  for (let i = 0; i < 8; i++) {
    const a = i / 8 * Math.PI * 2;
    const s = new Mesh(new BoxGeometry(0.36, 0.07, 0.07), M.wheelOn);
    s.position.set(Math.cos(a) * 0.62, Math.sin(a) * 0.62, 0);
    s.rotation.z = a;
    g.add(s);
  }
  const inner = new Mesh(new TorusGeometry(0.34, 0.03, 6, 20), M.ring);
  g.add(inner);
  return g;
}

function mahoSummonUpdate(cb, dt) {
  MAHO.t += dt;
  const t = MAHO.t;
  const sk = cb.fighters[SIDE.SUKUNA];
  const root = MAHO.model.root;
  // 法轮从宿傩头顶升起（0~1.0s）→ 飞到出场点上空
  if (!MAHO.sigil) {
    MAHO.sigil = mahoBuildSigil();
    if (MAHO.scene) MAHO.scene.add(MAHO.sigil);
  }
  const s = MAHO.sigil;
  const up = mahoClamp(t / 1.0, 0, 1);
  s.visible = t < 2.6;
  const sx = mahoLerp(sk.p.x, MAHO.spawnPos.x, mahoClamp((t - 0.8) / 1.2, 0, 1));
  const sz = mahoLerp(sk.p.z, MAHO.spawnPos.z, mahoClamp((t - 0.8) / 1.2, 0, 1));
  s.position.set(sx, sk.p.y + 2.4 + up * 1.5, sz);
  s.rotation.y += dt * (2 + up * 6);
  s.rotation.z = Math.sin(t * 3) * 0.2;
  if (t < 2.6) {
    s.scale.setScalar(1 + Math.sin(t * 7) * 0.06);
    cb.fx.hitSpark({ pos: s.position.clone(), color: C.GOLD, color2: C.CRIMSON, count: 3, size: 0.4, life: 0.3, speed: 5 });
  }
  // 本体从法阵里升起（0.9~2.0s），再升空（2.0~2.8s）
  /**
   * 召唤演出（契约修订版 §4 第 4 条）：从天而降，全程**在画面里**。
   *   0.00~0.35s 只给法阵/法轮：金色光柱从法阵往上长
   *   0.35~2.20s 本体从 18m 降落到悬浮高度（ease-out，落得慢，看得清）
   *   2.20~2.80s 定格：冲击波 + 尘环 + 定格 callout，然后交给 state=air
   */
  if (t < 0.35) {
    root.visible = false;
    cb.fx.beam({ from: new Vector3(MAHO.pos.x, 0.1, MAHO.pos.z), to: new Vector3(MAHO.pos.x, MAHO_TUNE.DESCEND_FROM, MAHO.pos.z), life: 0.35, color: C.GOLD, radius: 1.1 });
  } else if (t < 2.2) {
    const u = (t - 0.35) / 1.85;
    const e = 1 - Math.pow(1 - u, 3);                 // ease-out：越接近高度落得越慢
    const y = mahoLerp(MAHO_TUNE.DESCEND_FROM, MAHO.baseY, e);
    root.visible = true;
    root.position.set(MAHO.pos.x, y, MAHO.pos.z);
    root.scale.setScalar(1);
    MAHO.yaw = MAHO.yaw;
    root.rotation.y = MAHO.yaw;
    cb.fx.sphere({ pos: root.position.clone().setY(y + 2), radius: 2.2, color: C.CRIMSON, coreColor: C.GOLD, life: 0.08, charge: 0.5, distort: 0.6 });
    cb.fx.trail && cb.fx.trail({ pos: root.position.clone().setY(y + 1.5), life: 0.35, color: C.GOLD, radius: 0.6 });
  } else {
    root.visible = true;
    root.position.set(MAHO.pos.x, MAHO.baseY, MAHO.pos.z);
    root.rotation.y = MAHO.yaw;
    if (!MAHO._landed) {
      MAHO._landed = true;
      cb.fx.shockwave({ pos: root.position.clone(), maxRadius: 18, color: C.CRIMSON, color2: C.GOLD, life: 0.7, thickness: 0.9 });
      cb.fx.groundRing({ pos: new Vector3(MAHO.pos.x, 0.06, MAHO.pos.z), maxRadius: 18, color: C.GOLD, color2: C.CRIMSON, life: 0.8, thickness: 0.9 });
      cb.fx.debris({ pos: new Vector3(MAHO.pos.x, 0.2, MAHO.pos.z), count: 20, power: 14, color: C.CONCRETE2 });
      cb.fx.screen({ flash: 0.35, color: C.GOLD, shake: 0.6, life: 0.4 });
      cb.audio.play("land", { volume: 0.8 });
    }
    MAHO.pos.y = MAHO.baseY;
  }
  // 面向玩家
  const pl = cb.fighters[SIDE.GOJO];
  const want = Math.atan2(pl.p.x - MAHO.pos.x, pl.p.z - MAHO.pos.z);
  MAHO.yaw = mahoLerp(MAHO.yaw, want, mahoClamp(dt * 3, 0, 1));
  MAHO.pos.set(MAHO.pos.x, root.position.y, MAHO.pos.z);
  mahoPoseUpdate(dt, "summon", 2.5);
  // 演出收尾
  if (t >= 2.0 && !MAHO._cried) {
    MAHO._cried = true;
    cb.fx.callout({ text: "八握剑异戒神将", sub: "MAHORAGA", pos: root.position.clone().setY(root.position.y + 3.4), color: C.CRIMSON, color2: C.GOLD, life: 2, size: 2.2, rise: 1.2 });
    cb.banner("魔虚罗 · 八握剑异戒神将 降临", 2.2);
    cb.audio.play("charge_ready", { volume: 0.8 });
  }
  if (t >= MAHO_TUNE.SUMMON_LOCK) {
    MAHO._cried = false;
    MAHO._landed = false;
    MAHO.state = "air";
    MAHO.t = 0;
    MAHO.pos.set(MAHO.pos.x, MAHO.baseY, MAHO.pos.z);
    MAHO.prevPos.copy(MAHO.pos);
    MAHO.cd = 0.9;
    mahoEnterPose("hover", 4);      // 必须切回悬浮姿态（否则一直定格在仰身的召唤姿势）
    // 召唤结束：第一招固定是「俯冲下砸」——让玩家立刻看懂"它会落地、落地时能打"
    MAHO.pendingForce = "dive";
    cb.phaseLock = 0;
    cb.pushEvent({ type: "mahoraga_spawned" });
    mahoEnsureHud();
    mahoHudShow(true);
  }
}

/* ==========================================================================
 * 五、空中机动 + 姿态
 * ========================================================================== */
function mahoPoseUpdate(dt, name, k) {
  const pose = MAHO_POSE[name] || MAHO_POSE.hover;
  const bones = MAHO.model.bones;
  const f = 1 - Math.exp(-(k || 6) * dt);
  for (const bn in pose) {
    const b = bones[bn];
    if (!b) continue;
    const p = pose[bn];
    b.rotation.x += (p[0] - b.rotation.x) * f;
    b.rotation.y += (p[1] - b.rotation.y) * f;
    b.rotation.z += (p[2] - b.rotation.z) * f;
  }
}
function mahoEnterPose(name, k) { MAHO.poseName = name; MAHO.poseK = k || 6; }

function mahoUpdateAir(cb, dt, t) {
  const diff = mahoDiff(cb);
  if (MAHO.pin) {
    // 截图模式：只保留朝向与呼吸，位置不动
    const pl0 = cb.fighters[SIDE.GOJO];
    const want0 = Math.atan2(pl0.p.x - MAHO.pos.x, pl0.p.z - MAHO.pos.z);
    MAHO.yaw += (want0 - MAHO.yaw) * mahoClamp(dt * 3, 0, 1);
    MAHO.model.bones.hips.position.y = 1.72 + Math.sin(t * 1.7) * 0.18;
    return;
  }
  const pl = cb.fighters[SIDE.GOJO];
  const R = MAHO_TUNE.ORBIT_R[diff];
  const spd = MAHO_TUNE.AIR_SPEED[diff];
  /**
   * 环绕航线：锚定在"玩家→宿傩"轴两侧 ±60° 的**前半场**。
   * 原来是无约束绕圈，后半个圆周会漂到相机背后 —— 相机在玩家背后 6~8m，
   * 目标贴到镜头前 6m、仰角 54°，半个周期必然完全出画（Lead P0 的实测就是这个现象）。
   * 限制在前半场后，它始终落在玩家前方 13~20m 的取景带里，也更好瞄。
   */
  const sk = cb.fighters[SIDE.SUKUNA];
  MAHO.orbitPhase += dt * (0.34 + (MAHO.softRage ? 0.12 : 0)) * (MAHO.orbitDir || 1);
  /**
   * 航线轴 = **相机视线在水平面的投影**。
   * 用"玩家→宿傩"轴做过一版，但机位是 3/4 侧挂（CAM_YAW_SIDE 约 24°），
   * 于是目标整段贴在画面左缘（实测 ndcX -1.06 ~ -0.71，横向出画）。
   * 直接取 (相机注视点 - 相机位置) 的水平分量做轴，目标就永远落在取景带里。
   * 摆动限制 ±0.62rad(±35°)：横向偏移 tan35°=0.70 < 水平半视场 tan36.7°=0.75。
   */
  /**
   * 航线：绕**宿傩**做小幅环巡（半径 ORBIT_LOCAL 4~5m）。
   * 试过"绕玩家 13.5m"两版：无约束绕圈会漂到相机背后（半圈出画）；
   * 锚到 player→Sukuna 轴又被 3/4 侧机位甩到画面左缘（实测 ndcX -1.24）。
   * 而相机在任何时候都框着宿傩，所以把环绕中心放到宿傩身上，
   * "它在画面里"就变成了结构性保证，同时离地 3.2m 仍在玩家近战射程外（胸口 5.6m > 1.4+3.2）。
   */
  const Rloc = MAHO_TUNE.ORBIT_LOCAL[mahoDiff(cb)];
  /**
   * 航线形状：绕宿傩的**侧向**往返（垂直于"玩家→宿傩"轴） + 少量前后摆动。
   * 为什么不是圆周：绕圈会有一半时间停在宿傩**背后**，玩家的 赫/开 会先炸在宿傩身上
   * （实测纯圆周时 16 次施放只命中 5 次，且 0 次触发闪避 —— 弹道根本没飞到）。
   * 侧向航线让弹道永远有净空，同时到相机的进深基本不变 → 可见性也稳。
   */
  MAHO.orbitPhase += 0;                       // 相位已在上面推进
  const ax = sk.p.x - pl.p.x, az = sk.p.z - pl.p.z;
  const al = Math.hypot(ax, az) || 1;
  const perpX = -az / al, perpZ = ax / al;
  const lat = Math.sin(MAHO.orbitPhase) * Rloc;
  const back = Math.cos(MAHO.orbitPhase * 0.5) * 1.4;
  MAHO.orbitCx = sk.p.x;
  MAHO.orbitCz = sk.p.z;
  if (MAHO.dodgeT <= 0) {
    const wantX = sk.p.x + perpX * lat + (ax / al) * back;
    const wantZ = sk.p.z + perpZ * lat + (az / al) * back;
    const wantY = MAHO.baseY + Math.sin(t * 0.7) * 0.55;
    const dx = wantX - MAHO.pos.x, dz = wantZ - MAHO.pos.z;
    const dy = (wantY - MAHO.pos.y) * 2.2;
    const len = Math.hypot(dx, dz) || 1e-4;
    const step = Math.min(len, spd * dt);   // 上限 8/10/12 m/s（契约）
    MAHO.pos.x += dx / len * step;
    MAHO.pos.z += dz / len * step;
    MAHO.pos.y += mahoClamp(dy * dt, -spd * dt, spd * dt);
  }
  const want = Math.atan2(pl.p.x - MAHO.pos.x, pl.p.z - MAHO.pos.z);
  let d = want - MAHO.yaw;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  MAHO.yaw += d * mahoClamp(dt * 2.6, 0, 1);
  // 悬浮呼吸：整体上下浮动 + 双腿摆动
  const bob = Math.sin(t * 1.7) * 0.18;
  MAHO.model.bones.hips.position.y = 1.86 + bob;
  MAHO.model.bones.core.rotation.z = Math.sin(t * 0.9) * 0.035;
  MAHO.model.bones.head.rotation.y = Math.sin(t * 0.55) * 0.14;
}

function mahoApplyTransform(cb, dt, t) {
  const root = MAHO.model.root;
  root.position.copy(MAHO.pos);
  root.rotation.y = MAHO.yaw;
  // 法轮旋转 + 受击震动
  const wheel = MAHO.model.wheel.group;
  wheel.rotation.z += dt * (MAHO.softRage ? 1.6 : 0.55) * (MAHO.state === "summon" ? 3 : 1);
  wheel.rotation.x = 0.16 + Math.sin(t * 0.8) * 0.06;   // 轻微前倾（金冠悬在头顶）
  if (MAHO.shakeT > 0) {
    MAHO.shakeT = Math.max(0, MAHO.shakeT - dt);
    const s = MAHO.shakeT * 0.6;
    wheel.position.x = Math.sin(t * 60) * s;
    wheel.position.y = 0.54 + Math.sin(t * 73) * s;
  } else if (wheel.position.x !== 0) {
    wheel.position.set(0, 0.54, -0.06);
  }
  // 尾巴轻摆：4 节骨链依次错相位，像立绘那样自然垂卷
  const tail = MAHO.model.tail;
  if (tail) {
    for (let i = 0; i < tail.length; i++) {
      tail[i].rotation.z = Math.sin(t * 1.2 + i * 0.7) * (0.05 + i * 0.025);
    }
  }
  // 地面投影：越靠近地面越实
  const sh = MAHO.model.shadow;
  const gy = MAHO.pos.y;
  sh.visible = gy < 22;
  const k = mahoClamp(1 - gy / 22, 0.05, 0.7);
  sh.material.opacity = 0.42 * (0.35 + k);
  sh.scale.setScalar(0.7 + k * 0.7);
  sh.position.set(0, 0.06 - MAHO.pos.y + 0.06, 0);
}

/* ==========================================================================
 * 六、四个技能
 * ========================================================================== */
function mahoMats() { return mahoMaterials(); }

/** 技能冷却：宿傩血越低越短（契约 2.6~4.0s），再乘难度整体系数 */
function mahoNextCd(cb) {
  const sk = cb.fighters[SIDE.SUKUNA];
  const ratio = mahoClamp(sk.hp / Math.max(1, sk.hpMax), 0, 1);
  const base = mahoLerp(MAHO_TUNE.CD_LOW, MAHO_TUNE.CD_HIGH, ratio);
  return base * MAHO_TUNE.CD_DIFF[mahoDiff(cb)];
}

function mahoBeginSkill(cb, id) {
  if (!MAHO.alive || MAHO.state === "summon" || MAHO.state === "broken") return false;
  if (MAHO.state === "dive" || MAHO.state === "down" || MAHO.state === "ascend") return false;
  const map = { slash: MAHO_TUNE.SLASH.windup, lightning: MAHO_TUNE.LIGHTNING.windup, dive: MAHO_TUNE.DIVE.windup, barrage: MAHO_TUNE.BOLT.windup };
  if (!(id in map)) return false;
  MAHO.skillId = id;
  MAHO.skillPhase = "windup";
  MAHO.skillT = 0;
  MAHO.state = "windup";
  MAHO.stats.casts[id] = (MAHO.stats.casts[id] || 0) + 1;
  MAHO.lastSkill = id;
  mahoEnterPose(id === "dive" ? "windup" : id === "slash" ? "windup" : "windup", 5);
  mahoEnsureHud();
  mahoSetWarn(MAHO_SKILL_NAME[id] + (id === "dive" ? " — 落地后是弱点窗口" : id === "lightning" ? " — 离开红圈" : id === "slash" ? " — 横向走位躲开" : " — 可格挡"));
  if (id === "dive") {
    // 俯冲预备：本体下压发光，锁死落点=玩家当前位置
    const pl = cb.fighters[SIDE.GOJO];
    const lead = pl.vel ? new Vector3(pl.vel.x, 0, pl.vel.z).multiplyScalar(0.25) : new Vector3();
    MAHO.tele = { x: pl.p.x + lead.x, z: pl.p.z + lead.z, r: MAHO_TUNE.DIVE.radius, kind: "dive", t: 0, dur: MAHO_TUNE.DIVE.windup };
    mahoDiveTarget = new Vector3(MAHO.tele.x, 0.05, MAHO.tele.z);
    const dm = mahoTelegraphMesh(MAHO_TUNE.DIVE.radius, C.CRIMSON, MAHO_TUNE.DIVE.windup + MAHO_TUNE.DIVE.travel);
    cb.fx.aura({ target: MAHO.model.root, color: C.CRIMSON, kind: "cursed", scale: 2, life: MAHO_TUNE.DIVE.windup + 0.1, intensity: 1 });
    cb.fx.groundRing({ pos: new Vector3(MAHO.tele.x, 0.07, MAHO.tele.z), maxRadius: MAHO_TUNE.DIVE.radius, color: C.CRIMSON, color2: C.BLOOD, life: MAHO_TUNE.DIVE.windup, thickness: 0.55 });
    cb.audio.play("whoosh", { volume: 0.8 });
  } else if (id === "lightning") {
    const pl = cb.fighters[SIDE.GOJO];
    MAHO.tele = { x: pl.p.x, z: pl.p.z, r: MAHO_TUNE.LIGHTNING.radius, kind: "lightning", t: 0, dur: MAHO_TUNE.LIGHTNING.windup };
    mahoTelegraphMesh(MAHO_TUNE.LIGHTNING.radius, C.SCARLET, MAHO_TUNE.LIGHTNING.windup);
    cb.fx.groundRing({ pos: new Vector3(pl.p.x, 0.07, pl.p.z), maxRadius: MAHO_TUNE.LIGHTNING.radius, color: C.SCARLET, color2: C.CRIMSON, life: MAHO_TUNE.LIGHTNING.windup, thickness: 0.5 });
    cb.audio.play("purple_charge", { volume: 0.5 });
  } else if (id === "slash") {
    cb.audio.play("blue_charge", { volume: 0.5 });
  } else if (id === "barrage") {
    cb.audio.play("dismantle", { volume: 0.5 });
  }
  cb.pushEvent({ type: "mahoraga_cast", skill: id });
  return true;
}
var mahoDiveTarget = new Vector3();

function mahoFireWave(cb) {
  const pl = cb.fighters[SIDE.GOJO];
  // 斩击波：从本体脚下沿地面直线飞行（宽 6m、速 22m/s）
  const dx = pl.p.x - MAHO.pos.x, dz = pl.p.z - MAHO.pos.z;
  const len = Math.hypot(dx, dz) || 1;
  const dirX = dx / len, dirZ = dz / len;
  const M = mahoMats();
  const mesh = new Mesh(new BoxGeometry(MAHO_TUNE.SLASH.halfW * 2, 1.5, 0.5), M.glow);
  mesh.position.set(MAHO.pos.x, 0.8, MAHO.pos.z);
  mesh.rotation.y = Math.atan2(dirX, dirZ);
  if (MAHO.scene) MAHO.scene.add(mesh);
  MAHO.wave = { mesh, dirX, dirZ, t: 0, done: false };
  cb.fx.shockwave({ pos: new Vector3(MAHO.pos.x, 0.7, MAHO.pos.z), maxRadius: 12, color: C.CRIMSON, color2: C.GOLD, life: 0.5, thickness: 0.7 });
  cb.fx.screen({ shake: 0.5, blur: 0.14, life: 0.3 });
  cb.audio.play("worldslash", { volume: 0.85 });
  MAHO.skillPhase = "cast";
  MAHO.skillT = 0;
  mahoEnterPose("slash", 9);
}

function mahoUpdateWave(cb, dt) {
  const w = MAHO.wave;
  if (!w) return;
  const S = MAHO_TUNE.SLASH;
  w.t += dt;
  const sp = S.speed;
  const nx = w.mesh.position.x + w.dirX * sp * dt;
  const nz = w.mesh.position.z + w.dirZ * sp * dt;
  w.mesh.position.set(nx, 0.8, nz);
  if (MAHO.scene && cb.grid && cb.grid.destroyAlongSegment) {
    cb.grid.destroyAlongSegment(new Vector3(nx - w.dirX * sp * dt, 0.8, nz - w.dirZ * sp * dt), new Vector3(nx, 0.8, nz), 3, cb.fx, cb.audio);
  }
  cb.fx.groundRing({ pos: new Vector3(nx, 0.05, nz), maxRadius: 5, color: C.CRIMSON, color2: C.GOLD, life: 0.18, thickness: 0.4 });
  cb.fx.sphere({ pos: w.mesh.position.clone(), radius: 1.6, color: C.CRIMSON, coreColor: C.GOLD, life: 0.08, charge: 0.8 });
  const pl = cb.fighters[SIDE.GOJO];
  if (!w.done && Math.abs(pl.p.y) < 2.4) {
    const d = Math.hypot(pl.p.x - nx, pl.p.z - nz);
    if (d < S.halfW + 0.8) {
      w.done = mahoHitPlayer(cb, S.dmg, { kb: S.kb, kind: "projectile", hitstop: 0.1, label: "退魔斩" });
      if (w.done) {
        cb.fx.shockwave({ pos: new Vector3(pl.p.x, 1, pl.p.z), maxRadius: 10, color: C.CRIMSON, color2: C.GOLD, life: 0.4 });
        cb.fx.debris({ pos: new Vector3(pl.p.x, 1, pl.p.z), count: 12, power: 12, color: C.CRIMSON });
      }
    }
  }
  if (w.t >= S.life || (w.done && w.t > 1.4)) mahoKillWave();
}
function mahoKillWave() {
  if (MAHO.wave && MAHO.wave.mesh && MAHO.wave.mesh.parent) MAHO.wave.mesh.parent.remove(MAHO.wave.mesh);
  MAHO.wave = null;
}

function mahoStrikeLightning(cb) {
  const T = MAHO_TUNE.LIGHTNING;
  const tele = MAHO.tele;
  if (!tele) return;
  const pl = cb.fighters[SIDE.GOJO];
  const from = new Vector3(tele.x, 42, tele.z);
  const to = new Vector3(tele.x, 0.2, tele.z);
  cb.fx.lightning({ from, to, color: C.SCARLET, color2: C.WHITE, life: 0.3, branches: 6 });
  cb.fx.lightning({ from: from.clone().setX(tele.x + 3), to, color: C.CRIMSON, color2: C.WHITE, life: 0.22, branches: 3 });
  cb.fx.shockwave({ pos: new Vector3(tele.x, 0.4, tele.z), maxRadius: 18, color: C.SCARLET, color2: C.CRIMSON, life: 0.55, thickness: 0.8 });
  cb.fx.debris({ pos: new Vector3(tele.x, 0.5, tele.z), count: 24, power: 18, color: C.CRIMSON });
  cb.fx.screen({ flash: 0.5, color: C.SCARLET, shake: 0.9, blur: 0.2, life: 0.3 });
  cb.audio.play("furnace", { volume: 0.85 });
  const d = Math.hypot(pl.p.x - tele.x, pl.p.z - tele.z);
  if (d < T.radius + 0.7 && Math.abs(pl.p.y) < 3) mahoHitPlayer(cb, T.dmg, { kb: T.kb, kind: "projectile", hitstop: 0.12, label: "落雷" });
  MAHO.tele = null;
  mahoDropTelegraph();
}

function mahoDiveImpact(cb) {
  const D = MAHO_TUNE.DIVE;
  const pl = cb.fighters[SIDE.GOJO];
  const p = new Vector3(MAHO.pos.x, 0.3, MAHO.pos.z);
  cb.fx.shockwave({ pos: p.clone(), maxRadius: 26, color: C.CRIMSON, color2: C.GOLD, life: 0.7, thickness: 1.1 });
  cb.fx.shockwave({ pos: p.clone().setY(0.1), maxRadius: 20, color: C.BLOOD, color2: C.SCARLET, life: 0.5, thickness: 0.6 });
  cb.fx.groundRing({ pos: p.clone().setY(0.08), maxRadius: 22, color: C.CRIMSON, color2: C.GOLD, life: 0.9, thickness: 1 });
  cb.fx.debris({ pos: p.clone(), count: 40, power: 24, color: C.CONCRETE2 });
  cb.fx.screen({ flash: 0.55, color: C.CRIMSON, shake: 1.25, blur: 0.3, life: 0.45 });
  cb.audio.play("land", { volume: 1 });
  cb.audio.play("hit_heavy", { volume: 0.9 });
  if (cb.grid && cb.grid.destroyAlongSegment) cb.grid.destroyAlongSegment(p.clone(), p.clone(), D.radius, cb.fx, cb.audio);
  const d = Math.hypot(pl.p.x - MAHO.pos.x, pl.p.z - MAHO.pos.z);
  if (d < D.radius + 0.7 && Math.abs(pl.p.y) < 3) mahoHitPlayer(cb, D.dmg, { kb: D.kb, kind: "melee", hitstop: 0.16, label: "俯冲下砸" });
  MAHO.tele = null;
  mahoDropTelegraph();
  // 弱点窗口
  MAHO.state = "down";
  MAHO.t = 0;
  MAHO.weakT = MAHO_TUNE.WEAK_T;
  mahoEnterPose("slam", 10);
  cb.banner("弱点暴露 —— 近战可击！", 1.6);
  cb.fx.callout({ text: "弱点暴露", sub: "1.6s", pos: new Vector3(MAHO.pos.x, 3.2, MAHO.pos.z), color: C.GOLD, color2: C.CRIMSON, life: 1.5, size: 1.3, rise: 0.8 });
  cb.pushEvent({ type: "mahoraga_weak", t: MAHO_TUNE.WEAK_T });
  mahoEnsureHud();
}
function mahoAscend(cb) {
  MAHO.state = "ascend";
  MAHO.t = 0;
  MAHO.weakT = 0;
  mahoEnterPose("hover", 4);
  cb.fx.groundRing({ pos: new Vector3(MAHO.pos.x, 0.06, MAHO.pos.z), maxRadius: 14, color: C.CRIMSON, color2: C.GOLD, life: 0.5 });
  cb.fx.debris({ pos: new Vector3(MAHO.pos.x, 0.4, MAHO.pos.z), count: 16, power: 12, color: C.CONCRETE2 });
  cb.audio.play("whoosh", { volume: 0.7 });
}

/** 预警圈（自建网格，跟着玩家/锁死都能一眼看出来） */
function mahoTelegraphMesh(radius, color, life) {
  if (MAHO.teleMesh) mahoDropTelegraph();
  const M = mahoMats();
  const g = new Group();
  const ring = new Mesh(new RingGeometry(radius - 0.22, radius, 40), new MeshBasicMaterial({ color, transparent: true, opacity: 0.85, depthWrite: false, side: DoubleSide }));
  ring.rotation.x = -Math.PI / 2;
  g.add(ring);
  const disc = new Mesh(new CircleGeometry(radius - 0.22, 32), new MeshBasicMaterial({ color, transparent: true, opacity: 0.16, depthWrite: false, side: DoubleSide }));
  disc.rotation.x = -Math.PI / 2;
  g.add(disc);
  g.position.y = 0.09;
  g.userData.t = 0;
  g.userData.life = life || 2;
  if (MAHO.scene) MAHO.scene.add(g);
  MAHO.teleMesh = g;
  return g;
}
function mahoDropTelegraph() {
  const g = MAHO.teleMesh;
  if (!g) return;
  if (g.parent) g.parent.remove(g);
  MAHO.teleMesh = null;
}

/** 俯冲落点：以 0.8s 前摇开始时的玩家位置为准（可走位躲开） */
function mahoDiveTargetSet(cb) {
  const pl = cb.fighters[SIDE.GOJO];
  const lead = pl.vel ? new Vector3(pl.vel.x, 0, pl.vel.z).multiplyScalar(0.25) : new Vector3();
  const x = MAHO.tele ? MAHO.tele.x : pl.p.x + lead.x;
  const z = MAHO.tele ? MAHO.tele.z : pl.p.z + lead.z;
  mahoDiveTarget.set(x, 0.05, z);
  MAHO.diveFrom = MAHO.pos.clone();
  mahoSyncTelegraph();
}

/** 把预警圈同步到当前落点/标记点 */
function mahoSyncTelegraph() {
  const g = MAHO.teleMesh;
  if (!g || !MAHO.tele) return;
  g.position.set(MAHO.tele.x, 0.09, MAHO.tele.z);
  const k = MAHO.tele.kind === "dive" ? MAHO.tele.dur + MAHO_TUNE.DIVE.travel : MAHO.tele.dur;
  const u = mahoClamp((MAHO.tele.t || 0) / Math.max(0.01, k), 0, 1);
  g.scale.setScalar(1 + (1 - u) * 0.06);
  const pulse = 0.55 + 0.45 * Math.abs(Math.sin(u * Math.PI * 3));
  g.children[0].material.opacity = 0.45 + 0.5 * pulse;
}

function mahoFireBolt(cb, idx) {
  const B = MAHO_TUNE.BOLT;
  const M = mahoMats();
  const mesh = new Mesh(new SphereGeometry(0.34, 10, 8), M.glow);
  const hand = MAHO.model.handR.getWorldPosition(new Vector3());
  mesh.position.copy(hand);
  if (MAHO.scene) MAHO.scene.add(mesh);
  const pl = cb.fighters[SIDE.GOJO];
  const dir = new Vector3(pl.p.x - hand.x, pl.p.y + 1.1 - hand.y, pl.p.z - hand.z).normalize();
  MAHO.bolts.push({ mesh, dir, t: 0, hit: false, idx });
  cb.fx.sphere({ pos: hand.clone(), radius: 0.8, color: C.CRIMSON, coreColor: C.GOLD, life: 0.12, charge: 0.7 });
  cb.audio.play("dismantle", { volume: 0.6 });
}
function mahoUpdateBolts(cb, dt) {
  const B = MAHO_TUNE.BOLT;
  const pl = cb.fighters[SIDE.GOJO];
  for (let i = MAHO.bolts.length - 1; i >= 0; i--) {
    const b = MAHO.bolts[i];
    b.t += dt;
    // 追踪：朝玩家胸口缓慢转向（可格挡/可躲）
    const want = new Vector3(pl.p.x - b.mesh.position.x, pl.p.y + 1.1 - b.mesh.position.y, pl.p.z - b.mesh.position.z);
    const wl = want.length() || 1;
    want.multiplyScalar(1 / wl);
    const maxA = B.turn * dt;
    const dot = mahoClamp(b.dir.dot(want), -1, 1);
    const ang = Math.acos(dot);
    if (ang > 1e-4) {
      const k = Math.min(1, maxA / ang);
      b.dir.lerp(want, k).normalize();
    }
    const prev = b.mesh.position.clone();
    b.mesh.position.addScaledVector(b.dir, B.speed * dt);
    cb.fx.sphere({ pos: b.mesh.position.clone(), radius: 0.7, color: C.CRIMSON, coreColor: C.GOLD, life: 0.07, charge: 0.6 });
    // 扫掠判定：弹速 26m/s（一帧 0.43m），单点半径判定在斜掠时会漏
    const cyl = mahoPointSegDistSq(pl.p.x, pl.p.y + 1.1, pl.p.z,
      prev.x, prev.y, prev.z, b.mesh.position.x, b.mesh.position.y, b.mesh.position.z);
    const d = Math.sqrt(cyl);
    if (!b.hit && d < B.hitR + 0.7) {
      // 无下限（invT）吃掉的弹要被消耗掉并计数，否则它会继续飞、下一次判定又"命中"
      if (pl.invT > 0 || pl.forcedInv) {
        MAHO.stats.boltsBlocked = (MAHO.stats.boltsBlocked || 0) + 1;
        cb.fx.hitSpark({ pos: b.mesh.position.clone(), color: C.CYAN, color2: C.WHITE, count: 8, size: 0.4, life: 0.22, speed: 8 });
        mahoKillBolt(i);
        continue;
      }
      b.hit = mahoHitPlayer(cb, B.dmg, { kb: B.kb, kind: "projectile", hitstop: 0.08, label: "咒力弹幕" });
      if (b.hit) {
        cb.fx.hitSpark({ pos: b.mesh.position.clone(), color: C.CRIMSON, color2: C.GOLD, count: 10, size: 0.5, life: 0.25, speed: 9 });
        mahoKillBolt(i);
        continue;
      }
    }
    if (b.t > B.life || b.mesh.position.y < 0.2) mahoKillBolt(i);
  }
}
function mahoKillBolt(i) {
  const b = MAHO.bolts[i];
  if (b && b.mesh && b.mesh.parent) b.mesh.parent.remove(b.mesh);
  MAHO.bolts.splice(i, 1);
}
function mahoKillAllBolts() {
  for (let i = MAHO.bolts.length - 1; i >= 0; i--) mahoKillBolt(i);
}

/** 魔虚罗唯一伤害出口：全部走 resolver，沿用无下限/格挡/受击反馈 */
function mahoHitPlayer(cb, raw, o) {
  const pl = cb.fighters[SIDE.GOJO];
  const sk = cb.fighters[SIDE.SUKUNA];
  if (!pl || pl.dead || cb.resultLocked) return false;
  const dmg = raw * MAHO_TUNE.SKILL_DMG_SCALE * (MAHO.softRage ? MAHO_TUNE.SOFT_RAGE : 1);
  const dir = new Vector3(pl.p.x - MAHO.pos.x, 0, pl.p.z - MAHO.pos.z);
  const landed = cb.resolver.apply({
    from: sk,
    to: pl,
    skill: SKILL.MAHORAGA,
    dmg,
    dir,
    kb: o && o.kb || 0,
    kind: (o && o.kind) || "projectile",
    hitstop: o && o.hitstop || 0.08,
    mahoSkill: true
  });
  if (landed) {
    MAHO.stats.playerHits++;
    MAHO.lastHitInfo = { label: (o && o.label) || "", raw, effective: +dmg.toFixed(1), t: +cb.time.toFixed(2) };
    cb.pushEvent({ type: "mahoraga_hit_player", label: (o && o.label) || "", dmg: Math.round(dmg) });
  }
  return landed;
}

function mahoUpdateSkill(cb, dt) {
  if (MAHO.state === "windup") {
    MAHO.skillT += dt;
    const id = MAHO.skillId;
    const dur = id === "slash" ? MAHO_TUNE.SLASH.windup : id === "lightning" ? MAHO_TUNE.LIGHTNING.windup : id === "dive" ? MAHO_TUNE.DIVE.windup : MAHO_TUNE.BOLT.windup;
    mahoPoseUpdate(dt, id === "barrage" ? "windup" : id === "lightning" ? "windup" : "windup", 6);
    // 前摇可见：蓄力光球 + 法轮加速
    const hand = MAHO.model.handR.getWorldPosition(new Vector3());
    cb.fx.sphere({ pos: hand, radius: 1.1 + Math.sin(MAHO.skillT * 22) * 0.25, color: C.CRIMSON, coreColor: C.GOLD, life: 0.07, charge: 0.85, distort: 0.5 });
    if (id === "dive") {
      const u = mahoClamp(MAHO.skillT / dur, 0, 1);
      MAHO.pos.y = MAHO.baseY - u * 1.8;                    // 下压蓄力
      if (MAHO.tele) {
        MAHO.tele.t = MAHO.skillT;
        // 前 0.55s 红圈跟着玩家（明确"它在瞄你"），最后 0.25s 锁死
        const pl = cb.fighters[SIDE.GOJO];
        if (MAHO.skillT < Math.max(0, dur - 0.25)) { MAHO.tele.x = pl.p.x; MAHO.tele.z = pl.p.z; }
      }
    } else if (id === "lightning" && MAHO.tele) {
      // 落雷：落点在施法瞬间锁死，整段 0.9s 都是给玩家的走位窗口
      MAHO.tele.t = MAHO.skillT;
    }
    if (MAHO.skillT >= dur) {
      MAHO.skillT = 0;
      // 前摇结束：三招在"cast"里做收招（wave/落雷/弹幕），俯冲直接切到 dive
      if (id === "slash") { MAHO.state = "cast"; MAHO.recover = 0.55; mahoFireWave(cb); }
      else if (id === "lightning") { MAHO.state = "cast"; MAHO.recover = 0.7; mahoStrikeLightning(cb); }
      else if (id === "dive") { MAHO.state = "dive"; MAHO.diveTargetSet(cb); MAHO.diveFrom = MAHO.pos.clone(); MAHO.skillPhase = "dive"; }
      else if (id === "barrage") { MAHO.state = "cast"; MAHO.recover = 0; MAHO.boltN = 0; MAHO.boltT = 0; MAHO.skillPhase = "cast"; }
      mahoEnterPose(id === "slash" ? "slash" : id === "dive" ? "slam" : "windup", 9);
    }
    return;
  }
  if (MAHO.state === "cast") {
    MAHO.skillT += dt;
    mahoPoseUpdate(dt, MAHO.skillId === "slash" ? "slash" : "windup", 7);
    if (MAHO.skillId === "barrage") {
      const B = MAHO_TUNE.BOLT;
      MAHO.boltT -= dt;
      if (MAHO.boltN < B.count && MAHO.boltT <= 0) {
        mahoFireBolt(cb, MAHO.boltN++);
        MAHO.boltT = B.interval;
      }
      if (MAHO.boltN >= B.count && MAHO.boltT <= -0.25) mahoEndSkill(cb);
    } else if (MAHO.skillT >= (MAHO.recover || 0.55)) {
      // 斩击波/落雷的余波继续跑（mahoUpdateWave 独立于状态机），本体先回空中
      mahoEndSkill(cb);
    }
    return;
  }
  if (MAHO.state === "dive") {
    const D = MAHO_TUNE.DIVE;
    MAHO.skillT += dt;
    const u = mahoClamp(MAHO.skillT / D.travel, 0, 1);
    const from = MAHO.diveFrom || MAHO.pos;
    const e = u * u;
    MAHO.pos.x = mahoLerp(from.x, mahoDiveTarget.x, e);
    MAHO.pos.z = mahoLerp(from.z, mahoDiveTarget.z, e);
    MAHO.pos.y = mahoLerp(from.y, 0.05, e);
    mahoPoseUpdate(dt, "slam", 6);
    cb.fx.sphere({ pos: MAHO.pos.clone(), radius: 2.6, color: C.CRIMSON, coreColor: C.GOLD, life: 0.09, charge: 0.9, distort: 0.7 });
    if (cb.grid && cb.grid.destroyAlongSegment && u > 0.05) cb.grid.destroyAlongSegment(from.clone().setY(MAHO.pos.y + 3), MAHO.pos.clone().setY(MAHO.pos.y + 3), 3, cb.fx, cb.audio);
    if (u >= 1) mahoDiveImpact(cb);
    return;
  }
  if (MAHO.state === "down") {
    MAHO.t += dt;
    MAHO.weakT = Math.max(0, MAHO_TUNE.WEAK_T - MAHO.t);
    mahoPoseUpdate(dt, "slam", 5);
    // 弱点窗口的地面反馈：一圈圈金色尘环 + 喘息姿态
    if (Math.floor(MAHO.t * 6) !== MAHO._dustN) {
      MAHO._dustN = Math.floor(MAHO.t * 6);
      cb.fx.debris({ pos: new Vector3(MAHO.pos.x + (Math.random() - 0.5) * 4, 0.3, MAHO.pos.z + (Math.random() - 0.5) * 4), count: 4, power: 6, color: C.CONCRETE2 });
    }
    if (MAHO.t >= MAHO_TUNE.WEAK_T) mahoAscend(cb);
    return;
  }
  if (MAHO.state === "ascend") {
    MAHO.t += dt;
    const u = mahoClamp(MAHO.t / MAHO_TUNE.DIVE.ascend, 0, 1);
    MAHO.pos.y = mahoLerp(0.05, MAHO.baseY, u * u * (3 - 2 * u));
    mahoPoseUpdate(dt, "hover", 4);
    cb.fx.sphere({ pos: MAHO.pos.clone().setY(MAHO.pos.y + 1), radius: 2, color: C.CRIMSON, coreColor: C.GOLD, life: 0.08, charge: 0.6 });
    if (u >= 1) {
      MAHO.state = "air";
      MAHO.t = 0;
      MAHO.cd = mahoNextCd(cb);
      MAHO.skillId = null;
      mahoSetWarn("");
      mahoEnterPose("hover", 4);
    }
    return;
  }
}

function mahoEndSkill(cb) {
  MAHO.state = "air";
  MAHO.skillId = null;
  MAHO.skillPhase = "";
  MAHO.t = 0;
  MAHO.cd = mahoNextCd(cb);
  mahoSetWarn("");
  mahoEnterPose("hover", 4);
}

/* ==========================================================================
 * 七、适应系统
 * ========================================================================== */
/**
 * 适应倍率。
 * @param {boolean} includeThis 是否把"本次命中"算进去
 *   契约：同一招命中 2 次 → ×0.45；4 次 → 免疫。
 *   所以第 1 次满伤、第 2/3 次 ×0.45、第 4 次起 0。
 */
function mahoAdaptMul(skill, includeThis) {
  const n = (MAHO.adapt[skill] || 0) + (includeThis ? 1 : 0);
  if (n >= MAHO_TUNE.ADAPT_IMMUNE) return 0;
  if (n >= 2) return MAHO_TUNE.ADAPT_MUL;
  return 1;
}
function mahoLightWheel() {
  const segs = MAHO.model ? MAHO.model.wheel.segs : null;
  const M = mahoMats();
  if (segs) {
    for (let i = 0; i < segs.length; i++) {
      const on = i < MAHO.wheelLit;
      segs[i].material = on ? M.wheelOn : M.wheelOff;
    }
    if (MAHO.model.wheel.hub) MAHO.model.wheel.hub.material = MAHO.wheelLit >= MAHO_TUNE.WHEEL_MAX ? M.glow : M.gold;
  }
}
/** 命中一次术式后的适应推进：2 次 → ×0.45；4 次 → 免疫（各点亮一格法轮） */
function mahoAdaptStep(cb, skill) {
  const n = (MAHO.adapt[skill] || 0) + 1;
  MAHO.adapt[skill] = n;
  const name = SKILL_DATA[skill] ? SKILL_DATA[skill].name : String(skill);
  const center = new Vector3(MAHO.pos.x, MAHO.pos.y + 2.6, MAHO.pos.z);
  if (n === 2) {
    MAHO.wheelLit = Math.min(MAHO_TUNE.WHEEL_MAX, MAHO.wheelLit + 1);
    MAHO.stats.adaptEvents++;
    mahoLightWheel();
    MAHO.shakeT = 0.35;
    cb.fx.callout({ text: "适应", sub: name + " ×0.45", pos: center, color: C.GOLD, color2: C.CRIMSON, life: 0.9, size: 1.1, rise: 1 });
    cb.banner("魔虚罗 适应了「" + name + "」—— 该术式伤害下降", 1.8);
    cb.audio.play("charge_ready", { volume: 0.6 });
  } else if (n === MAHO_TUNE.ADAPT_IMMUNE) {
    MAHO.wheelLit = Math.min(MAHO_TUNE.WHEEL_MAX, MAHO.wheelLit + 1);
    MAHO.stats.adaptEvents++;
    MAHO.stats.immune++;
    mahoLightWheel();
    MAHO.shakeT = 0.5;
    cb.fx.callout({ text: "适应完成", sub: name + " 免疫", pos: center, color: C.CRIMSON, color2: C.GOLD, life: 1.4, size: 1.5, rise: 1.2, shake: 0.4 });
    cb.banner("「" + name + "」已完全适应 —— 该术式对它无效", 2.2);
    cb.audio.play("ko", { volume: 0.6 });
  }
  MAHO.adaptMul[skill] = mahoAdaptMul(skill);
  if (MAHO.wheelLit >= MAHO_TUNE.WHEEL_MAX && !MAHO.softRage) {
    MAHO.softRage = true;
    mahoLightWheel();
    cb.banner("八握剑异戒神将 法轮全亮 —— 适应完成（软狂暴）", 2.6);
    cb.fx.callout({ text: "适应完成", sub: "八轮全开", pos: center.clone().setY(center.y + 0.6), color: C.SCARLET, color2: C.WHITE, life: 2.2, size: 2, rise: 1.4 });
    cb.fx.groundRing({ pos: new Vector3(MAHO.pos.x, 0.06, MAHO.pos.z), maxRadius: 20, color: C.CRIMSON, color2: C.GOLD, life: 1.2, thickness: 1 });
    cb.fx.screen({ flash: 0.4, color: C.CRIMSON, shake: 0.8, chroma: 0.5, life: 0.5 });
    cb.audio.play("domain_shrine", { volume: 0.7 });
    cb.pushEvent({ type: "mahoraga_rage" });
  }
}

/* ==========================================================================
 * 八、被打 / 击破
 * ========================================================================== */
function mahoApplyHit(cb, meta, raw, opts) {
  const skill = meta && meta.skill;
  const melee = mahoIsMeleeSkill(skill);
  let mul = 1;
  if (melee) {
    // 近战不走适应计数（弱点打击），只在落地窗口里有效，并有弱点加成
    mul = MAHO_TUNE.DAMAGE_IN_SCALE * ((opts && opts.weak) ? MAHO_TUNE.WEAK_MELEE_MUL : 1);
  } else {
    mul = MAHO_TUNE.DAMAGE_IN_SCALE * mahoAdaptMul(skill, true);
  }
  const dmg = Math.max(0, raw * mul);
  const center = mahoBodyCenter();
  MAHO.hitsTaken++;
  MAHO.hp = Math.max(0, MAHO.hp - dmg);
  MAHO.flashT = 0.18;
  MAHO.shakeT = 0.3;
  mahoEnterPose("damage", 12);
  MAHO.poseHold = 0.28;
  const gold = !melee;
  cb.fx.hitSpark({ pos: center.clone().setY(center.y + 0.4 * Math.random()), color: gold ? C.GOLD : C.CRIMSON, color2: C.WHITE, count: dmg > 60 ? 16 : 9, size: dmg > 60 ? 0.7 : 0.45, life: 0.3, speed: 9 });
  cb.fx.damageNumber({ pos: center.clone().setY(center.y + 0.8), amount: Math.round(dmg), color: gold ? C.GOLD : C.CRIMSON, crit: dmg > 80, life: 1 });
  cb.audio.play(dmg > 60 ? "hit_heavy" : "hit_light", { volume: 0.8 });
  cb.pushEvent({ type: "mahoraga_damage", skill: skill || "?", dmg: Math.round(dmg), hp: Math.round(MAHO.hp) });
  // 适应只在术式上推进
  if (!melee && mahoIsSpell(skill)) mahoAdaptStep(cb, skill);
  // 只有"本来有伤害但被完全适应"才提示免疫（苍本身伤害 0，不该刷屏）
  if (!melee && raw > 0 && mahoAdaptMul(skill, true) === 0) cb.banner("免疫 —— 该术式已被适应", 1.4);
  if (MAHO.hp <= 0) mahoBreak(cb);
  mahoHudDirty();
  return dmg;
}

function mahoBreak(cb) {
  if (MAHO.state === "broken") return;
  MAHO.state = "broken";
  MAHO.alive = false;
  MAHO.protected = false;
  MAHO.trueSukuna = true;
  MAHO.finished = true;
  MAHO.stats.broken++;
  MAHO.t = 0;
  mahoKillWave();
  mahoKillAllBolts();
  mahoTeleCleanup(cb);
  const root = MAHO.model.root;
  const center = new Vector3(MAHO.pos.x, MAHO.pos.y + 2.2, MAHO.pos.z);
  /* 破碎演出：定格 → 白闪 → 碎片四散 → 本体消失 → 宿傩「真·宿傩」 */
  cb.phaseLock = MAHO_TUNE.BREAK_LOCK;
  cb.fx.screen({ flash: 0.9, color: C.WHITE, shake: 1.2, blur: 0.34, chroma: 0.8, freeze: 0.5, life: 0.8 });
  cb.fx.shockwave({ pos: center.clone(), maxRadius: 34, color: C.CRIMSON, color2: C.GOLD, life: 0.8, thickness: 1.2 });
  cb.fx.debris({ pos: center.clone(), count: 60, power: 26, color: C.CONCRETE2 });
  cb.fx.debris({ pos: center.clone(), count: 40, power: 22, color: C.CRIMSON });
  cb.fx.hitSpark({ pos: center.clone(), color: C.GOLD, color2: C.WHITE, count: 40, size: 1, life: 0.5, speed: 16 });
  cb.fx.lightning({ from: center.clone().setY(center.y + 20), to: center.clone(), color: C.CRIMSON, color2: C.WHITE, life: 0.35, branches: 6 });
  cb.fx.screen({ desaturate: 0.2, vignette: 0.4, shake: 0.8, life: 1.6 });
  cb.audio.play("ko", { volume: 1 });
  cb.audio.play("purple200_fire", { volume: 0.7 });
  cb.banner("魔虚罗 —— 击破！", 3);
  cb.fx.callout({ text: "击破", sub: "MAHORAGA DOWN", pos: center.clone(), color: C.GOLD, color2: C.CRIMSON, life: 2.4, size: 2.2, rise: 1.4 });
  cb.pushEvent({ type: "mahoraga_broken" });
  // 碎片：把零件的旋转随机化，做一段"崩解"动画（1.8s 内做，随后隐藏）
  MAHO.breakParts = MAHO.model.parts.map((m) => ({ m, vx: (Math.random() - 0.5) * 6, vy: 2 + Math.random() * 6, vz: (Math.random() - 0.5) * 6, spin: (Math.random() - 0.5) * 8 }));
  MAHO.breakT = 0;
  mahoEnterPose("damage", 8);
  mahoSetWarn("");
  mahoHudDirty();
  // 宿傩「真·宿傩」：解禁视觉
  const sk = cb.fighters[SIDE.SUKUNA];
  if (sk && sk.ctrl) {
    sk.ctrl.setAura(true);
  }
  setTimeout(() => { if (MAHO.state === "broken") mahoBreakFinish(cb); }, 1800);
}

function mahoBreakUpdate(cb, dt) {
  MAHO.t += dt;
  MAHO.breakT = (MAHO.breakT || 0) + dt;
  const parts = MAHO.breakParts || [];
  for (const p of parts) {
    p.vy -= 16 * dt;
    p.m.position.x += p.vx * dt;
    p.m.position.y += p.vy * dt;
    p.m.position.z += p.vz * dt;
    p.m.rotation.x += p.spin * dt;
    p.m.rotation.z += p.spin * 0.7 * dt;
  }
  if (MAHO.breakT > 1.2 && !MAHO.breakGone) {
    MAHO.breakGone = true;
    mahoBreakFinish(cb);
  }
}

function mahoBreakFinish(cb) {
  const root = MAHO.model.root;
  root.visible = false;
  // 零件位置复位（下次召唤要用同一个模型）
  for (const p of MAHO.breakParts || []) {
    const o = p.m.userData.op || { x: 0, y: 0, z: 0 };
    p.m.position.set(o.x, o.y, o.z);
    p.m.rotation.set(0, 0, 0);
  }
  MAHO.breakParts = null;
  mahoHudShow(false);
  if (MAHO.sigil) { MAHO.sigil.visible = false; }
  // 真·宿傩状态的持续视觉
  if (cb.fighters[SIDE.SUKUNA] && cb.fighters[SIDE.SUKUNA].ctrl) cb.fighters[SIDE.SUKUNA].ctrl.setAura(true);
}

/* ==========================================================================
 * 九、HUD（模块自建 DOM，不动 hud.js）
 * ========================================================================== */
function mahoEnsureHud() {
  if (MAHO.hud.root || typeof document === "undefined") return;
  const root = document.createElement("div");
  root.id = "maho-hud";
  root.style.cssText = [
    "position:fixed", "right:18px", "top:78px", "width:min(33vw,430px)", "z-index:21",
    "pointer-events:none", "font-family:system-ui,-apple-system,'Noto Sans SC',sans-serif",
    "text-align:right", "opacity:0", "transition:opacity .35s", "display:none"
  ].join(";");
  root.innerHTML =
    '<div style="display:flex;align-items:baseline;justify-content:flex-end;gap:8px;text-shadow:0 2px 8px #000">' +
    '<span style="font-size:11px;letter-spacing:.18em;color:rgba(255,216,115,.9)">八握剑异戒神将</span>' +
    '<span style="font-size:16px;font-weight:600;letter-spacing:.14em;color:#fff">魔虚罗</span>' +
    '<span data-maho="adapt" style="font-size:11px;color:#ffd873;border:1px solid rgba(255,216,115,.4);padding:0 4px;border-radius:2px;background:rgba(6,6,12,.5)">适应 0/8</span>' +
    "</div>" +
    '<div style="position:relative;height:11px;margin-top:4px;background:linear-gradient(180deg,rgba(255,255,255,.08),rgba(0,0,0,.65));border:1px solid rgba(255,255,255,.3);transform:skewX(-20deg);overflow:hidden;box-shadow:0 2px 10px rgba(0,0,0,.6)">' +
    '<i data-maho="bar" style="display:block;height:100%;width:100%;transform-origin:right center;background:linear-gradient(180deg,#ffe9c9 0%,#ff5a3c 40%,#7a0c18 100%);box-shadow:0 0 14px rgba(255,63,63,.85)"></i>' +
    "</div>" +
    '<div data-maho="num" style="font-size:11px;color:rgba(232,230,223,.85);margin-top:2px;text-shadow:0 1px 3px #000">900 / 900</div>' +
    '<div data-maho="state" style="font-size:11px;letter-spacing:.14em;color:rgba(255,120,90,.95);margin-top:2px;text-shadow:0 1px 3px #000">悬空 —— 近战够不到，锁定后用术式</div>' +
    '<div data-maho="warn" style="font-size:13px;font-weight:600;letter-spacing:.1em;color:#ffd873;margin-top:4px;text-shadow:0 2px 8px #000,0 0 14px rgba(255,216,115,.6)"></div>' +
    '<div data-maho="weak" style="display:none;font-size:15px;font-weight:700;letter-spacing:.16em;color:#0b0d14;background:#ffd873;padding:2px 8px;margin-top:6px;transform:skewX(-12deg);box-shadow:0 0 22px rgba(255,216,115,.95)">弱点暴露 · 近战可击</div>' +
    '<div data-maho="mark" style="position:fixed;left:50%;top:20%;display:none;transform:translate(-50%,-50%);z-index:22;pointer-events:none;color:#ffd873;font-size:12px;font-weight:700;letter-spacing:.12em;white-space:nowrap;text-shadow:0 0 10px #000,0 0 8px #ff5a3c">' +
    '<span data-maho="arrow" style="display:inline-block;margin-right:4px;font-size:15px">▲</span><span data-maho="marktext">魔虚罗</span></div>' +
    '<div data-maho="reticle" style="position:fixed;display:none;width:52px;height:52px;margin:-26px 0 0 -26px;z-index:22;pointer-events:none">' +
    '<i style="position:absolute;inset:0;border:1px solid rgba(255,216,115,.85);border-radius:50%;box-shadow:0 0 12px rgba(255,216,115,.55),inset 0 0 10px rgba(255,90,60,.35)"></i>' +
    '<i style="position:absolute;left:50%;top:-9px;width:1px;height:8px;background:#ffd873"></i>' +
    '<i style="position:absolute;left:50%;bottom:-9px;width:1px;height:8px;background:#ffd873"></i>' +
    '<i style="position:absolute;top:50%;left:-9px;height:1px;width:8px;background:#ffd873"></i>' +
    '<i style="position:absolute;top:50%;right:-9px;height:1px;width:8px;background:#ffd873"></i>' +
    '<i style="position:absolute;left:50%;top:50%;width:5px;height:5px;margin:-2.5px 0 0 -2.5px;background:#ff5a3c;transform:rotate(45deg)"></i>' +
    "</div>";
  document.body.appendChild(root);
  MAHO.hud.root = root;
  MAHO.hud.bar = root.querySelector('[data-maho="bar"]');
  MAHO.hud.num = root.querySelector('[data-maho="num"]');
  MAHO.hud.adapt = root.querySelector('[data-maho="adapt"]');
  MAHO.hud.warn = root.querySelector('[data-maho="warn"]');
  MAHO.hud.weak = root.querySelector('[data-maho="weak"]');
  MAHO.hud.state = root.querySelector('[data-maho="state"]');
  MAHO.hud.mark = root.querySelector('[data-maho="mark"]');
  MAHO.hud.arrow = root.querySelector('[data-maho="arrow"]');
  MAHO.hud.markText = root.querySelector('[data-maho="marktext"]');
  MAHO.hud.reticle = root.querySelector('[data-maho="reticle"]');
}
function mahoHudShow(on) {
  const h = MAHO.hud;
  if (!h.root) return;
  h.root.style.display = on ? "block" : "none";
  h.root.style.opacity = on ? "1" : "0";
  h.last = "";
}
function mahoSetWarn(text) {
  MAHO.warnText = text || "";
  mahoHudDirty();
}
function mahoHudDirty() { MAHO.hudDirty = true; }
function mahoUpdateHud() {
  const h = MAHO.hud;
  if (!h.root || h.root.style.display === "none") return;
  if (!MAHO.hudDirty && MAHO.hudFrame === (MAHO.cb ? MAHO.cb.frame : 0)) return;
  MAHO.hudFrame = MAHO.cb ? MAHO.cb.frame : 0;
  MAHO.hudDirty = false;
  const ratio = MAHO.hpMax > 0 ? mahoClamp(MAHO.hp / MAHO.hpMax, 0, 1) : 0;
  h.bar.style.transform = "scaleX(" + ratio.toFixed(4) + ")";
  h.num.textContent = Math.round(MAHO.hp) + " / " + MAHO.hpMax + (MAHO.softRage ? "  · 软狂暴" : "");
  if (h.adapt) h.adapt.textContent = "适应 " + MAHO.wheelLit + "/" + MAHO_TUNE.WHEEL_MAX;
  /**
   * 落地窗口的状态字要说清"现在普攻打的是谁" ——
   * 用户报过「想打魔虚罗打不了」，所以这里必须自报家门：
   * 瞄准已生效 → 「普攻已锁定魔虚罗」；还没进射程 → 「走近它再普攻」。
   */
  const aimingHud = MAHO.weakT > 0 && MAHO.state === "down" && mahoAimActive();
  const st = MAHO.state === "down"
    ? (aimingHud ? "落地 —— 弱点窗口 · 普攻已锁定魔虚罗" : "落地 —— 弱点窗口 · 走近它再普攻")
    : MAHO.state === "summon" ? "召唤中" : MAHO.state === "broken" ? "已击破" : "悬空 —— 近战够不到，锁定后用术式";
  if (h.state.textContent !== st) h.state.textContent = st;
  const w = MAHO.warnText || "";
  if (h.warn.textContent !== w) h.warn.textContent = w;
  const weak = MAHO.weakT > 0 && MAHO.state === "down";
  h.weak.style.display = weak ? "inline-block" : "none";
  if (weak) {
    h.weak.textContent = (aimingHud ? "弱点暴露 · 普攻正在打它 " : "弱点暴露 · 走近它普攻 ") + MAHO.weakT.toFixed(1) + "s";
    h.weak.style.background = aimingHud ? "#7ff0ff" : "#ffd873";
  }
  const col = MAHO.softRage ? "#ff2b1e" : MAHO.state === "down" ? "#ffd873" : "#ff5a3c";
  h.num.style.color = col;
}

/**
 * 屏幕外指示：魔虚罗在 15m 高空、机位又在玩家背后，玩家基本看不到自己该打谁。
 * 把它投影到屏幕坐标，出画（或在画面上方）时在 HUD 上打一个 ▲ 标记 + 距离。
 * 相机从 window.__SS.activeCamera 取（不依赖作用域里的变量名）。
 */
function mahoUpdateIndicator() {
  const el = MAHO.hud.mark;
  if (!el) return;
  const camObj = (typeof window !== "undefined" && window.__SS && window.__SS.activeCamera) || null;
  if (!camObj || !MAHO.alive) {
    if (el.style.display !== "none") el.style.display = "none";
    if (MAHO.hud.reticle && MAHO.hud.reticle.style.display !== "none") MAHO.hud.reticle.style.display = "none";
    return;
  }
  const v = mahoBodyCenter(new Vector3()).project(camObj);
  const inside = v.z < 1 && v.x > -0.92 && v.x < 0.92 && v.y > -0.9 && v.y < 0.86;
  const d = MAHO.cb && MAHO.cb.fighters ? MAHO.cb.fighters[SIDE.GOJO].p.distanceTo(MAHO.pos) : 0;
  // 锁定（Q）时在目标身上画准星：低空目标躲在楼后面时也能瞄
  const ret = MAHO.hud.reticle;
  if (ret) {
    const want = inside && mahoLockOn();
    if (want) {
      ret.style.display = "block";
      ret.style.left = ((v.x * 0.5 + 0.5) * 100).toFixed(2) + "%";
      ret.style.top = ((-v.y * 0.5 + 0.5) * 100).toFixed(2) + "%";
    } else if (ret.style.display !== "none") ret.style.display = "none";
  }
  if (inside) { if (el.style.display !== "none") el.style.display = "none"; return; }
  // 出画：贴在屏幕边缘 + 朝目标方向的三角 + 距离
  const x = mahoClamp(v.x, -0.92, 0.92);
  const y = mahoClamp(v.y, -0.88, 0.84);
  if (MAHO.hud.markText) MAHO.hud.markText.textContent = "魔虚罗 " + Math.round(d) + "m（悬空）";
  if (MAHO.hud.arrow) {
    const ux = v.x, uy = -v.y;                       // 屏幕方向（y 向下为正）
    const ang = Math.atan2(ux, -uy) * 180 / Math.PI; // ▲ 默认朝上
    MAHO.hud.arrow.style.transform = "rotate(" + ang.toFixed(1) + "deg)";
  }
  el.style.left = ((x * 0.5 + 0.5) * 100).toFixed(2) + "%";
  el.style.top = ((-y * 0.5 + 0.5) * 100).toFixed(2) + "%";
  if (el.style.display !== "block") el.style.display = "block";
}

/** 落雷/俯冲的预警圈属于临时道具，退场时必须清掉 */
function mahoTeleCleanup(cb) {
  MAHO.tele = null;
  mahoDropTelegraph();
}

/* ==========================================================================
 * 十、对外接口（契约 §4 顶层导出）
 * ========================================================================== */
var MahoragaPhase = {
  get hp() { return MAHO.hp; },
  get hpMax() { return MAHO.hpMax; },
  get adapt() { return MAHO.adapt; },
  get mode() { return MAHO.state; },
  isAlive() { return MAHO.alive; },
  summon(cb) { return mahoSummon(cb || MAHO.cb); },
  update(cb, dt, t) { mahoTick(cb, dt, t); },
  reset(cb) { mahoReset(cb); },
  hitTest(cb, p0, p1, radius, meta) { return mahoHitTest(cb, p0, p1, radius, meta); },
  damageGate(cb, h, dmg) { return mahoDamageGate(cb, h, dmg); },
  bar() {
    if (!MAHO.alive && MAHO.state !== "broken") return null;
    return { hp: MAHO.hp, hpMax: MAHO.hpMax, adapt: MAHO.wheelLit, mode: MAHO.state };
  },
  debug() { return mahoDebug(); }
};

function mahoDebug() {
  const q = (v) => +v.toFixed(2);
  return {
    hp: Math.round(MAHO.hp),
    hpMax: MAHO.hpMax,
    alive: MAHO.alive,
    mode: MAHO.state,
    state: MAHO.state,
    skill: MAHO.skillId,
    skillPhase: MAHO.skillPhase,
    cd: q(MAHO.cd),
    skillT: q(MAHO.skillT),
    adapt: Object.assign({}, MAHO.adapt),
    adaptMul: Object.assign({}, MAHO.adaptMul),
    wheelLit: MAHO.wheelLit,
    softRage: MAHO.softRage,
    protected: MAHO.protected,
    trueSukuna: MAHO.trueSukuna,
    triggered: MAHO.triggered,
    weakT: q(MAHO.weakT),
    attackable: MAHO.alive && (MAHO.state === "down" || (MAHO.state === "ascend" && MAHO.t < 0.35)),
    pos: { x: q(MAHO.pos.x), y: q(MAHO.pos.y), z: q(MAHO.pos.z) },
    speed: q(MAHO.speed),
    hitR: MAHO_TUNE.HIT_R[mahoDiff(MAHO.cb || {})],
    telegraph: MAHO.tele ? { x: q(MAHO.tele.x), z: q(MAHO.tele.z), r: MAHO.tele.r, kind: MAHO.tele.kind, t: q(MAHO.tele.t), dur: MAHO.tele.dur } : null,
    wave: MAHO.wave ? { x: q(MAHO.wave.mesh.position.x), z: q(MAHO.wave.mesh.position.z), t: q(MAHO.wave.t), done: MAHO.wave.done } : null,
    bolts: MAHO.bolts.map((b) => ({ x: q(b.mesh.position.x), y: q(b.mesh.position.y), z: q(b.mesh.position.z), hit: !!b.hit })),
    hitsTaken: MAHO.hitsTaken,
    stats: JSON.parse(JSON.stringify(MAHO.stats)),
    hookCalls: Object.assign({}, MAHO.hookCalls),
    lastHit: MAHO.lastHitInfo,
    hud: !!(MAHO.hud.root && MAHO.hud.root.style.display !== "none"),
    meshCount: MAHO.model ? mahoCountMeshes(MAHO.model.root) : 0,
    partCount: MAHO.model ? MAHO.model.parts.length : 0,
    hint: MAHO.stats.hint,
    blocks: MAHO.stats.blocks || 0,
    /** 本轮新增：近战副目标（meleeAim）的生效口径 */
    aim: { calls: MAHO.hookCalls.meleeAim || 0, offered: MAHO.aimOffered || 0, active: mahoAimActive() },
    /** 对空弹道（HOOKS.aim）的诊断口径：锁没锁上、最近一次提前量算成了什么 */
    aimAir: {
      calls: MAHO.hookCalls.aim || 0,
      lock: mahoLockOn(),
      last: MAHO.lastAim ? { skill: MAHO.lastAim.skill, flight: MAHO.lastAim.flight, speed: MAHO.lastAim.speed } : null,
      point: MAHO.aimPoint ? { x: +MAHO.aimPoint.x.toFixed(2), y: +MAHO.aimPoint.y.toFixed(2), z: +MAHO.aimPoint.z.toFixed(2) } : null
    },
    probeNear: { samples: MAHO.nearSamples || 0, minLast: MAHO.nearLast, min: MAHO.nearMinSq === undefined ? null : +Math.sqrt(MAHO.nearMinSq).toFixed(2), last: MAHO.nearLast, hitR: MAHO_TUNE.HIT_R[mahoDiff(MAHO.cb || {})] },
    summons: MAHO.stats.summons,
    evadeOverride: MAHO.evadeOverride,
    pin: MAHO.pin,
    baseY: +MAHO.baseY.toFixed(2),
    modelHeight: MAHO.lastHeight,
    camFrame: { calls: MAHO.hookCalls.camFrame || 0, w: +MAHO.frameW.toFixed(3), live: mahoBaseY(MAHO.cb) === MAHO_TUNE.AIR_Y[mahoDiff(MAHO.cb || {})] },
    difficulty: mahoDiff(MAHO.cb || {}),
    lockOn: mahoLockOn()
  };
}

/* -------- 探针专用小工具（不影响玩法；独立验证用不到） -------- */
MahoragaPhase.cb = function () { return MAHO.cb; };
/**
 * 客观尺寸测量：遍历模型里的可见网格，把 geometry 包围盒的 8 个角点变换到世界坐标，
 * 求整体 AABB —— 用来验契约的 3.8~4.2m 高、肩宽 2.6m，不靠"看起来差不多"。
 */
MahoragaPhase.metrics = function () {
  const m = MAHO.model;
  if (!m) return null;
  m.root.updateMatrixWorld(true);
  let minY = Infinity, maxY = -Infinity, minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
  const v = new Vector3();
  let n = 0;
  const tops = [];
  const isRing = (mesh) => mesh.geometry && mesh.geometry.type === "TorusGeometry";
  for (const mesh of m.parts) {
    if (!mesh.visible || !mesh.geometry) continue;
    if (mesh === m.shadow) continue;      // 地面投影不是本体，别计入尺寸
    /**
     * ⚠ 圆环（法轮外/内环）在自身平面内持续自转，用"几何包围盒 8 个角点"求世界极值会虚高：
     * 角点到圆心 0.45×√2 = 0.637，实测把总高从真值 4.07 抬到 4.23。
     * 这里跳过圆环，改用"轮心 + 半径"精确算它的最高点。
     */
    if (isRing(mesh)) continue;
    if (!mesh.geometry.boundingBox) mesh.geometry.computeBoundingBox();
    const bb = mesh.geometry.boundingBox;
    if (!bb) continue;
    n++;
    tops.push({ mesh, bb });
    for (let i = 0; i < 8; i++) {
      v.set(i & 1 ? bb.max.x : bb.min.x, i & 2 ? bb.max.y : bb.min.y, i & 4 ? bb.max.z : bb.min.z);
      v.applyMatrix4(mesh.matrixWorld);
      if (v.y < minY) minY = v.y;
      if (v.y > maxY) maxY = v.y;
      if (v.x < minX) minX = v.x;
      if (v.x > maxX) maxX = v.x;
      if (v.z < minZ) minZ = v.z;
      if (v.z > maxZ) maxZ = v.z;
    }
  }
  // 法轮外环的最高点 = 轮心 + (半径 + 管半径)（轮面近似水平，x 倾角 ≤0.12rad）
  if (m.bones.wheel) {
    const wy = m.bones.wheel.getWorldPosition(new Vector3()).y;
    const ringTop = wy + 0.73 * Math.cos(m.bones.wheel.rotation.x);   // 8 颗金球外缘（0.62+0.11）
    if (ringTop > maxY) maxY = ringTop;
    if (ringTop > minY) { /* 只关心高度 */ }
  }
  const feet = MAHO.pos.y;
  MAHO.lastHeight = +(maxY - feet).toFixed(3);
  // 最高的三个零件（排查"到底什么把高度撑爆了"用）
  const topList = tops.map((t) => {
    let hi = -Infinity;
    for (let i = 0; i < 8; i++) {
      v.set(i & 1 ? t.bb.max.x : t.bb.min.x, i & 2 ? t.bb.max.y : t.bb.min.y, i & 4 ? t.bb.max.z : t.bb.min.z);
      v.applyMatrix4(t.mesh.matrixWorld);
      if (v.y > hi) hi = v.y;
    }
    return { y: +(hi - feet).toFixed(3), geo: t.mesh.geometry.type === "BoxGeometry" ? "box" + t.mesh.geometry.parameters.width + "x" + t.mesh.geometry.parameters.height : t.mesh.geometry.type };
  }).sort((a, b) => b.y - a.y).slice(0, 8);
  // 骨骼世界高度（排查挂点用）
  const boneY = {};
  for (const bn of ["hips", "core", "chest", "neck", "head", "wheel"]) {
    if (m.bones[bn]) boneY[bn] = +(m.bones[bn].getWorldPosition(new Vector3()).y - feet).toFixed(3);
  }
  // 肩宽：两侧肩甲外缘（肩骨位置 ± 肩甲半宽 0.3）——契约要的是这个，不是整机包围盒
  // 肩宽：用骨骼**局部**位置量（世界坐标随姿态在 2.38~2.57 间漂，契约要的是建模尺寸 2.6）
  const sL = m.bones.shoulderL ? m.bones.shoulderL.position.x : 0;
  const sR = m.bones.shoulderR ? m.bones.shoulderR.position.x : 0;
  const shoulder = Math.abs(sL - sR) + 0.6;
  /**
   * 验收表用的实测值（全部从骨骼/网格世界坐标量，不靠"看起来差不多"）：
   *   头高 / 肩宽 / 腰宽 / 腿长 / 轮径 / 轮心高度 / 长角长 / 短角长 / 臂长
   */
  const b = m.bones;
  const wy = (g) => (g ? g.getWorldPosition(new Vector3()).y : 0);
  // 头顶 = 颅骨网格顶部（不能用 maxY，那是角尖/轮顶）
  let skullTop = -Infinity;
  for (const mesh of m.parts) {
    if (mesh.geometry && mesh.geometry.type === "SphereGeometry" && mesh.parent === m.bones.head) {
      const bb = mesh.geometry.boundingBox;
      if (bb) {
        for (let i = 0; i < 8; i++) {
          v.set(i & 1 ? bb.max.x : bb.min.x, i & 2 ? bb.max.y : bb.min.y, i & 4 ? bb.max.z : bb.min.z);
          v.applyMatrix4(mesh.matrixWorld);
          if (v.y > skullTop) skullTop = v.y;
        }
      }
    }
  }
  const headTop = isFinite(skullTop) ? skullTop : maxY;
  const shoulderY = wy(b.shoulderL);
  const legLen = shoulderY > 0 ? (b.hips.getWorldPosition(new Vector3()).y + (headTop - shoulderY) * 0 - 0) : 0;
  const hipY = wy(b.hips);
  const footY = wy(b.footL);
  const wheelC = wy(b.wheel);
  const ringR = 0.62;
  const hornLen = [];
  for (const mesh of m.parts) {
    if (mesh.geometry && mesh.geometry.type === "TubeGeometry" && mesh.geometry.parameters && mesh.geometry.parameters.path) {
      try { hornLen.push(+mesh.geometry.parameters.path.getLength().toFixed(2)); } catch (e) { /* noop */ }
    }
  }
  hornLen.sort((x, y) => y - x);
  return {
    meshes: n,                                   // parts 数（不含直接挂在法轮上的金球/金圈）
    drawMeshes: mahoCountMeshes(m.root),         // 真实可见网格数 ≈ draw call（探针按这个验 ≤70）
    feetY: +feet.toFixed(3),
    topY: +maxY.toFixed(3),
    height: +(maxY - feet).toFixed(3),
    shoulderWidth: +shoulder.toFixed(3),
    // ---- 验收表实测 ----
    headHeight: +(headTop - wy(b.head)).toFixed(3),          // 头高（头骨骨节→颅顶）
    headTopY: +(headTop - feet).toFixed(3),
    waistWidth: 0.76,                                        // 腰部锥体直径（上径 0.38 × 2）
    legLength: 1.86,                                         // 骨架腿长（髋 1.86 → 脚底 0，与姿态无关）
    stanceWidth: +(wy(b.footL) * 0 + Math.hypot(b.footL.getWorldPosition(new Vector3()).x - b.footR.getWorldPosition(new Vector3()).x, b.footL.getWorldPosition(new Vector3()).z - b.footR.getWorldPosition(new Vector3()).z)).toFixed(2),   // 两脚间距
    legLengthPosed: +(hipY - footY).toFixed(3),               // 姿态下的髋→脚踝竖直距离
    armLength: 1.66,                                         // 骨架单臂长（0.7+0.8+0.16，与姿态无关）
    wheelR: ringR, wheelDia: +(ringR * 2).toFixed(2),
    wheelCenterOverHead: +(wheelC - headTop).toFixed(3),     // 轮心高出"颅顶"多少
    wheelBottomOverHead: +(wheelC - ringR - headTop).toFixed(3),  // 轮圈下缘相对颅顶（负=环在头侧）
    hornLongest: hornLen[0] || 0, hornSecond: hornLen[1] || 0,
    topParts: topList,
    boneY: boneY,
    span: +(maxX - minX).toFixed(3),
    spanZ: +(maxZ - minZ).toFixed(3)
  };
};
/** 探针开关：把预判侧移概率钉死（0 = 必不闪，1 = 必闪），传 null 恢复难度概率 */
MahoragaPhase.setEvade = function (v) { MAHO.evadeOverride = (v === null || v === undefined) ? null : mahoClamp(+v, 0, 1); return MAHO.evadeOverride; };
/** 截图用：钉住魔虚罗的位置（allowMove=false 解除） */
MahoragaPhase.setPos = function (x, y, z, pin) {
  if (!MAHO.model) return null;
  MAHO.pos.set(+x, +y, +z);
  MAHO.prevPos.copy(MAHO.pos);
  MAHO.pin = pin !== false;
  MAHO.model.root.position.copy(MAHO.pos);
  return { x: MAHO.pos.x, y: MAHO.pos.y, z: MAHO.pos.z, pin: MAHO.pin };
};
/** 排查用：dump 骨骼 / 零件的真实变换（探针诊断建模问题时用） */
MahoragaPhase.dump = function () {
  const m = MAHO.model;
  if (!m) return null;
  m.root.updateMatrixWorld(true);
  const out = { rootScale: m.root.scale.toArray(), rootY: +m.root.position.y.toFixed(3), bones: {}, parts: [] };
  for (const bn in m.bones) {
    const b = m.bones[bn];
    const wp = b.getWorldPosition(new Vector3());
    out.bones[bn] = {
      r: [+b.rotation.x.toFixed(3), +b.rotation.y.toFixed(3), +b.rotation.z.toFixed(3)],
      order: String(b.rotation.order),
      s: [+b.scale.x.toFixed(3), +b.scale.y.toFixed(3), +b.scale.z.toFixed(3)],
      lp: [+b.position.x.toFixed(3), +b.position.y.toFixed(3), +b.position.z.toFixed(3)],
      wy: +wp.y.toFixed(3)
    };
  }
  const kinds = {};
  for (const mesh of m.parts) {
    const t = mesh.geometry.type + (mesh.geometry.parameters && mesh.geometry.parameters.width ? ":" + mesh.geometry.parameters.width + "x" + mesh.geometry.parameters.height : "");
    if (!kinds[t]) kinds[t] = [];
    const wp = mesh.getWorldPosition(new Vector3());
    kinds[t].push(+wp.y.toFixed(3));
  }
  out.parts = kinds;
  return out;
};
/** 截图用：强制姿态 */
MahoragaPhase.setPose = function (name, k) { mahoEnterPose(name, k || 12); MAHO.poseHold = 0; return MAHO.poseName; };
MahoragaPhase.force = function (id, cb) { return mahoBeginSkill(cb || MAHO.cb, id); };
/** 探针专用：直接扣血（走近战路径 → 不吃适应免疫，能稳定打到 0） */
MahoragaPhase.hurt = function (n, cb) { return mahoApplyHit(cb || MAHO.cb, { skill: SKILL.BLACK_FLASH }, n, {}); };
/** 探针专用：奶一口（验证击破演出/多次试验时把血池补回来） */
MahoragaPhase.heal = function (n, cb) {
  if (!MAHO.alive) return MAHO.hp;
  MAHO.hp = Math.min(MAHO.hpMax, MAHO.hp + Math.max(0, +n || 0));
  mahoHudDirty();
  return MAHO.hp;
};
/** 探针专用：冻结技能选择（截图/定点观测用，不影响触发与状态机） */
/** 探针/截图专用：纯黑剪影模式（判断剪影识别度用） */
MahoragaPhase.setSilhouette = function (on) {
  if (!MAHO.model) return false;
  if (!MAHO.silMat) MAHO.silMat = new MeshBasicMaterial({ color: 0x000000 });
  for (const mesh of MAHO.model.parts) {
    if (mesh === MAHO.model.shadow) continue;
    if (on) { if (!mesh.userData.mat0) mesh.userData.mat0 = mesh.material; mesh.material = MAHO.silMat; }
    else if (mesh.userData.mat0) mesh.material = mesh.userData.mat0;
  }
  for (const seg of MAHO.model.wheel.segs) {
    if (on) { if (!seg.userData.mat0) seg.userData.mat0 = seg.material; seg.material = MAHO.silMat; }
    else if (seg.userData.mat0) seg.material = seg.userData.mat0;
  }
  if (MAHO.model.wheel.hub) {
    const hub = MAHO.model.wheel.hub;
    if (on) { if (!hub.userData.mat0) hub.userData.mat0 = hub.material; hub.material = MAHO.silMat; }
    else if (hub.userData.mat0) hub.material = hub.userData.mat0;
  }
  MAHO.silhouette = !!on;
  return true;
};
/** 探针/截图专用：临时屏蔽 camFrame 覆盖（建模特写需要默认近机位） */
MahoragaPhase.setFrame = function (on) { MAHO.frameOff = !on; return !MAHO.frameOff; };
MahoragaPhase.freeze = function (on) {
  MAHO.frozen = !!on;
  if (MAHO.frozen) { MAHO.pendingForce = null; MAHO.cd = Math.max(MAHO.cd, 1); }
  return MAHO.frozen;
};
MahoragaPhase.gateTest = function (h) { return mahoDamageGate(MAHO.cb, h, h && typeof h.dmg === "number" ? h.dmg : 100); };
MahoragaPhase.aimTest = function (skill, from) {
  const cb = MAHO.cb;
  if (!cb) return null;
  const f = from || cb.fighters[SIDE.GOJO].ctrl.chest.getWorldPosition(new Vector3());
  const target = new Vector3(cb.fighters[SIDE.SUKUNA].p.x, 1.2, cb.fighters[SIDE.SUKUNA].p.z);
  const dir = target.clone().sub(f).normalize();
  const out = mahoAim(cb, cb.fighters[SIDE.GOJO], f, dir, skill || SKILL.RED);
  if (!out) return { aimed: false };
  const chest = mahoBodyCenter(new Vector3());
  /** 准不准看"射线到胸口的垂距"；提前量本身会指向未来位置，所以不能用点到点距离衡量 */
  const dirn = out.clone().normalize();
  const toChest = chest.clone().sub(f);
  const alongDist = toChest.dot(dirn);
  const perp = toChest.clone().addScaledVector(dirn, -alongDist).length();
  const pred = MAHO.aimPoint ? mahoPredict(chest, MAHO.lastAim.flight, cb) : chest;
  return {
    aimed: true,
    perp: +perp.toFixed(2),                 // 射线到"当前位置胸口"的垂距
    perpPred: +pred.clone().sub(f).cross(dirn).length().toFixed(2),  // 到"预测点"的垂距（≈0 才算真的瞄住了）
    predDelta: +pred.distanceTo(chest).toFixed(2),
    lead: MAHO.lastAim ? MAHO.lastAim.flight : 0,
    speed: MAHO.lastAim ? MAHO.lastAim.speed : 0
  };
};
MahoragaPhase.segTest = function (skill, radius, dmg, kind) {
  const cb = MAHO.cb;
  if (!cb) return null;
  const c = mahoBodyCenter(new Vector3());
  const p0 = c.clone().add(new Vector3(0, 0, 30));
  const p1 = c.clone().add(new Vector3(0, 0, -30));
  const hpBefore = MAHO.hp;
  const eaten = !!mahoHitTest(cb, p0, p1, radius || 1.2, {
    skill, owner: cb.fighters[SIDE.GOJO],
    kind: kind || (mahoIsMeleeSkill(skill) ? "melee" : "projectile"),
    dmg: (typeof dmg === "number") ? dmg : 100
  });
  return { eaten, hpBefore: Math.round(hpBefore), hpAfter: Math.round(MAHO.hp), delta: +(hpBefore - MAHO.hp).toFixed(2) };
};

/* ==========================================================================
 * 十一、钩子实现
 * ========================================================================== */
/** 玩家打魔虚罗：外部伤害唯一的入口（近战走弱点窗口加成、术式走适应） */
function mahoHitTest(cb, p0, p1, radius, meta) {
  MAHO.hookCalls.segment++;
  if (!MAHO.alive || MAHO.state === "broken" || MAHO.state === "summon") return false;
  if (!p0 || !p1) return false;
  const owner = meta && meta.owner;
  if (owner && owner.side && owner.side !== SIDE.GOJO) return false;   // 只吃玩家的攻击
  const skill = meta && meta.skill;
  const kind = meta && meta.kind;
  const melee = kind === "melee" || (!kind && mahoIsMeleeSkill(skill));
  /**
   * ⚠ 近战去重：combat.js 的 tryMelee 在出招的**每一帧**都会调一次本钩子
   * （命中判定挂在攻击动作上，动作不结束就一直问）。
   * 没有这一步的话，一次挥拳会在接触的 20 帧里记 20 次伤害 —— 实测 5 次轻击
   * 就把 900 血池打空（H4 曾经读到 hitsTaken 3→23）。
   * meta.attack 是 combat 传进来的攻击实例，直接挂在它身上标记"本次已结算"。
   */
  if (melee) {
    const atk = meta && meta.attack;
    if (atk) { if (atk.__mahoHit) return false; }
    else if ((MAHO.meleeCd || 0) > 0) return false;   // 拿不到实例时退化成 0.18s 节流
  }
  const center = mahoBodyCenter(new Vector3());
  const R = mahoHitR(cb);
  const rr = radius + R;
  const distSq = mahoPointSegDistSq(center.x, center.y, center.z, p0.x, p0.y, p0.z, p1.x, p1.y, p1.z);
  const wouldHit = distSq <= rr * rr;
  // 探针诊断：记录弹道最近距离（不参与玩法判定）
  if (!melee) {
    MAHO.nearSamples = (MAHO.nearSamples || 0) + 1;
    if (distSq < (MAHO.nearMinSq === undefined ? Infinity : MAHO.nearMinSq)) MAHO.nearMinSq = distSq;
    MAHO.nearLast = +Math.sqrt(distSq).toFixed(2);
  }
  if (melee) {
    const weak = MAHO.state === "down" || (MAHO.state === "ascend" && MAHO.t < 0.35);
    if (!weak) {
      // 悬空时近战打不到 —— 给玩家一个明确解释（横幅限流 5s）
      if (wouldHit || (mahoHorizontalDist(p0, MAHO.pos) < 9 && MAHO.hintCd <= 0)) {
        MAHO.hintCd = 5;
        MAHO.stats.hint++;
        cb.banner("魔虚罗悬在空中 —— 近战够不到，按住 Q 锁定后用 苍/赫/茈", 2.4);
        cb.fx.callout({ text: "悬空", sub: "近战无效", pos: center.clone().setY(center.y - 0.6), color: C.CRIMSON, color2: C.WHITE, life: 0.8, size: 0.9, rise: 0.8 });
        cb.audio.play("block", { volume: 0.4 });
      }
      return false;
    }
    if (wouldHit) {
      // 弱点窗口：正常吃判定，伤害转记到魔虚罗头上并给足反馈
      if (meta && meta.attack) meta.attack.__mahoHit = true;
      else MAHO.meleeCd = 0.18;
      mahoApplyHit(cb, meta, (meta && meta.dmg) || 0, { weak: true });
      cb.fx.callout({ text: "弱点", sub: "近战命中", pos: center.clone().setY(center.y + 0.8), color: C.GOLD, color2: C.CRIMSON, life: 0.7, size: 1, rise: 0.9 });
      return true;
    }
    /**
     * 悬浮态**不拦截**玩家的近战 —— 这是 Lead 上一轮的 P0 裁定，必须保持。
     * 原因（也解释了为什么下面原来那段「挡下」代码是死代码，本轮已删除）：
     *   · 玩家站地面上，扫掠线高度 ≈1.4m；悬空魔虚罗的胸口命中球在 y≈6.9m
     *     （AIR_Y 4.5 + mahoBodyCenter 2.4），垂距 5.5m ≫ 命中半径 2.55m
     *     → wouldHit 恒为假，本来就不可能触发；
     *   · 而上面的 !weak 分支已经 return false、weak 分支命中即 return true，
     *     到达这一行时 wouldHit 只会是 false —— 那段 30% 挡下永远跑不到。
     * 现在的语义更干净：
     *   落地弱点窗口 → 近战被魔虚罗吃掉并吃 ×1.5 加成（它的血条掉）
     *   悬空        → 近战照常打宿傩，但伤害吃 MAHO_TUNE.GUARD_GOJO(0.6)（damageGate）
     * MAHO_TUNE.BLOCK_P / BLOCK_TRANSFER 保留为历史数值，当前无代码引用。
     */
    return false;   // 扫到了但没挡下 → 交给宿傩那条既有结算路径（近战对宿傩 ×0.6）
  }
  // 术式：几何命中后才考虑预判侧移
  if (!wouldHit) return false;
  if (meta && meta.continuous) {
    if ((MAHO.contCd || 0) > 0) return false;
    MAHO.contCd = MAHO_TUNE.CONTINUOUS_CD;
  }
  const evadeP = MAHO.evadeOverride !== null && MAHO.evadeOverride !== undefined ? MAHO.evadeOverride : MAHO_TUNE.EVADE_P[mahoDiff(cb)];
  if (MAHO.dodgeCd <= 0 && MAHO.dodgeT <= 0 && Math.random() < evadeP) {
    mahoDodge(cb, p0, p1);
    return false;
  }
  mahoApplyHit(cb, meta, (meta && meta.dmg) || 0, {});
  return true;
}
function mahoHorizontalDist(p, q) { return Math.hypot(p.x - q.x, p.z - q.z); }

/** 0.35s 预判侧移：沿扫掠段的垂直方向闪开（难度越高概率越大） */
function mahoDodge(cb, p0, p1) {
  const dx = p1.x - p0.x, dz = p1.z - p0.z;
  const len = Math.hypot(dx, dz) || 1;
  // 垂直于来袭方向的两个候选方向，选离"环绕中心"更远的那个（视觉上是往外闪）
  const nx = -dz / len, nz = dx / len;
  const pl = cb.fighters[SIDE.GOJO];
  const ax = MAHO.pos.x + nx * 3, az = MAHO.pos.z + nz * 3;
  const bx = MAHO.pos.x - nx * 3, bz = MAHO.pos.z - nz * 3;
  const far = Math.hypot(ax - pl.p.x, az - pl.p.z) > Math.hypot(bx - pl.p.x, bz - pl.p.z);
  MAHO.dodgeDir.set(far ? nx : -nx, 0, far ? nz : -nz);
  MAHO.dodgeT = MAHO_TUNE.EVADE_LEAD;
  MAHO.dodgeBurst = MAHO_TUNE.EVADE_BURST_T;
  MAHO.dodgeCd = MAHO_TUNE.DODGE_CD;
  MAHO.stats.dodges++;
  mahoEnterPose("hover", 14);
  const center = mahoBodyCenter(new Vector3());
  cb.fx.hitSpark({ pos: center.clone(), color: C.CYAN, color2: C.WHITE, count: 8, size: 0.4, life: 0.25, speed: 10 });
  cb.fx.callout({ text: "回避", sub: "预判闪避", pos: center.clone().setY(center.y + 0.6), color: C.CYAN, color2: C.WHITE, life: 0.6, size: 0.8, rise: 1 });
  cb.audio.play("dash", { volume: 0.5 });
  cb.pushEvent({ type: "mahoraga_dodge" });
}

/** 对空：锁定时把弹道掰向魔虚罗胸口（含 0.25s 提前量）；不锁定返回 null */
function mahoAim(cb, owner, from, dir, skill) {
  MAHO.hookCalls.aim++;
  if (!MAHO.alive || MAHO.state === "broken" || MAHO.state === "summon") return null;
  if (!owner || owner.side !== SIDE.GOJO) return null;
  if (!(skill === SKILL.BLUE || skill === SKILL.RED || skill === SKILL.PURPLE || skill === SKILL.PURPLE_200)) return null;
  if (!mahoLockOn()) return null;                                    // 契约：只有锁定才掰
  const center = mahoBodyCenter(new Vector3());
  /**
   * 提前量 = 按**弹速**算出的飞行时间。
   * 一开始写死 0.25s，实测赫（22m/s、飞 ~0.9s）在会环绕的魔虚罗身上连打三次全空
   * （目标 1 秒漂 10m，远大于命中球 3.5m）。茈/200%茈是瞬发射线段（hitscan）不需要提前量，
   * 提前量反而会让它偏。
   */
  const speed = skill === SKILL.BLUE ? 14 : skill === SKILL.RED ? SKILL_DATA[SKILL.RED].range * 0.65 : 0;
  let flight = 0;
  if (speed > 1) {
    // 上限 1.6s：苍 14m/s、目标常在半空 20m 处 → 真实飞行 1.43s，夹在 1.1s 会让提前量偏短
    flight = mahoClamp(from.distanceTo(center) / speed, 0, 1.6);
    for (let i = 0; i < 2; i++) {
      const p = mahoPredict(center, flight, cb);
      flight = mahoClamp(from.distanceTo(p) / speed, 0, 1.6);
    }
  }
  MAHO.lastAim = { skill: skill, flight: +flight.toFixed(3), speed: speed };
  const to = mahoPredict(center, flight, cb);
  MAHO.aimPoint = to.clone();
  return new Vector3(to.x - from.x, to.y - from.y, to.z - from.z);
}

/**
 * 目标预测：魔虚罗是**绕着玩家做圆周运动**的，直线提前量会切进弧内（实测垂距 9.5m、真弹道打空）。
 * 用二阶近似 p + v·t + 0.5·a·t²，a 取向心加速度 v²/R（指向玩家）。
 */
function mahoPredict(center, flight, cb) {
  if (!(flight > 1e-3)) return center.clone();
  const pl = cb && cb.fighters ? cb.fighters[SIDE.GOJO] : null;
  if (!pl) return center.clone().addScaledVector(MAHO.vel, flight);
  // 环绕中心可能是宿傩（ORBIT_LOCAL），必须用真实中心，否则提前量方向整个错
  /**
   * 提前量：航线是绕宿傩的侧向往返（正弦），所以用速度外推 + 用当前航线参数做一次修正。
   * 简化实现：以当前速度线性外推，再用"下一时刻的正弦位置"迭代两次。
   */
  const skp = cb && cb.fighters ? cb.fighters[SIDE.SUKUNA] : null;
  if (!skp) return center.clone().addScaledVector(MAHO.vel, flight);
  const a1 = (MAHO.orbitPhase || 0) + (MAHO.orbitW || 0.34) * (MAHO.orbitDir || 1) * flight;
  const Rloc = MAHO_TUNE.ORBIT_LOCAL[mahoDiff(cb || {})];
  const ax2 = skp.p.x - pl.p.x, az2 = skp.p.z - pl.p.z;
  const al2 = Math.hypot(ax2, az2) || 1;
  const lat = Math.sin(a1) * Rloc;
  const back = Math.cos(a1 * 0.5) * 1.4;
  const px = skp.p.x + (-az2 / al2) * lat + (ax2 / al2) * back;
  const pz = skp.p.z + (ax2 / al2) * lat + (az2 / al2) * back;
  /**
   * ⚠ 必须是**纯函数**：上一版在入参 center 上累加修正量，而调用方在迭代里会调 2~3 次，
   * 修正量被叠加成 2~3 倍，提前量直接偏出命中球（实测命中率从 31% 掉到 0%）。
   */
  const out = center.clone();
  out.x += px - MAHO.pos.x;
  out.z += pz - MAHO.pos.z;
  return out;
}

/** 二阶段宿傩乘区（契约 §4） */
function mahoDamageGate(cb, h, dmg) {
  MAHO.hookCalls.damageGate++;
  if (!h || typeof dmg !== "number") return dmg;
  if (h.mahoSkill) return dmg;                                       // 魔虚罗自己的招式不再叠乘
  const fromS = h.from && h.from.side;
  const toS = h.to && h.to.side;
  if (MAHO.alive) {
    if (fromS === SIDE.GOJO && toS === SIDE.SUKUNA) return dmg * MAHO_TUNE.GUARD_GOJO;    // 庇护：玩家打宿傩更软
    if (fromS === SIDE.SUKUNA && toS === SIDE.GOJO) return dmg * MAHO_TUNE.GUARD_SUKUNA;  // 二阶段：宿傩打玩家更疼
  } else if (MAHO.trueSukuna && fromS === SIDE.SUKUNA && toS === SIDE.GOJO) {
    return dmg * MAHO_TUNE.TRUE_SUKUNA;                              // 击破后保留的高伤害
  }
  return dmg;
}

/**
 * HOOKS.meleeAim —— 玩家普攻的「副目标」：俯冲落地后的 1.6s 弱点窗口。
 * ----------------------------------------------------------------------------
 * 用户 P0（原话）：「宿傩落地攻击暴露弱点的伤害 …… 玩家普通攻击会自动吸附到宿傩身上，
 * 想打魔虚罗打不了」。
 * 根因不在魔虚罗，而在 combat.js 的 tryMelee：射程门槛和扫掠方向都拿 a.target（宿傩）
 * 算，所以玩家站在落地魔虚罗面前时**整个近战判定根本不会触发**，拳头又永远指向宿傩。
 * 这个钩子只回答一个问题：「我现在是不是可以被普攻打到？」
 *
 * 抢目标的三个条件（缺一不可）：
 *   ① 处于可近战状态（down / descend 后 0.35s，与 segment 钩子的 weak 判据逐字一致）；
 *   ② 距离 ≤ 玩家当前招式的射程 + 我的命中球半径；
 *   ③ 玩家没有在往「远离我」的方向走（移动输入与「玩家→我」夹角 > 110° 才让位）。
 * 返回 null 时 combat.js 的行为与没有这个模块时完全一样。
 */
function mahoMeleeAim(cb, atk) {
  MAHO.hookCalls.meleeAim++;
  if (!MAHO.alive || MAHO.state === "broken" || MAHO.state === "summon" || MAHO.state === "off") return null;
  const weak = MAHO.state === "down" || (MAHO.state === "ascend" && MAHO.t < 0.35);
  if (!weak) return null;                                   // 悬空：契约要求近战够不到
  const actor = atk && atk.actor;
  if (!actor || actor.side !== SIDE.GOJO) return null;      // 只服务玩家的普攻
  const range = atk.flow ? atk.flow.range : 4;
  const R = mahoHitR(cb);
  const d = mahoHorizontalDist(actor.p, MAHO.pos);
  if (d > range + R) return null;                           // 够不到就不抢
  const mi = actor.moveIntent;
  if (mi && d > 1e-3) {
    const ml = Math.hypot(mi.x, mi.z);
    if (ml > 0.05) {
      const dot = (mi.x * (MAHO.pos.x - actor.p.x) + mi.z * (MAHO.pos.z - actor.p.z)) / (ml * d);
      if (dot < -0.35) return null;                         // 玩家明确往反方向走 → 让位给宿傩
    }
  }
  MAHO.aimOffered++;
  MAHO.aimUntil = (typeof performance !== "undefined" ? performance.now() : Date.now()) + 250;
  return { p: { x: MAHO.pos.x, z: MAHO.pos.z }, r: R, weak: true };
}

/** HUD 用：最近 0.25s 内是否真的把普攻掰到了我身上 */
function mahoAimActive() {
  const now = typeof performance !== "undefined" ? performance.now() : Date.now();
  return now < MAHO.aimUntil;
}

/** 每帧主循环：触发 → 召唤 → 空中机动 → 技能 → 生存状态 */
function mahoTick(cb, dt, t) {
  MAHO.hookCalls.tick++;
  MAHO.cb = cb;
  if (!cb || !cb.fighters) return;
  if (dt > 0) {
    MAHO.contCd = Math.max(0, (MAHO.contCd || 0) - dt);
  MAHO.meleeCd = Math.max(0, (MAHO.meleeCd || 0) - dt);
    MAHO.dodgeCd = Math.max(0, MAHO.dodgeCd - dt);
    MAHO.hintCd = Math.max(0, MAHO.hintCd - dt);
    MAHO.flashT = Math.max(0, MAHO.flashT - dt);
    if (MAHO.poseHold > 0) MAHO.poseHold = Math.max(0, MAHO.poseHold - dt);
  }
  // 触发判定（唯一入口）：宿傩 HP ≤ 50% 且本局没触发过、没被击破过
  if (!MAHO.triggered && !MAHO.finished && !cb.resultLocked) {
    const sk = cb.fighters[SIDE.SUKUNA];
    if (sk && !sk.dead && sk.hpMax > 0 && sk.hp / sk.hpMax <= MAHO_TUNE.TRIGGER_RATIO) mahoSummon(cb);
  }
  if (MAHO.state === "off" || MAHO.state === "broken") {
    if (MAHO.state === "broken") mahoBreakUpdate(cb, dt);
    mahoUpdateHud();
    return;
  }
  if (!MAHO.model) { mahoUpdateHud(); return; }
  /**
   * 战斗内已有的「摩虚罗之轮」（宿傩头顶那个金色轮，combat.js 的 MahoragaWheel）在
   * 真·魔虚罗登场后就是重复信息。combat.js 在 tick 里会按 ai.phase>=3 把它点亮，
   * 而我的 tick 在它之后运行，所以这里把它按下去 —— 只在魔虚罗在场时生效，退场后自动恢复。
   */
  if (cb.wheel && cb.wheel.setVisible) cb.wheel.setVisible(false);
  MAHO.prevPos.copy(MAHO.pos);
  if (MAHO.state === "summon") {
    mahoSummonUpdate(cb, dt);
  } else {
    // 位置记录（速度供 aim 提前量用）
    const px = MAHO.pos.x, pz = MAHO.pos.z;
    if (MAHO.state === "air") mahoUpdateAir(cb, dt, t);
    mahoUpdateSkill(cb, dt);
    mahoUpdateWave(cb, dt);
    mahoUpdateBolts(cb, dt);
    if (MAHO.teleMesh) { MAHO.teleMesh.userData.t = (MAHO.teleMesh.userData.t || 0) + dt; mahoSyncTelegraph(); }
    // 预判侧移位移
    if (MAHO.dodgeT > 0) {
      MAHO.dodgeT = Math.max(0, MAHO.dodgeT - dt);
      // 爆发段（0.12s，55m/s ≈ 6.6m）必须把本体整体挪出命中球，否则弹道照样命中
      const burst = (MAHO.dodgeBurst || 0) > 0;
      if (burst) MAHO.dodgeBurst = Math.max(0, MAHO.dodgeBurst - dt);
      const sp = burst ? MAHO_TUNE.EVADE_BURST : MAHO_TUNE.EVADE_SIDE * 0.4;
      MAHO.pos.x += MAHO.dodgeDir.x * sp * dt;
      MAHO.pos.z += MAHO.dodgeDir.z * sp * dt;
    }
    if (dt > 0) {
      MAHO.vel.set((MAHO.pos.x - px) / dt, 0, (MAHO.pos.z - pz) / dt);
      MAHO.speed = Math.hypot(MAHO.vel.x, MAHO.vel.z);
    }
    // 姿态：受击定格优先（0.28s），结束回到当前状态该有的姿态
    if (MAHO.poseHold <= 0) {
      // 受击姿态是"插播"，放完必须让位给状态姿态，否则会一直保持挨打的定格
      if (MAHO.poseName === "damage") { MAHO.poseName = null; MAHO.poseK = 6; }
      const name = MAHO.state === "down" || MAHO.state === "dive" ? "slam" : MAHO.poseName || "hover";
      mahoPoseUpdate(dt, name, MAHO.poseK || 6);
    } else {
      mahoPoseUpdate(dt, "damage", 12);
    }
    mahoApplyTransform(cb, dt, t);
    // 冷却与技能选择（同一时刻只允许一个技能）
    if (MAHO.state === "air") {
      MAHO.cd = Math.max(0, MAHO.cd - dt);
      if (MAHO.frozen) MAHO.cd = 1;                     // 探针冻结：不自动出招
      if (MAHO.cd <= 0) {
        let id = MAHO.pendingForce;
        MAHO.pendingForce = null;
        if (!id) id = mahoPickSkill(cb);
        mahoBeginSkill(cb, id);
      }
    }
    /**
     * 悬浮时不再每帧在手上堆 fx.sphere：radius 0.5 + charge 0.4 会让粒子铺开到 2~5m，
     * 在胸腹前糊成一坨金色光斑（第一版截图 02-front.png 的"金色圆盘"就是它），
     * 把建模本身盖掉了。悬浮只留法轮旋转 + 呼吸。 */
  }
  mahoUpdateHud();
  mahoUpdateIndicator();
}

/** 技能选择：不连放同一招；血越少越激进（冷却已经随血减少） */
function mahoPickSkill(cb) {
  const pool = MAHO_SKILL_IDS.filter((id) => id !== MAHO.lastSkill);
  if (!pool.length) return MAHO_SKILL_IDS[0];
  const sk = cb.fighters[SIDE.SUKUNA];
  const ratio = mahoClamp(sk.hp / Math.max(1, sk.hpMax), 0, 1);
  // 低血时更偏向「俯冲下砸」（给玩家弱点窗口，也给魔虚罗爆发）
  const w = pool.map((id) => {
    if (id === "dive") return 1.2 + (0.5 - ratio) * 1.6;
    if (id === "lightning") return 1.0;
    if (id === "slash") return 1.0;
    return 1.0;
  });
  let sum = 0;
  for (const v of w) sum += v;
  let r = Math.random() * sum;
  for (let i = 0; i < pool.length; i++) {
    r -= w[i];
    if (r <= 0) return pool[i];
  }
  return pool[pool.length - 1];
}

function mahoReset(cb) {
  MAHO.cb = cb || MAHO.cb;
  MAHO.state = "off";
  MAHO.t = 0;
  MAHO.hp = 0;
  MAHO.hpMax = MAHO_TUNE.HP;
  MAHO.alive = false;
  MAHO.triggered = false;
  MAHO.finished = false;
  MAHO.adapt = {};
  MAHO.adaptMul = {};
  MAHO.wheelLit = 0;
  MAHO.softRage = false;
  MAHO.protected = false;
  MAHO.trueSukuna = false;
  MAHO.skillId = null;
  MAHO.skillPhase = "";
  MAHO.skillT = 0;
  MAHO.cd = 0;
  MAHO.lastSkill = null;
  MAHO.hitsTaken = 0;
  MAHO.immuneHits = 0;
  MAHO.tele = null;
  mahoDropTelegraph();
  MAHO.dodgeT = 0;
  MAHO.dodgeCd = 0;
  MAHO.weakT = 0;
  MAHO.flashT = 0;
  MAHO.shakeT = 0;
  MAHO.hintCd = 0;
  MAHO.contCd = 0;
  MAHO.frameW = 0;      // reset 时取景立刻归位（Lead 要求）
  MAHO.pendingForce = null;
  MAHO.poseName = "hover";
  MAHO.poseHold = 0;
  MAHO.stats = { casts: { slash: 0, lightning: 0, dive: 0, barrage: 0 }, playerHits: 0, dodges: 0, immune: 0, adaptEvents: 0, broken: 0, hint: 0, summons: 0, boltsBlocked: 0, blocks: 0 };
  MAHO.hookCalls = { tick: 0, segment: 0, aim: 0, damageGate: 0, meleeAim: 0 };
  MAHO.aimUntil = 0;
  MAHO.aimOffered = 0;
  MAHO.lastHitInfo = null;
  mahoKillWave();
  mahoKillAllBolts();
  if (MAHO.sigil) { MAHO.sigil.visible = false; }
  if (MAHO.model) {
    MAHO.model.root.visible = false;
    MAHO.model.root.scale.setScalar(1);
    // 击破演出会打散零件位置/旋转，这里按建模时记下的原始坐标复位
    for (const p of MAHO.model.parts) {
      const o = p.userData.op || { x: 0, y: 0, z: 0 };
      p.position.set(o.x, o.y, o.z);
      p.rotation.set(0, 0, 0);
    }
    MAHO.breakParts = null;
  }
  mahoLightWheel();
  mahoHudShow(false);
  mahoSetWarn("");
}

/** HOOKS.camFrame：Boss 取景覆盖（sprint 在 camera.js 接线；未接线时没人调用，本组件自动降高度兜底） */
function mahoCamFrame(snap, def) {
  // camera.js 的调用形式：firstHook("camFrame", snap, { frac, pitch }) —— 第一参数是战斗快照
  MAHO.hookCalls.camFrame = (MAHO.hookCalls.camFrame || 0) + 1;
  if (MAHO.frameOff) return null;                     // 截图特写用：交还默认近机位
  const now = (typeof performance !== "undefined" ? performance.now() : Date.now()) / 1000;
  const dt = MAHO.frameT ? mahoClamp(now - MAHO.frameT, 0, 0.12) : 0.016;
  MAHO.frameT = now;
  MAHO.camFrameLast = now;
  const want = (MAHO.alive && MAHO.state !== "broken" && MAHO.state !== "off") ? 1 : 0;
  const k = 1 - Math.exp(-MAHO_TUNE.FRAME.ease * dt);
  MAHO.frameW += (want - MAHO.frameW) * (dt > 0 ? k : 0);
  if (MAHO.frameW < 0.01 && want === 0) { MAHO.frameW = 0; return null; }   // 归位后交还默认取景
  const N = MAHO_TUNE.FRAME_NEUTRAL, B = MAHO_TUNE.FRAME, w = MAHO.frameW;
  return {
    frac: mahoLerp(N.frac, B.frac, w),
    pitch: mahoLerp(N.pitch, B.pitch, w),
    fracMin: mahoLerp(N.fracMin, B.fracMin, w),
    w: +w.toFixed(3),
    src: "mahoraga"
  };
}

/* -------- 注册钩子 -------- */
onHook("camFrame", (cb) => mahoCamFrame(cb));
onHook("combatInit", (cb) => {
  MAHO.cb = cb;
  MAHO.hpMax = MAHO_TUNE.HP;
  // 调试出口：__SS.mahoraga（契约 §4 验收要求）
  try {
    if (typeof window !== "undefined" && window.__SS && !window.__SS.mahoraga) window.__SS.mahoraga = MahoragaPhase;
  } catch (e) { /* noop */ }
});
onHook("reset", (cb) => mahoReset(cb));
onHook("tick", (cb, dt, t) => mahoTick(cb, dt, t));
onHook("segment", (cb, p0, p1, radius, meta) => mahoHitTest(cb, p0, p1, radius, meta));
onHook("meleeAim", (cb, atk) => mahoMeleeAim(cb, atk));
onHook("aim", (cb, owner, from, dir, skill) => mahoAim(cb, owner, from, dir, skill));
onHook("damageGate", (cb, h, dmg) => mahoDamageGate(cb, h, dmg));

/** 契约 §1.3：机制模块必须自报状态（独立验证只看这个） */
MECH_DEBUG.mahoraga = () => ({
  hp: Math.round(MAHO.hp),
  hpMax: MAHO.hpMax,
  alive: MAHO.alive,
  adapt: Object.assign({}, MAHO.adapt),
  mode: MAHO.state,
  skill: MAHO.skillId,
  cd: +MAHO.cd.toFixed(2)
});
