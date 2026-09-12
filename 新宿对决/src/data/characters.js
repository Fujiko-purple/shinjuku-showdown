/**
 * data/characters.js —— 招式帧数据表（铁律 3：加招 = 加一行数据）
 * ----------------------------------------------------------------------------
 * 帧数都是 60Hz 的帧。字段含义：
 *   startup  起手帧（这段时间有预警，可被对手读到）
 *   active   判定帧
 *   recovery 后摇（规则 11：≥0.5s = 30 帧，玩家必须能在这段时间里塞进一整段反击）
 *   reach    判定线段长度（从身体中心沿朝向）
 *   hitR     判定半径（线段 vs 胶囊）
 *   dmg      伤害（规则 12 的标定：轻击 ≈ 1.2% 目标血量）
 *   kb       击退距离
 *   hitstop  命中顿帧帧数（表现层用它，逻辑层只用来冻结）
 *   ce       命中时给攻击者的咒力
 *   def      这一招**能被哪些选项解**（规则 1：至少一种能打出 0 伤害）
 *   chain    连段后继（在后摇前半段内再次按轻击）
 */
var MOVE = {
  light1: { id: "light1", name: "打击", key: "light", startup: 5, active: 3, recovery: 14, reach: 3.4, hitR: 0.6, dmg: 22, kb: 0.5, hitstop: 4, ce: 3, def: ["parry", "dodge", "walk"], chain: "light2", chainFrom: 4 },
  light2: { id: "light2", name: "打击二段", key: "light", startup: 4, active: 3, recovery: 16, reach: 3.6, hitR: 0.6, dmg: 26, kb: 0.9, hitstop: 4, ce: 3, def: ["parry", "dodge", "walk"], chain: "light3", chainFrom: 4 },
  light3: { id: "light3", name: "打击三段", key: "light", startup: 6, active: 4, recovery: 30, reach: 3.8, hitR: 0.7, dmg: 44, kb: 3.0, hitstop: 7, ce: 8, def: ["parry", "dodge", "walk"] },
  heavy: { id: "heavy", name: "踢击", key: "heavy", startup: 12, active: 4, recovery: 32, reach: 4.2, hitR: 0.8, dmg: 96, kb: 5.0, hitstop: 9, ce: 5, def: ["parry", "dodge", "walk"] },
  /** 防御动词 1：无下限·招架。窗口内被命中 = 零伤害 + 反打 */
  parry: { id: "parry", name: "无下限·招架", key: "parry", startup: 0, active: 11, recovery: 16, reach: 0, hitR: 0, dmg: 0, kb: 0, hitstop: 0, ce: 0, def: [], window: 11, failStun: 22, reward: { ce: 12, counter: 24, foeStun: 30 } },
  /** 防御动词 2：闪避（位移 + 无敌帧） */
  dodge: { id: "dodge", name: "闪避", key: "dodge", startup: 0, active: 0, recovery: 18, reach: 0, hitR: 0, dmg: 0, kb: 0, hitstop: 0, ce: 0, def: [], iframes: 12, dist: 4.2 }
};

var CHARACTERS = {
  gojo: {
    id: "gojo",
    name: "五条悟",
    title: "现代最强",
    color: 0x5ff0ff,
    hpMax: 1500,
    ceMax: 100,
    speed: 4.8,
    runSpeed: 7.2,
    dodgeSpeed: 12,
    moves: MOVE,
    combo: ["light1", "light2", "light3"]
  },
  sukuna: {
    id: "sukuna",
    name: "两面宿傩",
    title: "史上最强",
    color: 0xff1f3d,
    hpMax: 1800,
    ceMax: 100,
    speed: 4.6,
    runSpeed: 6.6,
    dodgeSpeed: 11,
    moves: MOVE,
    combo: ["light1", "light2", "light3"]
  }
};
