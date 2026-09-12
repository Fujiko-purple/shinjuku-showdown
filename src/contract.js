  var C = {
    INK: 394764,
    STREET: 1316383,
    CONCRETE: 2830141,
    CONCRETE2: 3817556,
    NEON_PINK: 16723311,
    NEON_CYAN: 2287615,
    NEON_AMBER: 16756794,
    CRIMSON: 16719677,
    BLOOD: 9177886,
    AZURE: 2852607,
    CYAN: 6287615,
    SCARLET: 16722731,
    VIOLET: 11554047,
    WHITE: 16777215,
    GOLD: 16767091
  };
  var SIDE = { GOJO: "gojo", SUKUNA: "sukuna" };
  var SKILL = {
    // ---- 五条悟 ----
    PUNCH: "punch",
    // 体术打击
    KICK: "kick",
    // 踢击 (击退更强)
    BLACK_FLASH: "blackflash",
    // 黑闪 (命中判定窗口内触发, 2.5^2.5 倍咒力)
    BLUE: "blue",
    // 术式顺转「苍」 吸引
    RED: "red",
    // 术式反转「赫」 斥力冲击波
    PURPLE: "purple",
    // 虚式「茈」 100% 直线湮灭
    PURPLE_200: "purple200",
    // 虚式「茈」200% 超远程 (仅开场播片 / 终极技)
    REVERSE: "reverse",
    // 反转术式 自愈
    INFINITY: "infinity",
    // 无下限术式 被动 0.4s 无敌
    DOMAIN_VOID: "void",
    // 领域展开「无量空处」
    DOMAIN_AMP: "amp",
    // 领域展延
    // ---- 宿傩 ----
    DISMANTLE: "dismantle",
    // 「解」 无形斩击 远程
    CLEAVE: "cleave",
    // 「捌」 贴合斩击 近战连斩
    FURNACE: "furnace",
    // 「开」 火焰弓 / 竈
    DOMAIN_SHRINE: "shrine",
    // 领域展开「伏魔御厨子」
    WORLD_SLASH: "worldslash",
    // 扩张术式「解」 空间斩 (终盘)
    MAHORAGA: "mahoraga",
    // 摩虚罗之轮 适应
    RUSH: "rush"
    // 突进
  };
  var SKILL_DATA = {
    [SKILL.PUNCH]: { name: "打击", cost: 0, cd: 0.34, range: 4, dmg: 26, guardable: true, cast: 0.1 },
    [SKILL.KICK]: { name: "踢击", cost: 0, cd: 0.62, range: 4.6, dmg: 42, guardable: true, cast: 0.18 },
    [SKILL.BLACK_FLASH]: { name: "黑闪", cost: 0, cd: 0, range: 5.2, dmg: 210, guardable: true, cast: 0 },
    [SKILL.BLUE]: { name: "术式顺转 苍", cost: 22, cd: 6, range: 70, dmg: 0, guardable: false, cast: 0.35 },
    [SKILL.RED]: { name: "术式反转 赫", cost: 34, cd: 9, range: 34, dmg: 165, guardable: false, cast: 0.45 },
    [SKILL.PURPLE]: { name: "虚式 茈", cost: 60, cd: 16, range: 120, dmg: 430, guardable: false, cast: 0.85 },
    [SKILL.PURPLE_200]: { name: "虚式 茈 200%", cost: 0, cd: 0, range: 9999, dmg: 900, guardable: false, cast: 2.6 },
    [SKILL.REVERSE]: { name: "反转术式", cost: 45, cd: 14, range: 0, dmg: -180, guardable: false, cast: 0.6 },
    [SKILL.DOMAIN_VOID]: { name: "领域展开 无量空处", cost: 100, cd: 0, range: 0, dmg: 0, guardable: false, cast: 0.9 },
    [SKILL.DISMANTLE]: { name: "解", cost: 8, cd: 1.1, range: 90, dmg: 58, guardable: true, cast: 0.2 },
    [SKILL.CLEAVE]: { name: "捌", cost: 14, cd: 2.4, range: 5, dmg: 96, guardable: true, cast: 0.35 },
    [SKILL.FURNACE]: { name: "开", cost: 30, cd: 11, range: 95, dmg: 190, guardable: false, cast: 0.7 },
    [SKILL.DOMAIN_SHRINE]: { name: "领域展开 伏魔御厨子", cost: 100, cd: 0, range: 0, dmg: 0, guardable: false, cast: 0.9 },
    [SKILL.WORLD_SLASH]: { name: "扩张术式 解", cost: 40, cd: 12, range: 9999, dmg: 520, guardable: false, cast: 1.1 },
    [SKILL.RUSH]: { name: "突进", cost: 10, cd: 3, range: 40, dmg: 20, guardable: true, cast: 0.3 },
    /** 魔虚罗（十种影法术·八握剑异戒神将）—— 它的招式不打在宿傩的 CD 表里，
     *  这里登记只是为了 apply() 里查得到 guardable 之类的元数据。 */
    [SKILL.MAHORAGA]: { name: "魔虚罗", cost: 0, cd: 0, range: 40, dmg: 0, guardable: true, cast: 0 }
  };
  /**
   * ============================================================================
   * 机制扩展总线（HOOKS）
   * ----------------------------------------------------------------------------
   * 本作有四个互相独立的机制（魔虚罗 / 领域对决 / 黑闪 / 疾跑），它们都要插进
   * combat.js 的主循环，但并行开发时**不能共写同一个文件**。
   * 所以 combat.js 只在固定的十几个位置调用本总线的钩子，各机制模块自己
   * onHook(...) 注册进来 —— combat.js 不需要知道有谁存在，模块缺席时行为完全不变。
   *
   * 契约（冻结）见 reviews/13-mechanics-contract.md，改这里必须同步改那里的表。
   * ============================================================================
   */
  var HOOKS = {
    combatInit: [],
    // (cb)                        战斗对象构建完成
    reset: [],
    // (cb)                        每局重开
    tick: [],
    // (cb, dt, t)                 每帧
    hud: [],
    // (dt, snap)                  每帧 HUD
    segment: [],
    // (cb,p0,p1,r,meta)->bool     命中扫掠；true = 这次攻击被本模块吃掉
    aim: [],
    // (cb,owner,from,dir,skill)   改写弹道方向
    damageGate: [],
    // (cb,h,dmg)->number          伤害乘区
    onHitDone: [],
    // (cb,h,dmg,info)             结算完成
    beforeCast: [],
    // (cb,c,skill)->false         拦截出招
    blackFlash: [],
    // (cb,h,dmg)->bool            黑闪判定（唯一实现）
    clash: [],
    // (combat2)->clash 实例       领域对决（唯一实现）
    move: [],
    // (cb,c,wish,dt,inp)          移动速度乘区
    locomotion: [],
    // (cb,c,info)->bool           移动动画状态机
    camFrame: []
    // (snap,{frac,pitch})->{frac?,pitch?,lookH?,fracMin?}|null
    //   取景覆盖：机位模块算完常规取景后交给机制模块改。
    //   用途：魔虚罗升到空中后，常规「俯视交战点」的机位只能看到地面往上 6.2m，
    //   空中的目标必然出画 —— 这里允许把机位拉远（frac 变小）并压低俯角（pitch 变小）。
  };
  /**
   * 机制模块的调试快照出口。
   * 模块在自己文件里写 MECH_DEBUG.<名字> = () => ({...})，独立验证的探针统一用
   * __SS.mech() 一次性读出四个机制的内部状态 —— 不需要读实现代码就能验。
   */
  var MECH_DEBUG = {};
  function onHook(name, fn) {
    if (!fn || !HOOKS[name]) return;
    HOOKS[name].push(fn);
  }
  /** 依次调用，返回「有没有任何一个返回了真值」 */
  function runHook(name, ...args) {
    const list = HOOKS[name];
    if (!list || !list.length) return false;
    let any = false;
    for (let i = 0; i < list.length; i++) {
      try {
        if (list[i].apply(null, args)) any = true;
      } catch (e) {
        console.warn("[hook] " + name + " 抛错:", e);
      }
    }
    return any;
  }
  /** 只调用第一个注册者（黑闪判定 / 领域对决工厂这种「唯一实现」用） */
  function firstHook(name, ...args) {
    const list = HOOKS[name];
    if (!list || !list.length) return void 0;
    try {
      return list[0].apply(null, args);
    } catch (e) {
      console.warn("[hook] " + name + " 抛错:", e);
      return void 0;
    }
  }
  /** 数值链：每个钩子拿到当前值，返回数字则替换（伤害乘区 / 移动乘区） */
  function gateHook(name, initial, ...args) {
    const list = HOOKS[name];
    if (!list || !list.length) return initial;
    let v = initial;
    for (let i = 0; i < list.length; i++) {
      try {
        const r = list[i].apply(null, args.concat([v]));
        if (typeof r === "number" && isFinite(r)) v = r;
      } catch (e) {
        console.warn("[hook] " + name + " 抛错:", e);
      }
    }
    return v;
  }
  function detectQuality() {
    const w = typeof window !== "undefined" && window.innerWidth || 1280;
    const mobile = /Mobi|Android|iPhone|iPad/i.test(navigator.userAgent || "");
    const mem = navigator.deviceMemory || 8;
    const cores = navigator.hardwareConcurrency || 4;
    if (mobile || w < 900 || cores <= 4 || mem <= 4) return "low";
    if (w < 1600 || cores <= 6) return "medium";
    return "high";
  }
