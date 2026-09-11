  var clamp6 = (v, a, b) => v < a ? a : v > b ? b : v;
  var lerp3 = (a, b, t) => a + (b - a) * t;
  var rand = (a, b) => a + Math.random() * (b - a);
  var _v13 = new Vector3();
  var _v23 = new Vector3();
  var _v33 = new Vector3();
  var _v42 = new Vector3();
  var _v5 = new Vector3();
  var _v6 = new Vector3();
  var _v7 = new Vector3();
  var _v8 = new Vector3();
  function distXZ(a, b) {
    const dx = a.x - b.x;
    const dz = a.z - b.z;
    return Math.sqrt(dx * dx + dz * dz);
  }
  function segSegDistSq(p1, q1, p2, q2) {
    const d1 = _v33.subVectors(q1, p1);
    const d2 = _v42.subVectors(q2, p2);
    const r = _v5.subVectors(p1, p2);
    const a = d1.dot(d1);
    const e = d2.dot(d2);
    const f = d2.dot(r);
    const EPS = 1e-9;
    let s = 0;
    let t = 0;
    if (a <= EPS && e <= EPS) return r.lengthSq();
    if (a <= EPS) {
      t = clamp6(f / e, 0, 1);
    } else {
      const c = d1.dot(r);
      if (e <= EPS) {
        s = clamp6(-c / a, 0, 1);
      } else {
        const b = d1.dot(d2);
        const denom = a * e - b * b;
        s = denom > EPS ? clamp6((b * f - c * e) / denom, 0, 1) : 0;
        t = (b * s + f) / e;
        if (t < 0) {
          t = 0;
          s = clamp6(-c / a, 0, 1);
        } else if (t > 1) {
          t = 1;
          s = clamp6((b - c) / a, 0, 1);
        }
      }
    }
    const c1 = _v6.copy(d1).multiplyScalar(s).add(p1);
    const c2 = _v7.copy(d2).multiplyScalar(t).add(p2);
    return c1.distanceToSquared(c2);
  }
  var cellKey = (cx, cz) => (cx + 4096) * 8192 + (cz + 4096);
  var TUNE = {
    HP_MAX: { [SIDE.GOJO]: 1500, [SIDE.SUKUNA]: 1800 },
    CE_MAX: 100,
    CE_REGEN: 6,
    // 每秒自然回复
    CE_ON_HIT: 1.5,
    // 命中额外回复
    CE_REFUND_ON_INTERRUPT: 0.5,
    // 被打断的吟唱返还一半咒力
    DOMAIN_MAX: 100,
    DOMAIN_REGEN: 1.4,
    // 每秒自然累积
    DOMAIN_ON_DEAL: 2,
    // 造成伤害
    DOMAIN_ON_TAKE: 3,
    // 受到伤害
    DOMAIN_COOLDOWN: 6,
    // 领域结束后（未破碎）的重整时间
    /** 全局进入伤害系数：SKILL_DATA 是招式原始威力，而本作是 1500/1800 血池、
     *  2.5~4 分钟一局的长局对抗 —— 按「强玩家 ≈ 10 DPS、均衡型玩家 ≈ 7 DPS」反推，
     *  原始数值需要整体下调。它不修改任何单招的相对强弱，只调节整局 TTK。
     *  （实测：合格 bot 在 0.62 下 21 秒速通，故下调到 0.15） */
    INCOMING_SCALE: 0.1,
    /** 宿傩的出伤系数：BOSS 的血池是玩家的 1.2 倍、玩家 DPS 又必须压到 ~10，
     *  两边用同一系数会让宿傩完全打不死人。这是标准的「非对称平衡」旋钮，
     *  只放大宿傩打出的伤害，不改动 SKILL_DATA 的相对强弱。 */
    BOSS_DMG_SCALE: 1.6,
    GUARD_DR: 0.32,
    // 宿傩格挡：仅对 guardable 招式生效，伤害降至 32%
    GUARD_CHIP_CE: 6,
    // 格挡成功仍会消耗少量咒力
    INFINITY_PASSIVE_DR: 0.12,
    // 无下限被动：格挡类攻击在触及前停滞，伤害 -12%
    BLACK_FLASH_WINDOW: 0.28,
    // 黑闪判定窗口
    BLACK_FLASH_HITSTOP: 0.18,
    // 黑闪顿帧
    BLACK_FLASH_CD: 2.6,
    // 黑闪内置冷却：让它保持“稀有高光”而不是每次连段都出
    HITSTOP_LIGHT: 0.05,
    HITSTOP_HEAVY: 0.1,
    HEAVY_DMG_LINE: 150,
    // ≥150 走 hit_heavy 音效/表现
    HITSTUN_LIGHT: 0.24,
    HITSTUN_HEAVY: 0.46,
    /** 强韧（poise）：轻击不会打断出招，只有累计到上限或重击才硬直。
     *  没有这一条，玩家的连续平A会把宿傩永久锁死，「有来有回」无从谈起。 */
    POISE: { [SIDE.GOJO]: 5, [SIDE.SUKUNA]: 8 },
    POISE_REGEN: 0.75,
    // 每 0.75s 恢复 1 点强韧
    KNOCKBACK_DAMP: 6.5,
    // 击退速度衰减
    WALL_SMASH_SPEED: 6,
    // 击退速度超过该值撞墙 → 摧毁建筑
    WALL_SMASH_DMG: 55,
    // 撞墙追加伤害（原始值）
    WALL_SMASH_RADIUS: 1.15,
    // 与建筑半径的重叠容差
    INFINITY_TIME: 0.4,
    // 无下限无敌时长
    INFINITY_CD: 0.85,
    DODGE_SPEED: 16,
    // 闪避瞬时位移速度
    MOVE_SPEED: 4.8,
    DASH_SPEED: 8.8,
    SUKUNA_MOVE: 4,
    SUKUNA_RUN: 6.6,
    SUKUNA_RUSH: 15,
    COMBO_TIMEOUT: 1.6,
    // 连段计数保持时间
    CHAIN_WINDOW: 0.95,
    // 体术三段衔接窗口
    CHAIN_MIN_GAP: 0.14,
    // 命中后最快多久可以接下一段（连段节奏 ≈ 0.24s/段，仍落在黑闪窗口内）
    INPUT_BUFFER: 0.22,
    // 输入缓冲
    PURPLE_CHARGE_MAX: 1.2,
    // 茈最大蓄力
    PURPLE_CHARGE_MIN_RATIO: 0.7,
    // 未蓄力的最低威力比例（× SKILL_DATA[PURPLE].dmg）
    PURPLE_PIERCE_HALF: 6,
    // 贯穿破坏半宽 ±6m
    PURPLE200_RELOAD: 26,
    // 终极技再装填：避免长按 L 无限连发
    CLASH_LIFE: 12,
    // 领域拉锯时长上限
    CLASH_PRESS_PUSH: 0.09,
    // 玩家每次连点推动量
    CLASH_AI_PUSH: 0.26,
    // 宿傩每秒推动量（× 难度）
    CLASH_EROSION_DPS: 70,
    // |tug| 处于拉锯僵持区时的相互侵蚀 DPS
    CLASH_STALE_BAND: 0.15,
    // 僵持判定带宽
    CLASH_WIN_DMG: { [SIDE.GOJO]: 320, [SIDE.SUKUNA]: 360 },
    // 胜方对败方的重创
    BURNOUT: { [SIDE.GOJO]: 5, [SIDE.SUKUNA]: 6 },
    // 术式熔断时长
    DRAW_BURNOUT: 2,
    VOID_SUPPRESS: 5,
    // 无量空处单体压制时长（输出窗口）
    VOID_DOT_DPS: 62,
    // 压制期间持续伤害
    SHRINE_LIFE: 8,
    // 伏魔御厨子单体持续
    SHRINE_SLASH_INTERVAL: 1,
    SHRINE_DMG: 62,
    SHRINE_RADIUS: 90,
    // 无边界领域：超大范围
    ADAPT_PER_HIT: 0.12,
    // 摩虚罗适应：每次 -12%
    ADAPT_FLOOR: 0.3,
    // 最低 30%
    WHEEL_SEGMENTS: 8,
    AI_REACT: { easy: 0.35, normal: 0.22, hard: 0.12 },
    // 反应延迟
    AI_DECIDE: { easy: 0.42, normal: 0.26, hard: 0.17 },
    // 决策间隔
    AI_DMG: { easy: 0.75, normal: 1, hard: 1.3 },
    // 宿傩造成伤害倍率
    AI_GUARD: { easy: 0.3, normal: 0.55, hard: 0.8 }
    // 格挡概率
  };
  function difficultyCurve(x, easy, normal, hard) {
    if (x <= 1) return lerp3(easy, normal, clamp6((x - 0.6) / 0.4, 0, 1));
    return lerp3(normal, hard, clamp6((x - 1) / 0.45, 0, 1));
  }
  var BuildingGrid = class {
    /**
     * @param {Array<{id:number, mesh:THREE.Object3D, height:number, radius:number, destroyed:boolean, destroy:Function}>} buildings
     * @param {number} cell 网格边长（米）
     */
    constructor(buildings, cell = 24) {
      this.cell = cell;
      this.buildings = buildings || [];
      this.map = /* @__PURE__ */ new Map();
      this.stats = { queries: 0, visited: 0, destroyed: 0 };
      this._mark = 0;
      this._stamp = /* @__PURE__ */ new Map();
      this._out = [];
      this.rebuild();
    }
    rebuild() {
      this.map.clear();
      for (const b of this.buildings) {
        const p = b.mesh ? b.mesh.position : _v13.set(0, 0, 0);
        const r = b.radius || 6;
        const x0 = Math.floor((p.x - r) / this.cell);
        const x1 = Math.floor((p.x + r) / this.cell);
        const z0 = Math.floor((p.z - r) / this.cell);
        const z1 = Math.floor((p.z + r) / this.cell);
        for (let cx = x0; cx <= x1; cx++) {
          for (let cz = z0; cz <= z1; cz++) {
            const k = cellKey(cx, cz);
            let arr = this.map.get(k);
            if (!arr) {
              arr = [];
              this.map.set(k, arr);
            }
            arr.push(b);
          }
        }
      }
    }
    /**
     * 查询 (x,z) 半径 r 内的建筑（去重）。返回的数组会被复用，不要持有。
     * @returns {Array} 建筑数组
     */
    query(x, z, r) {
      this.stats.queries++;
      const out = this._out;
      out.length = 0;
      const mark = ++this._mark;
      const c = this.cell;
      const x0 = Math.floor((x - r) / c);
      const x1 = Math.floor((x + r) / c);
      const z0 = Math.floor((z - r) / c);
      const z1 = Math.floor((z + r) / c);
      for (let cx = x0; cx <= x1; cx++) {
        for (let cz = z0; cz <= z1; cz++) {
          const arr = this.map.get(cellKey(cx, cz));
          if (!arr) continue;
          for (let i = 0; i < arr.length; i++) {
            const b = arr[i];
            this.stats.visited++;
            if (this._stamp.get(b.id) === mark) continue;
            this._stamp.set(b.id, mark);
            const p = b.mesh ? b.mesh.position : null;
            if (!p) continue;
            const dx = p.x - x;
            const dz = p.z - z;
            const rr2 = r + (b.radius || 6);
            if (dx * dx + dz * dz <= rr2 * rr2) out.push(b);
          }
        }
      }
      return out;
    }
    /** 最近的未摧毁建筑（AI 用来找掩体/贴墙） */
    nearest(x, z, maxR) {
      const list = this.query(x, z, maxR);
      let best = null;
      let bestD = Infinity;
      for (const b of list) {
        if (b.destroyed) continue;
        const p = b.mesh.position;
        const d = (p.x - x) * (p.x - x) + (p.z - z) * (p.z - z);
        if (d < bestD) {
          bestD = d;
          best = b;
        }
      }
      return best;
    }
    /** 摧毁一栋建筑（幂等），返回是否真的摧毁了 */
    destroyBuilding(b, fx2, audio2) {
      if (!b || b.destroyed) return false;
      b.destroy();
      this.stats.destroyed++;
      if (fx2 && fx2.debris) {
        const p = b.mesh ? b.mesh.position : _v13.set(0, 0, 0);
        fx2.debris({ pos: _v23.set(p.x, Math.min(14, (b.height || 12) * 0.5), p.z), count: 28, power: 16, color: C.CONCRETE2 });
      }
      if (audio2) audio2.play("land", { volume: 0.25 });
      return true;
    }
    /**
     * 沿线段摧毁建筑（茈 的贯穿 / 赫的冲击），仅破坏距线段 halfWidth 以内者。
     * 查询结果数组是复用的，所以先收集再统一销毁。
     * @returns {number} 摧毁数量
     */
    destroyAlongSegment(from, to, halfWidth, fx2, audio2) {
      const len = distXZ(from, to);
      const steps = Math.max(1, Math.ceil(len / (this.cell * 0.5)));
      const hits = [];
      for (let i = 0; i <= steps; i++) {
        const t = i / steps;
        const x = lerp3(from.x, to.x, t);
        const z = lerp3(from.z, to.z, t);
        const list = this.query(x, z, halfWidth);
        for (const b of list) {
          if (b.destroyed || hits.indexOf(b) >= 0) continue;
          if (Math.sqrt(pointSegDistSqXZ(b.mesh.position, from, to)) <= halfWidth + (b.radius || 6) * 0.55) hits.push(b);
        }
      }
      let n = 0;
      for (const b of hits) if (this.destroyBuilding(b, fx2, audio2)) n++;
      return n;
    }
    /** 复位统计（建筑复位由外部调用 building.reset()） */
    resetStats() {
      this.stats.queries = 0;
      this.stats.visited = 0;
      this.stats.destroyed = 0;
    }
  };
  function pointSegDistSqXZ(p, a, b) {
    const abx = b.x - a.x;
    const abz = b.z - a.z;
    const apx = p.x - a.x;
    const apz = p.z - a.z;
    const len = abx * abx + abz * abz;
    const t = len > 1e-9 ? clamp6((apx * abx + apz * abz) / len, 0, 1) : 0;
    const dx = apx - abx * t;
    const dz = apz - abz * t;
    return dx * dx + dz * dz;
  }
  var BURNOUT_LOCKS = {
    [SIDE.GOJO]: /* @__PURE__ */ new Set([SKILL.BLUE, SKILL.RED, SKILL.PURPLE, SKILL.PURPLE_200, SKILL.DOMAIN_VOID]),
    [SIDE.SUKUNA]: /* @__PURE__ */ new Set([SKILL.DISMANTLE, SKILL.CLEAVE, SKILL.FURNACE, SKILL.DOMAIN_SHRINE, SKILL.WORLD_SLASH])
  };
  var Combatant = class {
    constructor(combat2, side, ctrl, hpMax) {
      this.combat = combat2;
      this.side = side;
      this.ctrl = ctrl;
      this.hpMax = hpMax;
      this.ceMax = TUNE.CE_MAX;
      this.domainMax = TUNE.DOMAIN_MAX;
      this.p = new Vector3();
      this.reset();
    }
    reset() {
      this.hp = this.hpMax;
      this.ce = this.ceMax;
      this.domain = 0;
      this.dead = false;
      this.cds = /* @__PURE__ */ new Map();
      this.vel = new Vector3();
      this.stunT = 0;
      this.stunHeavy = false;
      this.poise = TUNE.POISE[this.side];
      this.poiseMax = TUNE.POISE[this.side];
      this.poiseT = 0;
      this.invT = 0;
      this.infinityT = 0;
      this.infinityCd = 0;
      this.burnoutT = 0;
      this.domainCd = 0;
      this.p200Cd = 0;
      this.guarding = false;
      this.drT = 0;
      this.drAmount = 0;
      this.action = null;
      this.chain = 0;
      this.chainT = 0;
      this.adapt = /* @__PURE__ */ new Map();
      this.adaptTotal = 0;
      this.buf = null;
      this.bufT = 0;
      this.hitCount = 0;
      this.moveIntent = new Vector3();
      this.forcedInv = false;
      this.p.copy(this.ctrl.getPos());
    }
    /** 每帧推进：冷却 / 资源 / 硬直 / 速度积分 */
    tick(dt) {
      const ctrl = this.ctrl;
      this.p.copy(ctrl.getPos());
      for (const [k, v] of this.cds) {
        const n = v - dt;
        if (n <= 0) this.cds.delete(k);
        else this.cds.set(k, n);
      }
      this.stunT = Math.max(0, this.stunT - dt);
      this.invT = Math.max(0, this.invT - dt);
      this.infinityT = Math.max(0, this.infinityT - dt);
      this.infinityCd = Math.max(0, this.infinityCd - dt);
      this.burnoutT = Math.max(0, this.burnoutT - dt);
      this.domainCd = Math.max(0, this.domainCd - dt);
      this.p200Cd = Math.max(0, this.p200Cd - dt);
      this.drT = Math.max(0, this.drT - dt);
      this.chainT = Math.max(0, this.chainT - dt);
      this.bufT = Math.max(0, this.bufT - dt);
      if (this.bufT <= 0) this.buf = null;
      if (this.chainT <= 0) this.chain = 0;
      if (this.poise < this.poiseMax) {
        this.poiseT += dt;
        if (this.poiseT >= TUNE.POISE_REGEN) {
          this.poiseT = 0;
          this.poise = Math.min(this.poiseMax, this.poise + 1);
        }
      }
      if (!this.dead) {
        this.ce = Math.min(this.ceMax, this.ce + TUNE.CE_REGEN * dt);
        this.domain = Math.min(this.domainMax, this.domain + TUNE.DOMAIN_REGEN * dt);
      }
      if (this.vel.lengthSq() > 1e-4) {
        const p = ctrl.getPos();
        const nx = p.x + this.vel.x * dt;
        const nz = p.z + this.vel.z * dt;
        ctrl.setPos(nx, 0, nz);
        const damp2 = Math.max(0, 1 - TUNE.KNOCKBACK_DAMP * dt);
        this.vel.multiplyScalar(damp2);
        if (this.vel.lengthSq() < 1e-3) this.vel.set(0, 0, 0);
        this.p.set(nx, 0, nz);
      }
    }
    /** 技能是否被熔断禁用 */
    isBurnoutLocked(skill) {
      return this.burnoutT > 0 && BURNOUT_LOCKS[this.side].has(skill);
    }
    cdOf(skill) {
      return this.cds.get(skill) || 0;
    }
    cdMaxOf(skill) {
      const d = SKILL_DATA[skill];
      return d ? d.cd : 0;
    }
    costOf(skill) {
      const d = SKILL_DATA[skill];
      return d ? d.cost : 0;
    }
    /** 是否可以起手某招式（不含距离判定） */
    canCast(skill, ignoreResources = false) {
      if (this.dead) return false;
      if (this.combat.inputLocked()) return false;
      if (this.stunT > 0) return false;
      if (this.action && !this.action.done) {
        const a = this.action;
        const cancelable = a.phase === "recover";
        if (!cancelable) return false;
      }
      if (this.isBurnoutLocked(skill)) return false;
      if (skill === SKILL.DOMAIN_VOID || skill === SKILL.DOMAIN_SHRINE) {
        if (this.domain < this.domainMax || this.domainCd > 0) return false;
        return true;
      }
      if (ignoreResources) return true;
      const d = SKILL_DATA[skill];
      if (!d) return false;
      if (this.cdOf(skill) > 0) return false;
      if (this.ce < d.cost) return false;
      return true;
    }
    pay(skill) {
      const d = SKILL_DATA[skill];
      if (d && d.cost > 0) this.ce = Math.max(0, this.ce - d.cost);
    }
    refund(skill, ratio) {
      const d = SKILL_DATA[skill];
      if (d && d.cost > 0) this.ce = Math.min(this.ceMax, this.ce + d.cost * ratio);
    }
    gainDomain(v) {
      if (this.dead) return;
      this.domain = clamp6(this.domain + v, 0, this.domainMax);
    }
    /** 施加击退（dir 会被归一化） */
    knockback(dir, speed) {
      if (dir.lengthSq() < 1e-8) return;
      _v8.copy(dir).setY(0).normalize();
      this.vel.x += _v8.x * speed;
      this.vel.z += _v8.z * speed;
    }
    /** 把战斗状态写回 fighters.js 的 FighterState（HUD 只读它） */
    syncState(moving) {
      const s = this.ctrl.state;
      if (!s) return;
      s.hp = this.hp;
      s.hpMax = this.hpMax;
      s.ce = this.ce;
      s.ceMax = this.ceMax;
      s.domain = this.domain;
      s.dead = this.dead;
      if (this.dead) s.phase = "down";
      else if (this.combat.mode === "victory" || this.combat.mode === "defeat") s.phase = "win";
      else if (this.combat.domains.isOpen(this.side)) s.phase = "domain";
      else if (this.action && !this.action.done) s.phase = this.action.flow.melee ? "attack" : "cast";
      else if (this.stunT > 0) s.phase = "hit";
      else if (this.guarding) s.phase = "guard";
      else if (moving) s.phase = "move";
      else s.phase = "idle";
    }
  };
  function playAnim(ctrl, name, opts) {
    if (!ctrl || !name) return;
    if (typeof ctrl.has === "function" && !ctrl.has(name)) return;
    ctrl.play(name, opts);
  }
  function buildFlows(cb) {
    const F = {};
    const D = SKILL_DATA;
    const melee = (skill, o) => {
      const d = D[skill];
      const active = o.active;
      const recover = o.fromCd ? Math.max(0.06, d.cd - d.cast - active) : o.recover;
      return {
        skill,
        anim: o.anim,
        cast: d.cast,
        active,
        recover,
        range: d.range,
        dmg: d.dmg,
        kb: o.kb,
        hitR: o.hitR,
        heavy: !!o.heavy,
        melee: true,
        hyper: !!o.hyper,
        interruptible: o.interruptible !== false,
        onStart: o.onStart,
        tickCast: o.tickCast,
        tickActive: o.tickActive
      };
    };
    F[SKILL.PUNCH] = melee(SKILL.PUNCH, {
      anim: "punch",
      active: 0.12,
      fromCd: true,
      kb: 3.4,
      hitR: 1.05,
      onStart: (a) => {
        a.combat.resolver.lunge(a, 2.6);
        a.combat.audio.play("whoosh", { volume: 0.35 });
      },
      tickActive: (a) => a.combat.resolver.tryMelee(a)
    });
    F[SKILL.BLACK_FLASH] = melee(SKILL.BLACK_FLASH, {
      anim: "punch",
      active: 0.14,
      recover: 0.18,
      kb: 6,
      hitR: 1.25,
      heavy: true,
      onStart: (a) => a.combat.resolver.lunge(a, 5),
      tickActive: (a) => a.combat.resolver.tryMelee(a)
    });
    F[SKILL.KICK] = melee(SKILL.KICK, {
      anim: "kick",
      active: 0.16,
      fromCd: true,
      kb: 7.6,
      hitR: 1.2,
      heavy: true,
      onStart: (a) => {
        a.combat.resolver.lunge(a, 3.4);
        a.combat.audio.play("whoosh", { volume: 0.5 });
      },
      tickActive: (a) => a.combat.resolver.tryMelee(a)
    });
    F[SKILL.BLUE] = {
      skill: SKILL.BLUE,
      anim: "cast_point",
      cast: D[SKILL.BLUE].cast,
      active: 0.25,
      recover: 0.2,
      melee: false,
      interruptible: true,
      onStart: (a) => {
        cb.audio.play("blue_charge");
        cb.fx.callout({ text: "苍", sub: "术式顺转", pos: a.actor.ctrl.chest.getWorldPosition(new Vector3()), color: C.AZURE, color2: C.CYAN, life: 0.9 });
      },
      onActive: (a) => {
        const p = a.actor.ctrl.handR.getWorldPosition(new Vector3());
        const pos = p.clone().addScaledVector(a.forward, 2.6);
        cb.audio.play("blue_fire");
        spawnBlueField(cb, a.actor, pos, a.forward.clone());
      }
    };
    F[SKILL.RED] = {
      skill: SKILL.RED,
      anim: "cast_release",
      cast: D[SKILL.RED].cast,
      active: 0.2,
      recover: 0.25,
      melee: false,
      interruptible: true,
      onStart: (a) => cb.audio.play("red_charge"),
      onActive: (a) => {
        const p = a.actor.ctrl.handR.getWorldPosition(new Vector3());
        const pos = p.clone().addScaledVector(a.forward, 2.2);
        cb.audio.play("red_fire");
        spawnRedField(cb, a.actor, pos, a.forward.clone());
      }
    };
    F[SKILL.PURPLE] = {
      skill: SKILL.PURPLE,
      anim: "cast_charge",
      cast: 0.12,
      // 释放前摇（蓄力阶段单独处理）
      active: 0.5,
      recover: 0.34,
      melee: false,
      interruptible: true,
      chargePhase: true,
      onStart: (a) => {
        a.charge = 0;
        a.data.fired = false;
        cb.audio.play("purple_charge");
        a.actor.ctrl.setAura(true);
        if (a.actor.ctrl.has("cast_charge")) a.actor.ctrl.play("cast_charge", { loop: true });
      },
      /** 蓄力阶段由 combat 的输入层驱动（按住 purple 键）；
       *  forceSkill 强制出招时没有「松手」信号，蓄满 1.2s 自动全力释放 */
      tickCharge: (a, dt) => {
        a.charge = Math.min(TUNE.PURPLE_CHARGE_MAX, a.charge + dt);
        const r = a.charge / TUNE.PURPLE_CHARGE_MAX;
        const p = a.actor.ctrl.handR.getWorldPosition(new Vector3());
        p.addScaledVector(a.forward, 1.6);
        cb.fx.sphere({ pos: p, radius: lerp3(0.5, 1.5, r), color: C.VIOLET, coreColor: C.WHITE, life: 0.08, charge: r, distort: r, pulse: 0.4 });
        if (r >= 1 && !a.data.chargeReady) {
          a.data.chargeReady = true;
          cb.audio.play("charge_ready");
        }
        if (a.force && r >= 1) a.data.wantRelease = true;
        return true;
      },
      onActive: (a) => firePurple(a, cb),
      tickActive: (a, dt) => {
        if (a.data.from && a.data.to) {
          cb.fx.beam({ from: a.data.from.clone(), to: a.data.to.clone(), color: C.VIOLET, color2: C.WHITE, coreWidth: 1.4, glowWidth: 5, life: 0.12, grow: 0.2, helix: 0.4 });
        }
        return a.t < a.flow.active * 0.5;
      }
    };
    F[SKILL.PURPLE_200] = {
      skill: SKILL.PURPLE_200,
      anim: "cast_point",
      cast: D[SKILL.PURPLE_200].cast,
      active: 0.8,
      recover: 0.6,
      melee: false,
      hyper: true,
      // 咏唱霸体：不被打断（播片招式）
      interruptible: false,
      onStart: (a) => {
        a.data.charge = 0;
        cb.audio.play("purple_charge");
        cb.banner("虚式「茈」— 200%", 2);
      },
      tickCast: (a, dt) => {
        a.data.charge = clamp6(a.t / a.flow.cast, 0, 1);
        const p = a.actor.ctrl.handR.getWorldPosition(new Vector3());
        p.addScaledVector(a.forward, 1.8);
        cb.fx.sphere({ pos: p, radius: lerp3(0.4, 2.4, a.data.charge), color: C.VIOLET, coreColor: C.WHITE, life: 0.08, charge: a.data.charge, distort: a.data.charge, pulse: 0.6 });
        cb.fx.groundRing({ pos: a.actor.p.clone(), color: C.VIOLET, maxRadius: 6 + 14 * a.data.charge, life: 0.3, thickness: 0.3 });
      },
      onActive: (a) => {
        a.charge = TUNE.PURPLE_CHARGE_MAX * 2;
        firePurple(a, cb, true);
        cb.fx.screen({ flash: 1, color: C.VIOLET, shake: 1.6, chroma: 1, blur: 0.9, life: 0.6 });
      },
      tickActive: (a) => a.t < 0.4
    };
    F[SKILL.REVERSE] = {
      skill: SKILL.REVERSE,
      anim: "heal",
      cast: D[SKILL.REVERSE].cast,
      active: 0.05,
      recover: 0.26,
      melee: false,
      interruptible: true,
      onStart: (a) => {
        cb.audio.play("heal");
        cb.banner("反转术式 吟唱中…", 0.6);
      },
      onActive: (a) => {
        const amount = -D[SKILL.REVERSE].dmg;
        cb.resolver.heal(a.actor, amount, true);
      }
    };
    F[SKILL.DOMAIN_VOID] = {
      skill: SKILL.DOMAIN_VOID,
      anim: "chant",
      cast: D[SKILL.DOMAIN_VOID].cast,
      active: 0.05,
      recover: 0.3,
      melee: false,
      interruptible: false,
      hyper: true,
      onStart: (a) => {
        cb.banner("领域展开 — 无量空处", 1.4);
        cb.audio.play("domain_void");
        a.actor.ctrl.play("domain_expand");
      },
      onActive: (a) => cb.domains.open(a.actor.side)
    };
    F[SKILL.DISMANTLE] = {
      skill: SKILL.DISMANTLE,
      anim: "cast_point",
      cast: D[SKILL.DISMANTLE].cast,
      active: 0.34,
      recover: 0.3,
      melee: false,
      interruptible: true,
      onStart: (a) => cb.audio.play("dismantle"),
      onActive: (a) => {
        const from = a.actor.ctrl.handR.getWorldPosition(new Vector3());
        a.data.from = from.clone();
        a.data.to = a.target.ctrl.chest.getWorldPosition(new Vector3());
        a.data.travel = 0.12;
        cb.weapons.dismantle({ from: from.clone(), to: a.data.to.clone(), count: 5, life: 0.5 });
        cb.grid.destroyAlongSegment(from, a.data.to, 4, cb.fx, cb.audio);
      },
      tickActive: (a) => {
        if (a.t < a.data.travel) return true;
        if (a.hitLanded) return false;
        const foe = a.target;
        if (foe.dead) return false;
        const chest = foe.ctrl.chest.getWorldPosition(_v13);
        if (cb.resolver.segmentHitsTarget(a.data.from, chest, 1.35, foe)) {
          a.hitLanded = true;
          a.hitIds.add(foe.side);
          cb.resolver.apply({
            from: a.actor,
            to: foe,
            skill: SKILL.DISMANTLE,
            dmg: D[SKILL.DISMANTLE].dmg,
            dir: _v23.subVectors(foe.p, a.actor.p),
            kb: 2.2,
            kind: "projectile"
          });
          return false;
        }
        return a.t < a.flow.active;
      }
    };
    F[SKILL.CLEAVE] = melee(SKILL.CLEAVE, {
      anim: "combo_finish",
      active: 0.24,
      recover: 0.34,
      kb: 5,
      hitR: 1.35,
      heavy: true,
      hyper: true,
      onStart: (a) => {
        a.combat.resolver.lunge(a, 4.2);
        cb.audio.play("cleave");
        const p = a.target.ctrl.chest.getWorldPosition(new Vector3());
        a.data.slashes = cb.weapons.cleave({
          pos: p,
          dir: a.forward.clone(),
          count: 3,
          life: 0.45,
          onHit: (hp) => cb.fx.hitSpark({ pos: hp.clone(), color: C.CRIMSON, color2: C.BLOOD, count: 8, size: 0.6, life: 0.2 })
        });
      },
      tickActive: (a) => cb.resolver.tryMelee(a),
      onFinish: (a) => {
        if (a.data.slashes) a.data.slashes.kill();
      }
    });
    F[SKILL.FURNACE] = {
      skill: SKILL.FURNACE,
      anim: "cast_charge",
      cast: D[SKILL.FURNACE].cast,
      active: 0.2,
      recover: 0.4,
      melee: false,
      interruptible: true,
      onStart: (a) => {
        cb.audio.play("furnace");
        a.actor.ctrl.play("cast_release");
      },
      onActive: (a) => {
        const from = a.actor.ctrl.handR.getWorldPosition(new Vector3());
        spawnFurnaceField(cb, a.actor, from, a.target.p.clone());
      }
    };
    F[SKILL.DOMAIN_SHRINE] = {
      skill: SKILL.DOMAIN_SHRINE,
      anim: "chant",
      cast: D[SKILL.DOMAIN_SHRINE].cast,
      active: 0.05,
      recover: 0.3,
      melee: false,
      interruptible: false,
      hyper: true,
      onStart: (a) => {
        cb.banner("领域展开 — 伏魔御厨子", 1.4);
        cb.audio.play("domain_shrine");
        a.actor.ctrl.play("domain_expand");
      },
      onActive: (a) => cb.domains.open(a.actor.side)
    };
    F[SKILL.WORLD_SLASH] = {
      skill: SKILL.WORLD_SLASH,
      anim: "cast_point",
      cast: D[SKILL.WORLD_SLASH].cast,
      active: 0.35,
      recover: 0.55,
      melee: false,
      hyper: true,
      // 前摇霸体：玩家必须闪避或用无下限硬挡
      interruptible: false,
      onStart: (a) => {
        cb.banner("扩张术式「解」— 空间斩！", 1.1);
        cb.fx.callout({ text: "扩张术式 解", sub: "空间斩", pos: a.actor.ctrl.chest.getWorldPosition(new Vector3()), color: C.CRIMSON, color2: C.BLOOD, life: 1.1, size: 1.4 });
        a.actor.ctrl.play("cast_point");
      },
      /** 1.1 秒红色预警：地面圆环 + 锁定线 + 屏幕染红，给玩家闪避窗口 */
      tickCast: (a, dt) => {
        const to = a.target.ctrl.chest.getWorldPosition(_v33);
        const warn = clamp6(a.t / a.flow.cast, 0, 1);
        cb.fx.slash({ from: a.actor.ctrl.handR.getWorldPosition(new Vector3()), to: to.clone(), color: C.CRIMSON, color2: C.SCARLET, width: 0.12 + warn * 0.5, life: 0.08, bend: 0.1 });
        cb.fx.groundRing({ pos: a.target.p.clone(), color: C.CRIMSON, maxRadius: 3.5, life: 0.1, thickness: 0.25 });
        cb.fx.screen({ vignette: 0.5 * warn, color: C.CRIMSON, chroma: 0.35 * warn, life: 0.1 });
      },
      onActive: (a) => {
        const from = a.actor.ctrl.handR.getWorldPosition(new Vector3());
        cb.audio.play("worldslash");
        cb.fx.screen({ flash: 0.5, color: C.CRIMSON, shake: 1.2, blur: 0.5, life: 0.4 });
        const to = a.target.p.clone().setY(1.1);
        a.data.line = cb.weapons.worldSlash({
          from: from.clone(),
          to: to.clone(),
          life: 0.6,
          onHit: () => {
          }
        });
        cb.resolver.apply({
          from: a.actor,
          to: a.target,
          skill: SKILL.WORLD_SLASH,
          dmg: D[SKILL.WORLD_SLASH].dmg,
          dir: _v13.subVectors(a.target.p, a.actor.p),
          kb: 9,
          kind: "projectile",
          unblockable: true,
          hitstop: TUNE.HITSTOP_HEAVY
        });
        cb.grid.destroyAlongSegment(from, to, 8, cb.fx, cb.audio);
      },
      onFinish: (a) => {
        if (a.data.line) a.data.line.kill();
      }
    };
    F[SKILL.RUSH] = melee(SKILL.RUSH, {
      anim: "dash",
      active: 0.26,
      recover: 0.24,
      kb: 5.5,
      hitR: 1.5,
      hyper: true,
      onStart: (a) => {
        cb.audio.play("dash");
        a.actor.ctrl.play("run", { loop: false });
      },
      /** 前摇期间高速贴脸 */
      tickCast: (a, dt) => {
        const t = a.target;
        a.actor.ctrl.moveTowards(t.p.x, t.p.z, TUNE.SUKUNA_RUSH, dt);
        a.actor.ctrl.faceTo(t.p.x, t.p.z);
      },
      tickActive: (a) => {
        const hit = cb.resolver.tryMelee(a);
        a.actor.ctrl.moveTowards(a.target.p.x, a.target.p.z, TUNE.SUKUNA_RUSH * 0.5, 1 / 60);
        return !hit;
      }
    });
    return F;
  }
  function spawnFurnaceField(cb, owner, from, targetPos) {
    const speed = 40;
    const dir = new Vector3(targetPos.x - from.x, 0, targetPos.z - from.z);
    if (dir.lengthSq() < 1e-6) dir.set(0, 0, 1);
    dir.normalize();
    const to = from.clone().addScaledVector(dir, 60).setY(1.2);
    const field = {
      kind: "furnace",
      t: 0,
      life: 1.1,
      owner,
      pos: from.clone(),
      handle: cb.weapons.furnace({ from: from.clone(), to, life: 1.1 }),
      update(dt) {
        field.pos.addScaledVector(dir, speed * dt);
        const foe = cb.fighters[cb.other(owner.side)];
        cb.fx.sphere({ pos: field.pos.clone(), radius: 0.9, color: C.NEON_AMBER, coreColor: C.SCARLET, life: 0.08, charge: 1 });
        const d = distXZ(field.pos, foe.p);
        if (d < 3.6 || field.t >= 0.75) {
          cb.fx.shockwave({ pos: field.pos.clone(), maxRadius: 15, color: C.NEON_AMBER, color2: C.SCARLET, life: 0.5 });
          cb.fx.debris({ pos: field.pos.clone(), count: 20, power: 16, color: C.NEON_AMBER });
          cb.audio.play("furnace", { volume: 0.6 });
          cb.grid.destroyAlongSegment(field.pos, field.pos, 9, cb.fx, cb.audio);
          if (!foe.dead && cb.resolver.segmentHitsTarget(field.pos, field.pos, 6, foe)) {
            cb.resolver.apply({
              from: owner,
              to: foe,
              skill: SKILL.FURNACE,
              dmg: SKILL_DATA[SKILL.FURNACE].dmg,
              dir: _v13.subVectors(foe.p, owner.p),
              kb: 9,
              kind: "projectile",
              unblockable: true,
              hitstop: TUNE.HITSTOP_HEAVY
            });
          }
          return false;
        }
        return true;
      }
    };
    cb.fields.push(field);
    return field;
  }
  function spawnBlueField(cb, owner, pos, dir) {
    const field = {
      kind: "blue",
      t: 0,
      life: 1.7,
      owner,
      pos,
      dir,
      pulseT: 0,
      handle: cb.weapons.blue({
        pos: pos.clone(),
        dir: dir.clone(),
        life: 1.7,
        onEnd: () => cb.fx.shockwave({ pos: field.pos.clone(), maxRadius: 16, color: C.AZURE, color2: C.CYAN, life: 0.5 })
      }),
      update(dt) {
        const target = cb.fighters[cb.other(owner.side)];
        if (distXZ(field.pos, target.p) > 9) field.pos.addScaledVector(field.dir, 14 * dt);
        if (field.handle && field.handle.setPos) field.handle.setPos(field.pos);
        cb.fx.sphere({ pos: field.pos.clone(), radius: 1.2, color: C.AZURE, coreColor: C.CYAN, life: 0.1, charge: 0.6, distort: 0.5 });
        const d = distXZ(field.pos, target.p);
        if (d < 26 && !target.dead) {
          const pull = _v13.subVectors(owner.p, target.p).setY(0);
          if (pull.lengthSq() > 1e-6) {
            pull.normalize();
            const strength = 26 * (1 - d / 26) + 8;
            target.vel.addScaledVector(pull, strength * dt * 3.2);
            target.guarding = false;
            target.ctrl.setGuard(false);
            field.pulseT -= dt;
            if (field.pulseT <= 0) {
              field.pulseT = 0.9;
              target.stunT = Math.max(target.stunT, 0.16);
              cb.fx.lightning({ from: field.pos.clone(), to: target.ctrl.chest.getWorldPosition(new Vector3()), color: C.CYAN, life: 0.14, branches: 2 });
            }
          }
        }
        return true;
      }
    };
    cb.fields.push(field);
    return field;
  }
  function spawnRedField(cb, owner, pos, dir) {
    const speed = SKILL_DATA[SKILL.RED].range * 0.65;
    const field = {
      kind: "red",
      t: 0,
      life: 1.6,
      owner,
      pos,
      dir,
      prev: pos.clone(),
      hit: false,
      handle: cb.weapons.red({ pos: pos.clone(), dir: dir.clone(), power: 1, life: 1.6 }),
      update(dt) {
        if (field.hit) return false;
        field.prev.copy(field.pos);
        field.pos.addScaledVector(field.dir, speed * dt);
        if (field.handle && field.handle.setPos) field.handle.setPos(field.pos);
        // coreColor 用 SCARLET 同色系：GOLD 的白热核心让「赫」在飞行段看起来像颗彗星，
        // 与"斥力"的红色语义不符（vfx-combat 实机比对后的建议）
        cb.fx.sphere({ pos: field.pos.clone(), radius: 1.5, color: C.SCARLET, coreColor: C.SCARLET, life: 0.1, charge: 1, distort: 0.6 });
        cb.grid.destroyAlongSegment(field.prev, field.pos, 4.5, cb.fx, cb.audio);
        const target = cb.fighters[cb.other(owner.side)];
        let detonated = false;
        if (!target.dead && cb.resolver.segmentHitsTarget(field.prev, field.pos, 1.5, target)) {
          cb.resolver.apply({
            from: owner,
            to: target,
            skill: SKILL.RED,
            dmg: SKILL_DATA[SKILL.RED].dmg,
            dir: field.dir,
            kb: 17,
            kind: "projectile",
            unblockable: true,
            hitstop: TUNE.HITSTOP_HEAVY
          });
          detonated = true;
        } else if (field.t >= field.life) {
          detonated = true;
        }
        if (detonated) {
          field.hit = true;
          cb.fx.shockwave({ pos: field.pos.clone(), maxRadius: 26, color: C.SCARLET, color2: C.GOLD, life: 0.6, thickness: 0.9 });
          cb.fx.debris({ pos: field.pos.clone(), count: 24, power: 18, color: C.SCARLET });
          cb.fx.screen({ shake: 0.8, flash: 0.35, color: C.SCARLET, life: 0.4 });
          cb.audio.play("hit_heavy", { volume: 0.5 });
          cb.grid.destroyAlongSegment(field.pos, field.pos, 8, cb.fx, cb.audio);
          return false;
        }
        return true;
      }
    };
    cb.fields.push(field);
    return field;
  }
  function firePurple(a, cb, is200 = false) {
    const d = SKILL_DATA[SKILL.PURPLE];
    const maxCharge = is200 ? TUNE.PURPLE_CHARGE_MAX * 2 : TUNE.PURPLE_CHARGE_MAX;
    const ratio = clamp6(a.charge / maxCharge, 0, 1);
    const power = d.dmg * lerp3(TUNE.PURPLE_CHARGE_MIN_RATIO, 1, ratio);
    const from = a.actor.ctrl.handR.getWorldPosition(new Vector3());
    const len = is200 ? 260 : Math.min(d.range, lerp3(60, 120, ratio));
    const to = from.clone().addScaledVector(a.forward, len);
    a.data.from = from.clone();
    a.data.to = to.clone();
    a.data.power = power;
    a.data.fired = true;
    const weapon = cb.weapons.purple({
      from: from.clone(),
      to: to.clone(),
      mode: ratio > 0.85 ? "line" : "orb",
      power,
      life: is200 ? 1 : 0.5,
      onImpact: (p) => {
        cb.fx.shockwave({ pos: p.clone(), maxRadius: 18, color: C.VIOLET, color2: C.WHITE, life: 0.6 });
        cb.fx.debris({ pos: p.clone(), count: 26, power: 20, color: C.CONCRETE2 });
      }
    });
    a.data.weapon = weapon;
    const half = is200 ? 14 : TUNE.PURPLE_PIERCE_HALF;
    const n = cb.grid.destroyAlongSegment(from, to, half, cb.fx, cb.audio);
    if (n > 0) cb.fx.screen({ shake: 0.5 + n * 0.05, life: 0.5 });
    cb.fx.screen({ flash: is200 ? 1 : 0.45, color: C.VIOLET, shake: is200 ? 1.6 : 0.7, blur: 0.5, chroma: 0.6, life: 0.35 });
    if (!is200) cb.banner(ratio > 0.9 ? "虚式「茈」 全力" : "虚式「茈」", 0.9);
    cb.audio.play(is200 ? "purple200_fire" : "purple_fire");
    cb.audio.duck();
    if (!a.target.dead) {
      if (cb.resolver.segmentHitsTarget(from, to, 1.8, a.target)) {
        cb.resolver.apply({
          from: a.actor,
          to: a.target,
          skill: is200 ? SKILL.PURPLE_200 : SKILL.PURPLE,
          dmg: power,
          dir: _v13.copy(a.forward),
          kb: is200 ? 16 : 10,
          kind: "projectile",
          unblockable: true,
          hitstop: TUNE.HITSTOP_HEAVY
        });
      }
    }
  }
  var SkillRunner = class {
    constructor(combat2) {
      this.combat = combat2;
      this.actions = /* @__PURE__ */ new Map();
      this.flows = buildFlows(combat2);
      this.seq = 0;
    }
    current(side) {
      return this.actions.get(side) || null;
    }
    /**
     * 起手一个招式。
     * @param {'gojo'|'sukuna'} side
     * @param {string} skill
     * @param {{force?:boolean, chainStage?:number}} [opts] force = 无视 CD/咒力（播片）
     */
    start(side, skill, opts = {}) {
      const cb = this.combat;
      const flow = this.flows[skill];
      const actor = cb.fighters[side];
      if (!flow || !actor || actor.dead) return null;
      const target = cb.fighters[cb.other(side)];
      const stage = opts.chainStage | 0;
      const a = {
        id: ++this.seq,
        side,
        skill,
        flow,
        actor,
        target,
        combat: cb,
        phase: flow.chargePhase ? "charge" : "cast",
        t: 0,
        charge: 0,
        hitLanded: false,
        hitIds: /* @__PURE__ */ new Set(),
        data: {},
        done: false,
        force: !!opts.force,
        chainStage: stage,
        dmgMul: 1,
        kbMul: 1,
        forward: new Vector3(0, 0, 1)
      };
      this.updateForward(a);
      if (stage === 1) {
        a.dmgMul = 1.15;
        if (flow.anim) playAnim(actor.ctrl, "punch2", { loop: false });
      } else if (stage === 2) {
        a.dmgMul = 1.45;
        a.kbMul = 1.9;
        if (flow.anim) playAnim(actor.ctrl, "combo_finish", { loop: false });
      }
      const old = this.actions.get(side);
      if (old && !old.done) {
        old.done = true;
        this._teardown(old);
      }
      if (!opts.force) {
        actor.pay(skill);
        if (SKILL_DATA[skill].cd > 0) actor.cds.set(skill, SKILL_DATA[skill].cd);
      } else {
        actor.cds.set(skill, Math.max(actor.cdOf(skill), SKILL_DATA[skill].cd));
      }
      actor.action = a;
      this.actions.set(side, a);
      cb.pushEvent({ type: "skill", skill, side });
      if (flow.anim && !stage) playAnim(actor.ctrl, flow.anim, { loop: false });
      if (flow.onStart) flow.onStart(a, cb);
      return a;
    }
    /** 更新动作的「前方」（出招瞬间朝向目标；判定窗口内锁定，让闪避有意义） */
    updateForward(a) {
      const t = a.target;
      if (t) {
        _v13.subVectors(t.ctrl.getPos(), a.actor.ctrl.getPos()).setY(0);
        if (_v13.lengthSq() > 1e-6) a.forward.copy(_v13.normalize());
      }
    }
    /** 打断当前动作（受击 / 拉锯锁定 / 播片强制覆盖） */
    cancel(side, reason) {
      const a = this.current(side);
      if (!a || a.done) return false;
      const flow = a.flow;
      const hard = reason === "force" || reason === "abort";
      if (!hard) {
        if (flow.hyper) return false;
        if (flow.interruptible === false) return false;
      }
      if (a.phase === "cast" || a.phase === "charge") a.actor.refund(a.skill, TUNE.CE_REFUND_ON_INTERRUPT);
      this._teardown(a);
      a.done = true;
      this.actions.set(side, null);
      if (reason === "hit") playAnim(a.actor.ctrl, "hit_light");
      return true;
    }
    _teardown(a) {
      if (a.data.orb && a.data.orb.kill) a.data.orb.kill();
      if (a.data.weapon && a.data.weapon.kill) a.data.weapon.kill();
      if (a.data.arrow && a.data.arrow.kill) a.data.arrow.kill();
      if (a.data.line && a.data.line.kill) a.data.line.kill();
      if (a.data.slashes && a.data.slashes.kill) a.data.slashes.kill();
      if (a.flow.onFinish) a.flow.onFinish(a, this.combat);
      a.actor.action = null;
    }
    update(dt) {
      for (const side of this.actions.keys()) {
        const a = this.actions.get(side);
        if (!a || a.done) continue;
        this._step(a, dt);
        if (a.done) this.actions.set(side, null);
      }
    }
    _step(a, dt) {
      const cb = this.combat;
      const flow = a.flow;
      a.t += dt;
      if (a.phase !== "active") this.updateForward(a);
      if (a.phase === "charge") {
        if (a.data.wantRelease) {
          a.phase = "cast";
          a.t = 0;
          playAnim(a.actor.ctrl, "cast_release");
          return;
        }
        if (flow.tickCharge && flow.tickCharge(a, dt) === false) this._finish(a);
        return;
      }
      if (a.phase === "cast") {
        if (flow.tickCast) flow.tickCast(a, dt);
        if (a.t >= flow.cast) {
          a.phase = "active";
          a.t = 0;
          if (flow.onActive) flow.onActive(a, cb);
        }
        return;
      }
      if (a.phase === "active") {
        const keep = flow.tickActive ? flow.tickActive(a, dt) : true;
        if (!keep || a.t >= flow.active) {
          a.phase = "recover";
          a.t = 0;
        }
        return;
      }
      if (a.phase === "recover") {
        if (a.t >= flow.recover) this._finish(a);
      }
    }
    _finish(a) {
      if (a.done) return;
      this._teardown(a);
      a.done = true;
      this.actions.set(a.side, null);
      this.combat.onActionEnd(a);
    }
  };
  var CAPSULE_R = 0.55;
  var BODY_LOW = 0.35;
  var BODY_TOP_PAD = 0.3;
  var _sa = new Vector3();
  var _sb = new Vector3();
  var _sc = new Vector3();
  var _sd = new Vector3();
  var HitResolver = class {
    constructor(combat2) {
      this.combat = combat2;
    }
    /** 目标胶囊体轴线（写入 out 两个点） */
    capsule(target, outA, outB) {
      const h = target.height;
      outA.set(target.p.x, target.p.y + BODY_LOW, target.p.z);
      outB.set(target.p.x, target.p.y + h - BODY_TOP_PAD, target.p.z);
      return outA;
    }
    /** 线段（弹道 / 光束）是否命中目标胶囊体 */
    segmentHitsTarget(from, to, radius, target) {
      this.capsule(target, _sa, _sb);
      const rr2 = radius + CAPSULE_R;
      return segSegDistSq(from, to, _sa, _sb) <= rr2 * rr2;
    }
    /** 出招小步前冲（打击感） */
    lunge(a, dist) {
      const t = a.target;
      if (!t) return;
      const p = a.actor.ctrl.getPos();
      const dx = t.p.x - p.x;
      const dz = t.p.z - p.z;
      const d = Math.hypot(dx, dz);
      if (d < 1e-4) return;
      const step = Math.min(dist, Math.max(0, d - 1.7));
      if (step <= 0) return;
      const nx = p.x + dx / d * step;
      const nz = p.z + dz / d * step;
      a.actor.ctrl.setPos(nx, 0, nz);
      a.actor.p.set(nx, 0, nz);
    }
    /**
     * 近战判定：攻击者「手部挂点 → 沿攻击方向扫掠线段」与目标胶囊体的距离。
     * 不用纯距离圆：判定锚在挥击的手上，且每个攻击实例只命中一次。
     * @returns {boolean} 本次调用是否产生命中
     */
    tryMelee(a) {
      const cb = this.combat;
      const target = a.target;
      if (!target || target.dead) return false;
      if (a.hitIds.has(target.side)) return false;
      const range = a.flow.range;
      if (distXZ(a.actor.p, target.p) > range) return false;
      const hand = a.actor.ctrl.handR;
      if (!hand) return false;
      hand.getWorldPosition(_sc);
      _sd.copy(_sc).addScaledVector(a.forward, range * 0.85);
      this.capsule(target, _sa, _sb);
      const rr2 = a.flow.hitR + CAPSULE_R;
      if (segSegDistSq(_sc, _sd, _sa, _sb) > rr2 * rr2) return false;
      const landed = this.apply({
        from: a.actor,
        to: target,
        skill: a.skill,
        dmg: a.flow.dmg * a.dmgMul,
        dir: _v13.subVectors(target.p, a.actor.p),
        kb: a.flow.kb * a.kbMul,
        kind: "melee",
        hitstop: a.flow.heavy ? TUNE.HITSTOP_HEAVY : TUNE.HITSTOP_LIGHT,
        noBlackFlash: a.skill === SKILL.BLACK_FLASH,
        finisher: !!a.flow.heavy || a.chainStage === 2
      });
      if (landed) {
        a.hitIds.add(target.side);
        a.hitLanded = true;
      }
      return landed;
    }
    /**
     * 统一的伤害入口。
     * @param {{from:Combatant, to:Combatant, skill:string, dmg:number, dir:THREE.Vector3,
     *          kb?:number, kind:'melee'|'projectile'|'domain', unblockable?:boolean,
     *          hitstop?:number, noBlackFlash?:boolean, finisher?:boolean}} h
     * @returns {boolean} 是否真正造成伤害（无敌时会返回 false 且不消耗判定）
     */
    apply(h) {
      const cb = this.combat;
      const victim = h.to;
      const attacker = h.from;
      if (!victim || victim.dead || cb.resultLocked) return false;
      const data = SKILL_DATA[h.skill];
      const chest = () => victim.ctrl.chest.getWorldPosition(new Vector3());
      const dir = new Vector3(h.dir ? h.dir.x : 0, 0, h.dir ? h.dir.z : 0);
      if (victim.invT > 0 || victim.forcedInv) {
        if (!victim.forcedInv) {
          const p = chest();
          cb.fx.hitSpark({ pos: p, color: C.CYAN, color2: C.WHITE, count: 12, size: 0.5, life: 0.25, speed: 8 });
          cb.fx.callout({ text: "无下限", sub: "不可侵", pos: p.clone(), color: C.CYAN, color2: C.WHITE, life: 0.7, size: 0.9, rise: 1.2 });
          cb.audio.play("guard_infinity", { volume: 0.7 });
          cb.fx.screen({ shake: 0.25, chroma: 0.3, life: 0.2 });
        }
        return false;
      }
      let dmg = h.dmg;
      const guardable = !!(data && data.guardable) && !h.unblockable;
      let guarded = false;
      if (guardable && victim.guarding) {
        dmg *= TUNE.GUARD_DR;
        guarded = true;
        victim.ce = Math.max(0, victim.ce - TUNE.GUARD_CHIP_CE);
      }
      if (guardable && victim.side === SIDE.GOJO) dmg *= 1 - TUNE.INFINITY_PASSIVE_DR;
      if (victim.drT > 0) dmg *= 1 - victim.drAmount;
      if (victim.side === SIDE.SUKUNA && cb.sukunaPhase() >= 3 && h.kind !== "domain") dmg *= cb.adaptMul(h.skill);
      if (attacker && attacker.side === SIDE.SUKUNA) dmg *= cb.ai.damageMul * TUNE.BOSS_DMG_SCALE;
      dmg *= TUNE.INCOMING_SCALE;
      dmg = Math.max(1, dmg);
      let blackFlash = false;
      if (h.kind === "melee" && attacker && attacker.side === SIDE.GOJO && !h.noBlackFlash) {
        if (h.finisher && cb.bfWindowUntil > cb.time && cb.bfCd <= 0) {
          blackFlash = true;
          cb.bfWindowUntil = 0;
          cb.bfCd = TUNE.BLACK_FLASH_CD;
          cb.bfCount++;
        } else if (!h.finisher) {
          cb.bfWindowUntil = cb.time + TUNE.BLACK_FLASH_WINDOW;
        }
      }
      if (blackFlash) dmg += SKILL_DATA[SKILL.BLACK_FLASH].dmg * TUNE.INCOMING_SCALE;
      victim.hp = Math.max(0, victim.hp - dmg);
      victim.gainDomain(TUNE.DOMAIN_ON_TAKE);
      if (attacker) {
        attacker.gainDomain(TUNE.DOMAIN_ON_DEAL);
        attacker.ce = Math.min(attacker.ceMax, attacker.ce + TUNE.CE_ON_HIT);
        attacker.hitCount++;
      }
      const heavy = h.dmg >= TUNE.HEAVY_DMG_LINE || dmg >= TUNE.HEAVY_DMG_LINE * TUNE.INCOMING_SCALE;
      let staggered = heavy || blackFlash || h.kind === "projectile";
      if (!staggered) {
        victim.poise -= 1;
        if (victim.poise <= 0) staggered = true;
      }
      const armored = staggered && victim.action && !victim.action.done && victim.action.flow.hyper;
      if (armored) staggered = false;
      if (staggered) {
        victim.poise = victim.poiseMax;
        victim.poiseT = 0;
        victim.stunT = Math.max(victim.stunT, heavy ? TUNE.HITSTUN_HEAVY : TUNE.HITSTUN_LIGHT);
        victim.stunHeavy = heavy;
        victim.guarding = false;
        victim.ctrl.setGuard(false);
        cb.runner.cancel(victim.side, "hit");
      }
      if (h.kb) victim.knockback(dir, h.kb * (heavy ? 1 : 0.35));
      if (victim.side === SIDE.SUKUNA && cb.sukunaPhase() >= 3 && attacker && attacker.side === SIDE.GOJO && h.kind !== "domain") {
        cb.adaptSkill(h.skill);
      }
      {
        const p = chest();
        const hs = h.hitstop !== void 0 ? h.hitstop : heavy ? TUNE.HITSTOP_HEAVY : TUNE.HITSTOP_LIGHT;
        victim.ctrl.hitFlash(heavy ? 2 : 1);
        cb.fx.hitSpark({ pos: p, color: guarded ? C.NEON_CYAN : C.GOLD, color2: C.WHITE, count: heavy ? 26 : 14, size: heavy ? 0.85 : 0.55, life: 0.3, speed: heavy ? 14 : 9 });
        cb.fx.damageNumber({ pos: p, amount: Math.round(dmg), color: blackFlash ? C.GOLD : C.WHITE, crit: blackFlash, life: 0.9 });
        cb.fx.screen({ shake: blackFlash ? 1.5 : heavy ? 0.75 : 0.3, freeze: hs, life: 0.25 });
        cb.audio.play(heavy ? "hit_heavy" : "hit_light", { volume: heavy ? 1 : 0.7 });
        if (guarded) cb.audio.play("block", { volume: 0.7 });
        cb.hitstop = Math.max(cb.hitstop, blackFlash ? TUNE.BLACK_FLASH_HITSTOP : hs);
      }
      if (blackFlash) {
        const p = chest();
        cb.fx.callout({ text: "黑闪", sub: "BLACK FLASH", pos: p.clone().setY(p.y + 1.2), color: C.GOLD, color2: C.INK, life: 1.2, size: 2.4, shake: 0.6, rise: 1.6 });
        cb.fx.shockwave({ pos: p.clone(), maxRadius: 22, color: C.GOLD, color2: C.CRIMSON, life: 0.55, thickness: 0.7 });
        cb.fx.lightning({ from: attacker.ctrl.handR.getWorldPosition(new Vector3()), to: p.clone(), color: C.GOLD, color2: C.INK, branches: 5, life: 0.3, width: 0.35, jag: 1.4 });
        cb.fx.screen({ flash: 0.7, color: C.GOLD, shake: 1.5, chroma: 0.9, blur: 0.6, life: 0.4 });
        cb.audio.play("blackflash");
        cb.audio.duck();
        cb.banner("黑闪！", 1);
        cb.pushEvent({ type: "blackflash", amount: Math.round(dmg), combo: cb.combo });
      }
      cb.onHitLanded(attacker, victim, dmg, blackFlash);
      cb.pushEvent({ type: "hit", side: attacker ? attacker.side : null, target: victim.side, skill: h.skill, amount: Math.round(dmg), heavy, guarded, blackFlash });
      if (victim.hp <= 0) cb.onDeath(victim);
      return true;
    }
    /** 治疗（反转术式） */
    heal(c, amount) {
      const cb = this.combat;
      if (c.dead || amount <= 0) return;
      const before = c.hp;
      c.hp = Math.min(c.hpMax, c.hp + amount);
      const real = c.hp - before;
      const p = c.ctrl.chest.getWorldPosition(new Vector3());
      cb.fx.damageNumber({ pos: p, amount: Math.round(real), color: C.CYAN, prefix: "+", life: 1 });
      cb.fx.groundRing({ pos: c.p.clone(), color: C.CYAN, color2: C.WHITE, maxRadius: 7, life: 0.7, thickness: 0.35 });
      cb.fx.aura({ target: c.ctrl.root, color: C.CYAN, kind: "cursed", scale: 1.3, life: 0.9, intensity: 1 });
      cb.fx.screen({ vignette: -0.3, color: C.CYAN, life: 0.5 });
      cb.audio.play("heal");
      c.gainDomain(3);
    }
    /** 被击退撞进建筑：摧毁建筑并追加伤害 */
    wallSmash(c, speed) {
      const cb = this.combat;
      if (speed < TUNE.WALL_SMASH_SPEED) return false;
      const list = cb.grid.query(c.p.x, c.p.z, 10);
      for (const b of list) {
        if (b.destroyed) continue;
        const p = b.mesh ? b.mesh.position : null;
        if (!p) continue;
        const dx = p.x - c.p.x;
        const dz = p.z - c.p.z;
        const rr2 = (b.radius || 6) * 0.8 + TUNE.WALL_SMASH_RADIUS;
        if (dx * dx + dz * dz > rr2 * rr2) continue;
        cb.grid.destroyBuilding(b, cb.fx, cb.audio);
        const dmg = TUNE.WALL_SMASH_DMG * TUNE.INCOMING_SCALE;
        c.hp = Math.max(0, c.hp - dmg);
        c.stunT = Math.max(c.stunT, TUNE.HITSTUN_HEAVY);
        c.vel.set(0, 0, 0);
        cb.runner.cancel(c.side, "hit");
        cb.fx.damageNumber({ pos: new Vector3(c.p.x, c.p.y + 1.6, c.p.z), amount: Math.round(dmg), color: C.CONCRETE2, life: 0.8 });
        cb.fx.shockwave({ pos: new Vector3(c.p.x, c.p.y + 1, c.p.z), maxRadius: 12, color: C.CONCRETE2, life: 0.4 });
        cb.fx.screen({ shake: 1, life: 0.4 });
        cb.audio.play("hit_heavy");
        if (c.hp <= 0) cb.onDeath(c);
        return true;
      }
      return false;
    }
  };
  var MahoragaWheel = class {
    constructor(scene2) {
      this.group = new Group();
      const R = 1.15;
      this.ring = new Mesh(
        new TorusGeometry(R, 0.055, 8, 32),
        new MeshBasicMaterial({ color: C.GOLD, transparent: true, opacity: 0.9 })
      );
      this.group.add(this.ring);
      this.segs = [];
      for (let i = 0; i < TUNE.WHEEL_SEGMENTS; i++) {
        const ang = i / TUNE.WHEEL_SEGMENTS * Math.PI * 2;
        const mesh = new Mesh(
          new BoxGeometry(0.5, 0.075, 0.075),
          new MeshBasicMaterial({ color: C.CONCRETE2, transparent: true, opacity: 0.45 })
        );
        mesh.position.set(Math.cos(ang) * R, Math.sin(ang) * R, 0);
        mesh.rotation.z = ang;
        this.group.add(mesh);
        this.segs.push(mesh);
      }
      this.lit = 0;
      this.group.visible = false;
      this._t = 0;
      if (scene2 && scene2.add) scene2.add(this.group);
    }
    update(dt, pos) {
      this._t += dt;
      this.group.position.set(pos.x, pos.y + 2.55, pos.z);
      this.group.rotation.y = this._t * 0.55;
      this.group.rotation.z = Math.sin(this._t * 0.8) * 0.14;
    }
    setVisible(v) {
      this.group.visible = !!v;
    }
    /** 点亮 n 格 */
    light(n) {
      this.lit = clamp6(n, 0, TUNE.WHEEL_SEGMENTS);
      for (let i = 0; i < this.segs.length; i++) {
        const on = i < this.lit;
        this.segs[i].material.color.setHex(on ? C.GOLD : C.CONCRETE2);
        this.segs[i].material.opacity = on ? 1 : 0.45;
      }
      this.ring.material.color.setHex(this.lit >= TUNE.WHEEL_SEGMENTS ? C.CRIMSON : C.GOLD);
    }
    reset() {
      this._t = 0;
      this.light(0);
      this.setVisible(false);
    }
  };
  var DomainClash = class {
    constructor(combat2) {
      this.combat = combat2;
      this.active = false;
      this.tug = 0;
      this.life = 0;
      this.elapsed = 0;
      this.winner = null;
      this.pressCount = 0;
      this._fxT = 0;
      this._decay = 0;
    }
    reset() {
      this.active = false;
      this.tug = 0;
      this.life = 0;
      this.elapsed = 0;
      this.winner = null;
      this.pressCount = 0;
      this._fxT = 0;
      this._decay = 0;
    }
    begin() {
      const cb = this.combat;
      this.active = true;
      this.tug = 0;
      this.life = TUNE.CLASH_LIFE;
      this.elapsed = 0;
      this.winner = null;
      this.pressCount = 0;
      this._fxT = 0;
      this._decay = 0;
      cb.banner("领域对撞 — 连点 J / K 压制！", 3);
      cb.audio.play("domain_clash");
      cb.audio.loop("music_domain");
      cb.fx.screen({ flash: 0.9, color: C.VIOLET, shake: 1.4, chroma: 1, vignette: 0.5, blur: 0.5, life: 1 });
      cb.fx.callout({ text: "领域对撞", sub: "DOMAIN CLASH", pos: cb.fighters[SIDE.GOJO].ctrl.chest.getWorldPosition(new Vector3()), color: C.VIOLET, color2: C.CRIMSON, life: 2, size: 2.2, screenAnchor: false });
    }
    /** 玩家推动（连点攻击键 / 专门对抗输入） */
    push(amount, label) {
      if (!this.active || this.winner) return;
      this.tug = clamp6(this.tug + amount, -1.2, 1.2);
      this.pressCount++;
      const cb = this.combat;
      if (this.pressCount % 2 === 0) {
        const p = cb.fighters[SIDE.GOJO].ctrl.handR.getWorldPosition(new Vector3());
        cb.fx.hitSpark({ pos: p, color: C.CYAN, color2: C.VIOLET, count: 8, size: 0.5, life: 0.25, speed: 12 });
        cb.audio.play("ui_move", { volume: 0.35, rate: 1 + this.tug * 0.2 });
      }
      if (this.tug >= 1) this.resolve(SIDE.GOJO);
      else if (this.tug <= -1) this.resolve(SIDE.SUKUNA);
    }
    /**
     * @param {number} dt
     * @param {{light:boolean, heavy:boolean, mouse:boolean}} edges 本帧的按键边沿
     */
    update(dt, edges) {
      const cb = this.combat;
      if (!this.active) {
        if (this._decay > 0) {
          this._decay -= dt;
          this.tug *= Math.max(0, 1 - dt * 2.2);
          if (this._decay <= 0) this.tug = 0;
        }
        return;
      }
      this.elapsed += dt;
      this.life -= dt;
      if (edges && (edges.light || edges.heavy || edges.mouse)) this.push(TUNE.CLASH_PRESS_PUSH, "press");
      const sk = cb.fighters[SIDE.SUKUNA];
      const hpFrac = sk.hp / sk.hpMax;
      const aiPush = TUNE.CLASH_AI_PUSH * cb.ai.difficulty * (0.7 + 0.3 * hpFrac);
      this.tug = clamp6(this.tug - aiPush * dt, -1.2, 1.2);
      if (Math.abs(this.tug) < TUNE.CLASH_STALE_BAND) {
        const dmg = TUNE.CLASH_EROSION_DPS * dt * TUNE.INCOMING_SCALE;
        for (const side of [SIDE.GOJO, SIDE.SUKUNA]) {
          const c = cb.fighters[side];
          if (c.dead) continue;
          c.hp = Math.max(0, c.hp - dmg);
          if (c.hp <= 0) cb.onDeath(c);
        }
      }
      this._fxT -= dt;
      if (this._fxT <= 0) {
        this._fxT = 0.16;
        const tension = 1 - Math.abs(this.tug);
        const mid = new Vector3().lerpVectors(cb.fighters[SIDE.GOJO].p, cb.fighters[SIDE.SUKUNA].p, 0.5);
        mid.y = 2.2;
        cb.fx.lightning({ from: cb.fighters[SIDE.GOJO].ctrl.chest.getWorldPosition(new Vector3()), to: cb.fighters[SIDE.SUKUNA].ctrl.chest.getWorldPosition(new Vector3()), color: this.tug >= 0 ? C.CYAN : C.CRIMSON, color2: C.VIOLET, branches: 3, life: 0.22, width: 0.28, jag: 1.2 });
        cb.fx.screen({ shake: 0.18 + tension * 0.35, chroma: 0.25 + tension * 0.3, vignette: 0.3 + tension * 0.25, blur: 0.15, life: 0.2 });
        if (tension > 0.5) cb.fx.shockwave({ pos: mid, maxRadius: 26, color: C.VIOLET, color2: C.WHITE, life: 0.35, thickness: 0.4 });
      }
      if (this.winner) return;
      if (this.tug >= 1) this.resolve(SIDE.GOJO);
      else if (this.tug <= -1) this.resolve(SIDE.SUKUNA);
      else if (this.life <= 0) {
        if (this.tug >= 0.15) this.resolve(SIDE.GOJO, true);
        else if (this.tug <= -0.15) this.resolve(SIDE.SUKUNA, true);
        else this.resolve(null);
      }
    }
    /**
     * @param {'gojo'|'sukuna'|null} winner null = 双双崩溃
     * @param {boolean} [byTime] 是否因时间上限判定
     */
    resolve(winner, byTime = false) {
      if (this.winner !== null || !this.active) return;
      const cb = this.combat;
      this.winner = winner || "draw";
      this.active = false;
      this._decay = 2;
      const loserSide = winner === SIDE.GOJO ? SIDE.SUKUNA : winner === SIDE.SUKUNA ? SIDE.GOJO : null;
      cb.pushEvent({ type: winner === SIDE.GOJO ? "clash_win" : winner === SIDE.SUKUNA ? "clash_lose" : "clash_draw", winner: winner || "draw", tug: this.tug, elapsed: this.elapsed });
      if (winner && loserSide) {
        const w = cb.fighters[winner];
        const l = cb.fighters[loserSide];
        const dmg = TUNE.CLASH_WIN_DMG[winner];
        cb.banner(winner === SIDE.GOJO ? "领域压制 — 伏魔御厨子 破碎！" : "领域被压制 — 无量空处 破碎！", 2.4);
        cb.fx.callout({
          text: winner === SIDE.GOJO ? "领域破碎" : "领域破碎",
          sub: winner === SIDE.GOJO ? "伏魔御厨子" : "无量空处",
          pos: l.ctrl.chest.getWorldPosition(new Vector3()),
          color: winner === SIDE.GOJO ? C.CYAN : C.CRIMSON,
          color2: C.WHITE,
          life: 1.8,
          size: 2,
          shake: 0.5
        });
        cb.fx.shockwave({ pos: l.p.clone(), maxRadius: 60, color: winner === SIDE.GOJO ? C.CYAN : C.CRIMSON, color2: C.VIOLET, life: 1, thickness: 1.2 });
        cb.fx.screen({ flash: 0.8, color: winner === SIDE.GOJO ? C.CYAN : C.CRIMSON, shake: 1.6, chroma: 0.9, blur: 0.4, life: 0.8 });
        cb.audio.play("ko");
        cb.audio.play("domain_clash", { volume: 0.8 });
        l.hp = Math.max(0, l.hp - dmg * TUNE.INCOMING_SCALE);
        l.burnoutT = TUNE.BURNOUT[loserSide];
        l.stunT = Math.max(l.stunT, TUNE.HITSTUN_HEAVY);
        l.vel.set(0, 0, 0);
        cb.runner.cancel(loserSide, "burnout");
        w.gainDomain(20);
        cb.fx.damageNumber({ pos: l.ctrl.chest.getWorldPosition(new Vector3()), amount: Math.round(dmg * TUNE.INCOMING_SCALE), color: C.GOLD, crit: true, life: 1.4 });
        if (l.hp <= 0) cb.onDeath(l);
      } else {
        cb.banner("领域同时崩坏 — 术式熔断", 2.2);
        cb.fx.screen({ flash: 0.6, color: C.VIOLET, shake: 1.2, chroma: 0.8, life: 0.7 });
        for (const side of [SIDE.GOJO, SIDE.SUKUNA]) {
          const c = cb.fighters[side];
          c.burnoutT = Math.max(c.burnoutT, TUNE.DRAW_BURNOUT);
          c.hp = Math.max(0, c.hp - 90 * TUNE.INCOMING_SCALE);
          cb.runner.cancel(side, "burnout");
          if (c.hp <= 0) cb.onDeath(c);
        }
        cb.audio.play("ko");
      }
      if (byTime) cb.fx.callout({ text: "领域终结", sub: "12s", pos: cb.fighters[SIDE.GOJO].p.clone().setY(3), color: C.VIOLET, color2: C.WHITE, life: 1.2, size: 1.4 });
      cb.domains.onClashResolved(winner || null);
    }
  };
  var DomainRunner = class {
    constructor(combat2) {
      this.combat = combat2;
      this.state = { [SIDE.GOJO]: null, [SIDE.SUKUNA]: null };
      this.clash = new DomainClash(combat2);
      this.clashHandle = null;
      this._endGuard = false;
      this._dotT = 0;
      this._slashT = 0;
    }
    reset() {
      this.close(SIDE.GOJO, "reset");
      this.close(SIDE.SUKUNA, "reset");
      if (this.clashHandle && this.clashHandle.kill) this.clashHandle.kill();
      this.clashHandle = null;
      this.clash.reset();
      this.state[SIDE.GOJO] = null;
      this.state[SIDE.SUKUNA] = null;
      this._dotT = 0;
      this._slashT = 0;
    }
    isOpen(side) {
      const s = this.state[side];
      return !!(s && !s.closed);
    }
    kindOf(side) {
      const s = this.state[side];
      return s && !s.closed ? s.kind : null;
    }
    get clashActive() {
      return this.clash.active;
    }
    /** 展开领域 */
    open(side) {
      const cb = this.combat;
      const c = cb.fighters[side];
      if (!c || c.dead) return;
      const kind = side === SIDE.GOJO ? SKILL.DOMAIN_VOID : SKILL.DOMAIN_SHRINE;
      const life = side === SIDE.GOJO ? TUNE.VOID_SUPPRESS + 2.5 : TUNE.SHRINE_LIFE;
      if (c.burnoutT > 0) return;
      if (this.isOpen(side)) return;
      c.domain = 0;
      c.ctrl.setDomained(true);
      c.ctrl.setAura(true);
      c.ctrl.play("domain_expand");
      const pos = c.ctrl.chest.getWorldPosition(new Vector3());
      const onEnd = () => {
        if (this.state[side] && this.state[side].handle === handle) this.close(side, "weapon_end");
      };
      const handle = side === SIDE.GOJO ? cb.weapons.voidDomain({ pos, life, onEnd }) : cb.weapons.shrineDomain({ pos, life, onEnd });
      this.state[side] = { side, kind, t: 0, life, handle, closed: false };
      cb.fx.groundRing({ pos: c.p.clone(), color: side === SIDE.GOJO ? C.AZURE : C.CRIMSON, color2: C.WHITE, maxRadius: side === SIDE.GOJO ? 40 : 90, life: 1.2, thickness: 0.9 });
      cb.fx.screen({ flash: 0.7, color: side === SIDE.GOJO ? C.AZURE : C.CRIMSON, shake: 0.8, vignette: 0.3, life: 0.8 });
      const other = cb.other(side);
      if (this.isOpen(other)) this.beginClash();
      else {
        cb.modeTo("domain");
        cb.banner(side === SIDE.GOJO ? "无量空处 — 输出窗口！" : "伏魔御厨子 — 快离开领域！", 2);
      }
    }
    beginClash() {
      const cb = this.combat;
      if (this.clash.active || !this.isOpen(SIDE.GOJO) || !this.isOpen(SIDE.SUKUNA)) return;
      this.clash.begin();
      cb.modeTo("domain");
      const vp = cb.fighters[SIDE.GOJO].p.clone();
      const sp = cb.fighters[SIDE.SUKUNA].p.clone();
      this.clashHandle = cb.weapons.domainClash({
        voidPos: vp,
        shrinePos: sp,
        tug: () => this.clash.tug,
        life: TUNE.CLASH_LIFE,
        onEnd: (winner) => {
          if (this._endGuard) return;
          if (this.clash.active) this.clash.resolve(winner === SIDE.SUKUNA ? SIDE.SUKUNA : SIDE.GOJO);
          else this.onClashResolved(winner);
        }
      });
    }
    /** 拉锯判定完成后的收尾 */
    onClashResolved(winner) {
      const cb = this.combat;
      this._endGuard = true;
      if (this.clashHandle && this.clashHandle.kill) this.clashHandle.kill();
      this.clashHandle = null;
      if (winner === SIDE.GOJO) this.close(SIDE.SUKUNA, "broken");
      else if (winner === SIDE.SUKUNA) this.close(SIDE.GOJO, "broken");
      else {
        this.close(SIDE.GOJO, "broken");
        this.close(SIDE.SUKUNA, "broken");
      }
      cb.modeTo("fight");
      cb.audio.stop("music_domain");
      this._endGuard = false;
    }
    /** 关闭一方领域 */
    close(side, reason) {
      const cb = this.combat;
      const s = this.state[side];
      const c = cb.fighters[side];
      if (c) {
        c.ctrl.setDomained(false);
        c.ctrl.setAura(false);
        if (reason !== "reset") c.domainCd = Math.max(c.domainCd, TUNE.DOMAIN_COOLDOWN);
      }
      if (!s || s.closed) {
        this.state[side] = null;
        return;
      }
      s.closed = true;
      if (s.handle && s.handle.kill) s.handle.kill();
      this.state[side] = null;
    }
    update(dt, edges) {
      const cb = this.combat;
      this.clash.update(dt, edges);
      if (this.clash.active) {
        const vs = this.state[SIDE.GOJO];
        const ss = this.state[SIDE.SUKUNA];
        if (vs && vs.handle && vs.handle.setPos) vs.handle.setPos(cb.fighters[SIDE.GOJO].ctrl.chest.getWorldPosition(new Vector3()));
        if (ss && ss.handle && ss.handle.setPos) ss.handle.setPos(cb.fighters[SIDE.SUKUNA].ctrl.chest.getWorldPosition(new Vector3()));
        return;
      }
      for (const side of [SIDE.GOJO, SIDE.SUKUNA]) {
        const s = this.state[side];
        if (!s || s.closed) continue;
        const c = cb.fighters[side];
        const foe = cb.fighters[cb.other(side)];
        s.t += dt;
        if (s.handle && s.handle.setPos) s.handle.setPos(c.ctrl.chest.getWorldPosition(new Vector3()));
        if (c.dead) {
          this.close(side, "dead");
          continue;
        }
        if (side === SIDE.GOJO) {
          const foeAct = foe.action;
          const foeCastingDomain = !!foeAct && !foeAct.done && (foeAct.skill === SKILL.DOMAIN_SHRINE || foeAct.skill === SKILL.DOMAIN_VOID);
          if (!foe.dead && !foeCastingDomain && distXZ(c.p, foe.p) < 60) {
            foe.stunT = Math.max(foe.stunT, 0.22);
            foe.guarding = false;
            cb.runner.cancel(foe.side, "void");
            this._dotT -= dt;
            if (this._dotT <= 0) {
              this._dotT = 0.5;
              const dmg = TUNE.VOID_DOT_DPS * 0.5 * TUNE.INCOMING_SCALE;
              foe.hp = Math.max(0, foe.hp - dmg);
              const p = foe.ctrl.chest.getWorldPosition(new Vector3());
              cb.fx.damageNumber({ pos: p, amount: Math.round(dmg), color: C.AZURE, life: 0.7 });
              cb.fx.hitSpark({ pos: p, color: C.CYAN, count: 8, size: 0.5, life: 0.3 });
              foe.ctrl.hitFlash(1);
              if (foe.hp <= 0) cb.onDeath(foe);
            }
          }
        } else {
          this._slashT -= dt;
          if (this._slashT <= 0) {
            this._slashT = TUNE.SHRINE_SLASH_INTERVAL;
            if (!foe.dead && distXZ(c.p, foe.p) < TUNE.SHRINE_RADIUS) {
              const p = foe.ctrl.chest.getWorldPosition(new Vector3());
              cb.fx.slash({ from: p.clone().add(new Vector3(rand(-4, 4), rand(-2, 2), rand(-4, 4))), to: p.clone().add(new Vector3(rand(-4, 4), rand(-2, 2), rand(-4, 4))), color: C.CRIMSON, color2: C.BLOOD, width: 0.4, life: 0.25, count: 2 });
              cb.resolver.apply({
                from: c,
                to: foe,
                skill: SKILL.DOMAIN_SHRINE,
                dmg: TUNE.SHRINE_DMG,
                dir: _v13.subVectors(foe.p, c.p),
                kb: 1,
                kind: "domain",
                hitstop: TUNE.HITSTOP_LIGHT
              });
              const near = cb.grid.nearest(foe.p.x, foe.p.z, 12);
              if (near && !near.destroyed) cb.grid.destroyBuilding(near, cb.fx, cb.audio);
            } else if (!foe.dead) {
              const near = cb.grid.nearest(foe.p.x, foe.p.z, 14);
              if (near && !near.destroyed) cb.grid.destroyBuilding(near, cb.fx, cb.audio);
            }
          }
        }
        if (s.t >= s.life) this.close(side, "timeout");
      }
      if (cb.mode === "domain" && !this.isOpen(SIDE.GOJO) && !this.isOpen(SIDE.SUKUNA) && !this.clash.active) {
        cb.mode = cb.resultLocked ? cb.mode : "fight";
      }
    }
  };
  var SukunaAI = class {
    constructor(combat2) {
      this.combat = combat2;
      this.enabled = true;
      this.phase = 1;
      this.difficulty = 1;
      this.damageMul = 1;
      this.guardChance = TUNE.AI_GUARD.normal;
      this.reactTime = TUNE.AI_REACT.normal;
      this.decideInterval = TUNE.AI_DECIDE.normal;
      this.decideT = 0;
      this.intent = { kind: "approach", skill: null, until: 0 };
      this.obsBuf = [];
      this.answered = false;
      this.guardCd = 0;
      this.retreatCd = 0;
      this._strafeDir = 1;
      this._strafeT = 0;
      this._cover = null;
      this._coverT = 0;
    }
    reset() {
      this.phase = 1;
      this.decideT = 0;
      this.intent = { kind: "approach", skill: null, until: 0 };
      this.obsBuf.length = 0;
      this.answered = false;
      this.guardCd = 0;
      this._strafeDir = 1;
      this._strafeT = 0;
      this._cover = null;
      this._coverT = 0;
    }
    /** 难度 0.6 / 1.0 / 1.45：影响决策间隔、反应延迟、格挡概率、伤害倍率 */
    setDifficulty(x) {
      const d = clamp6(Number(x) || 1, 0.4, 2.5);
      this.difficulty = d;
      this.reactTime = difficultyCurve(d, TUNE.AI_REACT.easy, TUNE.AI_REACT.normal, TUNE.AI_REACT.hard);
      this.decideInterval = difficultyCurve(d, TUNE.AI_DECIDE.easy, TUNE.AI_DECIDE.normal, TUNE.AI_DECIDE.hard);
      this.guardChance = difficultyCurve(d, TUNE.AI_GUARD.easy, TUNE.AI_GUARD.normal, TUNE.AI_GUARD.hard);
      this.damageMul = difficultyCurve(d, TUNE.AI_DMG.easy, TUNE.AI_DMG.normal, TUNE.AI_DMG.hard);
    }
    /** 记录本帧「真实」玩家状态（AI 之后只能读延迟版本） */
    observe(t) {
      const cb = this.combat;
      const pl = cb.fighters[SIDE.GOJO];
      const sk = cb.fighters[SIDE.SUKUNA];
      const a = pl.action;
      this.obsBuf.push({
        t,
        dist: distXZ(sk.p, pl.p),
        action: a,
        skill: a ? a.skill : null,
        attacking: !!a && !!a.flow.melee && (a.phase === "cast" || a.phase === "active"),
        heavy: !!a && !!a.flow.heavy,
        bigCast: !!a && (a.skill === SKILL.RED || a.skill === SKILL.PURPLE || a.skill === SKILL.PURPLE_200),
        purple: !!a && a.skill === SKILL.PURPLE,
        domainCast: !!a && a.skill === SKILL.DOMAIN_VOID,
        guarding: pl.guarding,
        stunned: pl.stunT > 0,
        invincible: pl.invT > 0,
        /** 玩家挥空/后摇中 —— 宿傩的惩罚窗口 */
        recovering: !!a && a.phase === "recover",
        hpFrac: pl.hp / pl.hpMax,
        px: pl.p.x,
        pz: pl.p.z
      });
      if (this.obsBuf.length > 90) this.obsBuf.shift();
    }
    /** 取 reactTime 之前的那一帧观测 —— 反应延迟，杜绝瞬时外挂 */
    reactionView(t) {
      const want = t - this.reactTime;
      const buf = this.obsBuf;
      for (let i = buf.length - 1; i >= 0; i--) {
        if (buf[i].t <= want) return buf[i];
      }
      return buf[0] || null;
    }
    /** 阶段切换（按血量 100~66 / 66~33 / 33~0） */
    updatePhase() {
      const cb = this.combat;
      const sk = cb.fighters[SIDE.SUKUNA];
      const frac = sk.hp / sk.hpMax;
      const p = frac > 0.66 ? 1 : frac > 0.33 ? 2 : 3;
      if (p === this.phase) return;
      const prev = this.phase;
      this.phase = p;
      sk.drT = 3;
      sk.drAmount = 0.3;
      cb.banner(`宿傩 — 第 ${p} 阶段`, 2);
      cb.fx.screen({ flash: 0.6, color: C.CRIMSON, shake: 0.8, chroma: 0.8, vignette: 0.3, life: 0.8 });
      sk.ctrl.setAura(true);
      if (p >= 2 && prev < 2) {
        cb.fx.callout({ text: "宿傩", sub: "解 · 捌 · 开", pos: sk.ctrl.chest.getWorldPosition(new Vector3()), color: C.CRIMSON, color2: C.BLOOD, life: 1.8, size: 1.6 });
      }
      if (p >= 3) {
        sk.ctrl.setMode("awakened");
        sk.drAmount = 0.25;
        cb.wheel.setVisible(true);
        cb.audio.loop("music_final");
        cb.audio.play("domain_shrine", { volume: 0.55 });
        cb.banner("摩虚罗之轮 — 他开始适应你的术式", 2.6);
        cb.fx.callout({ text: "摩虚罗之轮", sub: "适应", pos: sk.ctrl.chest.getWorldPosition(new Vector3()), color: C.GOLD, color2: C.CRIMSON, life: 2.2, size: 1.8 });
        cb.fx.groundRing({ pos: sk.p.clone(), color: C.GOLD, maxRadius: 18, life: 1, thickness: 0.6 });
      }
    }
    update(dt, t) {
      const cb = this.combat;
      const sk = cb.fighters[SIDE.SUKUNA];
      const pl = cb.fighters[SIDE.GOJO];
      this.updatePhase();
      if (!this.enabled || sk.dead || pl.dead || cb.inputLocked()) {
        this.releaseGuard();
        sk.moveIntent.set(0, 0, 0);
        return;
      }
      this.observe(t);
      const obs = this.reactionView(t);
      this.guardCd = Math.max(0, this.guardCd - dt);
      this.retreatCd = Math.max(0, this.retreatCd - dt);
      if (cb.domains.clashActive) {
        this.releaseGuard();
        sk.moveIntent.set(0, 0, 0);
        sk.ctrl.faceTo(pl.p.x, pl.p.z);
        return;
      }
      if (!obs) return;
      if (obs.domainCast && !this.answered) {
        this.answered = true;
        if (sk.canCast(SKILL.DOMAIN_SHRINE)) {
          sk.ctrl.faceTo(pl.p.x, pl.p.z);
          cb.runner.start(SIDE.SUKUNA, SKILL.DOMAIN_SHRINE);
        } else {
          this.intent = { kind: "retreat", skill: null, until: cb.time + 1 };
        }
      } else if (!obs.domainCast) {
        this.answered = false;
      }
      this.decideT -= dt;
      if (this.decideT <= 0) {
        this.decide(obs);
        this.decideT = this.decideInterval * rand(0.85, 1.2);
      }
      this.act(dt, obs);
    }
    releaseGuard() {
      const sk = this.combat.fighters[SIDE.SUKUNA];
      if (sk.guarding) {
        sk.guarding = false;
        sk.ctrl.setGuard(false);
      }
    }
    /**
     * 效用评分：根据「距离 / 自身咒力 / 玩家状态 / 阶段」给每个候选行为打分，取最高。
     * 同一行为的连续性有惯性加成，避免每帧横跳。
     */
    decide(obs) {
      const cb = this.combat;
      const sk = cb.fighters[SIDE.SUKUNA];
      const ph = this.phase;
      const dist = obs.dist;
      const hpFrac = sk.hp / sk.hpMax;
      const can = (s) => sk.canCast(s);
      const cands = [];
      const add = (kind, score, skill) => {
        if (score > 0) cands.push({ kind, score, skill: skill || null });
      };
      const punish = obs.recovering ? 24 : 0;
      if (can(SKILL.DOMAIN_SHRINE)) add("skill", obs.domainCast ? 140 : 58 + (ph - 1) * 14, SKILL.DOMAIN_SHRINE);
      if (ph >= 3 && can(SKILL.WORLD_SLASH)) add("skill", 84 + (obs.stunned ? 12 : 0) + (dist > 12 ? 8 : 0), SKILL.WORLD_SLASH);
      if (ph >= 2 && can(SKILL.FURNACE) && dist > 9 && dist < SKILL_DATA[SKILL.FURNACE].range) add("skill", 64, SKILL.FURNACE);
      if (can(SKILL.DISMANTLE) && dist > 1.5 && dist < SKILL_DATA[SKILL.DISMANTLE].range) add("skill", 50 + (dist > 22 ? 12 : 0) + punish * 0.6, SKILL.DISMANTLE);
      if (can(SKILL.CLEAVE) && dist <= SKILL_DATA[SKILL.CLEAVE].range + 0.6) add("skill", 58 + ph * 7 + punish, SKILL.CLEAVE);
      if (can(SKILL.RUSH) && dist > 7 && dist < SKILL_DATA[SKILL.RUSH].range) add("skill", 44 + ph * 9 + punish, SKILL.RUSH);
      if (obs.attacking && dist < 7.5 && !obs.invincible && this.guardCd <= 0) {
        add("guard", 20 * this.guardChance + (obs.heavy ? 14 : 0));
      }
      if ((obs.bigCast || obs.purple) && dist < 18) add("dodge", 56 + ph * 6);
      if (obs.heavy && dist < 5.5 && Math.random() < this.guardChance * 0.7) add("dodge", 42);
      add("approach", 34 + (dist > 16 ? 14 : 0) + punish - (hpFrac < 0.22 ? 16 : 0) - (obs.purple ? 22 : 0) + ph * 3);
      if (this.retreatCd <= 0) add("retreat", (hpFrac < 0.35 ? 44 : 6) + (obs.bigCast ? 20 : 0) + (sk.hp < 320 ? 18 : 0));
      add("strafe", 22 + ph * 3 + punish * 0.4);
      for (const c of cands) {
        if (c.kind === this.intent.kind && (!this.intent.skill || c.skill === this.intent.skill)) c.score += 13;
      }
      let best = cands[0];
      for (const c of cands) if (c.score > best.score) best = c;
      this.intent = { kind: best.kind, skill: best.skill, until: cb.time + rand(0.35, 0.75) };
    }
    /** 掩体点：找最近建筑，取「玩家另一侧」的贴墙位置（阶段 2+ 用建筑周旋） */
    coverPoint() {
      const cb = this.combat;
      if (cb.time < this._coverT) return this._cover;
      this._coverT = cb.time + 1.5;
      const sk = cb.fighters[SIDE.SUKUNA];
      const pl = cb.fighters[SIDE.GOJO];
      const b = cb.grid.nearest(sk.p.x, sk.p.z, 40);
      if (!b || b.destroyed) {
        this._cover = null;
        return null;
      }
      const p = b.mesh.position;
      const dx = p.x - pl.p.x;
      const dz = p.z - pl.p.z;
      const len = Math.hypot(dx, dz) || 1;
      const r = (b.radius || 6) + 3;
      this._cover = new Vector3(p.x + dx / len * r, 0, p.z + dz / len * r);
      return this._cover;
    }
    act(dt, obs) {
      const cb = this.combat;
      const sk = cb.fighters[SIDE.SUKUNA];
      const pl = cb.fighters[SIDE.GOJO];
      const dist = distXZ(sk.p, pl.p);
      const intent = this.intent;
      if (sk.action && !sk.action.done) {
        sk.ctrl.faceTo(pl.p.x, pl.p.z);
        return;
      }
      sk.ctrl.faceTo(pl.p.x, pl.p.z);
      switch (intent.kind) {
        case "skill": {
          const s = intent.skill;
          const canUse = SKILL_DATA[s] || null;
          const ok = s && canUse && sk.canCast(s) && (s !== SKILL.CLEAVE || dist <= canUse.range + 0.6) && (s !== SKILL.FURNACE || dist < canUse.range && dist > 6) && (s !== SKILL.DISMANTLE || dist > 1.5 && dist < canUse.range);
          if (ok) {
            this.releaseGuard();
            cb.runner.start(SIDE.SUKUNA, s);
            this.intent = { kind: "approach", skill: null, until: cb.time + 0.25 };
            return;
          }
          this.intent = { kind: "approach", skill: null, until: cb.time + 0.3 };
          break;
        }
        case "guard": {
          sk.guarding = true;
          sk.ctrl.setGuard(true);
          sk.moveIntent.set(0, 0, 0);
          this.guardCd = rand(1, 1.7);
          if (cb.time > intent.until || dist > 6) this.intent = { kind: "approach", skill: null, until: cb.time + 0.2 };
          return;
        }
        case "dodge": {
          this.releaseGuard();
          const side = this._strafeDir;
          const dx = pl.p.x - sk.p.x;
          const dz = pl.p.z - sk.p.z;
          const l = Math.hypot(dx, dz) || 1;
          const nx = -dz / l * side;
          const nz = dx / l * side;
          sk.vel.x += nx * 9;
          sk.vel.z += nz * 9;
          sk.ctrl.moveTowards(sk.p.x + nx * 8, sk.p.z + nz * 8, TUNE.SUKUNA_RUN, dt);
          sk.moveIntent.set(nx, 0, nz);
          if (cb.time > intent.until) {
            this._strafeDir *= -1;
            this.intent = { kind: "strafe", skill: null, until: cb.time + 0.4 };
          }
          return;
        }
        case "retreat": {
          this.releaseGuard();
          this.retreatCd = rand(2.6, 4.2);
          let tx;
          let tz;
          const cover = this.phase >= 2 ? this.coverPoint() : null;
          if (cover) {
            tx = cover.x;
            tz = cover.z;
          } else {
            const dx = sk.p.x - pl.p.x;
            const dz = sk.p.z - pl.p.z;
            const l = Math.hypot(dx, dz) || 1;
            tx = sk.p.x + dx / l * 14;
            tz = sk.p.z + dz / l * 14;
          }
          tx = clamp6(tx, -170, 170);
          tz = clamp6(tz, -170, 170);
          sk.ctrl.moveTowards(tx, tz, TUNE.SUKUNA_RUN, dt);
          sk.moveIntent.set(tx - sk.p.x, 0, tz - sk.p.z);
          if (cb.time > intent.until) this.intent = { kind: "approach", skill: null, until: cb.time + 0.4 };
          return;
        }
        case "strafe": {
          this.releaseGuard();
          this._strafeT -= dt;
          if (this._strafeT <= 0) {
            this._strafeT = rand(0.8, 1.8);
            this._strafeDir *= -1;
          }
          const dx = pl.p.x - sk.p.x;
          const dz = pl.p.z - sk.p.z;
          const l = Math.hypot(dx, dz) || 1;
          const nx = -dz / l * this._strafeDir;
          const nz = dx / l * this._strafeDir;
          sk.ctrl.moveTowards(sk.p.x + nx * 10, sk.p.z + nz * 10, TUNE.SUKUNA_MOVE * 1.35, dt);
          sk.moveIntent.set(nx, 0, nz);
          return;
        }
        default: {
          this.releaseGuard();
          if (dist > 4.4) {
            if (this.phase >= 2) {
              const dx = pl.p.x - sk.p.x;
              const dz = pl.p.z - sk.p.z;
              const l = Math.hypot(dx, dz) || 1;
              const nx = -dz / l * this._strafeDir * 0.45;
              const nz = dx / l * this._strafeDir * 0.45;
              sk.ctrl.moveTowards(pl.p.x + nx * 4, pl.p.z + nz * 4, TUNE.SUKUNA_RUN, dt);
            } else {
              sk.ctrl.moveTowards(pl.p.x, pl.p.z, TUNE.SUKUNA_MOVE * 1.25, dt);
            }
            sk.moveIntent.set(pl.p.x - sk.p.x, 0, pl.p.z - sk.p.z);
          } else {
            sk.moveIntent.set(0, 0, 0);
          }
        }
      }
    }
  };
  function emptyInput() {
    return {
      moveX: 0,
      moveZ: 0,
      light: false,
      heavy: false,
      blue: false,
      red: false,
      purple: false,
      heal: false,
      dodge: false,
      dash: false,
      domain: false,
      lockOn: false,
      charge: false,
      mouse: { pressed: false }
    };
  }
  function createCombat(deps) {
    /**
     * camera 必须解构出来：移动输入是**屏幕空间**的，要靠相机偏航旋转到世界坐标。
     * 原来这个解构里没有 camera，导致"相对镜头移动"实际退化成世界坐标 ——
     * 开局相机恰好在角色正后方所以看不出问题，一打起来相机跟着对手转，
     * 前进键就变成了后退键。
     */
    const { scene: scene2, fx: fx2, weapons: weapons2, audio: audio2, city: city2, gojo: gojo2, sukuna: sukuna2, camera: camRef } = deps;
    const grid = new BuildingGrid(city2 && city2.buildings ? city2.buildings : [], 24);
    const wheel = new MahoragaWheel(scene2);
    const cb = {
      time: 0,
      mode: "fight",
      resultLocked: false,
      hitstop: 0,
      bfWindowUntil: 0,
      bfCd: 0,
      bfCount: 0,
      combo: 0,
      comboT: 0,
      hintFlags: { dodge: false, domain: false, heal: false, purple: false },
      hinted: {},
      fighters: null,
      grid,
      wheel,
      fx: fx2,
      weapons: weapons2,
      audio: audio2,
      runner: null,
      resolver: null,
      domains: null,
      ai: null,
      other(side) {
        return side === SIDE.GOJO ? SIDE.SUKUNA : SIDE.GOJO;
      },
      inputLocked() {
        return cb.resultLocked || cb.mode === "intro" || cb.mode === "victory" || cb.mode === "defeat";
      },
      /** 所有内部模式切换都走这里：胜负已定后不再被任何流程覆盖 */
      modeTo(m) {
        if (!cb.resultLocked) cb.mode = m;
      },
      banner(text, dur = 1.6) {
        cb.bannerText = text || "";
        cb.bannerTimer = text ? dur : 0;
        if (text) cb.pushEvent({ type: "banner", text: cb.bannerText, dur });
      },
      /** 本帧事件流（main.js 的演出/统计依赖；update 开头清空，过程中累积） */
      events: [],
      pushEvent(e) {
        if (cb.events.length < 64) cb.events.push(e);
      },
      /** 持续场（苍的引力球 / 赫的斥力弹） */
      fields: [],
      bannerText: "",
      bannerTimer: 0,
      /** 玩家招式对宿傩的适应倍率（阶段 3） */
      adaptMul(skill) {
        const n = cb.fighters[SIDE.SUKUNA].adapt.get(skill) || 0;
        return Math.max(TUNE.ADAPT_FLOOR, 1 - n * TUNE.ADAPT_PER_HIT);
      },
      adaptSkill(skill) {
        const sk = cb.fighters[SIDE.SUKUNA];
        const n = (sk.adapt.get(skill) || 0) + 1;
        sk.adapt.set(skill, n);
        sk.adaptTotal++;
        wheel.light(sk.adaptTotal);
        const p = sk.ctrl.chest.getWorldPosition(new Vector3());
        fx2.hitSpark({ pos: p, color: C.GOLD, count: 6, size: 0.4, life: 0.3 });
        fx2.callout({ text: "适应", sub: SKILL_DATA[skill] ? SKILL_DATA[skill].name : "", pos: p.clone(), color: C.GOLD, color2: C.INK, life: 0.7, size: 0.9, rise: 1 });
        if (sk.adaptTotal === TUNE.WHEEL_SEGMENTS) cb.banner("摩虚罗之轮 — 适应完成", 2.2);
      },
      sukunaPhase() {
        return cb.ai.phase;
      },
      tryHint(kind, text) {
        if (!cb.hintFlags[kind] || cb.hinted[kind]) return;
        cb.hinted[kind] = true;
        cb.banner(text, 2.6);
      },
      onHitLanded(attacker, victim, dmg, blackFlash) {
        if (!attacker) return;
        if (attacker.side === SIDE.GOJO) {
          cb.combo++;
          cb.comboT = TUNE.COMBO_TIMEOUT;
          if (cb.combo === 3) cb.banner("连段 ×3", 0.8);
        }
        if (victim && victim.side === SIDE.GOJO) {
          cb.tryHint("dodge", "空格：无下限术式 — 0.4s 完全免疫");
          cb.combo = 0;
        }
      },
      onDeath(c) {
        if (c.dead) return;
        c.dead = true;
        c.hp = 0;
        c.vel.set(0, 0, 0);
        cb.runner.cancel(c.side, "death");
        if (cb.domains.isOpen(c.side)) cb.domains.close(c.side, "dead");
        audio2.play("death");
        cb.setResult(c.side === SIDE.SUKUNA ? "victory" : "defeat");
      },
      onActionEnd(a) {
        if (!a.actor.dead) a.actor.ctrl.setAura(false);
      },
      setResult(m) {
        if (cb.resultLocked) return;
        cb.resultLocked = true;
        cb.domains.close(SIDE.GOJO, "result");
        cb.domains.close(SIDE.SUKUNA, "result");
        wheel.setVisible(false);
        cb.mode = m;
        audio2.stop("music_battle");
        audio2.stop("music_domain");
        audio2.stop("music_final");
        if (m === "victory") {
          gojo2.play("victory");
          sukuna2.play("defeat");
          audio2.play("victory");
          fx2.screen({ freeze: 0.6, blur: 0.7, desaturate: 0.35, shake: 0.5, life: 1.2 });
          fx2.callout({ text: "胜利", sub: "VICTORY", pos: gojo2.chest.getWorldPosition(new Vector3()), color: C.CYAN, color2: C.WHITE, life: 3, size: 2.6 });
          cb.banner("宿傩 讨伐", 4);
        } else {
          sukuna2.play("victory");
          gojo2.play("defeat");
          audio2.play("defeat");
          fx2.screen({ freeze: 0.5, blur: 0.5, desaturate: 0.7, vignette: 0.7, life: 1.4 });
          fx2.callout({ text: "败北", sub: "DEFEAT", pos: gojo2.chest.getWorldPosition(new Vector3()), color: C.CRIMSON, color2: C.INK, life: 3, size: 2.6 });
          cb.banner("五条悟 败北", 4);
        }
      }
    };
    cb.fighters = {
      [SIDE.GOJO]: new Combatant(cb, SIDE.GOJO, gojo2, TUNE.HP_MAX[SIDE.GOJO]),
      [SIDE.SUKUNA]: new Combatant(cb, SIDE.SUKUNA, sukuna2, TUNE.HP_MAX[SIDE.SUKUNA])
    };
    cb.fighters[SIDE.GOJO].height = 1.9;
    cb.fighters[SIDE.SUKUNA].height = 1.85;
    cb.resolver = new HitResolver(cb);
    cb.runner = new SkillRunner(cb);
    cb.domains = new DomainRunner(cb);
    cb.ai = new SukunaAI(cb);
    cb.ai.setDifficulty(1);
    const BTN = ["light", "heavy", "blue", "red", "purple", "heal", "dodge", "dash", "domain", "lockOn", "charge"];
    const cur = emptyInput();
    const prev = emptyInput();
    const edges = { mouse: false };
    const pending = { mouse: false };
    const eff = { mouse: false };
    for (const k of BTN) {
      edges[k] = false;
      pending[k] = false;
      eff[k] = false;
    }
    function refreshEff() {
      for (const k of BTN) eff[k] = edges[k] || pending[k];
      eff.mouse = edges.mouse || pending.mouse;
    }
    function clearPending() {
      for (const k of BTN) pending[k] = false;
      pending.mouse = false;
    }
    function latchPending() {
      for (const k of BTN) pending[k] = pending[k] || edges[k];
      pending.mouse = pending.mouse || edges.mouse;
    }
    function readInput(input) {
      const src = input || {};
      cur.moveX = Number(src.moveX) || 0;
      cur.moveZ = Number(src.moveZ) || 0;
      for (const k of BTN) cur[k] = !!src[k];
      cur.mouse.pressed = !!(src.mouse && src.mouse.pressed);
      for (const k of BTN) edges[k] = cur[k] && !prev[k];
      edges.mouse = cur.mouse.pressed && !prev.mouse.pressed;
    }
    function savePrev() {
      prev.moveX = cur.moveX;
      prev.moveZ = cur.moveZ;
      for (const k of BTN) prev[k] = cur[k];
      prev.mouse.pressed = cur.mouse.pressed;
    }
    function startInfinity(pl, inp) {
      pl.invT = TUNE.INFINITY_TIME;
      pl.infinityT = TUNE.INFINITY_TIME;
      pl.infinityCd = TUNE.INFINITY_TIME + TUNE.INFINITY_CD;
      playAnim(pl.ctrl, "guard_infinity");
      pl.ctrl.setGuard(true);
      pl.ctrl.setAura(true);
      const chest = pl.ctrl.chest.getWorldPosition(new Vector3());
      pl.infHandle = weapons2.infinityShield({ pos: chest, radius: 1.9, follow: pl.ctrl.root, life: TUNE.INFINITY_TIME });
      audio2.play("guard_infinity");
      fx2.screen({ chroma: 0.45, color: C.CYAN, vignette: 0.2, life: 0.3 });
      fx2.groundRing({ pos: pl.p.clone(), color: C.CYAN, color2: C.WHITE, maxRadius: 4.5, life: 0.35, thickness: 0.25 });
      let dx = inp.moveX;
      let dz = inp.moveZ;
      if (Math.hypot(dx, dz) < 0.15) {
        const foe = cb.fighters[SIDE.SUKUNA];
        dx = pl.p.x - foe.p.x;
        dz = pl.p.z - foe.p.z;
      }
      const l = Math.hypot(dx, dz) || 1;
      pl.vel.x += dx / l * TUNE.DODGE_SPEED;
      pl.vel.z += dz / l * TUNE.DODGE_SPEED;
      cb.tryHint("dodge", "无下限 — 攻击在触及前被无限细分");
    }
    function canChainNow(pl) {
      if (pl.stunT > 0) return false;
      const a = pl.action;
      if (!a || a.done) return true;
      if (!a.flow.melee) return false;
      if (a.phase === "recover") return true;
      return a.hitLanded && a.t >= a.flow.cast + TUNE.CHAIN_MIN_GAP;
    }
    function updatePlayer(dt, inp) {
      const pl = cb.fighters[SIDE.GOJO];
      const foe = cb.fighters[SIDE.SUKUNA];
      if (pl.dead) return;
      refreshEff();
      const E = eff;
      if (cb.domains.clashActive) {
        pl.moveIntent.set(0, 0, 0);
        pl.ctrl.faceTo(foe.p.x, foe.p.z);
        clearPending();
        return;
      }
      if (pl.stunT > 0) {
        pl.moveIntent.set(0, 0, 0);
        clearPending();
        return;
      }
      if (E.dodge && pl.infinityCd <= 0) startInfinity(pl, inp);
      /**
       * 移动方向：输入是**屏幕空间**的（W = 屏幕上/远离镜头），必须先按相机偏航
       * 旋转到世界坐标再交给角色。
       *
       * ⚠ 这里原来直接把 inp.moveX/moveZ 当世界坐标用 —— 开局相机正好在角色正后方
       *   （yaw≈0），两套坐标碰巧一致，所以看起来是对的；**一打起来相机跟着对手转**，
       *   "屏幕上的前"就和"世界 -z"不再重合，玩家按前进角色却往后退，
       *   这就是用户报的「移动键是反的，打斗之后就变反了」。
       *
       * 偏航从相机位置反推（相机和角色的水平连线），不额外依赖 main.js 传参：
       *   sin(yaw) = dx/len，cos(yaw) = dz/len
       *   "远离镜头" = -(sin,cos)，"屏幕右" = (cos,-sin)
       */
      let mx = inp.moveX;
      let mz = inp.moveZ;
      const mag = Math.hypot(mx, mz);
      if (mag > 1) {
        mx /= mag;
        mz /= mag;
      }
      if (mag > 0.08) {
        const cdx = camRef ? camRef.position.x - pl.p.x : 0;
        const cdz = camRef ? camRef.position.z - pl.p.z : 1;
        const clen = Math.hypot(cdx, cdz);
        if (clen > 1e-4) {
          const sy = cdx / clen, cy = cdz / clen;
          const wmx = mx * cy + mz * sy;
          const wmz = mz * cy - mx * sy;
          const wlen = Math.hypot(wmx, wmz);
          if (wlen > 1e-6) { mx = wmx / wlen; mz = wmz / wlen; }
        }
        const sp = inp.dash ? TUNE.DASH_SPEED : TUNE.MOVE_SPEED;
        pl.ctrl.moveTowards(pl.p.x + mx * 14, pl.p.z + mz * 14, sp, dt);
        pl.moveIntent.set(mx, 0, mz);
        if (inp.dash && Math.random() < 0.08) audio2.play("dash", { volume: 0.3 });
      } else {
        pl.moveIntent.set(0, 0, 0);
      }
      const a = pl.action;
      if (inp.lockOn || a && !a.done) pl.ctrl.faceTo(foe.p.x, foe.p.z);
      else if (mag > 0.08) pl.ctrl.faceTo(pl.p.x + mx, pl.p.z + mz);
      if (edges.blue && pl.canCast(SKILL.BLUE)) cb.runner.start(SIDE.GOJO, SKILL.BLUE);
      if (edges.red && pl.canCast(SKILL.RED)) cb.runner.start(SIDE.GOJO, SKILL.RED);
      if (edges.heal && pl.canCast(SKILL.REVERSE)) {
        cb.runner.start(SIDE.GOJO, SKILL.REVERSE);
        cb.tryHint("heal", "反转术式 — 0.6s 吟唱，可被打断");
      }
      if (edges.domain && pl.canCast(SKILL.DOMAIN_VOID)) {
        cb.runner.start(SIDE.GOJO, SKILL.DOMAIN_VOID);
        cb.tryHint("domain", "无量空处 — 领域槽满时按 G 展开");
      }
      const pa = pl.action && pl.action.skill === SKILL.PURPLE && !pl.action.done ? pl.action : null;
      if (pa && pa.phase === "charge") {
        if (!inp.purple && !pa.force) pa.data.wantRelease = true;
      } else if (inp.purple && pl.canCast(SKILL.PURPLE) && !(pl.action && !pl.action.done)) {
        cb.runner.start(SIDE.GOJO, SKILL.PURPLE);
        cb.tryHint("purple", "茈 — 蓄力越久威力越强，沿途摧毁建筑");
      }
      const p2 = pl.action && pl.action.skill === SKILL.PURPLE_200 && !pl.action.done ? pl.action : null;
      if (p2) {
        if (!inp.charge && !p2.force) cb.runner.cancel(SIDE.GOJO, "abort");
      } else if (inp.charge && !pl.action && pl.p200Cd <= 0 && !pl.isBurnoutLocked(SKILL.PURPLE_200)) {
        pl.p200Cd = TUNE.PURPLE200_RELOAD;
        cb.runner.start(SIDE.GOJO, SKILL.PURPLE_200);
      }
      if (E.light || E.mouse) {
        pl.buf = "light";
        pl.bufT = TUNE.INPUT_BUFFER;
      } else if (E.heavy) {
        pl.buf = "heavy";
        pl.bufT = TUNE.INPUT_BUFFER;
      }
      if (pl.buf && canChainNow(pl)) {
        const isLight = pl.buf === "light";
        const stage = isLight && pl.chainT > 0 && pl.chain < 2 ? pl.chain + 1 : 0;
        if (isLight && stage === 0 && pl.cdOf(SKILL.PUNCH) > 0) {
        } else {
          if (isLight) {
            pl.chain = stage;
            pl.chainT = TUNE.CHAIN_WINDOW;
            cb.runner.start(SIDE.GOJO, SKILL.PUNCH, { chainStage: stage });
          } else {
            pl.chain = 0;
            cb.runner.start(SIDE.GOJO, SKILL.KICK);
          }
          pl.buf = null;
          pl.bufT = 0;
        }
      }
      clearPending();
    }
    function updateFields(d) {
      for (let i = cb.fields.length - 1; i >= 0; i--) {
        const f = cb.fields[i];
        f.t += d;
        let keep = true;
        try {
          keep = f.update(d) !== false;
        } catch (err) {
          keep = false;
        }
        if (!keep || f.t >= f.life) {
          if (f.handle && f.handle.alive && f.handle.kill) f.handle.kill();
          cb.fields.splice(i, 1);
        }
      }
    }
    function update2(input, dt, t) {
      const d = clamp6(Number(dt) || 0, 0, 0.05);
      cb.events.length = 0;
      readInput(input);
      const pl = cb.fighters[SIDE.GOJO];
      const sk = cb.fighters[SIDE.SUKUNA];
      if (cb.hitstop > 0) {
        cb.hitstop = Math.max(0, cb.hitstop - d);
        latchPending();
        savePrev();
        return;
      }
      cb.time += d;
      cb.bfCd = Math.max(0, cb.bfCd - d);
      if (!cb.inputLocked()) updatePlayer(d, cur);
      cb.ai.update(d, cb.time);
      cb.runner.update(d);
      updateFields(d);
      cb.domains.update(d, edges);
      for (const side of [SIDE.GOJO, SIDE.SUKUNA]) {
        const c = cb.fighters[side];
        c.tick(d);
        if (c.vel.lengthSq() > 1e-4) cb.resolver.wallSmash(c, Math.hypot(c.vel.x, c.vel.z));
        c.syncState(c.moveIntent.lengthSq() > 0.01);
        c.ctrl.update(d);
        c.p.copy(c.ctrl.getPos());
        if (c.infinityT <= 0 && c.infHandle) {
          if (c.infHandle.kill) c.infHandle.kill();
          c.infHandle = null;
          if (!c.guarding) c.ctrl.setGuard(false);
          c.ctrl.setAura(false);
        }
      }
      if (cb.ai.phase >= 3 && !sk.dead) {
        wheel.setVisible(true);
        wheel.update(d, sk.p);
      }
      if (cb.comboT > 0) {
        cb.comboT -= d;
        if (cb.comboT <= 0) cb.combo = 0;
      }
      if (cb.bannerTimer > 0) cb.bannerTimer = Math.max(0, cb.bannerTimer - d);
      if (!cb.resultLocked) {
        const frac = Math.min(pl.hp / pl.hpMax, sk.hp / sk.hpMax);
        if (!cb.domains.clashActive && !cb.domains.isOpen(SIDE.GOJO) && !cb.domains.isOpen(SIDE.SUKUNA)) {
          cb.mode = frac < 0.12 ? "finish" : "fight";
        } else if (cb.domains.clashActive) {
          cb.mode = "domain";
        }
      }
      for (const c of [pl, sk]) if (!c.dead && c.hp <= 0) cb.onDeath(c);
      savePrev();
    }
    const SKILL_BAR = [SKILL.BLUE, SKILL.RED, SKILL.PURPLE, SKILL.REVERSE, SKILL.DOMAIN_VOID];
    const snap = {
      gojo: null,
      sukuna: null,
      tug: 0,
      clashActive: false,
      gojoDomain: null,
      sukunaDomain: null,
      combo: 0,
      comboTimer: 0,
      blackFlashReady: 0,
      chargeT: 0,
      phase: 1,
      distance: 0,
      skills: [],
      banner: "",
      bannerT: 0,
      mode: "fight",
      events: cb.events,
      // 与 update 共用同一个数组引用
      // —— 以下为契约之外的扩展字段（HUD 可选读；契约要求的键一个不少）——
      burnout: { gojo: 0, sukuna: 0 },
      // 术式熔断剩余时间
      adapt: { total: 0, wheel: 0 }
      // 摩虚罗适应：次数 / 点亮格数
    };
    snap.gojo = Object.assign({}, gojo2.state, { burnout: 0 });
    snap.sukuna = Object.assign({}, sukuna2.state, { burnout: 0 });
    for (let i = 0; i < SKILL_BAR.length; i++) snap.skills.push({ skill: SKILL_BAR[i], cd: 0, cdMax: 0, cost: 0, ready: false });
    function copyState(dst, src, burnout) {
      dst.hp = src.hp;
      dst.hpMax = src.hpMax;
      dst.ce = src.ce;
      dst.ceMax = src.ceMax;
      dst.domain = src.domain;
      dst.dead = src.dead;
      dst.anim = src.anim;
      dst.animT = src.animT;
      dst.phase = src.phase;
      dst.burnout = burnout;
      return dst;
    }
    function getSnapshot() {
      const pl = cb.fighters[SIDE.GOJO];
      const sk = cb.fighters[SIDE.SUKUNA];
      copyState(snap.gojo, gojo2.state, pl.burnoutT);
      copyState(snap.sukuna, sukuna2.state, sk.burnoutT);
      snap.tug = cb.domains.clash.tug;
      snap.clashActive = cb.domains.clash.active;
      snap.gojoDomain = cb.domains.kindOf(SIDE.GOJO);
      snap.sukunaDomain = cb.domains.kindOf(SIDE.SUKUNA);
      snap.combo = cb.combo;
      snap.comboTimer = Math.max(0, cb.comboT);
      snap.blackFlashReady = clamp6((cb.bfWindowUntil - cb.time) / TUNE.BLACK_FLASH_WINDOW, 0, 1);
      snap.chargeT = chargeProgress(pl);
      snap.phase = cb.ai.phase;
      snap.distance = distXZ(pl.p, sk.p);
      snap.banner = cb.bannerText;
      snap.bannerT = cb.bannerTimer;
      snap.mode = cb.mode;
      snap.burnout.gojo = pl.burnoutT;
      snap.burnout.sukuna = sk.burnoutT;
      snap.adapt.total = sk.adaptTotal;
      snap.adapt.wheel = wheel.lit;
      for (let i = 0; i < SKILL_BAR.length; i++) {
        const s = SKILL_BAR[i];
        const d = SKILL_DATA[s];
        const row = snap.skills[i];
        row.skill = s;
        row.cd = pl.cdOf(s) + (s === SKILL.DOMAIN_VOID ? pl.domainCd : 0);
        row.cdMax = d.cd;
        row.cost = d.cost;
        if (s === SKILL.DOMAIN_VOID) {
          row.ready = !pl.dead && pl.domain >= pl.domainMax && pl.domainCd <= 0 && !pl.isBurnoutLocked(s);
        } else {
          row.ready = !pl.dead && pl.cdOf(s) <= 0 && pl.ce >= d.cost && !pl.isBurnoutLocked(s);
        }
      }
      return snap;
    }
    function chargeProgress(pl) {
      const a = pl.action;
      if (!a || a.done) return 0;
      if (a.skill === SKILL.PURPLE && a.phase === "charge") return clamp6(a.charge / TUNE.PURPLE_CHARGE_MAX, 0, 1);
      if (a.skill === SKILL.PURPLE_200) return clamp6(a.t / a.flow.cast, 0, 1);
      return 0;
    }
    const api = {
      update: update2,
      getSnapshot,
      gojo: gojo2,
      sukuna: sukuna2,
      /** 播片/剧情强制出招：无视 CD 与咒力 */
      forceSkill(skill, side) {
        const c = cb.fighters[side];
        if (!c || c.dead) return;
        if (skill === SKILL.INFINITY) {
          if (side === SIDE.GOJO) startInfinity(c, cur);
          return;
        }
        if (skill === SKILL.DOMAIN_VOID || skill === SKILL.DOMAIN_SHRINE) {
          c.domain = c.domainMax;
          c.domainCd = 0;
        }
        c.burnoutT = 0;
        cb.runner.cancel(side, "force");
        cb.runner.start(side, skill, { force: true });
      },
      applyDamage(side, amount, opts = {}) {
        const c = cb.fighters[side];
        if (!c || c.dead || cb.resultLocked) return;
        if (c.forcedInv && !opts.force) return;
        const dmg = Math.max(0, Number(amount) || 0);
        c.hp = Math.max(0, c.hp - dmg);
        const p = c.ctrl.chest.getWorldPosition(new Vector3());
        c.ctrl.hitFlash(dmg >= TUNE.HEAVY_DMG_LINE ? 2 : 1);
        c.stunT = Math.max(c.stunT, dmg >= TUNE.HEAVY_DMG_LINE ? TUNE.HITSTUN_HEAVY : TUNE.HITSTUN_LIGHT);
        cb.runner.cancel(side, "hit");
        if (!opts.silent) {
          fx2.damageNumber({ pos: p, amount: Math.round(dmg), color: opts.crit ? C.GOLD : C.WHITE, crit: !!opts.crit, life: 1 });
          fx2.hitSpark({ pos: p, color: opts.crit ? C.GOLD : C.WHITE, count: opts.crit ? 24 : 12, size: 0.7, life: 0.3 });
          fx2.screen({ shake: dmg >= TUNE.HEAVY_DMG_LINE ? 0.9 : 0.35, life: 0.3 });
          audio2.play(dmg >= TUNE.HEAVY_DMG_LINE ? "hit_heavy" : "hit_light");
        }
        c.gainDomain(TUNE.DOMAIN_ON_TAKE);
        if (c.hp <= 0) cb.onDeath(c);
      },
      setMode(m) {
        cb.mode = String(m || "fight");
      },
      banner(text, dur = 1.6) {
        cb.banner(text, dur);
      },
      /** 完全复位：血量 / 位置 / CD / 领域 / 建筑 / 特效 */
      reset() {
        cb.time = 0;
        cb.resultLocked = false;
        cb.mode = "fight";
        cb.hitstop = 0;
        cb.bfWindowUntil = 0;
        cb.bfCd = 0;
        cb.bfCount = 0;
        cb.combo = 0;
        cb.comboT = 0;
        cb.hinted = {};
        cb.bannerText = "";
        cb.bannerTimer = 0;
        cb.runner.actions.clear();
        for (const f of cb.fields) if (f.handle && f.handle.alive && f.handle.kill) f.handle.kill();
        cb.fields.length = 0;
        cb.domains.reset();
        cb.ai.reset();
        cb.ai.setDifficulty(cb.ai.difficulty);
        const g = cb.fighters[SIDE.GOJO];
        const s = cb.fighters[SIDE.SUKUNA];
        for (const c of [g, s]) {
          if (c.infHandle && c.infHandle.kill) c.infHandle.kill();
          c.reset();
          c.ctrl.reset();
          c.ctrl.setDomained(false);
          c.ctrl.setGuard(false);
          c.ctrl.setAura(false);
          c.ctrl.setVisible(true);
          c.ctrl.setMode("normal");
          c.ctrl.setScale(1);
        }
        g.ctrl.setPos(0, 0, 16);
        s.ctrl.setPos(0, 0, -16);
        g.p.set(0, 0, 16);
        s.p.set(0, 0, -16);
        g.ctrl.faceTo(0, -16, true);
        s.ctrl.faceTo(0, 16, true);
        g.ctrl.play("idle");
        s.ctrl.play("idle");
        g.syncState(false);
        s.syncState(false);
        if (city2 && city2.buildings) {
          for (const b of city2.buildings) if (b.reset) b.reset();
        }
        grid.resetStats();
        wheel.reset();
        fx2.clear();
        weapons2.clear();
        if (prev) {
          Object.assign(prev, emptyInput());
          Object.assign(cur, emptyInput());
        }
        audio2.stop("music_domain");
      },
      setInvincible(which, on) {
        const c = cb.fighters[which];
        if (!c) return;
        c.forcedInv = !!on;
        if (on) c.invT = Math.max(c.invT, 999);
        else c.invT = 0;
        c.ctrl.setGuard(!!on);
      },
      setAiEnabled(on) {
        cb.ai.enabled = !!on;
        if (!on) {
          const sk = cb.fighters[SIDE.SUKUNA];
          sk.guarding = false;
          sk.ctrl.setGuard(false);
          sk.moveIntent.set(0, 0, 0);
        }
      },
      setDifficulty(x) {
        cb.ai.setDifficulty(x);
      },
      tutorialHint(kind, on) {
        if (kind in cb.hintFlags) cb.hintFlags[kind] = !!on;
        if (!on) delete cb.hinted[kind];
      }
    };
    api.reset();
    cb.mode = "fight";
    cb.bannerText = "";
    cb.bannerTimer = 0;
    return api;
  }
