/* ==========================================================================
 * GameLogic - 战斗核心逻辑模块
 * 命名空间: window.GameLogic
 * 依赖: window.GameState (core.js), window.Core, TOWER_DATA, ENEMY_DATA, ELITE_DATA, rollChip
 * ========================================================================== */
window.GameLogic = (function () {
    'use strict';

    var enemyUidSeq = 0;

    function dist(ax, ay, bx, by) {
        var dx = ax - bx, dy = ay - by;
        return Math.sqrt(dx * dx + dy * dy);
    }

    function _createRuntimeEnemy(def, hpScale) {
        var g = window.GameState;
        var isElite = !!def.isElite;
        var maxHp = Math.round((def.hp || def.baseHp) * hpScale);
        return {
            type: def.uid,
            uid: 'e_' + (++enemyUidSeq),
            name: def.name,
            x: g.path[0].x,
            y: g.path[0].y,
            hp: maxHp,
            maxHp: maxHp,
            baseSpeed: def.speed,
            speed: def.speed,
            gold: def.gold,
            size: def.size,
            shape: def.shape,
            color: def.color,
            isBoss: !!def.isBoss,
            isElite: isElite,
            armor: def.armor || 0,
            regen: def.regen || 0,
            phantom: !!def.phantom,
            special: def.special || null,
            shield: (def.special && def.special.shield) ? def.special.shield : 0,
            pathIdx: 0,
            slowTimer: 0,
            slowAmount: 0,
            dotTimer: 0,
            dotDps: 0,
            summonTimer: 0,
            auraTimer: 0,
            _dead: false
        };
    }

    // ---------- 波次 ----------
    function buildWave(n) {
        var queue = [];
        var tierScoreMax = Math.floor(n / 3) + 2;
        var enemyCount = 5 + Math.floor(n * 1.8);

        var tierScore = { s: 1, m: 2, l: 3, xl: 4, boss: 5 };
        var pool = [];
        for (var i = 0; i < window.ENEMY_DATA.length; i++) {
            var e = window.ENEMY_DATA[i];
            var ts = tierScore[e.tier] || 2;
            if (ts <= tierScoreMax) pool.push(e);
        }
        pool.sort(function (a, b) { return tierScore[a.tier] - tierScore[b.tier]; });

        var hpScale = 1 + (n - 1) * 0.18;
        var lowTierEnd = Math.max(1, Math.floor(pool.length * 0.6));

        for (var k = 0; k < enemyCount; k++) {
            var pick = (k % 7 === 6 && pool.length > 0)
                ? pool[Math.floor(Math.random() * pool.length)]
                : pool[Math.floor(Math.random() * lowTierEnd)];
            queue.push({ enemy: pick, time: k * 0.9 });
        }

        if (n > 0 && n % 5 === 0) {
            var elites = window.ELITE_DATA;
            var elitePick = elites[Math.floor(Math.random() * elites.length)];
            var eliteScaled = {
                uid: elitePick.uid,
                name: elitePick.name,
                hp: Math.round(elitePick.hp * hpScale),
                speed: elitePick.speed,
                gold: elitePick.gold,
                size: elitePick.size,
                shape: elitePick.shape,
                color: elitePick.color,
                isElite: true,
                isBoss: !!(elitePick.special && elitePick.special.isBoss),
                armor: elitePick.armor,
                regen: elitePick.regen,
                special: elitePick.special
            };
            queue.push({ enemy: eliteScaled, time: queue.length * 1.2 });
        }
        return queue;
    }

    function startWave() {
        var g = window.GameState;
        g.wave = g.wave || 0;
        g.wave++;
        g.spawnQueue = buildWave(g.wave);
        g.waveInProgress = true;
        g.spawnTimer = 0;
        g.waveBonus = 0;
    }

    function updateWaveSpawner(dt) {
        var g = window.GameState;
        if (!g.waveInProgress) return;

        g.spawnTimer += dt;
        while (g.spawnQueue.length > 0 && g.spawnQueue[0].time <= g.spawnTimer) {
            spawnEnemy(g.spawnQueue.shift().enemy);
        }

        if (g.spawnQueue.length === 0) {
            var alive = 0;
            for (var i = 0; i < g.enemies.length; i++) if (!g.enemies[i]._dead) alive++;
            if (alive === 0) {
                g.waveInProgress = false;
                var bonus = 30 + g.wave * 15;
                g.gold += bonus;
                g.waveBonus = bonus;
                g.score += g.wave * 20;
                if (g.wave >= (g.maxWave || 999)) gameWin();
            }
        }
    }

    // ---------- 敌人 ----------
    function spawnEnemy(enemyDef) {
        var g = window.GameState;
        var hpScale = 1 + (g.wave - 1) * 0.18;
        var enemy = _createRuntimeEnemy(enemyDef, hpScale);
        // === SkillEngine hook: apply enemy trait ===
        enemy.trait = enemyDef.trait || null;
        enemy.mechanic = enemyDef.mechanic || null;
        if (window.SkillEngine && SkillEngine.applyEnemyTrait) SkillEngine.applyEnemyTrait(enemy);
        g.enemies.push(enemy);
        return enemy;
    }

    function updateEnemies(dt) {
        var g = window.GameState;
        var path = g.path;
        // === SkillEngine hook: enemy trait ticks ===
        if (window.SkillEngine && SkillEngine.updateEnemies) SkillEngine.updateEnemies(dt);

        for (var i = 0; i < g.enemies.length; i++) {
            var e = g.enemies[i];
            if (e._dead) continue;
            // === SkillEngine: if enemy stunned/suppressed/phantom-skip ===
            if (e.stunned || e.suppressed) continue;

            // DOT
            if (e.dotTimer > 0) {
                e.dotTimer -= dt;
                e.hp -= e.dotDps * dt;
                if (e.hp <= 0) { killEnemy(e, null, null); continue; }
                if (e.dotTimer <= 0) { e.dotTimer = 0; e.dotDps = 0; }
            }
            // slow
            if (e.slowTimer > 0) {
                e.slowTimer -= dt;
                e.speed = e.baseSpeed * (1 - e.slowAmount);
                if (e.slowTimer <= 0) { e.slowAmount = 0; e.speed = e.baseSpeed; }
            }
            // regen
            if (e.regen > 0 && e.hp < e.maxHp) e.hp = Math.min(e.maxHp, e.hp + e.regen * dt);

            // 精英特殊行为
            if (e.isElite && e.special) _updateElite(e, dt);

            // 沿路径移动
            if (e.pathIdx < path.length - 1) {
                var t = path[e.pathIdx + 1];
                var dx = t.x - e.x, dy = t.y - e.y;
                var d = Math.sqrt(dx * dx + dy * dy);
                var step = e.speed * dt;
                e._dir = Math.atan2(dy, dx); // 眼睛追踪方向
                if (step >= d) { e.x = t.x; e.y = t.y; e.pathIdx++; }
                else { e.x += (dx / d) * step; e.y += (dy / d) * step; }
            } else {
                var lifeLoss = e.isBoss ? 5 : 1;
                g.lives -= lifeLoss;
                if (window.Core && typeof window.Core.spawnParticles === 'function')
                    window.Core.spawnParticles(e.x, e.y, '#ff4444', 12);
                e._dead = true;
                if (g.lives <= 0) { g.lives = 0; gameOver(); }
                continue;
            }

            if (e.hp <= 0 && !e._dead) killEnemy(e, null, null);
        }
        g.enemies = g.enemies.filter(function (x) { return !x._dead; });
    }

    function _updateElite(e, dt) {
        var g = window.GameState;
        var sp = e.special;

        // 召唤
        if (sp.summonInterval) {
            e.summonTimer = (e.summonTimer || 0) + dt * 1000;
            if (e.summonTimer >= sp.summonInterval) {
                e.summonTimer = 0;
                var minionDef = window.ENEMY_DATA.filter(function (x) { return x.proto === 'grunt' && x.tier === 's'; })[0] || window.ENEMY_DATA[0];
                for (var c = 0; c < (sp.summonCount || 2); c++) {
                    var m = spawnEnemy(minionDef);
                    m.x = e.x; m.y = e.y; m.pathIdx = e.pathIdx;
                    m.maxHp = Math.round(m.maxHp * 0.6); m.hp = m.maxHp;
                    m.gold = Math.round(m.gold * 0.5);
                }
            }
        }
        // dot光环（对塔楼范围伤害）
        if (sp.dot && sp.dotRadius) {
            e.auraTimer = (e.auraTimer || 0) + dt;
            if (e.auraTimer >= 1.0) {
                e.auraTimer = 0;
                for (var i = 0; i < g.towers.length; i++) {
                    var t2 = g.towers[i];
                    if (dist(e.x, e.y, t2.x, t2.y) <= sp.dotRadius && t2.hp !== undefined) {
                        t2.hp -= sp.dot;
                        if (t2.hp <= 0) t2._dead = true;
                    }
                }
            }
        }
        // execute: 血量低于50%处决附近低血量友军 + healOnKill
        if (sp.executeThreshold && e.hp / e.maxHp < 0.5) {
            for (var j = 0; j < g.enemies.length; j++) {
                var ally = g.enemies[j];
                if (ally === e || ally._dead) continue;
                if (dist(e.x, e.y, ally.x, ally.y) <= sp.executeRange && ally.hp / ally.maxHp < sp.executeThreshold) {
                    ally.hp = 0;
                    killEnemy(ally, e, null);
                    if (sp.healOnKill) e.hp = Math.min(e.maxHp, e.hp + e.maxHp * sp.healOnKill);
                }
            }
        }
    }

    // ---------- 伤害系统 ----------
    function damageEnemy(enemy, dmg, eff, data, isCrit, ownerTower) {
        if (!enemy || enemy._dead) return 0;
        // === SkillEngine hook: enemy evasion ===
        if (window.SkillEngine && SkillEngine.onBulletHit && SkillEngine.onBulletHit(enemy, ownerTower)) return 0;
        // === SkillEngine hook: crit bonus from tower skill ===
        if (window.SkillEngine && ownerTower) dmg = SkillEngine.applyTowerDamageBonus(ownerTower, enemy, dmg, isCrit);
        // 护盾
        if (enemy.shield > 0) {
            var absorb = Math.min(enemy.shield, dmg);
            enemy.shield -= absorb;
            dmg -= absorb;
            if (dmg <= 0) return 0;
        }
        // 护甲
        var armorMult = Math.max(0.1, 1 - (enemy.armor || 0));
        var finalDmg = Math.round(dmg * armorMult * 10) / 10;
        enemy.hp -= finalDmg;

        // 元素效果
        if (eff) {
            if (eff.slow && !enemy.isBoss) {
                enemy.slowAmount = Math.max(enemy.slowAmount, eff.slow);
                enemy.slowTimer = Math.max(enemy.slowTimer, 2.0);
            }
            if (eff.dot) {
                enemy.dotDps = Math.max(enemy.dotDps, eff.dot);
                enemy.dotTimer = Math.max(enemy.dotTimer, 3.0);
            }
        }
        if (isCrit) window.GameState.stats.totalCrits = (window.GameState.stats.totalCrits || 0) + 1;
        return finalDmg;
    }

    function killEnemy(enemy, ownerTower, eff) {
        var g = window.GameState;
        if (enemy._dead) return;
        enemy._dead = true;
        // === SkillEngine hook: onEnemyDeath (trait effects, 分裂/自爆/亡语/二度复活/传染DOT) ===
        if (window.SkillEngine && SkillEngine.onEnemyDeath) SkillEngine.onEnemyDeath(enemy, ownerTower);

        g.gold += enemy.gold;
        g.score += enemy.gold * 2;
        g.kills = (g.kills || 0) + 1;
        onKill();

        if (window.Core && typeof window.Core.spawnParticles === 'function')
            window.Core.spawnParticles(enemy.x, enemy.y, enemy.color, enemy.isBoss ? 30 : 15);

        // 芯片掉落
        var chipChance;
        if (enemy.isElite) chipChance = 1.0;
        else if (enemy.isBoss) chipChance = 0.85;
        else if (enemy.tier === 'xl') chipChance = 0.25;
        else chipChance = 0.08;

        if (Math.random() < chipChance && typeof window.rollChip === 'function') {
            var chip = window.rollChip();
            g.chips = g.chips || [];
            g.chips.push(chip);
            if (window.Core && typeof window.Core.onChipDropped === 'function')
                window.Core.onChipDropped(chip);
        }

        // 解锁图鉴
        if (g.saveData) {
            g.saveData.enemies = g.saveData.enemies || {};
            g.saveData.enemies[enemy.type] = true;
            if (ownerTower) {
                g.saveData.towers = g.saveData.towers || {};
                g.saveData.towers[ownerTower.uid] = true;
            }
        }
    }

    function onBulletHit(bullet, target) {
        var g = window.GameState;
        if (!target || target._dead) return;

        var isCrit = bullet.element && Math.random() < bullet.eff.critChance;
        var critMult = isCrit ? bullet.eff.critMult : 1.0;
        var dmg = bullet.damage * critMult;

        damageEnemy(target, dmg, bullet.eff, null, isCrit, bullet.ownerTower);

        // splash
        if (bullet.splash && bullet.splash > 0) {
            for (var i = 0; i < g.enemies.length; i++) {
                var e2 = g.enemies[i];
                if (e2 === target || e2._dead) continue;
                if (dist(target.x, target.y, e2.x, e2.y) <= bullet.splash)
                    damageEnemy(e2, dmg * 0.6, bullet.eff, null, false, bullet.ownerTower);
            }
            if (window.Core && typeof window.Core.spawnParticles === 'function')
                window.Core.spawnParticles(target.x, target.y, bullet.color, 20);
        }

        // chain
        if (bullet.eff && bullet.eff.chain && bullet.eff.chain > 0) {
            var lastT = target;
            for (var c = 0; c < bullet.eff.chain; c++) {
                var next = _findNearest(lastT.x, lastT.y, 150, bullet.hitSet);
                if (!next) break;
                damageEnemy(next, dmg * (0.7 - c * 0.1), bullet.eff, null, false, bullet.ownerTower);
                bullet.hitSet[next.uid] = true;
                lastT = next;
            }
        }
    }

    // ---------- 塔楼 ----------
    function updateTowers(dt) {
        var g = window.GameState;
        for (var i = 0; i < g.towers.length; i++) {
            var t = g.towers[i];
            if (t._dead) continue;

            var eff = t._eff || t;
            if (window.Core && typeof window.Core.computeTowerStats === 'function') {
                eff = window.Core.computeTowerStats(t);
                t._eff = eff;
            }

            // 找路径最靠前且在射程内的敌人
            var target = null, bestPathIdx = -1;
            for (var j = 0; j < g.enemies.length; j++) {
                var e = g.enemies[j];
                if (e._dead) continue;
                if (dist(t.x, t.y, e.x, e.y) <= eff.range && e.pathIdx > bestPathIdx) {
                    bestPathIdx = e.pathIdx; target = e;
                }
            }

            if (target) {
                t.angle = Math.atan2(target.y - t.y, target.x - t.x);
                t.cooldown = (t.cooldown || 0) - dt;
                if (t.cooldown <= 0) { t.cooldown = eff.fireRate; fireTower(t, target, eff); }
            } else {
                t.cooldown = Math.max(0, (t.cooldown || 0) - dt);
            }
        }
        g.towers = g.towers.filter(function (x) { return !x._dead; });
    }

    function fireTower(t, target, eff) {
        var g = window.GameState;
        var color = eff.color || '#ffffff';
        // === SkillEngine hook: onTowerFire ===
        if (window.SkillEngine && SkillEngine.onTowerFire) SkillEngine.onTowerFire(t, target, null, eff);

        if (t.proto === 'laser') {
            // 瞬时穿透射线
            var hitCount = 0;
            var hitSet = {};
            hitSet[target.uid] = true;
            damageEnemy(target, eff.damage, eff, null, Math.random() < eff.critChance, t);
            hitCount++;

            var angle = t.angle || Math.atan2(target.y - t.y, target.x - t.x);
            var range = eff.range;
            var endX = t.x + Math.cos(angle) * range;
            var endY = t.y + Math.sin(angle) * range;

            for (var i = 0; i < g.enemies.length; i++) {
                if (hitCount >= (eff.pierce || 3)) break;
                var e = g.enemies[i];
                if (e._dead || hitSet[e.uid]) continue;
                if (_pointToSegment(e.x, e.y, t.x, t.y, endX, endY) <= (e.size + 4)) {
                    hitSet[e.uid] = true;
                    damageEnemy(e, eff.damage, eff, null, Math.random() < eff.critChance, t);
                    hitCount++;
                }
            }
            if (window.Core && typeof window.Core.spawnParticles === 'function')
                window.Core.spawnParticles(target.x, target.y, color, 8);
        } else {
            g.bullets = g.bullets || [];
            g.bullets.push({
                x: t.x, y: t.y,
                target: target, targetUid: target.uid,
                speed: eff.bulletSpeed || 500,
                damage: eff.damage,
                color: color,
                size: eff.bulletSize || 4,
                splash: eff.splash || 0,
                pierce: eff.pierce || 1,
                hitSet: {},
                element: t.element,
                eff: eff,
                ownerTower: t,
                alive: true,
                life: 2.0
            });
        }
    }

    // ---------- 子弹 ----------
    function updateBullets(dt) {
        var g = window.GameState;
        if (!g.bullets) return;

        for (var i = 0; i < g.bullets.length; i++) {
            var b = g.bullets[i];
            if (!b.alive) continue;
            b.life -= dt;
            if (b.life <= 0) { b.alive = false; continue; }

            if (!b.target || b.target._dead) {
                b.target = _findNearest(b.x, b.y, 300, b.hitSet);
                if (!b.target) { b.alive = false; continue; }
            }

            var dx = b.target.x - b.x, dy = b.target.y - b.y;
            var d = Math.sqrt(dx * dx + dy * dy);
            var step = b.speed * dt;

            if (step >= d) {
                onBulletHit(b, b.target);
                b.hitSet[b.target.uid] = true;
                b.pierce = (b.pierce || 1) - 1;
                if (b.pierce <= 0) {
                    b.alive = false;
                } else {
                    var next = _findNearest(b.target.x, b.target.y, 200, b.hitSet);
                    if (!next) b.alive = false;
                    else { b.target = next; b.x = next.x; b.y = next.y; }
                }
            } else {
                b.x += (dx / d) * step;
                b.y += (dy / d) * step;
            }
        }
        g.bullets = g.bullets.filter(function (b) { return b.alive; });
    }

    // ---------- combo ----------
    var combo = { count: 0, lastKillTime: 0, timer: 0, best: 0 };

    function onKill() {
        var now = performance.now() / 1000;
        if (now - combo.lastKillTime <= 1.5) combo.count++;
        else combo.count = 1;
        combo.lastKillTime = now;
        combo.timer = 1.5;
        if (combo.count > combo.best) combo.best = combo.count;
        window.GameState.combo = combo;
    }

    function updateCombo(dt) {
        if (combo.count > 0) {
            combo.timer -= dt;
            if (combo.timer <= 0) { combo.count = 0; combo.timer = 0; }
        }
    }

    // ---------- 结束条件 ----------
    function _finalize(win) {
        var g = window.GameState;
        if (!g.running) return;
        g.running = false;
        g.gameOver = !win;
        g.gameWon = win;
        if (g.saveData) {
            if (!g.saveData.bestWave || g.wave > g.saveData.bestWave) g.saveData.bestWave = g.wave;
            if (!g.saveData.bestScore || g.score > g.saveData.bestScore) g.saveData.bestScore = g.score;
            if (window.Core && typeof window.Core.saveProgress === 'function')
                window.Core.saveProgress();
        }
    }
    function gameOver() { _finalize(false); }
    function gameWin() { _finalize(true); }

    // ---------- 帧入口 ----------
    function tick(dt) {
        var g = window.GameState;
        if (!g.running || g.paused) return;
        dt = Math.min(0.1, dt);

        updateWaveSpawner(dt);
        updateEnemies(dt);
        updateTowers(dt);
        updateBullets(dt);
        updateCombo(dt);
    }

    // ---------- 辅助 ----------
    function _findNearest(x, y, radius, excludeSet) {
        var g = window.GameState;
        var best = null, bestD = Infinity;
        for (var i = 0; i < g.enemies.length; i++) {
            var e = g.enemies[i];
            if (e._dead) continue;
            if (excludeSet && excludeSet[e.uid]) continue;
            var d = dist(x, y, e.x, e.y);
            if (d <= radius && d < bestD) { bestD = d; best = e; }
        }
        return best;
    }
    function _pointToSegment(px, py, ax, ay, bx, by) {
        var abx = bx - ax, aby = by - ay;
        var apx = px - ax, apy = py - ay;
        var abLen2 = abx * abx + aby * aby;
        if (abLen2 === 0) return dist(px, py, ax, ay);
        var t = Math.max(0, Math.min(1, (apx * abx + apy * aby) / abLen2));
        return dist(px, py, ax + abx * t, ay + aby * t);
    }

    return {
        buildWave: buildWave,
        startWave: startWave,
        updateWaveSpawner: updateWaveSpawner,
        spawnEnemy: spawnEnemy,
        updateEnemies: updateEnemies,
        damageEnemy: damageEnemy,
        killEnemy: killEnemy,
        onBulletHit: onBulletHit,
        updateTowers: updateTowers,
        fireTower: fireTower,
        updateBullets: updateBullets,
        tick: tick,
        gameOver: gameOver,
        gameWin: gameWin,
        combo: combo,
        reset: function () {
            enemyUidSeq = 0;
            combo.count = 0; combo.lastKillTime = 0; combo.timer = 0; combo.best = 0;
        }
    };

})();

console.log('GameLogic ready');
