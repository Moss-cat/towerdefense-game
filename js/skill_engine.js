/* skill_engine.js — 综合技能系统引擎
   让 20 塔技能、30+ 敌特性、所有芯片效果在战斗中生效。
   暴露 window.SkillEngine，供 game.js 在循环中调入。
*/
(function () {
    'use strict';
    if (window.SkillEngine && window.SkillEngine.ready) return;
    var SE = window.SkillEngine = {}, GS = null, Core = null, _initFlag = false;
    SE.ready = false;

    SE.init = function (gs) {
        GS = gs || window.GameState; Core = window.Core;
        GS.fireZones = GS.fireZones || []; GS.sentries = GS.sentries || [];
        GS.drones = GS.drones || []; GS.minions = GS.minions || [];
        GS.voidRifts = GS.voidRifts || []; GS.stealthTowers = GS.stealthTowers || [];
        GS.poisonClouds = GS.poisonClouds || []; GS.stunParticles = GS.stunParticles || [];
        GS.lightningBeams = GS.lightningBeams || []; GS.frostRings = GS.frostRings || [];
        GS.thornAuras = GS.thornAuras || [];
        _initFlag = true; SE.ready = true;
    };

    function dist2(ax, ay, bx, by) { var dx = ax - bx, dy = ay - by; return dx * dx + dy * dy; }
    function dist(ax, ay, bx, by) { return Math.sqrt(dist2(ax, ay, bx, by)); }
    function spawnP(x, y, c, n) { if (Core && Core.spawnParticles) Core.spawnParticles(x, y, c, n); }
    function spawnF(x, y, t, c, s) { if (Core && Core.spawnFloat) Core.spawnFloat(x, y, t, c, s || 14); }
    function clamp(v, a, b) { return v < a ? a : (v > b ? b : v); }
    function rand(a, b) { return a + Math.random() * (b - a); }

    // ========== Tower 分类映射 (proto + element → skill 类名) ==========
    var CLASS_MAP = {
        archer_fire: '范围灼烧', archer_ice: '减速控制',
        archer_lightning: '连锁闪电', archer_poison: '传染DOT',
        archer_arcane: '概率暴击',
        cannon_fire: '蓄力落雷', cannon_ice: '击退水炮',
        cannon_lightning: '分裂光束', cannon_poison: '破甲毒雾',
        cannon_arcane: '真实伤害',
        laser_fire: '穿透射线', laser_ice: '隐身狙击',
        laser_lightning: '多目标无人机', laser_poison: '吞噬拉扯',
        laser_arcane: '高伤慢速',
        storm_fire: '扇形喷射', storm_ice: '机械哨兵',
        storm_lightning: '防空导弹', storm_poison: '近战反伤',
        storm_arcane: '吞噬拉扯',
        archer_fast: '单体速射'
    };
    SE.classifyTower = function (t) {
        if (!t) return null;
        var p = t.proto || (t.def && t.def.proto) || 'archer';
        var e = t.element || (t.def && t.def.element) || 'fire';
        return CLASS_MAP[p + '_' + e] || '单体速射';
    };
    function _ctx(t) {
        if (!t._skillCtx) {
            var name = SE.classifyTower(t);
            t._skill = { name: name, cd: 0, cdTimer: 0, active: false };
            t._skillCtx = {};
            t._skillClass = name;
        }
        return t._skillCtx;
    }

    // ========== Tower Skills (20) ==========
    SE.towerSkills = {};

    // 1. 单体速射 —— 连击叠加
    SE.towerSkills['单体速射'] = {
        fire: function (t, tgt, b) { b._skill = '单体速射'; },
        hit: function (t, e, d) {
            var c = _ctx(t);
            if (e !== c.lastHit) c.stack = 0;
            c.stack = Math.min(5, (c.stack || 0) + 1);
            c.lastHit = e; c._idle = 0;
            spawnP(e.x, e.y, '#ffd93d', 3);
            return Math.round(d * (1 + c.stack * 0.15));
        },
        tick: function (t, dt, eff, c) { c._idle = (c._idle || 0) + dt; if (c._idle > 1.5) c.stack = 0; }
    };

    // 2. 减速控制 —— 冻结
    SE.towerSkills['减速控制'] = {
        hit: function (t, e, d) {
            e.freezeStacks = (e.freezeStacks || 0) + 1;
            if (e.freezeStacks >= 5 && !e.stunned) {
                e.stunned = true; e.stunTimer = 2.0; e.freezeStacks = 0;
                GS.frostRings.push({ x: e.x, y: e.y, radius: 0, maxR: e.size * 3, life: 0.6 });
                spawnP(e.x, e.y, '#4ab8ff', 18); spawnF(e.x, e.y - 10, '冻结!', '#4ab8ff');
            }
            return d;
        }
    };

    // 3. 范围灼烧 —— 持续燃烧
    SE.towerSkills['范围灼烧'] = {
        hit: function (t, e, d) {
            var dur = (t.cooldown || 1.2) * 1.2;
            GS.fireZones.push({ x: e.x, y: e.y, radius: 55,
                dps: (t._eff && t._eff.damage) ? t._eff.damage * 0.6 : 10,
                duration: dur, maxDuration: dur, element: 'fire' });
            spawnP(e.x, e.y, '#ff5a2a', 10); return d;
        }
    };

    // 4. 连锁闪电 —— 弹射
    SE.towerSkills['连锁闪电'] = {
        hit: function (t, e, d, b) {
            var src = b && b.ownerTower ? b.ownerTower : t;
            GS.lightningBeams.push({ sx: src.x, sy: src.y, tx: e.x, ty: e.y, life: 0.18, color: '#ffd93d' });
            spawnP(e.x, e.y, '#ffd93d', 6); return d;
        }
    };

    // 5. 近战反伤 —— 荆棘反伤
    SE.towerSkills['近战反伤'] = {
        tick: function (t, dt) {
            if (!t._thornInit) { t._thornInit = true; GS.thornAuras.push({ tower: t, life: 9999 }); }
            var r = 40;
            for (var i = 0; i < GS.enemies.length; i++) {
                var e = GS.enemies[i]; if (e._dead) continue;
                if (dist2(t.x, t.y, e.x, e.y) < r * r && (e._thornCd || 0) <= 0) {
                    e.hp -= (t._eff && t._eff.damage) ? t._eff.damage * 0.2 : 4;
                    e._thornCd = 0.8;
                    e.slowAmount = Math.max(e.slowAmount, 0.5);
                    e.slowTimer = Math.max(e.slowTimer, 2.0);
                    spawnP(e.x, e.y, '#6bff6b', 6);
                }
                if (e._thornCd > 0) e._thornCd -= dt;
            }
        }
    };

    // 6. 隐身狙击 —— 背刺
    SE.towerSkills['隐身狙击'] = {
        tick: function (t, dt, eff, c) {
            c._cd = (c._cd || 6) - dt;
            if (c._cd <= 0) {
                c._cd = 9 + Math.random() * 2;
                t.stealthTimer = 3.0; t.backshotArmed = true;
                GS.stealthTowers.push({ tower: t, remain: 3.0 });
            }
        },
        fire: function (t, tgt, b) {
            if (t.backshotArmed) { t.backshotArmed = false; b.color = '#ffd93d'; b._backshot = true; }
        },
        hit: function (t, e, d, b) {
            if (b && b._backshot) {
                d *= 3; spawnP(e.x, e.y, '#ffd93d', 18);
                spawnF(e.x, e.y - 14, '背刺!×3', '#ffd93d', 18);
            }
            return d;
        }
    };

    // 7. 穿透射线 —— 直线贯穿 (给 bullet 标 armorPierce)
    SE.towerSkills['穿透射线'] = {
        fire: function (t, tgt, b) { if (b) b._armorPierce = true; },
        hit: function (t, e, d) { spawnP(e.x, e.y, '#8fe8ff', 4); return d; }
    };

    // 8. 概率暴击 —— 双重判定
    SE.towerSkills['概率暴击'] = {
        hit: function (t, e, d) {
            var cr = (t._eff && t._eff.critChance) || 0.2;
            var r1 = Math.random() < cr, r2 = Math.random() < cr;
            if (r1 && r2) {
                d *= 3; spawnF(e.x, e.y - 18, '!!! 双重暴击 !!!', '#ffd93d', 22);
                spawnP(e.x, e.y, '#ffd93d', 14);
            } else if (r1 || r2) d *= ((t._eff && t._eff.critMult) || 2);
            return d;
        }
    };

    // 9. 破甲毒雾 —— 降低护甲
    SE.towerSkills['破甲毒雾'] = {
        hit: function (t, e, d) { e.armor = Math.max(0, (e.armor || 0) - 0.08); spawnP(e.x, e.y, '#6bff6b', 5); return d; }
    };

    // 10. 真实伤害 —— 斩杀
    SE.towerSkills['真实伤害'] = {
        hit: function (t, e, d) {
            if (e.hp / e.maxHp < 0.2) {
                spawnP(e.x, e.y, '#ff2040', 12);
                spawnF(e.x, e.y - 14, '斩杀!', '#ff2040', 20);
                return Math.round(d * 1.5);
            }
            return d;
        }
    };

    // 11. 蓄力落雷 —— 蓄力爆发
    SE.towerSkills['蓄力落雷'] = {
        tick: function (t, dt, eff, c) {
            c._ch = (c._ch || 0) + dt;
            if (!c._charging && c._ch > 4) { c._charging = true; c._ch = 0; }
            else if (c._charging && c._ch > 1.2) {
                c._charging = false; c._ch = 0;
                var r = 100, cx = t.x, cy = t.y;
                for (var i = 0; i < GS.enemies.length; i++) {
                    var e = GS.enemies[i]; if (e._dead) continue;
                    if (dist2(cx, cy, e.x, e.y) <= r * r) {
                        var d = (t._eff && t._eff.damage) ? t._eff.damage * 3 : 30;
                        e.hp -= d; spawnP(e.x, e.y, '#ffd93d', 6);
                    }
                }
                GS.lightningBeams.push({ sx: cx, sy: cy - 400, tx: cx, ty: cy, life: 0.22, color: '#ffd93d' });
                spawnP(cx, cy, '#ffd93d', 30);
            }
        }
    };

    // 12. 吞噬拉扯 —— 位移拽回
    SE.towerSkills['吞噬拉扯'] = {
        tick: function (t, dt, eff, c) {
            c._cd = (c._cd || 5) - dt;
            if (c._cd <= 0) {
                c._cd = 5;
                var best = null, bd = Infinity;
                for (var i = 0; i < GS.enemies.length; i++) {
                    var e = GS.enemies[i]; if (e._dead) continue;
                    var d = dist2(t.x, t.y, e.x, e.y);
                    if (d < bd) { bd = d; best = e; }
                }
                if (best && bd < 260 * 260) {
                    if (best.pathIdx > 0) {
                        var pv = GS.path[best.pathIdx - 1];
                        var dx = pv.x - best.x, dy = pv.y - best.y;
                        var dd = Math.sqrt(dx * dx + dy * dy);
                        if (dd > 0) { best.x += (dx / dd) * 30; best.y += (dy / dd) * 30; }
                    }
                    best.suppressTimer = 1.2;
                    GS.voidRifts.push({ x: best.x, y: best.y, life: 0.6 });
                    spawnP(best.x, best.y, '#c060ff', 12);
                }
            }
        }
    };

    // 13. 防空导弹 —— 对空专精
    SE.towerSkills['防空导弹'] = {
        fire: function (t, tgt, b) { if (tgt && (tgt.trait === '飞行' || tgt.canFly)) { b.color = '#ff5a2a'; spawnP(tgt.x, tgt.y, '#ff5a2a', 4); } },
        hit: function (t, e, d) { if (e.trait === '飞行' || e.canFly) d *= 2.5; return d; }
    };

    // 14. 扇形喷射 —— 扇形覆盖
    SE.towerSkills['扇形喷射'] = {
        tick: function (t, dt, eff, c) {
            c._cd = (c._cd || 0) - dt;
            if (c._cd <= 0) {
                c._cd = eff.fireRate || 0.8;
                var ang = t.angle || 0;
                var half = (15 * Math.PI / 180);
                var r = eff.range || 140;
                var dmg = (eff.damage || 10) * 0.7;
                for (var i = 0; i < GS.enemies.length; i++) {
                    var e = GS.enemies[i]; if (e._dead) continue;
                    var dx = e.x - t.x, dy = e.y - t.y;
                    var d = Math.sqrt(dx * dx + dy * dy);
                    if (d > r) continue;
                    var da = Math.abs(((Math.atan2(dy, dx) - ang + Math.PI * 3) % (Math.PI * 2)) - Math.PI);
                    if (da <= half) { e.hp -= dmg; spawnP(e.x, e.y, '#ff8844', 3); }
                }
            }
        }
    };

    // 15. 击退水炮 —— 击退
    SE.towerSkills['击退水炮'] = {
        hit: function (t, e, d) {
            var ang = t.angle || 0;
            e.x += Math.cos(ang) * 40; e.y += Math.sin(ang) * 40;
            e.slowAmount = Math.max(e.slowAmount, 0.3);
            e.slowTimer = Math.max(e.slowTimer, 1.5);
            spawnP(e.x, e.y, '#4ab8ff', 10); return d;
        }
    };

    // 16. 机械哨兵 —— 召唤单位
    SE.towerSkills['机械哨兵'] = {
        tick: function (t, dt, eff, c) {
            c._cd = (c._cd || 6) - dt;
            if (c._cd <= 0) {
                c._cd = 6 + Math.random() * 2;
                GS.sentries.push({ x: t.x, y: t.y, pathIdx: 0,
                    damage: (eff.damage || 8) * 0.4, fireCd: 0, owner: t, speed: 40 + (eff.range || 100) * 0.2 });
            }
        }
    };

    // 17. 多目标无人机 —— 分散打击
    SE.towerSkills['多目标无人机'] = {
        tick: function (t, dt, eff, c) {
            c._cd = (c._cd || 4) - dt;
            if (c._cd <= 0) {
                c._cd = 4;
                var used = {};
                for (var k = 0; k < 3; k++) {
                    var best = null, bd = Infinity;
                    for (var i = 0; i < GS.enemies.length; i++) {
                        var e = GS.enemies[i]; if (e._dead || used[e.uid]) continue;
                        var d = dist2(t.x, t.y, e.x, e.y);
                        if (d < bd) { bd = d; best = e; }
                    }
                    if (!best) break;
                    used[best.uid] = true;
                    var ang = Math.atan2(best.y - t.y, best.x - t.x);
                    GS.drones.push({ x: t.x, y: t.y,
                        vx: Math.cos(ang) * 260, vy: Math.sin(ang) * 260,
                        targetId: best.uid, damage: (eff.damage || 8) * 0.35, life: 2.5, size: 4 });
                }
            }
        }
    };

    // 18. 分裂光束 —— 多段分裂
    SE.towerSkills['分裂光束'] = {
        hit: function (t, e, d, b) {
            if (b && !b._splitDone) {
                b._splitDone = true;
                var ns = [];
                for (var i = 0; i < GS.enemies.length; i++) {
                    var a = GS.enemies[i]; if (a._dead || a === e) continue;
                    if (dist2(e.x, e.y, a.x, a.y) < 120 * 120) { ns.push(a); if (ns.length >= 3) break; }
                }
                for (var j = 0; j < ns.length; j++) {
                    ns[j].hp -= d * 0.5;
                    GS.lightningBeams.push({ sx: e.x, sy: e.y, tx: ns[j].x, ty: ns[j].y, life: 0.16, color: '#ff8844' });
                    spawnP(ns[j].x, ns[j].y, '#ff8844', 4);
                }
            }
            return d;
        }
    };

    // 19. 高伤慢速 —— 击晕
    SE.towerSkills['高伤慢速'] = {
        hit: function (t, e, d) {
            e.stunned = true; e.stunTimer = 0.8;
            for (var i = 0; i < 4; i++) {
                GS.stunParticles.push({ x: e.x + rand(-6, 6), y: e.y - e.size - 4,
                    vx: rand(-10, 10), vy: rand(-30, -10), life: 0.8, symbol: '★' });
            }
            return d * 2;
        }
    };

    // 20. 传染DOT —— 扩散传染
    SE.towerSkills['传染DOT'] = {
        hit: function (t, e, d) {
            e.dotTimer = Math.max(e.dotTimer, 3.0);
            e.dotDps = Math.max(e.dotDps, (t._eff && t._eff.dot) ? t._eff.dot : 8);
            return d;
        }
    };

    // ========== Enemy Traits (30+) ==========
    SE.enemyTraits = {};

    SE.enemyTraits['分裂']  = { onDeath: function (e) { SE._spawnMinionsAt(e.x, e.y, e.pathIdx, 2, 0.4); } };
    SE.enemyTraits['快速']  = { onSpawn: function (e) { e.baseSpeed = Math.round(e.baseSpeed * 1.4); e.speed = e.baseSpeed; }, onTick: function (e) { if (Math.random() < 0.15) spawnP(e.x + rand(-3, 3), e.y, '#ffaa44', 1); } };
    SE.enemyTraits['重甲']  = { onSpawn: function (e) { e.armor = (e.armor || 0) + 0.15; } };
    SE.enemyTraits['飞行']  = { onSpawn: function (e) { e.canFly = true; } };
    SE.enemyTraits['隐身']  = { onSpawn: function (e) { e.stealthAlpha = 0.2; } };
    SE.enemyTraits['自爆']  = { onReachTower: function (e) { for (var i = 0; i < GS.towers.length; i++) { var t = GS.towers[i]; if (t._dead) continue; if (dist(t.x, t.y, e.x, e.y) < 60 && t.hp !== undefined) { t.hp -= e.maxHp * 0.5; spawnP(t.x, t.y, '#ff2040', 14); } } } };
    SE.enemyTraits['治疗']  = { onSpawn: function (e) { e.healCd = 3; }, onTick: function (e, dt) { e.healCd -= dt; if (e.healCd <= 0) { e.healCd = 3; var best = null, bd = Infinity; for (var i = 0; i < GS.enemies.length; i++) { var a = GS.enemies[i]; if (a._dead || a === e) continue; var d = dist2(a.x, a.y, e.x, e.y); if (d < bd && a.hp < a.maxHp) { bd = d; best = a; } } if (best) { best.hp = Math.min(best.maxHp, best.hp + best.maxHp * 0.1); spawnP(best.x, best.y, '#6bff6b', 4); } } } };
    SE.enemyTraits['魔抗']  = { onSpawn: function (e) { e.magicResist = 0.35; } };
    SE.enemyTraits['亡灵']  = { onSpawn: function (e) { e.undead = true; } };
    SE.enemyTraits['机械']  = { onSpawn: function (e) { e.mechanical = true; } };
    SE.enemyTraits['光环']  = { onTick: function (e) { for (var i = 0; i < GS.enemies.length; i++) { var a = GS.enemies[i]; if (a._dead || a === e) continue; if (dist(a.x, a.y, e.x, e.y) < 80) a.baseSpeed *= 1.001; } if (Math.random() < 0.1) spawnP(e.x, e.y, '#ffd93d', 1); } };
    SE.enemyTraits['灼烧']  = { onBulletHitMe: function (e, t) { if (t && t.hp !== undefined) { t.burnTimer = 3; t.burnDps = 3; spawnP(t.x, t.y, '#ff5a2a', 3); } } };
    SE.enemyTraits['召唤']  = { onSpawn: function (e) { e._sc = 6; }, onTick: function (e, dt) { e._sc -= dt; if (e._sc <= 0) { e._sc = 6; SE._spawnMinionsAt(e.x, e.y, e.pathIdx, 2, 0.4); } } };
    SE.enemyTraits['闪避']  = { onBulletHit: function () { return Math.random() < 0.2; } };
    SE.enemyTraits['再生']  = { onTick: function (e) { if (e.regen > 0 && Math.random() < 0.08) spawnP(e.x, e.y, '#6bff6b', 1); } };
    SE.enemyTraits['护盾']  = { onTick: function (e) { if (e.shield > 0 && Math.random() < 0.1) spawnP(e.x + rand(-3, 3), e.y + rand(-3, 3), '#7ed5ff', 1); } };
    SE.enemyTraits['干扰']  = { onSpawn: function (e) { e._jc = 8; }, onTick: function (e, dt) { e._jc -= dt; if (e._jc <= 0) { e._jc = 8; var best = null, bd = Infinity; for (var i = 0; i < GS.towers.length; i++) { var t = GS.towers[i]; if (t._dead) continue; var d = dist2(t.x, t.y, e.x, e.y); if (d < bd) { bd = d; best = t; } } if (best) { best.jammed = 2; spawnP(best.x, best.y, '#c060ff', 6); } } } };
    SE.enemyTraits['随机增益'] = { onSpawn: function (e) { var r = Math.random(); if (r < 0.33) { e.baseSpeed *= 1.2; spawnF(e.x, e.y - 14, '+速度', '#ffaa44', 12); } else if (r < 0.66) { e._buffDmg = 1.3; spawnF(e.x, e.y - 14, '+伤害', '#ff5a2a', 12); } else { e.shield = (e.shield || 0) + 80; spawnF(e.x, e.y - 14, '+护盾', '#7ed5ff', 12); } } };
    SE.enemyTraits['首领']  = { onSpawn: function (e) { e.isBoss = true; }, onDeath: function (e) { spawnF(e.x, e.y - 20, 'BOSS 掉落芯片!', '#ffd93d', 16); } };
    SE.enemyTraits['延迟结算'] = { onReachExit: function () { GS.lives += 1; spawnF(50, 40, '延迟结算!+1❤', '#6bff6b', 14); } };
    SE.enemyTraits['吞弹反吐'] = { onSpawn: function (e) { e._rc = 8; }, onTick: function (e, dt) { e._rc -= dt; if (e._rc <= 0) { e._rc = 8; var best = null, bd = Infinity; for (var i = 0; i < GS.towers.length; i++) { var t = GS.towers[i]; if (t._dead) continue; var d = dist2(t.x, t.y, e.x, e.y); if (d < bd) { bd = d; best = t; } } if (best && best.hp !== undefined) { best.hp -= 8; spawnP(best.x, best.y, '#ffd93d', 6); } } } };
    SE.enemyTraits['输血条'] = { onTick: function (e, dt) { var l = GS.enemies.find(function (x) { return !x._dead && x.uid === e.leaderUid; }); if (l && dist(l.x, l.y, e.x, e.y) < 120) { l.hp = Math.min(l.maxHp, l.hp + 2 * dt); e.hp -= 1 * dt; if (Math.random() < 0.2) spawnP((e.x + l.x) / 2, (e.y + l.y) / 2, '#6bff6b', 1); } } };
    SE.enemyTraits['逆行']  = { onSpawn: function (e) { e.reverse = true; if (GS.path) e.pathIdx = GS.path.length - 2; } };
    SE.enemyTraits['吸光']  = { onBulletHit: function (e, d, b) { if (b && (b.element === 'lightning' || b._armorPierce)) { spawnP(e.x, e.y, '#ffd93d', 4); return 0; } return null; } };
    SE.enemyTraits['无影']  = { onBulletHit: function () { return Math.random() < 0.6; } };
    SE.enemyTraits['击杀反噬'] = { onDeath: function () { GS.lives = Math.max(0, GS.lives - 1); spawnF(50, 40, '反噬! -1❤', '#ff2040', 14); } };
    SE.enemyTraits['节拍压制'] = { onSpawn: function (e) { e._dc = 3; }, onTick: function (e, dt) { e._dc -= dt; if (e._dc <= 0) { e._dc = 3; for (var i = 0; i < GS.towers.length; i++) { var t = GS.towers[i]; if (t._dead) continue; if (dist2(t.x, t.y, e.x, e.y) < 120 * 120) { t.rateSuppressTimer = 1.0; spawnP(t.x, t.y, '#c060ff', 2); } } } } };
    SE.enemyTraits['随机改道'] = { onTick: function (e, dt) { if (Math.random() < 0.01) { var off = rand(-20, 20); e.x += off * dt * 2; e.y += off * dt * 2; } } };
    SE.enemyTraits['二度复活'] = { onDeath: function (e) { if (!e._revived) { e._revived = true; setTimeout(function () { e.hp = Math.round(e.maxHp * 0.4); e._dead = false; GS.enemies.push(e); spawnP(e.x, e.y, '#c060ff', 20); spawnF(e.x, e.y - 14, '复活!', '#c060ff', 16); }, 2000); } } };
    SE.enemyTraits['学习抗性'] = { onBulletHitMe: function (e) { e._lc = (e._lc || 0) + 1; if (e._lc <= 5) e.armor = Math.min(0.85, (e.armor || 0) + 0.05); } };
    SE.enemyTraits['亡语光环'] = { onDeath: function (e) { for (var i = 0; i < GS.enemies.length; i++) { var a = GS.enemies[i]; if (a._dead) continue; if (dist(a.x, a.y, e.x, e.y) < 100) a.baseSpeed *= 1.3; } spawnP(e.x, e.y, '#6bff6b', 20); } };
    SE.enemyTraits['穿行'] = { onSpawn: function (e) { e.canWalkThrough = true; e.shape = 'triangle'; e.color = '#aabbdd'; }, onBulletHitMe: function (e) { if (Math.random() < 0.25) return true; /* 25% 子弹穿越 */ } };
    SE.enemyTraits['机械'] = { onSpawn: function (e) { e.immuneSlow = true; e.immuneStun = true; } };
    SE.enemyTraits['亡灵'] = { onSpawn: function (e) { e.immunePoison = true; } };

    SE.applyEnemyTrait = function (enemy) {
        if (!enemy || !enemy.trait) return enemy;
        var h = SE.enemyTraits[enemy.trait];
        if (h && h.onSpawn) h.onSpawn(enemy);
        return enemy;
    };

    // ========== Chip 效果解析 ==========
    var CHIP_STAT = { damage: 'damage', crit: 'critChance', rate: 'fireRate', range: 'range',
        splash: 'splash', pierce: 'pierce', chain: 'chain', slow: 'slow', dot: 'dot',
        gold: '_goldMult', shield: '_maxShield', heal: '_regenOnTower', reflect: '_reflect',
        armor_pen: '_armorPenFlat', reload_speed: 'fireRate' };

    SE.sumChipMods = function (chips) {
        var agg = {};
        function walk(arr) {
            if (!arr) return;
            for (var i = 0; i < arr.length; i++) {
                var c = arr[i]; if (!c) continue;
                var f = c.statField || c.stat;
                var v = c.value;
                if (!f || v === undefined) continue;
                agg[f] = (agg[f] || 0) + v;
                if (c.children) walk(c.children);
            }
        }
        walk(chips); return agg;
    };

    SE.applyChipsToTower = function (tower) {
        var mods = SE.sumChipMods(tower.chips);
        tower._chipMods = mods;
        if (mods.shield) tower.hp = Math.max(tower.hp || 0, mods.shield);
    };

    // ========== Hook 入口 ==========
    SE.onTowerPlace = function (t) {
        if (!t) return; _ctx(t);
        if (t.chips && t.chips.length) SE.applyChipsToTower(t);
    };

    SE.onTowerFire = function (t, tgt, b, eff) {
        if (!t || !tgt) return;
        var name = t._skillClass || SE.classifyTower(t);
        var sk = SE.towerSkills[name];
        if (sk && sk.fire) sk.fire(t, tgt, b, eff || t._eff);
    };

    SE.onEnemyHit = function (e, d, src) {
        if (!e || e._dead) return d;
        // 闪避 / 无影 / 吸光
        if (e.trait) {
            var h = SE.enemyTraits[e.trait];
            if (h && h.onBulletHit) {
                var r = h.onBulletHit(e, d, src && src.bullet);
                if (r === true) { spawnF(e.x, e.y, 'miss', '#aaa', 11); return 0; }
                if (typeof r === 'number') return r;
            }
            if (h && h.onBulletHitMe) h.onBulletHitMe(e, src && src.bullet && src.bullet.ownerTower);
        }
        // tower skill hit
        if (src && src.tower) {
            var sk = SE.towerSkills[src.tower._skillClass || SE.classifyTower(src.tower)];
            if (sk && sk.hit) { var nd = sk.hit(src.tower, e, d, src.bullet); if (typeof nd === 'number') d = nd; }
        }
        // 亡灵免疫 DOT / 机械免疫减速冰冻
        if (src && src.bullet) {
            if (e.undead) { e.dotDps = 0; e.dotTimer = 0; }
            if (e.mechanical) { e.slowAmount = 0; e.freezeStacks = 0; }
        }
        return d;
    };

    SE.onBulletHit = function (b, e) {
        if (!b || !e) return;
        if (b.ownerTower) {
            var sk = SE.towerSkills[b.ownerTower._skillClass || SE.classifyTower(b.ownerTower)];
            if (sk && sk.hit) sk.hit(b.ownerTower, e, b.damage, b);
        }
        if (e.trait) {
            var h = SE.enemyTraits[e.trait];
            if (h && h.onBulletHitMe && b.ownerTower) h.onBulletHitMe(e, b.ownerTower);
        }
    };

    SE.onEnemyDeath = function (e) {
        if (!e) return;
        if (e.trait) { var h = SE.enemyTraits[e.trait]; if (h && h.onDeath) h.onDeath(e); }
        if (e.dotDps > 0 && !e._dotCloud) {
            e._dotCloud = true;
            GS.poisonClouds.push({ x: e.x, y: e.y, radius: 55, dps: e.dotDps, life: 3 });
        }
    };

    // ========== 主循环驱动 ==========
    SE.updateTowers = function (dt) {
        if (!_initFlag) return;
        for (var i = 0; i < GS.towers.length; i++) {
            var t = GS.towers[i]; if (t._dead) continue;
            if (t.jammed > 0) { t.jammed -= dt; continue; }
            if (t.rateSuppressTimer > 0) t.rateSuppressTimer -= dt;
            var name = t._skillClass || SE.classifyTower(t);
            var sk = SE.towerSkills[name];
            if (sk && sk.tick) sk.tick(t, dt, t._eff, _ctx(t));
            if (t.burnTimer > 0) { t.burnTimer -= dt; if (t.hp !== undefined) t.hp -= t.burnDps * dt; if (t.burnTimer <= 0) { t.burnTimer = 0; t.burnDps = 0; } }
            if (t._regenOnTower && t.hp !== undefined && t.maxHp && t.hp < t.maxHp) t.hp = Math.min(t.maxHp, t.hp + t._regenOnTower * dt);
            if (t.stealthTimer !== undefined && t.stealthTimer > 0) { t.stealthTimer -= dt; if (t.stealthTimer <= 0) t.stealthTimer = 0; }
        }
    };

    SE.updateEnemies = function (dt) {
        if (!_initFlag) return;
        for (var i = 0; i < GS.enemies.length; i++) {
            var e = GS.enemies[i]; if (e._dead) continue;
            if (e.stunTimer > 0) { e.stunTimer -= dt; if (e.stunTimer <= 0) e.stunned = false; }
            if (e.suppressTimer > 0) { e.suppressTimer -= dt; if (e.suppressTimer <= 0) e.suppressed = false; }
            if (e.trait) { var h = SE.enemyTraits[e.trait]; if (h && h.onTick) h.onTick(e, dt); }
            if (e.undead && e.dotTimer > 0) { e.dotTimer = 0; e.dotDps = 0; }
            if (e.mechanical) { e.slowAmount = 0; e.freezeStacks = 0; }
            // suppress 移动抑制
            if (e.suppressed) { /* 由游戏移动循环读取 e.suppressed 判断 */ }
        }
    };

    // ========== 新实体更新 ==========
    SE.updateEntities = function (dt) {
        if (!_initFlag) return;

        // fireZones
        for (var i = GS.fireZones.length - 1; i >= 0; i--) {
            var fz = GS.fireZones[i]; fz.duration -= dt;
            for (var j = 0; j < GS.enemies.length; j++) {
                var e = GS.enemies[j]; if (e._dead || e.undead) continue;
                if (dist2(e.x, e.y, fz.x, fz.y) <= fz.radius * fz.radius) {
                    e.hp -= fz.dps * dt;
                    if (Math.random() < 0.1) spawnP(e.x, e.y, '#ff8844', 1);
                }
            }
            if (fz.duration <= 0) GS.fireZones.splice(i, 1);
        }

        // poisonClouds
        for (var i = GS.poisonClouds.length - 1; i >= 0; i--) {
            var pc = GS.poisonClouds[i]; pc.life -= dt;
            for (var j = 0; j < GS.enemies.length; j++) {
                var e = GS.enemies[j]; if (e._dead || e.undead) continue;
                if (dist2(e.x, e.y, pc.x, pc.y) <= pc.radius * pc.radius) {
                    e.dotTimer = Math.max(e.dotTimer, 2.0);
                    e.dotDps = Math.max(e.dotDps, pc.dps);
                    e.hp -= pc.dps * dt * 0.5;
                }
            }
            if (pc.life <= 0) GS.poisonClouds.splice(i, 1);
        }

        // sentries —— 沿路径移动 + 攻击
        for (var i = GS.sentries.length - 1; i >= 0; i--) {
            var s = GS.sentries[i];
            if (!GS.path || s.pathIdx >= GS.path.length - 1) { GS.sentries.splice(i, 1); continue; }
            var tgt = GS.path[s.pathIdx + 1];
            var dx = tgt.x - s.x, dy = tgt.y - s.y, d = Math.sqrt(dx * dx + dy * dy);
            var step = s.speed * dt;
            if (step >= d) { s.x = tgt.x; s.y = tgt.y; s.pathIdx++; }
            else { s.x += (dx / d) * step; s.y += (dy / d) * step; }
            s.fireCd -= dt;
            if (s.fireCd <= 0) {
                s.fireCd = 1.0;
                var best = null, bd = 140 * 140;
                for (var k = 0; k < GS.enemies.length; k++) {
                    var e = GS.enemies[k]; if (e._dead) continue;
                    var dd = dist2(s.x, s.y, e.x, e.y);
                    if (dd < bd) { bd = dd; best = e; }
                }
                if (best) { best.hp -= s.damage; spawnP(best.x, best.y, '#ffd93d', 2); }
            }
        }

        // drones
        for (var i = GS.drones.length - 1; i >= 0; i--) {
            var dr = GS.drones[i]; dr.life -= dt;
            if (dr.life <= 0) { GS.drones.splice(i, 1); continue; }
            var tgt = GS.enemies.find(function (e) { return e.uid === dr.targetId && !e._dead; });
            if (!tgt) tgt = GS.enemies.find(function (e) { return !e._dead && dist2(e.x, e.y, dr.x, dr.y) < 200 * 200; });
            if (tgt) {
                var dx = tgt.x - dr.x, dy = tgt.y - dr.y, d = Math.sqrt(dx * dx + dy * dy);
                if (d < 10) { tgt.hp -= dr.damage; spawnP(tgt.x, tgt.y, '#ffd93d', 3); GS.drones.splice(i, 1); continue; }
                dr.vx = (dx / d) * 260; dr.vy = (dy / d) * 260;
            }
            dr.x += dr.vx * dt; dr.y += dr.vy * dt;
        }

        // voidRifts / frostRings / lightningBeams
        for (var i = GS.voidRifts.length - 1; i >= 0; i--) { GS.voidRifts[i].life -= dt; if (GS.voidRifts[i].life <= 0) GS.voidRifts.splice(i, 1); }
        for (var i = GS.frostRings.length - 1; i >= 0; i--) { GS.frostRings[i].life -= dt; GS.frostRings[i].radius = GS.frostRings[i].maxR * (1 - GS.frostRings[i].life / 0.6); if (GS.frostRings[i].life <= 0) GS.frostRings.splice(i, 1); }
        for (var i = GS.lightningBeams.length - 1; i >= 0; i--) { GS.lightningBeams[i].life -= dt; if (GS.lightningBeams[i].life <= 0) GS.lightningBeams.splice(i, 1); }

        // stunParticles (★ 星星)
        for (var i = GS.stunParticles.length - 1; i >= 0; i--) {
            var sp = GS.stunParticles[i]; sp.x += sp.vx * dt; sp.y += sp.vy * dt; sp.vy += 60 * dt; sp.life -= dt;
            if (sp.life <= 0) GS.stunParticles.splice(i, 1);
        }

        // stealth towers: 淡出 & 背刺武器化
        for (var i = GS.stealthTowers.length - 1; i >= 0; i--) {
            var ss = GS.stealthTowers[i]; ss.remain -= dt;
            if (!ss.tower || ss.tower._dead || ss.remain <= 0) { GS.stealthTowers.splice(i, 1); continue; }
            ss.tower._stealthAlpha = 0.2;
        }

        // thornAuras —— 清理已死塔
        for (var i = GS.thornAuras.length - 1; i >= 0; i--) {
            if (!GS.thornAuras[i].tower || GS.thornAuras[i].tower._dead) GS.thornAuras.splice(i, 1);
        }
    };

    // ========== 渲染 ==========
    SE.render = function (ctx) {
        if (!ctx || !_initFlag) return;

        // fire zones (底部层)
        for (var i = 0; i < GS.fireZones.length; i++) {
            var fz = GS.fireZones[i];
            var a = fz.duration / fz.maxDuration;
            ctx.beginPath(); ctx.arc(fz.x, fz.y, fz.radius, 0, Math.PI * 2);
            ctx.fillStyle = 'rgba(255,90,42,' + (0.28 * a) + ')'; ctx.fill();
            ctx.strokeStyle = 'rgba(255,170,68,' + (0.6 * a) + ')'; ctx.lineWidth = 2; ctx.stroke();
            if (Math.random() < 0.4) spawnP(fz.x + rand(-fz.radius, fz.radius), fz.y + rand(-fz.radius, fz.radius), '#ffaa44', 1);
        }

        // poison clouds
        for (var i = 0; i < GS.poisonClouds.length; i++) {
            var pc = GS.poisonClouds[i];
            ctx.beginPath(); ctx.arc(pc.x, pc.y, pc.radius, 0, Math.PI * 2);
            ctx.fillStyle = 'rgba(107,255,107,0.18)'; ctx.fill();
            ctx.strokeStyle = 'rgba(107,255,107,0.6)'; ctx.lineWidth = 1.5; ctx.stroke();
        }

        // lightning beams (锯齿)
        for (var i = 0; i < GS.lightningBeams.length; i++) {
            var lb = GS.lightningBeams[i];
            ctx.save(); ctx.strokeStyle = lb.color || '#ffd93d'; ctx.lineWidth = 3;
            ctx.globalAlpha = lb.life * 4; ctx.beginPath(); ctx.moveTo(lb.sx, lb.sy);
            for (var s = 1; s < 6; s++) {
                var tt = s / 6;
                ctx.lineTo(lb.sx + (lb.tx - lb.sx) * tt + rand(-6, 6), lb.sy + (lb.ty - lb.sy) * tt + rand(-6, 6));
            }
            ctx.lineTo(lb.tx, lb.ty); ctx.stroke(); ctx.restore();
        }

        // frost rings
        for (var i = 0; i < GS.frostRings.length; i++) {
            var fr = GS.frostRings[i];
            ctx.beginPath(); ctx.arc(fr.x, fr.y, fr.radius, 0, Math.PI * 2);
            ctx.strokeStyle = 'rgba(74,184,255,' + (fr.life / 0.6) + ')'; ctx.lineWidth = 3; ctx.stroke();
        }

        // void rifts (紫色螺旋)
        for (var i = 0; i < GS.voidRifts.length; i++) {
            var vr = GS.voidRifts[i];
            ctx.save(); ctx.translate(vr.x, vr.y); ctx.rotate(vr.life * 6);
            ctx.strokeStyle = 'rgba(192,96,255,' + (vr.life / 0.6) + ')'; ctx.lineWidth = 2;
            for (var k = 0; k < 3; k++) {
                ctx.beginPath(); ctx.arc(0, 0, 10 + k * 6, 0, Math.PI * 1.5); ctx.stroke();
            }
            ctx.restore();
        }

        // sentries (黄色小机器人)
        for (var i = 0; i < GS.sentries.length; i++) {
            var s = GS.sentries[i];
            ctx.fillStyle = '#ffd93d'; ctx.fillRect(s.x - 5, s.y - 5, 10, 10);
            ctx.fillStyle = '#ff5a2a'; ctx.fillRect(s.x - 2, s.y - 2, 4, 4);
        }

        // drones (三角形追踪箭头)
        for (var i = 0; i < GS.drones.length; i++) {
            var dr = GS.drones[i];
            ctx.save(); ctx.translate(dr.x, dr.y);
            ctx.rotate(Math.atan2(dr.vy, dr.vx));
            ctx.fillStyle = '#ffd93d'; ctx.beginPath();
            ctx.moveTo(8, 0); ctx.lineTo(-5, 4); ctx.lineTo(-5, -4); ctx.closePath(); ctx.fill();
            ctx.restore();
        }

        // stun stars
        for (var i = 0; i < GS.stunParticles.length; i++) {
            var sp = GS.stunParticles[i];
            ctx.globalAlpha = sp.life / 0.8; ctx.fillStyle = '#ffd93d';
            ctx.font = '12px sans-serif'; ctx.fillText(sp.symbol || '★', sp.x, sp.y);
            ctx.globalAlpha = 1;
        }

        // thorn aura 圆圈
        for (var i = 0; i < GS.thornAuras.length; i++) {
            var ta = GS.thornAuras[i]; if (!ta.tower || ta.tower._dead) continue;
            ctx.strokeStyle = 'rgba(107,255,107,0.3)'; ctx.lineWidth = 1;
            ctx.beginPath(); ctx.arc(ta.tower.x, ta.tower.y, 40, 0, Math.PI * 2); ctx.stroke();
        }
    };

    // ========== 工具 ==========
    SE._spawnMinionsAt = function (x, y, pathIdx, count, hpPct) {
        var baseDef = null;
        if (window.ENEMY_DATA) {
            for (var i = 0; i < window.ENEMY_DATA.length; i++) {
                if (window.ENEMY_DATA[i].proto === 'grunt' && window.ENEMY_DATA[i].tier === 's') { baseDef = window.ENEMY_DATA[i]; break; }
            }
            if (!baseDef) baseDef = window.ENEMY_DATA[0];
        }
        if (!baseDef) return;
        for (var k = 0; k < count; k++) {
            var m = (window.GameLogic && window.GameLogic.spawnEnemy)
                ? window.GameLogic.spawnEnemy(baseDef) : null;
            if (m) {
                m.x = x + rand(-8, 8); m.y = y + rand(-8, 8);
                m.pathIdx = Math.min((GS.path || []).length - 2, (pathIdx || 0) + k);
                m.maxHp = Math.round(m.maxHp * (hpPct || 0.4)); m.hp = m.maxHp;
                m.gold = Math.round(m.gold * 0.3); m.color = '#6bff6b';
                GS.minions = GS.minions || []; GS.minions.push(m);
            }
        }
    };

    // 防空塔 target 过滤
    SE.filterTargetForTower = function (tower, targets) {
        var name = tower._skillClass || SE.classifyTower(tower);
        if (name === '防空导弹') {
            var f = targets.filter(function (e) { return !e._dead && (e.trait === '飞行' || e.canFly); });
            if (f.length > 0) return f;
        }
        return targets;
    };

    // ========== 就绪日志 ==========
    setTimeout(function () {
        SE.init(window.GameState);
        console.log('SkillEngine ready — ' + Object.keys(SE.towerSkills).length + ' tower skills, ' + Object.keys(SE.enemyTraits).length + ' enemy traits');
    }, 0);

})();
