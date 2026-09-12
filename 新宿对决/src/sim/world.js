/**
 * sim/world.js —— 固定帧战斗世界（纯逻辑，不碰 three.js / DOM / 音频）
 * ----------------------------------------------------------------------------
 * 铁律 1+2+5。所有机制都在这一层，view 只订阅事件。
 * 帧序（顺序很重要，改之前先想清楚"谁先动"）：
 *   ① 输入/AI → ② 双方推进（计时器/动作/移动） → ③ 近战判定（同时结算，无帧序偏袒）
 *   → ④ 弹道 → ⑤ 领域 → ⑥ 魔虚罗 → ⑦ 架势崩坏 → ⑧ 资源 → ⑨ 胜负
 */
function createWorld(opts) {
  opts = opts || {};
  var rng = RNG.make(opts.seed || 20260913);
  var events = createEvents();
  var control = ["human", "human"];
  var frame = 0, freeze = 0, matchOver = null;
  var fighters = [], projectiles = [], domains = [], maho = null;
  var tmp = { ax: 0, az: 0, bx: 0, bz: 0 };
  var nextProjId = 1;

  function mkFighter(charId, side, x, facing) {
    var c = CHARACTERS[charId];
    return {
      id: c.id, side: side, char: c,
      x: x, z: 0, facing: facing,
      hp: c.hpMax, hpMax: c.hpMax, ce: Math.round(c.ceMax * 0.5), ceMax: c.ceMax,
      poise: c.poiseMax, poiseMax: c.poiseMax, poiseTimer: 0, broken: 0,
      action: null, hitstun: 0, iframes: 0, counter: 0, frozen: 0,
      zoneT: 0, bfReady: 0, bfPressAt: -999, bfCount: 0,
      gauge: 0, domainT: 0, domainKind: null, domainCd: 0,
      cds: {}, combo: 0, comboWindow: 0, lastHurtFrame: -9999, dealt: 0,
      ai: { t: 0, cd: 60, last: null, hist: [], panic: 0 },
      _prev: null, _aiEdge: null
    };
  }
  function foeOf(f) { return f.side === 0 ? fighters[1] : fighters[0]; }

  /** reset 必须连随机种子一起重置，否则"同样输入两遍"不可能一致（探针 A2） */
  function reset(seed, c1, c2) {
    rng = RNG.make(seed === undefined ? (opts.seed || 20260913) : seed);
    fighters = [
      mkFighter(c1 || opts.p1 || "gojo", 0, -5, Math.PI / 2),
      mkFighter(c2 || opts.p2 || "sukuna", 1, 5, -Math.PI / 2)
    ];
    projectiles = []; domains = []; maho = null;
    frame = 0; freeze = 0; matchOver = null; nextProjId = 1;
    events.clear();
  }
  reset();

  /* ============================ 出招 ============================ */
  function canAct(f, mv) {
    /** 领域展开无视"行动不能"：伏魔御厨子是开放领域，从外面起（原作的结构性优势） */
    if (mv && mv.kind === "domain") {
      if (matchOver || f.hitstun > 0 || f.broken > 0) return false;
      return !f.action || f.action.phase === "recovery";
    }
    if (matchOver || f.frozen > 0) return false;
    if (f.hitstun > 0 || f.broken > 0) return false;
    if (!f.action) return true;
    var mv = f.action.move;
    return !!(mv.chain && f.action.phase === "recovery" && f.action.t <= mv.chainFrom);
  }
  function ready(f, mv) {
    if ((f.cds[mv.id] || 0) > 0) return false;
    if ((mv.ce || 0) > f.ce) return false;
    if (mv.kind === "domain" && (f.gauge < 100 || f.domainCd > 0 || f.domainT > 0)) return false;
    if (mv.charge && f.action && f.action.move === mv) return true;   // 蓄力中
    return true;
  }
  function startAction(f, mv, opt) {
    var zoneCost = f.zoneT > 0 ? 0.7 : 1;
    if ((mv.ce || 0) > 0) f.ce = Math.max(0, f.ce - mv.ce * zoneCost);
    if (mv.cd) f.cds[mv.id] = mv.cd;
    f.action = {
      move: mv, t: 0, hitLanded: false, charge: 0,
      phase: mv.startup > 0 ? "startup" : (mv.active > 0 ? "active" : "recovery")
    };
    events.push("start", { id: f.id, move: mv.id, startup: mv.startup, name: mv.name });
    /** 位移类起手：突进 / 闪避 立刻给位移 */
    if (mv.dash) { var fx = Math.sin(f.facing), fz = Math.cos(f.facing); f.x += fx * mv.dash; f.z += fz * mv.dash; f.iframes = Math.max(f.iframes, 10); }
    if (mv.id === "dodge") {
      f.iframes = mv.iframes;
      var bx = -Math.sin(f.facing), bz = -Math.cos(f.facing);
      var wantBack = opt && opt.back;
      f.x += (wantBack ? bx : -bx) * mv.dist * 0.55;
      f.z += (wantBack ? bz : -bz) * mv.dist * 0.55;
    }
    return f.action;
  }
  function pickMove(f, inp, pressed) {
    // 领域 / 术式 优先级最高，其次是防御，最后是体术
    if (pressed.domain && ready(f, MOVES[f.char.bar[4].move])) return MOVES[f.char.bar[4].move];
    var bar = f.char.bar;
    if (pressed.heal && ready(f, MOVES[bar[3].move])) return MOVES[bar[3].move];
    if (pressed.purple && ready(f, MOVES[bar[2].move])) {
      var pm = MOVES[bar[2].move];
      // 蓄力招：按住不放 → 进蓄力；松手才发射（由 tickAction 处理）
      if (!(f.action && f.action.move === pm)) return pm;
    }
    if (pressed.red && ready(f, MOVES[bar[1].move])) return MOVES[bar[1].move];
    if (pressed.blue && ready(f, MOVES[bar[0].move])) return MOVES[bar[0].move];
    if (pressed.parry) return MOVES.parry;
    if (pressed.dodge) return MOVES.dodge;
    if (pressed.heavy) return MOVES.heavy;
    if (pressed.light) {
      if (f.action && f.action.phase === "recovery" && f.action.move.chain) return MOVES[f.action.move.chain];
      if (!f.action) return MOVES.light1;
    }
    return null;
  }

  /* ============================ 命中结算 ============================ */
  function isParryActive(f) {
    return !!(f.action && f.action.move.kind === "defense" && f.action.move.id === "parry" && f.action.phase === "active");
  }
  function hasInfinity(f) {
    return !!(f.action && f.action.move.id === "infinity" && f.action.phase === "active");
  }
  /** 伤害入口：所有伤害都必须走这里，规则 1/2/4/12 都在这一处生效 */
  function landHit(att, def, mv, hitX, hitZ) {
    if (matchOver) return false;
    var px = hitX === undefined ? def.x : hitX;
    var pz = hitZ === undefined ? def.z : hitZ;
    /** ① 招架：零伤害 + 返资源 + 开反击窗口（规则 4） */
    if (!mv.unblockable && isParryActive(def)) {
      var rw = MOVES.parry.reward;
      def.ce = Math.min(def.ceMax, def.ce + rw.ce);
      def.counter = rw.counter;
      def.zoneT = Math.max(def.zoneT, 60);
      att.hitstun = rw.foeStun;
      att.action = null;
      att.poise = Math.max(0, att.poise - rw.poise);
      freeze = Math.max(freeze, 7);
      events.push("parry", { by: def.id, attacker: att.id, ce: def.ce, counter: def.counter, foeStun: att.hitstun, x: px, z: pz });
      return true;
    }
    /** ② 无下限展开：近战被挡下（零伤害），但烧防御方咒力 */
    if (mv.kind === "melee" && hasInfinity(def)) {
      def.ce = Math.max(0, def.ce - 8);
      att.hitstun = 10;
      events.push("blocked", { by: def.id, attacker: att.id, x: px, z: pz });
      freeze = Math.max(freeze, 4);
      return true;
    }
    /** ③ 无敌帧 */
    if (def.iframes > 0) {
      events.push("dodged", { by: def.id, attacker: att.id, x: px, z: pz });
      return false;
    }
    /** ④ 真伤害 */
    var mul = 1;
    if (att.zoneT > 0) mul *= 1.15;
    var bf = false;
    if (mv.kind === "melee" && att.side === 0 && Math.abs(frame - att.bfPressAt) <= 3 && att.bfReady <= 0) {
      bf = true; mul *= 2.5; att.bfReady = 300; att.zoneT = 600; att.bfCount++;
      events.push("blackflash", { by: att.id, x: px, z: pz });
      freeze = Math.max(freeze, 12);
    }
    var raw2 = mv.dmg * mul;
    if (att.side === 1) raw2 *= (opts.aiDmg || 1);      // 难度档只影响 AI 打出的伤害
    var dmg = Math.round(raw2);
    /**
     * 领域展开是"结印"动作：起手之后不吃硬直、不被打断（原作的领域展开也是霸体演出）。
     * 没有这一条，无量空处一开对手就永远开不出自己的领域 → 领域对拼机制直接死掉。
     */
    var steadfast = !!(def.action && def.action.move.kind === "domain");
    /** 记下"最近一次命中"：命中之后再按 V 也能补判黑闪（±3 帧是双向的） */
    att.lastHit = { frame: frame, dmg: dmg, victim: def, move: mv.id };
    if (steadfast) {
      events.push("hit", { by: att.id, on: def.id, move: mv.id, name: mv.name, dmg: dmg, hp: def.hp, combo: att.combo || 1, heavy: false, x: px, z: pz });
      return true;
    }
    def.hp = Math.max(0, def.hp - dmg);
    def.lastHurtFrame = frame;
    def.poise = Math.max(0, def.poise - (mv.poise || 6) * (bf ? 1.6 : 1));
    def.poiseTimer = 150;
    def.hitstun = Math.max(def.hitstun, mv.dmg >= 90 ? 30 : 15);
    def.action = null;
    att.ce = Math.min(att.ceMax, att.ce + (mv.ceGain || 0));
    att.gauge = Math.min(100, att.gauge + 2);
    def.gauge = Math.min(100, def.gauge + 3);
    att.dealt += dmg;
    if (mv.kb) { var kx = def.x - att.x, kz = def.z - att.z, kl = Math.hypot(kx, kz) || 1; def.x += kx / kl * mv.kb; def.z += kz / kl * mv.kb; }
    freeze = Math.max(freeze, mv.hitstop || 4);
    if (att.comboWindow > 0) att.combo++; else att.combo = 1;
    att.comboWindow = 54;
    events.push("hit", { by: att.id, on: def.id, move: mv.id, name: mv.name, dmg: dmg, hp: def.hp, combo: att.combo, heavy: mv.dmg >= 90, bf: bf, x: px, z: pz });
    if (def.hp <= 0) { matchOver = att.id; events.push("ko", { loser: def.id, winner: att.id }); }
    return true;
  }

  /** 处决：对手"架势崩坏"时按重击 → 12% 最大血 */
  function tryExecute(f) {
    var foe = foeOf(f);
    if (foe.broken <= 0) return false;
    if (dist(f, foe) > 4.6) return false;
    var dmg = Math.round(foe.hpMax * 0.12);
    foe.hp = Math.max(0, foe.hp - dmg);
    foe.broken = 0; foe.poise = foe.poiseMax * 0.7; foe.hitstun = 30;
    f.gauge = Math.min(100, f.gauge + 10);
    freeze = Math.max(freeze, 16);
    events.push("execute", { by: f.id, on: foe.id, dmg: dmg, hp: foe.hp, x: foe.x, z: foe.z });
    if (foe.hp <= 0) { matchOver = f.id; events.push("ko", { loser: foe.id, winner: f.id }); }
    return true;
  }

  /* ============================ 近战判定 ============================ */
  function resolveMelee(f) {
    var a = f.action;
    if (!a || a.phase !== "active" || a.hitLanded) return;
    var mv = a.move;
    if (mv.kind !== "melee") return;
    var foe = foeOf(f);
    if (sweepHits(f, mv, foe, tmp)) {
      a.hitLanded = true;
      landHit(f, foe, mv, (f.x + foe.x) / 2, (f.z + foe.z) / 2);
    }
  }

  /* ============================ 动作推进 ============================ */
  function tickAction(f, inp, pressed) {
    var a = f.action;
    if (!a) return;
    var mv = a.move;
    a.t++;
    if (mv.charge && a.phase === "startup") {
      // 蓄力：按住不放就继续攒（上限 chargeMax），松手或攒满 → 发射
      var held = !!inp[mv.key];
      a.charge = Math.min(mv.chargeMax, a.charge + (held ? 1 : 0));
      var power = 0.6 + 0.4 * (a.charge / mv.chargeMax);
      a.power = power;
      if (!held || a.charge >= mv.chargeMax) { a.phase = "active"; a.t = 0; }
      return;
    }
    if (a.phase === "startup" && a.t >= mv.startup) { a.phase = mv.active > 0 ? "active" : "recovery"; a.t = 0; }
    else if (a.phase === "active" && a.t >= mv.active) { a.phase = "recovery"; a.t = 0; }
    else if (a.phase === "recovery" && a.t >= mv.recovery) { f.action = null; return; }

    if (!f.action) return;
    a = f.action; mv = a.move;
    /** 判定帧：远程/领域/治疗在进入 active 的那一帧结算 */
    if (a.phase === "active" && !a.hitLanded) {
      if (mv.kind === "projectile") { a.hitLanded = true; spawnProjectile(f, mv, a.power || 1); }
      else if (mv.kind === "buff") {
        a.hitLanded = true;
        if (mv.heal) { f.hp = Math.min(f.hpMax, f.hp + mv.heal); events.push("heal", { id: f.id, amount: mv.heal, hp: f.hp }); }
        if (mv.dash) { events.push("rush", { id: f.id }); }
      } else if (mv.kind === "domain") { a.hitLanded = true; openDomain(f, mv.domain); }
    }
  }

  /* ============================ 弹道 ============================ */
  function spawnProjectile(f, mv, power) {
    var pr = mv.proj || {};
    var fx = Math.sin(f.facing), fz = Math.cos(f.facing);
    var dmg = Math.round((pr.dmg || mv.dmg || 0) * power);
    projectiles.push({
      id: nextProjId++, owner: f.id, side: f.side, move: mv.id, name: mv.name,
      x: f.x + fx * 0.7, z: f.z + fz * 0.7, y: 1.15,
      vx: fx * pr.speed, vz: fz * pr.speed,
      life: pr.life, radius: pr.radius || 1.2, dmg: dmg,
      kb: pr.kb || 0, poise: mv.poise || 10, color: pr.color || 0xffffff,
      pierce: !!pr.pierce, aoe: pr.aoe || 0, pull: pr.pull || 0, homing: pr.homing || 0,
      unblockable: !!mv.unblockable, kind: mv.kind, chargePower: power
    });
    events.push("cast", { id: f.id, move: mv.id, name: mv.name, x: f.x, z: f.z, color: pr.color });
  }
  function tickProjectiles() {
    for (var i = projectiles.length - 1; i >= 0; i--) {
      var p = projectiles[i];
      var owner = p.side === 0 ? fighters[0] : fighters[1];
      var foe = p.side === 0 ? fighters[1] : fighters[0];
      if (p.homing) {
        var dx = foe.x - p.x, dz = foe.z - p.z, dl = Math.hypot(dx, dz) || 1;
        p.vx += (dx / dl * 20 - p.vx) * p.homing; p.vz += (dz / dl * 20 - p.vz) * p.homing;
      }
      p.x += p.vx * FIXED_DT; p.z += p.vz * FIXED_DT; p.life -= FIXED_DT;
      // 无下限展开：吞掉飞进来的术式
      if (hasInfinity(foe)) {
        var fd = Math.hypot(p.x - foe.x, p.z - foe.z);
        if (fd < MOVES.infinity.fieldR) {
          foe.ce = Math.max(0, foe.ce - 6);
          events.push("absorb", { by: foe.id, move: p.move, x: p.x, z: p.z });
          projectiles.splice(i, 1); continue;
        }
      }
      // 命中
      var d = Math.hypot(p.x - foe.x, p.z - foe.z);
      if (d < p.radius + 0.5) {
        landHit(owner, foe, { dmg: p.dmg, kb: p.kb, poise: p.poise, kind: "projectile", unblockable: p.unblockable, ceGain: 3, hitstop: 6, id: p.move, name: p.name }, p.x, p.z);
        if (p.aoe) events.push("explode", { x: p.x, z: p.z, radius: p.aoe, color: p.color });
        if (!p.pierce) { projectiles.splice(i, 1); continue; }
      }
      if (p.life <= 0 || Math.abs(p.x) > 44 || Math.abs(p.z) > 44) { projectiles.splice(i, 1); continue; }
    }
  }

  /* ============================ 领域 ============================ */
  function openDomain(f, kind) {
    var other = domains.filter(function (d) { return d.owner !== f.id; })[0];
    var d = { owner: f.id, side: f.side, kind: kind, t: 0, life: 8 * 60, radius: kind === "void" ? 9 : 22, anchors: [], broken: false };
    if (kind === "shrine") {
      for (var k = 0; k < 3; k++) {
        var ang = Math.PI * 2 * k / 3 + 0.5;
        d.anchors.push({ x: f.x + Math.cos(ang) * 18, z: f.z + Math.sin(ang) * 18, hp: 120, alive: true });
      }
    }
    f.gauge = 0; f.domainT = d.life; f.domainKind = kind;
    if (other) {
      /**
       * 领域对拼的胜负规则（按原作的结构性优势）：
       *   开放领域（伏魔御厨子）> 封闭领域（无量空处）—— 封闭领域的外壳会被从外面啃碎；
       *   两次都是同类型时，后开的占优（抢时机）。
       * 五条的应对不是硬拼，而是**跑到外沿打掉 3 个锚点**（见下面 shrine 的分支）。
       */
      var voidIsOther = other.kind === "void";
      var voidIsNew = kind === "void";
      /** 两个都不是封闭领域 → 后开者赢；只要有一方是封闭领域 → 封闭的那一方被压碎 */
      var breakOther = !(voidIsNew && !voidIsOther);
      if (breakOther) other.broken = true; else d.broken = true;
      var losingDom = breakOther ? other : d;
      var openWins = (voidIsOther && !voidIsNew);
      var loser = losingDom.side === 0 ? fighters[0] : fighters[1];
      loser.domainT = 0; loser.domainKind = null; loser.domainCd = 6 * 60;
      loser.hp = Math.max(0, loser.hp - 60);
      events.push("domainclash", { winner: f.id, loser: loser.id, openWins: openWins, winnerKind: kind });
      events.push("domainbroken", { id: loser.id, hp: loser.hp });
      if (loser.hp <= 0) { matchOver = f.id; events.push("ko", { loser: loser.id, winner: f.id }); }
    }
    domains.push(d);
    events.push("domain", { id: f.id, kind: kind, x: f.x, z: f.z, radius: d.radius, anchors: d.anchors.length });
  }
  function tickDomains() {
    for (var i = domains.length - 1; i >= 0; i--) {
      var d = domains[i];
      d.t++;
      var owner = d.side === 0 ? fighters[0] : fighters[1];
      var foe = d.side === 0 ? fighters[1] : fighters[0];
      if (d.kind === "void") {
        var inside = Math.hypot(foe.x - owner.x, foe.z - owner.z) < d.radius;
        if (inside && !foe.hitstun) { foe.frozen = 2; if (d.t % 60 === 0) landHit(owner, foe, { dmg: 18, poise: 4, ceGain: 0, hitstop: 2, id: "void", name: "无量空处", kind: "domain" }, foe.x, foe.z); }
      } else {
        // 伏魔御厨子：开放领域，每 1s 落一刀，从外部打破 3 个锚点即可提前解除
        if (d.t % 60 === 0) landHit(owner, foe, { dmg: 55, poise: 8, ceGain: 0, hitstop: 3, id: "shrine", name: "伏魔御厨子", kind: "domain" }, foe.x, foe.z);
        for (var k = 0; k < d.anchors.length; k++) {
          var an = d.anchors[k];
          if (!an.alive) continue;
          for (var pi = projectiles.length - 1; pi >= 0; pi--) {
            var p = projectiles[pi];
            if (p.side === d.side) continue;
            if (Math.hypot(p.x - an.x, p.z - an.z) < 3.2) { an.hp -= p.dmg; projectiles.splice(pi, 1); events.push("anchor", { x: an.x, z: an.z, hp: an.hp }); }
          }
          if (an.hp <= 0) { an.alive = false; events.push("anchordown", { x: an.x, z: an.z }); }
        }
        if (d.anchors.every(function (a) { return !a.alive; })) {
          d.broken = true;
          owner.domainT = 0; owner.domainKind = null; owner.domainCd = 6 * 60;
          owner.hp = Math.max(0, owner.hp - 120);
          owner.ce = 0;
          events.push("domainbroken", { id: owner.id, hp: owner.hp, byAnchors: true });
          if (owner.hp <= 0) { matchOver = foe.id; events.push("ko", { loser: owner.id, winner: foe.id }); }
        }
      }
      owner.domainT = Math.max(0, owner.domainT - 1);
      if (d.t >= d.life || d.broken || owner.domainT <= 0) {
        owner.domainT = 0; owner.domainKind = null; owner.domainCd = 6 * 60;
        domains.splice(i, 1);
        events.push("domainend", { id: owner.id, broken: !!d.broken });
      }
    }
  }

  /* ============================ 魔虚罗（无血条：适应进度） ============================ */
  function summonMahoraga() {
    var sk = fighters[1];
    maho = {
      alive: true, x: sk.x + 6, z: sk.z - 4, y: 4.5, t: 0,
      state: "air", cd: 180, adapt: { melee: 0, skill: 0 }, interrupts: 0,
      weakT: 0, adaptT: 0, dead: false, hp: 999
    };
    events.push("summon", { x: maho.x, z: maho.z });
  }
  function tickMahoraga() {
    if (!maho) {
      if (fighters[1].hp / fighters[1].hpMax <= 0.5 && !fighters[1].deadFlag) { fighters[1].deadFlag = true; summonMahoraga(); }
      return;
    }
    if (!maho.alive) return;
    maho.t++;
    var pl = fighters[0];
    if (maho.state === "summon") {
      maho.y -= 3.2 * FIXED_DT;
      if (maho.y <= 4.5) { maho.y = 4.5; maho.state = "air"; maho.cd = 120; }
      return;
    }
    if (maho.state === "adapting") {
      maho.adaptT++;
      if (maho.adaptT >= 90) { maho.state = "air"; maho.adapt.melee = Math.min(1, maho.adapt.melee + 0.34); maho.adapt.skill = Math.min(1, maho.adapt.skill + 0.34); events.push("adaptdone", { melee: maho.adapt.melee }); }
      return;
    }
    if (maho.state === "dive") {
      maho.t2 = (maho.t2 || 0) + 1;
      maho.y = Math.max(0.4, maho.y - 14 * FIXED_DT);
      if (maho.y <= 0.45) { maho.state = "down"; maho.weakT = 96; maho.t2 = 0; events.push("mahodive", { x: maho.x, z: maho.z }); }
      return;
    }
    if (maho.state === "down") {
      maho.weakT--;
      if (maho.weakT <= 0) { maho.state = "air"; maho.y = 4.5; maho.cd = 150; }
      return;
    }
    // 空中：慢慢挪向玩家，定期出手（出手前有 0.8s 预警）
    var dx = pl.x - maho.x, dz = pl.z - maho.z, dl = Math.hypot(dx, dz) || 1;
    maho.x += dx / dl * 2.4 * FIXED_DT; maho.z += dz / dl * 2.4 * FIXED_DT;
    maho.cd--;
    if (maho.cd <= 0) {
      var r = rng.next();
      if (r < 0.45) { maho.state = "dive"; maho.t2 = 0; events.push("mahowindup", { kind: "dive", x: maho.x, z: maho.z, w: 48 }); maho.cd = 240; }
      else if (r < 0.75) { maho.state = "adapting"; maho.adaptT = 0; events.push("mahowindup", { kind: "adapt", x: maho.x, z: maho.z, w: 90 }); maho.cd = 300; }
      else { events.push("mahobolt", { x: maho.x, z: maho.z }); maho.cd = 180;
        if (Math.hypot(pl.x - maho.x, pl.z - maho.z) < 5) landHit(fighters[1], pl, { dmg: 60, poise: 20, kb: 3, hitstop: 6, id: "maho_bolt", name: "落雷", kind: "projectile", unblockable: false, ceGain: 0 }, pl.x, pl.z);
      }
    }
  }
  /** 玩家打魔虚罗：按"类型"积累适应，满了就免疫那一类 */
  function damageMahoraga(att, mv, kind) {
    if (!maho || !maho.alive) return false;
    var cat = kind === "melee" ? "melee" : "skill";
    if (maho.adapt[cat] >= 1) { events.push("mahoimmune", { cat: cat, x: maho.x, z: maho.z }); return true; }
    if (mv.id === "purple") {   // 原作：它就是被最大出力的茈一击拆掉的
      maho.alive = false;
      events.push("mahodead", { x: maho.x, z: maho.z });
      att.gauge = Math.min(100, att.gauge + 30);
      freeze = Math.max(freeze, 20);
      return true;
    }
    maho.adapt[cat] = Math.min(1, maho.adapt[cat] + (cat === "melee" ? 0.14 : 0.24));
    if (maho.state === "adapting") {
      maho.interrupts++;
      maho.state = "air"; maho.y = 4.5; maho.cd = 200;
      maho.adapt.melee = Math.max(0, maho.adapt.melee - 0.3);
      maho.adapt.skill = Math.max(0, maho.adapt.skill - 0.3);
      att.ce = Math.min(att.ceMax, att.ce + 30);
      events.push("mahoint", { x: maho.x, z: maho.z, interrupts: maho.interrupts });
      freeze = Math.max(freeze, 10);
      if (maho.interrupts >= 2) { maho.alive = false; events.push("mahodead", { x: maho.x, z: maho.z }); att.gauge = Math.min(100, att.gauge + 30); }
    }
    return true;
  }

  /* ============================ 一帧 ============================ */
  /** 黑闪的按下处理（提前按 / 命中后补按都走这里） */
  function onVPress(f) {
    f.bfPressAt = frame;
    if (f.bfReady > 0 || !f.lastHit) return;
    var dt2 = frame - f.lastHit.frame;
    if (dt2 <= 0 || dt2 > 3) return;
    if (!f.lastHit.victim || f.lastHit.victim.hp <= 0) return;
    var bonus = Math.round(f.lastHit.dmg * 1.5);
    f.lastHit.victim.hp = Math.max(0, f.lastHit.victim.hp - bonus);
    f.bfReady = 300; f.zoneT = 600; f.bfCount++;
    freeze = Math.max(freeze, 12);
    events.push("blackflash", { by: f.id, x: f.lastHit.victim.x, z: f.lastHit.victim.z, bonus: bonus, late: true });
    if (f.lastHit.victim.hp <= 0) { matchOver = f.id; events.push("ko", { loser: f.lastHit.victim.id, winner: f.id }); }
  }

  function step(in1, in2) {
    frame++;
    /**
     * ⚠ 顿帧期间必须继续采样输入。
     * 命中会冻结 4~12 帧，而黑闪窗口是"命中帧 ±3"——不采样的话玩家在顿帧里按的 V
     * 会被整段丢掉（探针 A8 第一次就是这么挂的，而且是真实可玩的 bug）。
     */
    var rawIn = [in1, in2];
    for (var fi = 0; fi < 2; fi++) {
      var fr = fighters[fi];
      var r2 = rawIn[fi];
      if (r2 === null || r2 === undefined || control[fi] === "ai") continue;
      var ni = normalizeInput(r2);
      /**
       * ⚠ 这里**不能**写 fr._prev：tickFighter 靠 _prev 算"按下边沿"，
       * 提前覆盖会把边沿吃掉 —— 结果就是所有攻击都发不出来（踩过一次，全套探针挂了 10 条）。
       * 黑闪只用一个独立的 _latchPrev 记"上一帧采样值"。
       */
      var lp = fr._latchPrev || emptyInput();
      if (ni.v && !lp.v) onVPress(fr);
      fr._latchPrev = ni;
    }
    if (freeze > 0) { freeze--; events.push("hitstop", { left: freeze }); return; }
    if (matchOver) return;

    var inputs = [in1, in2];
    for (var i = 0; i < 2; i++) {
      var f = fighters[i];
      var raw = inputs[i];
      if (raw === null || raw === undefined || control[i] === "ai") raw = aiInput(f);
      tickFighter(f, normalizeInput(raw));
    }
    resolveMelee(fighters[0]);
    resolveMelee(fighters[1]);
    tickProjectiles();
    tickDomains();
    tickMahoraga();
    tickPoise();
    tickResource();
  }

  function tickFighter(f, inp) {
    var prev = f._prev || emptyInput();
    var pressed = {};
    for (var k = 0; k < INPUT_KEYS.length; k++) { var kk = INPUT_KEYS[k]; pressed[kk] = !!inp[kk] && !prev[kk]; }
    f._prev = inp;

    if (f.hitstun > 0) f.hitstun--;
    if (f.iframes > 0) f.iframes--;
    if (f.counter > 0) f.counter--;
    if (f.frozen > 0) f.frozen--;
    if (f.broken > 0) f.broken--;
    if (f.zoneT > 0) f.zoneT--;
    if (f.bfReady > 0) f.bfReady--;
    if (f.domainCd > 0) f.domainCd--;
    for (var id in f.cds) if (f.cds[id] > 0) f.cds[id]--;
    if (f.comboWindow > 0) { f.comboWindow--; if (f.comboWindow === 0) f.combo = 0; }

    // 无下限展开：长按招架键超过窗口 → 从招架切成展开
    if (f.action && f.action.move.id === "parry" && inp.parry && f.action.phase !== "startup" && f.action.t > 2) {
      var held = (f.parryHold || 0) + 1; f.parryHold = held;
      if (held > 8 && f.ce > 4) { f.action = null; startAction(f, MOVES.infinity); f.parryHold = 0; }
    } else f.parryHold = 0;
    if (f.action && f.action.move.id === "infinity") {
      f.ce = Math.max(0, f.ce - MOVES.infinity.drain * FIXED_DT);
      if (f.ce <= 0 || !inp.parry) { f.action = { move: MOVES.infinity, t: 0, phase: "recovery", hitLanded: true }; }
    }

    // 黑闪：按下边沿（正常帧里也算一次，AI 与探针直接喂输入时走这条路）
    if (pressed.v) onVPress(f);

    // 处决：架势崩坏时按重击
    if (pressed.heavy && foeOf(f).broken > 0) {
      if (tryExecute(f)) { f.action = null; return; }   // 处决是终结技：不受"正在出招"限制
    }

    var mv = pickMove(f, inp, pressed);
    if (mv && (canAct(f, mv) || (mv.charge && f.action && f.action.move === mv))) {
      if (!(f.action && f.action.move === mv && mv.charge)) startAction(f, mv, { back: inp.moveZ < -0.4 });
    }
    // 蓄力中松手 → 发射由 tickAction 处理（见上）
    tickAction(f, inp, pressed);

    // 移动（出招与受击时降速；跑图不再有收益，见 tickResource）
    var acting = !!f.action && f.action.move.kind !== "defense";
    var stunned = f.hitstun > 0 || f.broken > 0 || f.frozen > 0;
    var mag = Math.hypot(inp.moveX, inp.moveZ);
    if (!stunned && mag > 0.08) {
      var mul = acting ? (f.action.phase === "active" ? 0.18 : 0.36) : 1;
      var sp = f.char.speed * mul * (f.zoneT > 0 ? 1.12 : 1);
      f.x = clampPos(f.x + inp.moveX * sp * FIXED_DT);
      f.z = clampPos(f.z + inp.moveZ * sp * FIXED_DT);
      if (!acting) f.facing = Math.atan2(inp.moveX, inp.moveZ);
    }
    if (!acting) {
      var foe = foeOf(f);
      if (!stunned || true) f.facing = Math.atan2(foe.x - f.x, foe.z - f.z);
    }
    // 贴身时把对手推开
    var fo = foeOf(f);
    var ddx = fo.x - f.x, ddz = fo.z - f.z, dd = Math.hypot(ddx, ddz);
    if (dd < 0.9 && dd > 1e-4) { var push = (0.9 - dd) / 2; f.x -= ddx / dd * push; f.z -= ddz / dd * push; }
  }
  function clampPos(v) { return v < -40 ? -40 : v > 40 ? 40 : v; }
  function dist(a, b) { return Math.hypot(a.x - b.x, a.z - b.z); }

  function tickPoise() {
    for (var i = 0; i < 2; i++) {
      var f = fighters[i];
      if (f.poiseTimer > 0) f.poiseTimer--;
      else if (f.poise < f.poiseMax) f.poise = Math.min(f.poiseMax, f.poise + 14 * FIXED_DT);
      if (f.poise <= 0 && f.broken <= 0) {
        f.broken = 66;   // 1.1s 架势崩坏 → 对手可以处决
        f.action = null;
        events.push("broken", { id: f.id, x: f.x, z: f.z });
        freeze = Math.max(freeze, 10);
      }
    }
  }
  function tickResource() {
    var d = dist(fighters[0], fighters[1]);
    var near = d <= 12;
    for (var i = 0; i < 2; i++) {
      var f = fighters[i];
      if (near) f.ce = Math.min(f.ceMax, f.ce + f.char.ceRegen * FIXED_DT);
      else f.ce = Math.max(0, f.ce - 3 * FIXED_DT);          // 规则 5：跑图没收益
      f.gauge = Math.min(100, f.gauge + (near ? 1.6 : 0.6) * FIXED_DT);
    }
  }

  /* ============================ AI（规则 8/9/10） ============================ */
  function aiInterval(f) {
    var ratio = f.hp / f.hpMax;
    var base = ratio > 0.66 ? 132 : ratio > 0.33 ? 96 : 66;   // 2.2s / 1.6s / 1.1s（规则 8 的下限）
    return Math.max(40, Math.round(base * (opts.diffMul || 1)));
  }
  function aiInput(f) {
    var foe = foeOf(f);
    var inp = emptyInput();
    f.ai.t++;
    var d = dist(f, foe);
    /** 反应延迟（规则 10）：AI 只看 12 帧前的对手状态，且绝不读按键 */
    f.ai.hist.push({ x: foe.x, z: foe.z, move: foe.action ? foe.action.move.id : null, phase: foe.action ? foe.action.phase : null });
    var react = opts.react || 12;          // 规则 10：反应延迟 >=0.2s（12 帧）
    if (f.ai.hist.length > react) f.ai.hist.shift();
    var seen = f.ai.hist[0];

    if (f.ai.cd > 0) f.ai.cd--;
    var bar = f.char.bar;
    // 位移类：远距离拉近或拉远
    if (d > 7 && f.ai.cd <= 0 && ready(f, MOVES[bar[3].move]) && MOVES[bar[3].move].dash) { f.ai.cd = aiInterval(f); f.ai.last = bar[3].move; return withMove(inp, "heal"); }
    if (d > 4.4) { inp.moveX = (foe.x - f.x) / d; inp.moveZ = (foe.z - f.z) / d; }
    else if (d < 2.2) { inp.moveX = -(foe.x - f.x) / d; inp.moveZ = -(foe.z - f.z) / d; }
    // 反击窗口：对手后摇/架势崩坏 → 立刻打
    var punish = foe.broken > 0 || (seen && seen.phase === "recovery");
    if (punish && f.ai.cd <= 0 && d < 4.4) {
      f.ai.cd = Math.floor(aiInterval(f) * 0.5);
      var pk = f.ai.last === "heavy" ? "cleave" : "heavy";     // 规则 9：不连续复用同一招
      f.ai.last = pk;
      return withMove(inp, pk);
    }
    // 见招拆招（规则 1 的另一面：AI 也要用防御动词）
    if (seen && seen.phase === "startup" && d < 5.5 && rng.next() < (opts.parryP || 0.28)) { f.ai.cd = Math.max(f.ai.cd, 24); return withMove(inp, "parry"); }
    if (f.ai.cd <= 0) {
      var pool = [];
      if (d < 4.6) pool.push("light", "light", "heavy", "cleave", "cleave");
      if (d > 3.0) pool.push("dismantle", "dismantle");
      if (d > 5.0) pool.push("furnace");
      if (d > 7.0 && MOVES[f.char.bar[3].move].dash) pool.push("heal");
      if (f.gauge >= 100 && f.domainCd <= 0 && f.domainT <= 0) pool.push("domain");
      f.ai.recent = f.ai.recent || {};
      /**
       * 规则 9 的落实：同一招 4 秒内不再选（不是"只防相邻重复"，
       * 那样会把 dismantle 刷成常态 —— 实测第一版 40 秒里刷了 5 次）。
       */
      var fresh = pool.filter(function (c) { return (frame - (f.ai.recent[c] || -99999)) > 240; });
      if (!fresh.length) fresh = pool.filter(function (c) { return c !== f.ai.last; });
      if (!fresh.length) fresh = ["light"];
      var pick = fresh[Math.floor(rng.next() * fresh.length) % fresh.length];
      f.ai.recent[pick] = frame;
      f.ai.last = pick;
      f.ai.cd = aiInterval(f);
      return withMove(inp, pick);
    }
    return inp;
  }
  function withMove(inp, pick) {
    if (pick === "light" || pick === "heavy" || pick === "cleave") { inp[pick === "cleave" ? "red" : pick] = true; return inp; }
    if (pick === "parry") { inp.parry = true; return inp; }
    if (pick === "dodge") { inp.dodge = true; return inp; }
    if (pick === "dismantle") { inp.blue = true; return inp; }
    if (pick === "furnace") { inp.purple = true; inp.holdPurple = false; return inp; }
    if (pick === "domain") { inp.domain = true; return inp; }
    if (pick === "heal") { inp.heal = true; return inp; }
    inp.light = true; return inp;
  }

  /* ============================ 对外接口 ============================ */
  function state() {
    return {
      frame: frame, freeze: freeze, over: matchOver, projectiles: projectiles.length,
      domains: domains.map(function (d) { return { owner: d.side, kind: d.kind, t: d.t, anchors: d.anchors.filter(function (a) { return a.alive; }).length, radius: d.radius }; }),
      maho: maho ? { alive: maho.alive, x: +maho.x.toFixed(2), z: +maho.z.toFixed(2), y: +maho.y.toFixed(2), state: maho.state, adapt: { melee: +maho.adapt.melee.toFixed(2), skill: +maho.adapt.skill.toFixed(2) }, interrupts: maho.interrupts } : null,
      dist: +dist(fighters[0], fighters[1]).toFixed(3),
      fighters: fighters.map(function (f) {
        return {
          id: f.id, side: f.side, x: +f.x.toFixed(3), z: +f.z.toFixed(3), facing: +f.facing.toFixed(3),
          hp: f.hp, hpMax: f.hpMax, ce: +f.ce.toFixed(2), ceMax: f.ceMax,
          poise: +f.poise.toFixed(1), poiseMax: f.poiseMax,
          gauge: +f.gauge.toFixed(1), zoneT: f.zoneT, broken: f.broken, hitstun: f.hitstun, frozen: f.frozen,
          counter: f.counter, iframes: f.iframes, combo: f.combo, domainT: f.domainT, domainKind: f.domainKind,
          move: f.action ? f.action.move.id : null, phase: f.action ? f.action.phase : null, t: f.action ? f.action.t : 0,
          charge: f.action && f.action.charge ? +f.action.charge.toFixed(1) : 0
        };
      })
    };
  }
  function hash() {
    var s = frame + "|" + freeze + "|" + (matchOver || "-") + "|";
    for (var i = 0; i < 2; i++) {
      var f = fighters[i];
      s += [f.id, f.x.toFixed(4), f.z.toFixed(4), f.facing.toFixed(3), f.hp, f.ce.toFixed(2), f.poise.toFixed(2),
        f.hitstun, f.broken, f.iframes, f.zoneT, f.gauge.toFixed(2), f.action ? f.action.move.id + ":" + f.action.phase + ":" + f.action.t : "-"].join(",") + "|";
    }
    s += projectiles.length + "|" + domains.length + "|" + (maho ? (maho.state + maho.x.toFixed(2) + maho.adapt.melee.toFixed(2)) : "-");
    var h = 0x811c9dc5;
    for (var j = 0; j < s.length; j++) { h ^= s.charCodeAt(j); h = Math.imul(h, 0x01000193) >>> 0; }
    return h.toString(16);
  }

  return {
    step: step, state: state, hash: hash, reset: reset, events: events,
    fighters: function () { return fighters; },
    projectiles: function () { return projectiles; },
    domains: function () { return domains; },
    mahoraga: function () { return maho; },
    damageMahoraga: damageMahoraga,
    landHit: landHit,
    setControl: function (i, mode) { control[i] = mode; },
    /** 难度只调"决策节奏 + 反应延迟"，不调伤害（规则 8 的精神） */
    /**
     * 难度旋钮。注意规则 8 的原意是"BOSS 的阶段推进不能靠加伤害"，
     * 而玩家自己选的难度档是可以调伤害的 —— 这是两种不同的东西。
     *   简单：出手更慢 + 反应更慢 + AI 伤害 ×0.75（新手能活下来）
     *   困难：出手更密 + 反应更快 + AI 伤害 ×1.15
     */
    setDifficulty: function (d) {
      opts.diffMul = [1.55, 1, 0.72][d] || 1;
      opts.react = [18, 12, 8][d] || 12;
      opts.parryP = [0.12, 0.28, 0.42][d] || 0.28;
      opts.aiDmg = [0.75, 1, 1.15][d] || 1;
    },
    difficultyParry: function () { return opts.parryP || 0.28; },
    frame: function () { return frame; }
  };
}
