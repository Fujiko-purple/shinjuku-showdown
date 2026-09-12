/**
 * data/characters.js —— 两个角色的数值与招式集
 * ----------------------------------------------------------------------------
 * 规则 12 的伤害标定基准：
 *   轻击 22 / 26 / 44 → 对 1800 血 = 1.2% / 1.4% / 2.4%（符合"轻击 1~1.5%"）
 *   大招（茈 300 / 開 150）对 1500 血 = 20% / 10%；处决 = 12% 最大血
 */
var CHARACTERS = {
  gojo: {
    id: "gojo",
    name: "五条悟",
    title: "现代最强",
    color: 0x5ff0ff,
    accent: 0x2b86ff,
    hpMax: 1500,
    ceMax: 100,
    ceRegen: 6,
    poiseMax: 95,
    speed: 4.9,
    runSpeed: 7.4,
    dodgeSpeed: 13,
    combo: COMBO,
    /** HUD 技能栏 */
    bar: [
      { move: "blue", label: "蒼", sub: "U" },
      { move: "red", label: "赫", sub: "I" },
      { move: "purple", label: "茈", sub: "O" },
      { move: "reverse", label: "反转", sub: "H" },
      { move: "void", label: "领域", sub: "G" }
    ]
  },
  sukuna: {
    id: "sukuna",
    name: "两面宿傩",
    title: "史上最强",
    color: 0xff1f3d,
    accent: 0xffc36a,
    hpMax: 1800,
    ceMax: 100,
    ceRegen: 6,
    poiseMax: 120,
    speed: 4.7,
    runSpeed: 6.9,
    dodgeSpeed: 12,
    combo: COMBO,
    bar: [
      { move: "dismantle", label: "解", sub: "U" },
      { move: "cleave", label: "捌", sub: "I" },
      { move: "furnace", label: "開", sub: "O" },
      { move: "rush", label: "突进", sub: "H" },
      { move: "shrine", label: "领域", sub: "G" }
    ]
  }
};
