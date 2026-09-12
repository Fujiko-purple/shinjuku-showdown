/**
 * data/moves.js —— 全招式帧数据表
 * ----------------------------------------------------------------------------
 * 铁律 3：加招 = 加一行数据。sim 里不许出现 "if (move === 'red')" 这种分支，
 * 所有差异都靠这里的字段表达，sim 只负责解释字段。
 *
 * 帧数 = 60Hz 帧。字段：
 *   kind      melee | projectile | defense | buff | domain
 *   startup   起手帧（有预警，对手可读）
 *   active    判定帧
 *   recovery  后摇（规则 11：进攻招 >=30 帧，玩家必须能塞进一整段反击）
 *   dmg       伤害（规则 12 标定：轻击 = 目标最大血 1~1.5%）
 *   ce        咒力消耗 / ceGain 命中时给攻击者的咒力
 *   def       对手**可以怎么解**这一招（规则 1：至少一种零伤害解）
 *   armor     霸体（规则 7：霸体招占比 <=30%）
 *   unblockable 不可格挡（规则 2：必须 >=0.8s 起手）
 */
var MOVES = {
  /* ---------------- 双方共用的体术 ---------------- */
  light1: { id: "light1", name: "打击", key: "light", kind: "melee", startup: 5, active: 3, recovery: 14, reach: 3.4, hitR: 0.6, dmg: 22, kb: 0.5, hitstop: 4, ce: 0, ceGain: 3, poise: 16, def: ["parry", "dodge", "walk"], chain: "light2", chainFrom: 4 },
  light2: { id: "light2", name: "打击二段", key: "light", kind: "melee", startup: 4, active: 3, recovery: 16, reach: 3.6, hitR: 0.6, dmg: 26, kb: 0.9, hitstop: 4, ce: 0, ceGain: 3, poise: 18, def: ["parry", "dodge", "walk"], chain: "light3", chainFrom: 4 },
  light3: { id: "light3", name: "打击三段", key: "light", kind: "melee", startup: 6, active: 4, recovery: 30, reach: 3.8, hitR: 0.7, dmg: 44, kb: 1.8, hitstop: 7, ce: 0, ceGain: 8, poise: 34, def: ["parry", "dodge", "walk"] },
  heavy: { id: "heavy", name: "踢击", key: "heavy", kind: "melee", startup: 12, active: 4, recovery: 32, reach: 4.2, hitR: 0.8, dmg: 96, kb: 5.0, hitstop: 9, ce: 0, ceGain: 5, poise: 55, def: ["parry", "dodge", "walk"] },

  /* ---------------- 防御动作（三个动词，代价互不相同 —— 规则 3） ---------------- */
  /** 招架：窗口极短、失败要挨打，但成功零伤害 + 返资源 + 开反击窗口（规则 4） */
  parry: { id: "parry", name: "无下限·招架", key: "parry", kind: "defense", startup: 0, active: 11, recovery: 16, window: 11, failStun: 20, reward: { ce: 12, counter: 24, foeStun: 30, poise: 18 }, def: [], dmg: 0 },
  /** 闪避：位移 + 无敌帧，但后摇要还回来 */
  dodge: { id: "dodge", name: "闪避", key: "dodge", kind: "defense", startup: 0, active: 0, recovery: 18, iframes: 12, dist: 4.2, def: [], dmg: 0 },
  /** 无下限展开：长按空格；减速并吞掉飞来的术式，持续烧咒力 */
  infinity: { id: "infinity", name: "无下限", key: "parry", kind: "defense", startup: 3, active: 1, recovery: 14, fieldR: 6.2, drain: 14, blockProj: true, slow: 0.35, def: [], dmg: 0 },

  /* ---------------- 五条悟 ---------------- */
  blue: { id: "blue", name: "术式顺转·蒼", key: "blue", kind: "projectile", startup: 12, active: 1, recovery: 22, ce: 22, cd: 300, dmg: 0, pull: 9, proj: { speed: 26, life: 1.4, radius: 2.6, dmg: 0, pull: 9, homing: 0.05, color: 0x2b86ff }, def: ["dodge", "walk"], tags: ["術式"] },
  red: { id: "red", name: "术式反转·赫", key: "red", kind: "projectile", startup: 26, active: 1, recovery: 30, ce: 34, cd: 420, dmg: 165, kb: 8, hitstop: 8, ceGain: 4, poise: 45, guardBreak: true, proj: { speed: 24, life: 1.5, radius: 2.2, dmg: 165, kb: 8, color: 0xff1f3d }, def: ["parry", "dodge"], tags: ["術式"] },
  purple: { id: "purple", name: "虚式·茈", key: "purple", kind: "projectile", startup: 48, active: 1, recovery: 46, ce: 60, cd: 720, charge: true, chargeMax: 60, dmg: 300, unblockable: true, poise: 90, proj: { speed: 34, life: 1.6, radius: 3.0, dmg: 300, pierce: true, color: 0xb04cff }, def: ["dodge", "walk"], tags: ["術式"] },
  reverse: { id: "reverse", name: "反转术式", key: "heal", kind: "buff", startup: 54, active: 1, recovery: 24, ce: 45, cd: 900, heal: 180, def: [], tags: ["治療"] },
  void: { id: "void", name: "领域展开·无量空处", key: "domain", kind: "domain", startup: 54, active: 1, recovery: 30, ce: 0, domain: "void", def: [], tags: ["領域"] },

  /* ---------------- 两面宿傩 ---------------- */
  dismantle: { id: "dismantle", name: "解", key: "blue", kind: "projectile", startup: 24, active: 1, recovery: 26, ce: 12, cd: 300, dmg: 58, kb: 3, hitstop: 5, ceGain: 3, poise: 18, proj: { speed: 40, life: 0.9, radius: 1.5, dmg: 58, kb: 3, color: 0xff6a52 }, def: ["dodge", "walk", "parry"], tags: ["斬撃"] },
  cleave: { id: "cleave", name: "捌", key: "red", kind: "melee", startup: 22, active: 5, recovery: 30, reach: 4.4, hitR: 1.0, dmg: 96, kb: 4, hitstop: 8, ce: 16, cd: 300, ceGain: 3, poise: 40, armor: true, def: ["parry", "dodge"], tags: ["斬撃"] },
  furnace: { id: "furnace", name: "開·竈", key: "purple", kind: "projectile", startup: 48, active: 1, recovery: 40, ce: 30, cd: 660, dmg: 150, kb: 6, unblockable: true, poise: 60, proj: { speed: 30, life: 1.8, radius: 3.2, dmg: 150, kb: 6, aoe: 6.5, color: 0xff8a3d }, def: ["dodge", "walk"], tags: ["火焰"] },
  rush: { id: "rush", name: "突进", key: "heal", kind: "buff", startup: 18, active: 1, recovery: 20, ce: 10, cd: 360, dash: 9.5, dmg: 0, def: ["dodge"], tags: ["体術"] },
  shrine: { id: "shrine", name: "领域展开·伏魔御厨子", key: "domain", kind: "domain", startup: 54, active: 1, recovery: 30, ce: 0, domain: "shrine", def: [], tags: ["領域"] }
};

/** 三连段的顺序（双方一样） */
var COMBO = ["light1", "light2", "light3"];
