/* Core Engine — Tower Defense Framework | ~380 lines — with dynamic level support */
window.Core = window.Core || {};
window.GameState = window.GameState || {};

// CONSTANTS
(function () {
    var C = window.Core;
    C.W = 1100; C.H = 720; C.TS = 40;

    // Default path used as fallback when no level is loaded
    C.defaultPath = [
        {x:0,y:160},{x:200,y:160},{x:200,y:360},{x:520,y:360},
        {x:520,y:120},{x:820,y:120},{x:820,y:520},{x:360,y:520},
        {x:360,y:640},{x:1100,y:640}
    ];
    C.defaultPathWidth = C.TS * 0.6;

    // Current level state
    C.currentLevel = null;

    // Legacy PATH reference — points to current level path or default
    C.__defineGetter__('PATH', function () {
        return C.currentLevel ? C.currentLevel.path : C.defaultPath;
    });
    C.__defineGetter__('PATH_WIDTH', function () {
        return C.currentLevel ? (C.currentLevel.pathWidth || C.defaultPathWidth) : C.defaultPathWidth;
    });
})();

// LEVEL MANAGEMENT
(function () {
    var C = window.Core;

    C.setLevel = function (level) {
        if (!level || !level.path || level.path.length < 2) {
            console.warn('Core.setLevel: invalid level, falling back to default');
            C.currentLevel = null;
            C.buildPlaceableMap();
            return;
        }
        C.currentLevel = level;
        // Rebuild placeable map using level path
        C.buildPlaceableMap(level.path, level.pathWidth || C.defaultPathWidth);
        // Reset gold/lives from level config if present
        var S = window.GameState;
        if (level.startGold !== undefined) S.gold = level.startGold;
        if (level.startLives !== undefined) S.lives = level.startLives;
        // Clear towers, enemies, bullets when switching level
        S.towers = []; S.enemies = []; S.bullets = [];
        S.particles = []; S.floats = []; S.spawnQueue = [];
        S.wave = 0; S.waveInProgress = false; S.selectedTower = null;
    };

    // Getter helpers for current path
    C.getCurrentPath = function () {
        return C.currentLevel ? C.currentLevel.path : C.defaultPath;
    };
    C.getCurrentPathWidth = function () {
        return C.currentLevel ? (C.currentLevel.pathWidth || C.defaultPathWidth) : C.defaultPathWidth;
    };
    C.getCurrentTheme = function () {
        return C.currentLevel && C.currentLevel.theme ? C.currentLevel.theme : null;
    };
})();

// GAME STATE
(function () {
    var S = window.GameState;
    S.running = false; S.paused = false; S.speed = 1;
    S.wave = 0; S.maxWave = 50;
    S.gold = 0; S.lives = 20; S.score = 0; S.kills = 0;
    S.towers = []; S.enemies = []; S.bullets = [];
    S.particles = []; S.floats = []; S.chips = [];
    S.selectedTowerType = null; S.selectedTower = null;
    S.sellMode = false; S.waveInProgress = false; S.spawnQueue = [];
    S.towerChips = {}; S.placeableMap = null;
    S.combo = 0; S.screenShake = 0;
})();

// HELPERS
(function () {
    var C = window.Core;
    C.rand = function (a, b) { return a + Math.random() * (b - a); };
    C.randi = function (a, b) { return Math.floor(C.rand(a, b + 1)); };
    C.pick = function (arr) { return arr[Math.floor(Math.random() * arr.length)]; };
    C.dist = function (a, b) { var dx = a.x - b.x, dy = a.y - b.y; return Math.sqrt(dx*dx + dy*dy); };
    C.clamp = function (v, a, b) { return v < a ? a : (v > b ? b : v); };

    // Point-to-segment distance — used as default helper
    function pointSegDist(px, py, ax, ay, bx, by) {
        var abx = bx - ax, aby = by - ay;
        var apx = px - ax, apy = py - ay;
        var lenSq = abx*abx + aby*aby;
        if (lenSq === 0) return Math.sqrt(apx*apx + apy*apy);
        var t = C.clamp((apx*abx + apy*aby) / lenSq, 0, 1);
        var cx = ax + t*abx, cy = ay + t*aby;
        return Math.sqrt((px-cx)*(px-cx) + (py-cy)*(py-cy));
    }

    // Use external isPointOnLevelPath if provided, otherwise fall back to pointSegDist
    var pointLineDist;
    if (typeof window.isPointOnLevelPath === 'function') {
        pointLineDist = window.isPointOnLevelPath;
    } else {
        pointLineDist = pointSegDist;
    }

    C.isOnPath = function (px, py) {
        var path = C.getCurrentPath();
        var r = C.getCurrentPathWidth();
        for (var i = 0; i < path.length - 1; i++) {
            if (pointLineDist(px, py, path[i].x, path[i].y, path[i+1].x, path[i+1].y) < r) return true;
        }
        return false;
    };

    C.buildPlaceableMap = function (optPath, optWidth) {
        var path = optPath || C.getCurrentPath();
        var width = optWidth || C.getCurrentPathWidth();
        var cols = Math.ceil(C.W / C.TS), rows = Math.ceil(C.H / C.TS);
        var grid = [];
        // Build a local isOnPath using the provided path/width
        function localIsOnPath(px, py) {
            for (var i = 0; i < path.length - 1; i++) {
                if (pointLineDist(px, py, path[i].x, path[i].y, path[i+1].x, path[i+1].y) < width) return true;
            }
            return false;
        }
        for (var y = 0; y < rows; y++) {
            var row = [];
            for (var x = 0; x < cols; x++) {
                row.push(!localIsOnPath(x*C.TS + C.TS/2, y*C.TS + C.TS/2));
            }
            grid.push(row);
        }
        window.GameState.placeableMap = grid;
        return grid;
    };

    C.canPlaceAt = function (gx, gy) {
        var TS = C.TS, cols = Math.ceil(C.W/TS), rows = Math.ceil(C.H/TS);
        if (gx < 0 || gy < 0 || gx >= cols || gy >= rows) return false;
        var map = window.GameState.placeableMap || C.buildPlaceableMap();
        if (!map[gy][gx]) return false;
        var towers = window.GameState.towers;
        for (var i = 0; i < towers.length; i++) {
            if (Math.floor(towers[i].x/TS) === gx && Math.floor(towers[i].y/TS) === gy) return false;
        }
        return true;
    };

    function applyChip(stats, chip) {
        if (!chip) return;
        var f = chip.statField, v = chip.value;
        if (f === 'damage') stats.damage *= v;
        else if (f === 'range') stats.range *= v;
        else if (f === 'rate') stats.fireRate *= v;
        else if (f === 'crit') stats.critChance += v;
        else if (f === 'splash') stats.splash *= v;
        else if (f === 'pierce') stats.pierce += v;
        else if (f === 'chain') stats.chain += v;
        else if (f === 'slow') stats.slow = Math.min(0.9, stats.slow + v);
        else if (f === 'dot') stats.dot += v;
        else if (f === 'gold') stats.goldMult *= v;
        if (chip.children) for (var i = 0; i < chip.children.length; i++) applyChip(stats, chip.children[i]);
    }

    C.computeTowerStats = function (tower) {
        var data = window.TOWER_DATA[tower.type] || {};
        var lvl = tower.level || 1;
        var lm = 1 + (lvl - 1) * 0.25;
        var rm = 1 + (lvl - 1) * 0.1;
        var fm = 1 - (lvl - 1) * 0.08;
        var stats = {
            damage: (data.damage || 10) * lm,
            range: (data.range || 100) * rm,
            fireRate: (data.fireRate || 1) * fm,
            critChance: data.critChance || 0,
            critMult: data.critMult || 2,
            splash: data.splash || 0,
            pierce: data.pierce || 1,
            chain: data.chain || 0,
            slow: data.slow || 0,
            dot: data.dot || 0,
            goldMult: 1
        };
        var chips = tower.chips || [];
        for (var i = 0; i < chips.length; i++) applyChip(stats, chips[i]);
        return stats;
    };
})();

// PARTICLES & FLOATS
(function () {
    var C = window.Core;
    C.spawnParticles = function (x, y, color, count, speed, life) {
        var parts = window.GameState.particles;
        for (var i = 0; i < count; i++) {
            var ang = Math.random() * Math.PI * 2, spd = speed * (0.5 + Math.random() * 0.5);
            parts.push({ x:x, y:y, vx:Math.cos(ang)*spd, vy:Math.sin(ang)*spd, color:color, life:life, maxLife:life, size:2+Math.random()*3 });
        }
    };
    C.updateParticles = function (dt) {
        var parts = window.GameState.particles;
        for (var i = parts.length - 1; i >= 0; i--) {
            var p = parts[i];
            p.x += p.vx * dt; p.y += p.vy * dt;
            p.vx *= 0.92; p.vy *= 0.92; p.life -= dt;
            if (p.life <= 0) parts.splice(i, 1);
        }
    };
    C.drawParticles = function (ctx) {
        var parts = window.GameState.particles;
        for (var i = 0; i < parts.length; i++) {
            var p = parts[i];
            ctx.globalAlpha = Math.max(0, p.life / p.maxLife);
            ctx.fillStyle = p.color;
            ctx.beginPath(); ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2); ctx.fill();
        }
        ctx.globalAlpha = 1;
    };
    C.spawnFloat = function (x, y, text, color) {
        window.GameState.floats.push({ x:x, y:y, text:text, color:color, life:1.0, maxLife:1.0 });
    };
    C.updateFloats = function (dt) {
        var floats = window.GameState.floats;
        for (var i = floats.length - 1; i >= 0; i--) {
            floats[i].y -= 30 * dt; floats[i].life -= dt;
            if (floats[i].life <= 0) floats.splice(i, 1);
        }
    };
    C.drawFloats = function (ctx) {
        var floats = window.GameState.floats;
        ctx.font = 'bold 16px sans-serif'; ctx.textAlign = 'center';
        for (var i = 0; i < floats.length; i++) {
            var f = floats[i];
            ctx.globalAlpha = Math.max(0, f.life / f.maxLife);
            ctx.fillStyle = '#000'; ctx.fillText(f.text, f.x + 1, f.y + 1);
            ctx.fillStyle = f.color; ctx.fillText(f.text, f.x, f.y);
        }
        ctx.globalAlpha = 1;
    };
    C.spawnExplosion = function (x, y, color, size) {
        var parts = window.GameState.particles;
        var ringCount = Math.max(8, Math.floor(size / 5));
        for (var i = 0; i < ringCount; i++) {
            var ang = (i / ringCount) * Math.PI * 2, spd = size * 2;
            parts.push({ x:x, y:y, vx:Math.cos(ang)*spd, vy:Math.sin(ang)*spd, color:color, life:0.45, maxLife:0.45, size:3+size*0.02 });
        }
        C.spawnParticles(x, y, color, Math.floor(size / 2), size * 3, 0.6);
    };
})();

// SCREEN SHAKE
window.Core.ScreenShake = {
    intensity: 0, decay: 8,
    trigger: function (amt) { this.intensity = Math.max(this.intensity, amt); },
    getOffset: function (dt) {
        if (this.intensity <= 0) return { x: 0, y: 0 };
        this.intensity = Math.max(0, this.intensity - this.decay * dt);
        return { x:(Math.random()-0.5)*this.intensity, y:(Math.random()-0.5)*this.intensity };
    }
};

// DRAW HELPERS
(function () {
    var C = window.Core;
    // ============================================================
    // 增强版 drawTower — 底座/炮管/元素特效/动效/光环
    // ============================================================
    C.drawTower = function (ctx, t) {
        var data = window.TOWER_DATA[t.type] || {};
        var col = data.color || '#888899';
        var glow = data.glow || '#aaa';
        var element = data.element || '';
        var proto = data.proto || 'archer';
        var rarity = data.rarity || '普通';
        var lvl = t.level || 1;
        var t = Date.now() * 0.001;
        var cx = t.x, cy = t.y;
        if (t._notOnGrid) { /* nop but keep var */ }

        // === 底座阴影 ===
        ctx.fillStyle = 'rgba(0,0,0,0.35)';
        ctx.beginPath(); ctx.ellipse(cx, cy + 14, 18, 6, 0, 0, Math.PI*2); ctx.fill();

        // === 底座 (渐变色 + 外描边 + 螺栓) ===
        var baseGrad = ctx.createRadialGradient(cx-4, cy-4, 2, cx, cy, 18);
        baseGrad.addColorStop(0, '#3a4058');
        baseGrad.addColorStop(0.6, '#242838');
        baseGrad.addColorStop(1, '#12152a');
        ctx.fillStyle = baseGrad;
        ctx.beginPath(); ctx.arc(cx, cy, 18, 0, Math.PI*2); ctx.fill();
        ctx.lineWidth = 2; ctx.strokeStyle = '#0a0d1a';
        ctx.stroke();

        // 内圈颜色（按稀有度+元素渐变）
        var innerGrad = ctx.createRadialGradient(cx-3, cy-3, 1, cx, cy, 14);
        innerGrad.addColorStop(0, C._lighten(col, 0.25));
        innerGrad.addColorStop(1, col);
        ctx.fillStyle = innerGrad; ctx.globalAlpha = 0.6;
        ctx.beginPath(); ctx.arc(cx, cy, 14, 0, Math.PI*2); ctx.fill();
        ctx.globalAlpha = 1;

        // 稀有度外圈脉动（金/紫/蓝发光）
        var rareGlow = { '普通':'#9aa4bd','稀有':'#6bff6b','史诗':'#c060ff','传奇':'#ffd93d','神话':'#ff5a2a' };
        var rg = rareGlow[rarity] || '#9aa4bd';
        ctx.strokeStyle = rg; ctx.lineWidth = 1.5;
        ctx.globalAlpha = 0.4 + Math.sin(t*2 + t._spawnOffset||0)*0.2;
        ctx.beginPath(); ctx.arc(cx, cy, 16, 0, Math.PI*2); ctx.stroke();
        ctx.globalAlpha = 1;

        // 螺栓 (底座上 3 颗)
        ctx.fillStyle = '#555566'; ctx.strokeStyle = '#222233'; ctx.lineWidth = 1;
        for(var b=0;b<3;b++){
            var ba = b*Math.PI*2/3 - Math.PI/2;
            var bx = cx + Math.cos(ba)*15, by = cy + Math.sin(ba)*15;
            ctx.beginPath(); ctx.arc(bx, by, 1.8, 0, Math.PI*2); ctx.fill(); ctx.stroke();
        }

        // === 炮管 (旋转) ===
        var ang = t.angle || 0;
        ctx.save(); ctx.translate(cx, cy); ctx.rotate(ang);

        // 炮管按 proto 不同造型
        ctx.lineWidth = 2;
        switch(proto){
            case 'archer':
                // 弓手 — 长管 + 尖头箭
                ctx.fillStyle = col; ctx.strokeStyle = C._darken(col, 0.3);
                ctx.fillRect(4, -2, 14, 4); ctx.strokeRect(4, -2, 14, 4);
                ctx.fillStyle = C._lighten(col, 0.3);
                ctx.beginPath();
                ctx.moveTo(18, -3); ctx.lineTo(24, 0); ctx.lineTo(18, 3);
                ctx.closePath(); ctx.fill(); ctx.stroke();
                // 尾翼
                ctx.fillStyle = C._darken(col, 0.2);
                ctx.beginPath();
                ctx.moveTo(4, -4); ctx.lineTo(6, -2); ctx.lineTo(4, 0);
                ctx.closePath(); ctx.fill(); ctx.stroke();
                break;
            case 'cannon':
                // 火炮 — 粗管 + 炮口 + 前管环
                ctx.fillStyle = col; ctx.strokeStyle = C._darken(col, 0.3);
                ctx.fillRect(-2, -6, 22, 12); ctx.strokeRect(-2, -6, 22, 12);
                ctx.fillStyle = C._darken(col, 0.2);
                ctx.fillRect(14, -7, 6, 14); ctx.strokeRect(14, -7, 6, 14);
                // 炮口圆
                ctx.fillStyle = '#000';
                ctx.beginPath(); ctx.arc(20, 0, 2.5, 0, Math.PI*2); ctx.fill();
                // 散热管
                ctx.fillStyle = C._lighten(col, 0.15);
                ctx.fillRect(0, -9, 8, 3); ctx.strokeRect(0, -9, 8, 3);
                break;
            case 'laser':
                // 激光 — 细管 + 透镜 + 内部能量脉动
                ctx.fillStyle = '#44445a'; ctx.strokeStyle = '#222233';
                ctx.fillRect(2, -3, 20, 6); ctx.strokeRect(2, -3, 20, 6);
                // 能量核心脉动
                ctx.fillStyle = col; ctx.globalAlpha = 0.6 + Math.sin(t*8)*0.3;
                ctx.fillRect(4, -1.5, 16, 3);
                ctx.globalAlpha = 1;
                // 透镜
                ctx.fillStyle = C._lighten(col, 0.4);
                ctx.beginPath(); ctx.arc(22, 0, 3, 0, Math.PI*2); ctx.fill(); ctx.stroke();
                // 透镜光晕
                ctx.fillStyle = col; ctx.globalAlpha = 0.3 + Math.sin(t*4)*0.2;
                ctx.beginPath(); ctx.arc(22, 0, 5 + Math.sin(t*6), 0, Math.PI*2); ctx.fill();
                ctx.globalAlpha = 1;
                break;
            case 'storm':
                // 风暴 — 双管 + 旋转
                ctx.fillStyle = col; ctx.strokeStyle = C._darken(col, 0.3);
                var spin = t * 8; // 双管自转
                for(var sb=-1; sb<=1; sb+=2){
                    ctx.save(); ctx.rotate(spin);
                    ctx.fillRect(-2, sb*5 - 2, 14, 4);
                    ctx.strokeRect(-2, sb*5 - 2, 14, 4);
                    ctx.beginPath(); ctx.arc(12, sb*5, 2, 0, Math.PI*2); ctx.fill(); ctx.stroke();
                    ctx.restore();
                }
                // 中央球
                ctx.fillStyle = col;
                ctx.beginPath(); ctx.arc(0, 0, 4, 0, Math.PI*2); ctx.fill(); ctx.stroke();
                ctx.fillStyle = '#fff'; ctx.globalAlpha = 0.5 + Math.sin(t*5)*0.3;
                ctx.beginPath(); ctx.arc(-1.5, -1.5, 1.5, 0, Math.PI*2); ctx.fill();
                ctx.globalAlpha = 1;
                break;
            default:
                ctx.fillStyle = col; ctx.strokeStyle = glow;
                ctx.beginPath(); ctx.arc(0, 0, 8, 0, Math.PI*2); ctx.fill(); ctx.stroke();
        }
        ctx.restore();

        // === 元素装饰特效 ===
        C._towerDecor(ctx, t, data, cx, cy, t);

        // === 等级星星 (按稀有度金色/紫色) ===
        if(lvl > 1){
            ctx.font = 'bold 10px sans-serif';
            ctx.textAlign = 'center';
            var starColor = rarity === '神话' || rarity === '传奇' ? '#ffe27a' : (rarity === '史诗' ? '#c060ff' : '#ffffff');
            ctx.fillStyle = starColor;
            var starText = 'Lv.' + lvl;
            ctx.fillText(starText, cx, cy - 24);
        }

        // === 芯片槽 (底座下方) ===
        var chips = t.chips || [];
        var chipSize = 5, chipGap = 2;
        var chipRowW = chips.length * chipSize + Math.max(0, chips.length - 1) * chipGap;
        if(chipRowW > 0){
            for(var ci=0; ci<chips.length; ci++){
                var cix = cx - chipRowW/2 + ci*(chipSize+chipGap) + chipSize/2;
                var chipCol = chips[ci].color || '#888';
                ctx.fillStyle = chipCol;
                ctx.fillRect(cix - chipSize/2, cy + 16, chipSize, chipSize);
                // 芯片描边 + 微光
                ctx.strokeStyle = C._lighten(chipCol, 0.4); ctx.lineWidth = 0.5;
                ctx.strokeRect(cix - chipSize/2, cy + 16, chipSize, chipSize);
            }
        }

        // === 锻造塔 (forgeName) 加光环 ===
        if(t.isForged){
            ctx.strokeStyle = '#ffd93d'; ctx.lineWidth = 1;
            ctx.globalAlpha = 0.5 + Math.sin(t*3)*0.3;
            ctx.beginPath(); ctx.arc(cx, cy, 22 + Math.sin(t*2), 0, Math.PI*2); ctx.stroke();
            ctx.globalAlpha = 1;
            // forgeName 悬浮
            if(t.forgeName){
                ctx.font = '10px sans-serif'; ctx.fillStyle = '#ffe27a'; ctx.textAlign = 'center';
                ctx.fillText(t.forgeName, cx, cy - 30);
            }
        }

        // === 选中圈 + 范围 ===
        if (window.GameState && window.GameState.selectedTower === t) {
            var stats = C.computeTowerStats(t);
            // 范围圈
            ctx.strokeStyle = 'rgba(255, 226, 122, 0.5)'; ctx.lineWidth = 1; ctx.setLineDash([6, 4]);
            ctx.beginPath(); ctx.arc(cx, cy, stats.range, 0, Math.PI * 2); ctx.stroke(); ctx.setLineDash([]);
            // 选中环
            ctx.strokeStyle = '#ffe27a'; ctx.lineWidth = 2;
            ctx.beginPath(); ctx.arc(cx, cy, 20, 0, Math.PI*2); ctx.stroke();
            // 四角标识
            ctx.fillStyle = '#ffe27a';
            for(var cci=0;cci<4;cci++){
                var cca = cci*Math.PI/2;
                var ccx = cx + Math.cos(cca)*20, ccy = cy + Math.sin(cca)*20;
                ctx.beginPath(); ctx.arc(ccx, ccy, 2, 0, Math.PI*2); ctx.fill();
            }
        }
    };

    // --- 炮塔元素装饰 ---
    C._towerDecor = function(ctx, t, data, cx, cy, time){
        var element = data.element || '';
        switch(element){
            case '火': case '火2':
                // 炮口冒火星
                ctx.fillStyle = '#ffaa44';
                for(var f=0;f<2;f++){
                    var fx = cx + Math.cos(t.angle||0)*18 + (Math.random()-0.5)*3;
                    var fy = cy + Math.sin(t.angle||0)*18 + (Math.random()-0.5)*3;
                    ctx.globalAlpha = 0.5 - Math.random()*0.3;
                    ctx.beginPath(); ctx.arc(fx, fy, 1.5, 0, Math.PI*2); ctx.fill();
                }
                ctx.globalAlpha = 1;
                break;
            case '冰':
                // 底座冰霜结晶
                ctx.fillStyle = '#ccefff';
                ctx.globalAlpha = 0.5;
                for(var ic=0;ic<3;ic++){
                    var ica = ic*Math.PI*2/3 + time;
                    var icx = cx + Math.cos(ica)*19, icy = cy + Math.sin(ica)*19;
                    ctx.beginPath();
                    ctx.moveTo(icx, icy-3); ctx.lineTo(icx+1, icy); ctx.lineTo(icx, icy+3);
                    ctx.lineTo(icx-1, icy); ctx.closePath(); ctx.fill();
                }
                ctx.globalAlpha = 1;
                break;
            case '雷':
                // 底座电弧
                ctx.strokeStyle = '#ffd93d'; ctx.lineWidth = 1;
                ctx.globalAlpha = 0.6 + Math.sin(time*8)*0.3;
                for(var ls=0;ls<2;ls++){
                    var lx = cx + 16 + ls*4, ly = cy - 16 + ls*4;
                    ctx.beginPath(); ctx.moveTo(cx, cy);
                    for(var li=0;li<3;li++){
                        lx += (Math.random()-0.5)*6; ly += (Math.random()-0.5)*6;
                        ctx.lineTo(lx, ly);
                    }
                    ctx.stroke();
                }
                ctx.globalAlpha = 1;
                break;
            case '毒': case '酸':
                // 底座冒泡
                ctx.fillStyle = '#6bff6b';
                ctx.globalAlpha = 0.4;
                for(var pb=0;pb<2;pb++){
                    var pbx = cx + Math.sin(time*2+pb*3)*18;
                    var pby = cy + Math.cos(time*1.5+pb*2)*18;
                    ctx.beginPath(); ctx.arc(pbx, pby, 1.5, 0, Math.PI*2); ctx.fill();
                }
                ctx.globalAlpha = 1;
                break;
            case '虚空': case '暗':
                // 扭曲粒子环绕
                ctx.fillStyle = '#c060ff';
                for(var vp=0;vp<3;vp++){
                    var vpa = time*1.5 + vp*Math.PI*2/3;
                    ctx.globalAlpha = 0.4 + Math.sin(vpa*2)*0.3;
                    ctx.beginPath();
                    ctx.arc(cx + Math.cos(vpa)*20, cy + Math.sin(vpa)*20, 1.8, 0, Math.PI*2);
                    ctx.fill();
                }
                ctx.globalAlpha = 1;
                break;
            case '光': case '圣':
                // 光芒十字
                ctx.strokeStyle = '#ffe27a'; ctx.lineWidth = 1;
                ctx.globalAlpha = 0.5 + Math.sin(time*3)*0.3;
                ctx.beginPath();
                ctx.moveTo(cx-22, cy); ctx.lineTo(cx+22, cy);
                ctx.moveTo(cx, cy-22); ctx.lineTo(cx, cy+22);
                ctx.stroke();
                ctx.globalAlpha = 1;
                break;
        }
    };

    // ============================================================
    // drawChip — 精致芯片图标绘制（八边形 + 稀有度脉动光环 + 中心图标 + 底部数值）
    // ============================================================
    C.drawChip = function(ctx, chip, cx, cy, size){
        size = size || 40;
        var t = Date.now() * 0.001;
        var color = chip.color || '#9aa4bd';
        // 稀有度发光映射
        var rarityMap = {
            '普通': '#9aa4bd', 'N': '#9aa4bd',
            '稀有': '#6bff6b', 'R': '#6bff6b',
            '史诗': '#c060ff', 'SR': '#c060ff',
            '传奇': '#ffd93d', 'SSR': '#ffd93d', 'UR': '#ffd93d',
            '神话': '#ff5a2a', 'MY': '#ff5a2a'
        };
        var rarity = chip.rarityName || chip.rarity || '普通';
        var glowColor = rarityMap[rarity] || color;
        var half = size / 2;

        ctx.save();
        ctx.translate(cx, cy);

        // --- 稀有度脉动光环 ---
        var pulse = 0.3 + Math.sin(t * 2.5) * 0.15;
        ctx.globalAlpha = pulse;
        ctx.fillStyle = glowColor;
        ctx.beginPath();
        ctx.arc(0, 0, half * 1.2, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalAlpha = 1;

        // --- 外轮廓：八边形 ---
        ctx.strokeStyle = glowColor;
        ctx.lineWidth = 2;
        ctx.beginPath();
        for(var i = 0; i < 8; i++){
            var a = i * Math.PI / 4 - Math.PI / 8;
            var r = half * 0.95;
            if(i === 0) ctx.moveTo(Math.cos(a)*r, Math.sin(a)*r);
            else ctx.lineTo(Math.cos(a)*r, Math.sin(a)*r);
        }
        ctx.closePath();
        ctx.fillStyle = '#1a2234';
        ctx.fill();
        ctx.stroke();

        // --- 内部 chip 细节轮廓：圆角方形 ---
        var innerR = half * 0.55;
        var innerPad = half * 0.2;
        ctx.strokeStyle = color;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.roundRect(-innerR, -innerR + innerPad * 0.3, innerR * 2, innerR * 1.3, 2);
        ctx.stroke();

        // 底部引脚（金属质感）
        ctx.fillStyle = color;
        ctx.globalAlpha = 0.5;
        for(var p = 0; p < 3; p++){
            var px = -innerR * 0.7 + p * innerR * 0.7;
            ctx.fillRect(px, innerR * 0.5, 2, 3);
        }
        ctx.globalAlpha = 1;

        // --- 中心图标 / statName ---
        var iconText = chip.icon || chip.statName || chip.statCn || '◆';
        ctx.fillStyle = '#e8ecf4';
        ctx.font = 'bold ' + Math.floor(size * 0.28) + 'px system-ui, sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(iconText, 0, -size * 0.02);

        // --- 底部数值 ---
        var valText = (chip.value !== undefined && chip.value !== null) 
            ? chip.value + (chip.unit || '') 
            : '';
        if(valText){
            ctx.fillStyle = glowColor;
            ctx.font = 'bold ' + Math.floor(size * 0.22) + 'px system-ui, sans-serif';
            ctx.fillText(valText, 0, size * 0.22);
        }

        // --- nestedSlots 小树图标 ---
        if(chip.nestedSlots && chip.nestedSlots > 0){
            ctx.fillStyle = '#6bff6b';
            ctx.font = Math.floor(size * 0.18) + 'px system-ui, sans-serif';
            ctx.textAlign = 'left';
            ctx.textBaseline = 'top';
            ctx.fillText('🌲×' + chip.nestedSlots, -half + 2, -half + 2);
        }

        ctx.restore();
    };

    // ============================================================
    // makeCodexEnemyPreview — 根据 enemy 数据生成 drawEnemy 可接受的假对象
    // ============================================================
    C.makeCodexEnemyPreview = function(enemyData, cx, cy, size){
        return {
            x: cx,
            y: cy,
            color: enemyData.color || '#c060ff',
            shape: enemyData.shape || 'circle',
            size: size || 22,
            element: enemyData.element || '',
            trait: enemyData.trait || '',
            isBoss: !!enemyData.isBoss,
            isElite: !!(enemyData.isElite || enemyData.rank === '精英' || enemyData.rank === '首领'),
            _dir: 0,
            hp: enemyData.baseHp || 100,
            maxHp: enemyData.baseHp || 100,
            slowed: false,
            dot: 0,
            shield: 0,
            stunned: false,
            poison: 0,
            _spawnOffset: Math.random() * 10
        };
    };

    // ============================================================
    // makeCodexTowerPreview — 根据 tower 数据生成 drawTower 可接受的假对象
    // ============================================================
    C.makeCodexTowerPreview = function(towerData, cx, cy){
        return {
            type: towerData.id,
            x: cx,
            y: cy,
            angle: Math.random() * Math.PI * 2,
            level: 1,
            chips: towerData.previewChips || [],
            isForged: false,
            forgeName: null
        };
    };

    // ============================================================
    // 增强版 drawEnemy — 眼睛/高光/主题特效/动效
    // ============================================================
    C.drawEnemy = function (ctx, e) {
        var t = Date.now() * 0.001;
        var size = e.size || 14;
        var cx = e.x, cy = e.y;

        // === Aura / 光环 ===
        if (e.isBoss) {
            // Boss — 双层脉动光环
            ctx.globalAlpha = 0.25 + Math.sin(t*4)*0.08;
            ctx.fillStyle = e.color;
            ctx.beginPath(); ctx.arc(cx, cy, size+18+Math.sin(t*2)*3, 0, Math.PI*2); ctx.fill();
            ctx.globalAlpha = 0.12;
            ctx.fillStyle = '#ffd93d';
            ctx.beginPath(); ctx.arc(cx, cy, size+28+Math.sin(t*3)*4, 0, Math.PI*2); ctx.fill();
            ctx.globalAlpha = 1;
        } else if (e.isElite) {
            // 精英 — 单环 + 角光
            ctx.globalAlpha = 0.22;
            ctx.fillStyle = e.color;
            ctx.beginPath(); ctx.arc(cx, cy, size+12+Math.sin(t*3)*2, 0, Math.PI*2); ctx.fill();
            ctx.globalAlpha = 1;
        }

        // === 身体 (带高光阴影) ===
        C._enemyBody(ctx, e, cx, cy, size, t);

        // === 装饰主题特效 ===
        C._enemyDecor(ctx, e, cx, cy, size, t);

        // === 眼睛 ===
        C._enemyEyes(ctx, e, cx, cy, size, t);

        // === 状态圈 (冰冻/燃烧/中毒/眩晕/护盾) ===
        C._enemyStatus(ctx, e, cx, cy, size, t);

        // === HP bar ===
        var hpRatio = e.hp / e.maxHp, barW = size * 2, barY = cy - size - 10;
        // 背景条
        ctx.fillStyle = 'rgba(0,0,0,0.7)';
        ctx.fillRect(cx - barW/2 - 1, barY - 1, barW + 2, 5);
        ctx.fillStyle = '#2a2a30';
        ctx.fillRect(cx - barW/2, barY, barW, 3);
        // HP 填充
        var hpColor = hpRatio > 0.5 ? '#6bff6b' : (hpRatio > 0.25 ? '#ffd93d' : '#ff5a2a');
        ctx.fillStyle = hpColor;
        ctx.fillRect(cx - barW/2, barY, barW * hpRatio, 3);
        // Boss/精英 HP 条加光
        if(e.isBoss || e.isElite){
            ctx.globalAlpha = 0.5 + Math.sin(t*6)*0.3;
            ctx.fillStyle = hpColor;
            ctx.fillRect(cx - barW/2, barY, barW * hpRatio, 1);
            ctx.globalAlpha = 1;
        }
    };

    // --- 身体 ---
    C._enemyBody = function(ctx, e, cx, cy, sz, t){
        var col = e.color || '#aabbcc';
        var size = sz;
        var bob = Math.sin(t*6 + (e._spawnOffset||0)) * 1.5; // 呼吸动效
        cy += bob;

        ctx.lineWidth = 1.5;
        ctx.strokeStyle = 'rgba(0,0,0,0.6)';

        // 外描边 (阴影)
        ctx.fillStyle = 'rgba(0,0,0,0.25)';
        ctx.beginPath();
        C._enemyShapePath(ctx, e, cx, cy+2, size);
        ctx.fill();

        // 主体（渐变）
        var grad = ctx.createRadialGradient(cx - size*0.3, cy - size*0.3, 2, cx, cy, size);
        grad.addColorStop(0, C._lighten(col, 0.35));
        grad.addColorStop(0.6, col);
        grad.addColorStop(1, C._darken(col, 0.25));
        ctx.fillStyle = grad;
        ctx.beginPath();
        C._enemyShapePath(ctx, e, cx, cy, size);
        ctx.fill(); ctx.stroke();

        // 飞行敌人画翅膀
        if(e.flying || e.trait === '飞行'){
            ctx.fillStyle = C._lighten(col, 0.5);
            ctx.globalAlpha = 0.6;
            var wingY = cy - size*0.3;
            var wingSpread = size * (0.6 + Math.sin(t*12)*0.2);
            // 左翅
            ctx.beginPath();
            ctx.moveTo(cx - size*0.8, wingY);
            ctx.quadraticCurveTo(cx - size*1.8, wingY - size*0.4, cx - size*1.2, wingY + size*0.1);
            ctx.quadraticCurveTo(cx - size*1.5, wingY, cx - size*0.8, wingY);
            ctx.fill();
            // 右翅
            ctx.beginPath();
            ctx.moveTo(cx + size*0.8, wingY);
            ctx.quadraticCurveTo(cx + size*1.8, wingY - size*0.4, cx + size*1.2, wingY + size*0.1);
            ctx.quadraticCurveTo(cx + size*1.5, wingY, cx + size*0.8, wingY);
            ctx.fill();
            ctx.globalAlpha = 1;
        }

        // Boss/精英角/王冠
        if(e.isBoss){
            ctx.fillStyle = '#ffd93d';
            ctx.strokeStyle = '#aa8820';
            ctx.lineWidth = 1;
            // 三颗王冠
            for(var k=-1;k<=1;k++){
                ctx.beginPath();
                ctx.moveTo(cx + k*size*0.5, cy - size*0.5);
                ctx.lineTo(cx + k*size*0.6, cy - size*1.1);
                ctx.lineTo(cx + k*size*0.4, cy - size*0.5);
                ctx.closePath(); ctx.fill(); ctx.stroke();
            }
        } else if(e.isElite){
            // 精英角
            ctx.fillStyle = C._darken(col, 0.3);
            ctx.beginPath();
            ctx.moveTo(cx - size*0.5, cy - size*0.6);
            ctx.lineTo(cx - size*0.7, cy - size*1.0);
            ctx.lineTo(cx - size*0.3, cy - size*0.6);
            ctx.fill();
            ctx.beginPath();
            ctx.moveTo(cx + size*0.5, cy - size*0.6);
            ctx.lineTo(cx + size*0.7, cy - size*1.0);
            ctx.lineTo(cx + size*0.3, cy - size*0.6);
            ctx.fill();
        }
    };

    // --- 形状路径 ---
    C._enemyShapePath = function(ctx, e, cx, cy, size){
        var s = e.shape;
        // 精英/Boss 形状升级
        if(e.isBoss){
            s = 'diamond'; // Boss 统一菱形
            size *= 1.2;
        } else if(e.isElite && s === 'circle'){
            s = 'hexagon'; // 精英圆形→六边形
        } else if(e.isElite && s === 'triangle'){
            s = 'star';
        }
        switch(s){
            case 'triangle':
                ctx.moveTo(cx, cy - size);
                ctx.lineTo(cx - size*0.95, cy + size*0.75);
                ctx.lineTo(cx + size*0.95, cy + size*0.75);
                ctx.closePath(); break;
            case 'star':
                for(var i=0;i<10;i++){
                    var a = i*Math.PI/5 - Math.PI/2;
                    var r = i%2===0 ? size : size*0.5;
                    var px = cx + Math.cos(a)*r, py = cy + Math.sin(a)*r;
                    if(i===0) ctx.moveTo(px,py); else ctx.lineTo(px,py);
                }
                ctx.closePath(); break;
            case 'diamond':
                ctx.moveTo(cx, cy - size);
                ctx.lineTo(cx + size*0.9, cy);
                ctx.lineTo(cx, cy + size);
                ctx.lineTo(cx - size*0.9, cy);
                ctx.closePath(); break;
            case 'hexagon':
                for(var h=0;h<6;h++){
                    var ha = h*Math.PI/3 - Math.PI/2;
                    var hx = cx + Math.cos(ha)*size, hy = cy + Math.sin(ha)*size;
                    if(h===0) ctx.moveTo(hx,hy); else ctx.lineTo(hx,hy);
                }
                ctx.closePath(); break;
            case 'square':
                ctx.rect(cx - size*0.9, cy - size*0.9, size*1.8, size*1.8); break;
            case 'robot':
                ctx.rect(cx - size, cy - size*0.7, size*2, size*1.6); break;
            default: // circle
                ctx.arc(cx, cy, size, 0, Math.PI*2); break;
        }
    };

    // --- 眼睛 ---
    C._enemyEyes = function(ctx, e, cx, cy, sz, t){
        var size = sz * (e.isBoss ? 0.25 : 0.22);
        var yOff = -sz*0.1;
        var xOff = sz*0.35;
        // 追踪 —— 朝路径方向看（朝移动方向）
        var lookX = 0, lookY = 0;
        if(e._dir){ lookX = Math.cos(e._dir)*size*0.3; lookY = Math.sin(e._dir)*size*0.3; }
        // Boss/精英 多眼
        var eyes = e.isBoss ? 3 : 2;
        var eyeCol = e._eyeColor || '#ffffff';
        var pupilCol = e._pupilColor || '#000000';

        if(eyes === 3){
            // 三眼 Boss
            var offsets = [ [-sz*0.55, yOff+sz*0.15], [0, yOff], [sz*0.55, yOff+sz*0.15] ];
            offsets.forEach(function(o){
                ctx.fillStyle = eyeCol;
                ctx.beginPath(); ctx.arc(cx+o[0], cy+o[1], size, 0, Math.PI*2); ctx.fill();
                ctx.fillStyle = pupilCol;
                ctx.beginPath(); ctx.arc(cx+o[0]+lookX*0.5, cy+o[1]+lookY*0.5, size*0.55, 0, Math.PI*2); ctx.fill();
            });
        } else {
            // 普通两眼
            ctx.fillStyle = eyeCol;
            ctx.beginPath(); ctx.arc(cx-xOff, cy+yOff, size, 0, Math.PI*2); ctx.fill();
            ctx.beginPath(); ctx.arc(cx+xOff, cy+yOff, size, 0, Math.PI*2); ctx.fill();
            ctx.fillStyle = pupilCol;
            ctx.beginPath(); ctx.arc(cx-xOff+lookX*0.5, cy+yOff+lookY*0.5, size*0.55, 0, Math.PI*2); ctx.fill();
            ctx.beginPath(); ctx.arc(cx+xOff+lookX*0.5, cy+yOff+lookY*0.5, size*0.55, 0, Math.PI*2); ctx.fill();
        }

        // 机械敌人画红光扫描线
        if(e.trait === '机械'){
            ctx.strokeStyle = '#ff5a2a'; ctx.lineWidth = 1;
            ctx.globalAlpha = 0.6 + Math.sin(t*10)*0.3;
            ctx.beginPath();
            ctx.moveTo(cx-xOff-size, cy+yOff); ctx.lineTo(cx+xOff+size, cy+yOff);
            ctx.stroke();
            ctx.globalAlpha = 1;
        }
    };

    // --- 主题装饰特效 ---
    C._enemyDecor = function(ctx, e, cx, cy, sz, t){
        var size = sz;
        var element = e.element || '';
        var trait = e.trait || '';

        switch(element){
            case '火': case '火2':
                // 冒火星
                ctx.fillStyle = '#ffaa44';
                for(var f=0;f<3;f++){
                    var fx = cx + Math.sin(t*4+f*2)*size*0.6;
                    var fy = cy - size + (t*30+f*20)%size*1.5;
                    ctx.globalAlpha = 0.5 - (t*0.3+f*0.2)%0.5;
                    ctx.beginPath(); ctx.arc(fx, fy, 1.5, 0, Math.PI*2); ctx.fill();
                }
                ctx.globalAlpha = 1;
                // 底部火焰
                ctx.fillStyle = 'rgba(255,90,42,0.35)';
                ctx.beginPath();
                ctx.moveTo(cx - size*0.6, cy + size*0.7);
                ctx.quadraticCurveTo(cx - size*0.3, cy + size*1.5, cx, cy + size*0.8 + Math.sin(t*8)*3);
                ctx.quadraticCurveTo(cx + size*0.3, cy + size*1.5, cx + size*0.6, cy + size*0.7);
                ctx.fill();
                break;
            case '冰':
                // 雪花
                ctx.fillStyle = '#ccefff';
                for(var i=0;i<3;i++){
                    var sx = cx + Math.sin(t*1.5 + i*2.1)*size*1.2;
                    var sy = cy + Math.cos(t*1.2 + i*1.7)*size*1.2;
                    ctx.globalAlpha = 0.6;
                    ctx.beginPath(); ctx.arc(sx, sy, 1.8, 0, Math.PI*2); ctx.fill();
                }
                ctx.globalAlpha = 1;
                break;
            case '雷':
                // 电弧
                ctx.strokeStyle = '#ffd93d'; ctx.lineWidth = 1;
                ctx.globalAlpha = 0.7;
                var sx = cx + size*Math.sin(t*6); var sy = cy - size*1.2;
                ctx.beginPath(); ctx.moveTo(sx, sy);
                for(var j=0;j<4;j++){
                    sx += (Math.random()-0.5)*size*0.5;
                    sy += size*0.4;
                    ctx.lineTo(sx, sy);
                }
                ctx.stroke();
                ctx.globalAlpha = 1;
                break;
            case '毒': case '酸':
                // 气泡
                ctx.fillStyle = '#6bff6b';
                for(var b=0;b<2;b++){
                    var bx = cx + Math.sin(t*2+b*3)*size*0.8;
                    var by = cy - size*0.5 + ((t*40+b*25)%(size*1.5));
                    ctx.globalAlpha = 0.5;
                    ctx.beginPath(); ctx.arc(bx, by, 2, 0, Math.PI*2); ctx.fill();
                }
                ctx.globalAlpha = 1;
                break;
            case '虚空':
            case '暗':
                // 虚空粒子环绕
                ctx.fillStyle = '#c060ff';
                for(var v=0;v<4;v++){
                    var va = t*1.5 + v*Math.PI/2;
                    var vr = size*1.3;
                    ctx.globalAlpha = 0.4 + Math.sin(va*2)*0.3;
                    ctx.beginPath(); ctx.arc(cx + Math.cos(va)*vr, cy + Math.sin(va)*vr, 2, 0, Math.PI*2); ctx.fill();
                }
                ctx.globalAlpha = 1;
                break;
        }

        // trait 专属装饰
        switch(trait){
            case '自爆':
                // 头顶 TNT 警告
                ctx.fillStyle = '#ff3300';
                ctx.beginPath();
                ctx.rect(cx - 6, cy - size*1.6, 12, 8);
                ctx.fill();
                ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 1;
                ctx.strokeRect(cx - 6, cy - size*1.6, 12, 8);
                // 闪爆
                ctx.globalAlpha = 0.5 + Math.sin(t*12)*0.5;
                ctx.fillStyle = '#ff9900';
                ctx.beginPath(); ctx.arc(cx, cy - size*1.2, 2, 0, Math.PI*2); ctx.fill();
                ctx.globalAlpha = 1;
                break;
            case '分裂':
                // 分裂裂纹
                ctx.strokeStyle = 'rgba(255,255,255,0.5)'; ctx.lineWidth = 1;
                ctx.beginPath();
                ctx.moveTo(cx - size*0.5, cy - size*0.3);
                ctx.lineTo(cx - size*0.1, cy);
                ctx.lineTo(cx + size*0.3, cy - size*0.2);
                ctx.stroke();
                break;
            case '召唤':
                // 上方小召唤环
                ctx.strokeStyle = '#aa44ff'; ctx.lineWidth = 1.5;
                ctx.globalAlpha = 0.5 + Math.sin(t*3)*0.3;
                ctx.beginPath(); ctx.arc(cx, cy - size*1.5, size*0.5, 0, Math.PI*2); ctx.stroke();
                ctx.globalAlpha = 1;
                break;
            case '护盾':
                // 环绕护盾六边形
                ctx.strokeStyle = '#4ab8ff'; ctx.lineWidth = 2;
                ctx.globalAlpha = 0.6;
                ctx.beginPath();
                for(var k=0;k<6;k++){
                    var ka = k*Math.PI/3 + t*0.5;
                    var kx = cx + Math.cos(ka)*(size+6);
                    var ky = cy + Math.sin(ka)*(size+6);
                    if(k===0) ctx.moveTo(kx,ky); else ctx.lineTo(kx,ky);
                }
                ctx.stroke();
                ctx.globalAlpha = 1;
                break;
            case '逆行':
                // 反向箭头
                ctx.fillStyle = '#ffd93d';
                ctx.beginPath();
                ctx.moveTo(cx + size*1.2, cy);
                ctx.lineTo(cx + size*0.4, cy - size*0.4);
                ctx.lineTo(cx + size*0.4, cy + size*0.4);
                ctx.closePath(); ctx.fill();
                break;
            case '治疗':
                // 绿十字
                ctx.fillStyle = '#6bff6b';
                var cw = 4;
                ctx.fillRect(cx - cw/2 - 1, cy - size*1.3, cw + 2, cw + 6);
                ctx.fillRect(cx - cw/2 - 4, cy - size*1.3 + cw/2, cw + 8, cw);
                break;
            case '首领':
                // 王冠 (简化)
                ctx.fillStyle = '#ffe27a';
                ctx.beginPath();
                ctx.moveTo(cx - size*0.5, cy - size*0.6);
                ctx.lineTo(cx, cy - size*1.2);
                ctx.lineTo(cx + size*0.5, cy - size*0.6);
                ctx.closePath(); ctx.fill();
                ctx.strokeStyle = '#aa8820'; ctx.stroke();
                break;
        }

        // Boss 专属 —— 地面阴影 + 基座
        if(e.isBoss){
            ctx.fillStyle = 'rgba(0,0,0,0.35)';
            ctx.beginPath(); ctx.ellipse(cx, cy + size*1.2, size*1.2, size*0.4, 0, 0, Math.PI*2); ctx.fill();
        }
    };

    // --- 状态圈 ---
    C._enemyStatus = function(ctx, e, cx, cy, sz, t){
        var size = sz;
        // 冰冻
        if(e.slowed && e.slowTime > 0){
            ctx.strokeStyle = '#4ab8ff'; ctx.lineWidth = 2;
            ctx.globalAlpha = 0.5 + Math.sin(t*8)*0.2;
            ctx.beginPath(); ctx.arc(cx, cy, size+5, 0, Math.PI*2); ctx.stroke();
            ctx.globalAlpha = 1;
            // 冻结霜花
            ctx.fillStyle = '#ccefff';
            for(var s=0;s<4;s++){
                var sa = s*Math.PI/2 + t*0.5;
                ctx.beginPath();
                ctx.arc(cx + Math.cos(sa)*(size+5), cy + Math.sin(sa)*(size+5), 1.5, 0, Math.PI*2); ctx.fill();
            }
        }
        // 燃烧
        if(e.dot && e.dot > 0){
            ctx.fillStyle = '#ff5a2a';
            for(var d=0;d<4;d++){
                var dx = cx + (Math.random()-0.5)*size*1.8;
                var dy = cy + (Math.random()-0.5)*size*1.8 - size*0.3;
                ctx.globalAlpha = 0.6;
                ctx.beginPath(); ctx.arc(dx, dy, 1.8, 0, Math.PI*2); ctx.fill();
            }
            ctx.globalAlpha = 1;
        }
        // 中毒
        if(e.poison && e.poison > 0){
            ctx.fillStyle = '#6bff6b';
            ctx.globalAlpha = 0.5;
            ctx.beginPath(); ctx.arc(cx - size*0.3 + Math.sin(t*6)*2, cy - size*0.3, 1.5, 0, Math.PI*2); ctx.fill();
            ctx.beginPath(); ctx.arc(cx + size*0.3 + Math.cos(t*5)*2, cy - size*0.4, 1.5, 0, Math.PI*2); ctx.fill();
            ctx.globalAlpha = 1;
        }
        // 眩晕 (星星)
        if(e.stunned && e.stunTime > 0){
            ctx.fillStyle = '#ffd93d';
            for(var st=0;st<3;st++){
                var sta = t*3 + st*Math.PI*2/3;
                var stx = cx + Math.cos(sta)*size*0.8;
                var sty = cy - size - 4 + Math.sin(sta*2)*2;
                ctx.save(); ctx.translate(stx, sty); ctx.rotate(sta*2);
                ctx.beginPath();
                for(var sn=0;sn<10;sn++){
                    var r2 = sn%2===0 ? 3 : 1.5;
                    var a2 = sn*Math.PI/5;
                    var p2x = Math.cos(a2)*r2, p2y = Math.sin(a2)*r2;
                    if(sn===0) ctx.moveTo(p2x,p2y); else ctx.lineTo(p2x,p2y);
                }
                ctx.closePath(); ctx.fill(); ctx.restore();
            }
        }
        // 护盾条
        if(e.shield && e.shield > 0){
            ctx.strokeStyle = '#4ab8ff'; ctx.lineWidth = 2;
            ctx.globalAlpha = 0.7;
            ctx.beginPath(); ctx.arc(cx, cy, size+4, 0, Math.PI*2); ctx.stroke();
            ctx.globalAlpha = 1;
        }
    };

    // --- 颜色辅助 ---
    C._lighten = function(hex, amt){
        var n = parseInt(hex.replace('#',''),16);
        var r = Math.min(255, ((n>>16)&0xff) + 255*amt);
        var g = Math.min(255, ((n>>8)&0xff) + 255*amt);
        var b = Math.min(255, (n&0xff) + 255*amt);
        return 'rgb('+Math.round(r)+','+Math.round(g)+','+Math.round(b)+')';
    };
    C._darken = function(hex, amt){
        var n = parseInt(hex.replace('#',''),16);
        var r = Math.max(0, ((n>>16)&0xff) - 255*amt);
        var g = Math.max(0, ((n>>8)&0xff) - 255*amt);
        var b = Math.max(0, (n&0xff) - 255*amt);
        return 'rgb('+Math.round(r)+','+Math.round(g)+','+Math.round(b)+')';
    };
    C.drawBullet = function (ctx, b) {
        if (b.type === 'laser') {
            ctx.strokeStyle = b.color || '#ffd93d'; ctx.lineWidth = b.width || 2; ctx.globalAlpha = 0.85;
            ctx.beginPath(); ctx.moveTo(b.sx, b.sy); ctx.lineTo(b.x, b.y); ctx.stroke(); ctx.globalAlpha = 1;
            return;
        }
        var grad = ctx.createRadialGradient(b.x, b.y, 0, b.x, b.y, b.size + 3);
        grad.addColorStop(0, b.color || '#fff'); grad.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = grad; ctx.beginPath(); ctx.arc(b.x, b.y, b.size+3, 0, Math.PI*2); ctx.fill();
        ctx.fillStyle = b.color || '#fff'; ctx.beginPath(); ctx.arc(b.x, b.y, b.size || 3, 0, Math.PI*2); ctx.fill();
    };
})();

// RENDER
window.Core.render = function (ctx) {
    var C = window.Core, S = window.GameState;
    var shake = C.ScreenShake.getOffset(1/60);
    ctx.save(); ctx.translate(shake.x, shake.y);

    // Get level-specific data
    var path = C.getCurrentPath();
    var pathWidth = C.getCurrentPathWidth();
    var theme = C.getCurrentTheme() || {};

    // 1. Background gradient + grid — use theme colors if available
    var bgTop = theme.bgTop || '#1a1a2e';
    var bgBot = theme.bgBot || '#16213e';
    var gridColor = theme.grid || 'rgba(255,255,255,0.04)';
    var bg = ctx.createLinearGradient(0, 0, 0, C.H);
    bg.addColorStop(0, bgTop); bg.addColorStop(1, bgBot);
    ctx.fillStyle = bg; ctx.fillRect(0, 0, C.W, C.H);
    ctx.strokeStyle = gridColor; ctx.lineWidth = 1;
    for (var gx = 0; gx <= C.W; gx += C.TS) { ctx.beginPath(); ctx.moveTo(gx,0); ctx.lineTo(gx,C.H); ctx.stroke(); }
    for (var gy = 0; gy <= C.H; gy += C.TS) { ctx.beginPath(); ctx.moveTo(0,gy); ctx.lineTo(C.W,gy); ctx.stroke(); }

    // 1.5 Draw decorations from level.decorations (circles/polygons)
    var level = C.currentLevel;
    if (level && level.decorations && level.decorations.length) {
        for (var di = 0; di < level.decorations.length; di++) {
            var dec = level.decorations[di];
            ctx.save();
            ctx.fillStyle = dec.color || '#ffffff';
            ctx.globalAlpha = dec.alpha !== undefined ? dec.alpha : 0.3;
            if (dec.type === 'circle') {
                ctx.beginPath();
                ctx.arc(dec.x, dec.y, dec.r || 8, 0, Math.PI * 2);
                ctx.fill();
            } else if (dec.type === 'polygon' && dec.points && dec.points.length) {
                ctx.beginPath();
                ctx.moveTo(dec.points[0].x, dec.points[0].y);
                for (var pi = 1; pi < dec.points.length; pi++) ctx.lineTo(dec.points[pi].x, dec.points[pi].y);
                ctx.closePath();
                ctx.fill();
            } else if (dec.type === 'rect') {
                ctx.fillRect(dec.x, dec.y, dec.w || 20, dec.h || 20);
            } else if (dec.type === 'star') {
                // Simple 5-pointed star
                var cx = dec.x, cy = dec.y, outerR = dec.r || 10, innerR = outerR * 0.45;
                ctx.beginPath();
                for (var si = 0; si < 10; si++) {
                    var angle = (si * Math.PI / 5) - Math.PI / 2;
                    var r2 = (si % 2 === 0) ? outerR : innerR;
                    var sx = cx + Math.cos(angle) * r2, sy = cy + Math.sin(angle) * r2;
                    if (si === 0) ctx.moveTo(sx, sy); else ctx.lineTo(sx, sy);
                }
                ctx.closePath();
                ctx.fill();
            } else if (dec.type === 'tree' || dec.type === 'bush') {
                // Simple blob
                ctx.beginPath();
                ctx.arc(dec.x, dec.y, dec.r || 12, 0, Math.PI * 2);
                ctx.fill();
                ctx.globalAlpha *= 0.6;
                ctx.beginPath();
                ctx.arc(dec.x + 3, dec.y - 3, (dec.r || 12) * 0.7, 0, Math.PI * 2);
                ctx.fill();
            }
            ctx.restore();
        }
    }

    // 2. Path (wide stroke + inner + dashed center) — use theme colors
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    var pathOuter = theme.pathOuter || '#2a2a3a';
    var pathInner = theme.pathInner || '#4a4a5a';
    var pathCenter = theme.pathCenter || '#ffd93d';

    ctx.strokeStyle = pathOuter; ctx.lineWidth = pathWidth * 1.8;
    ctx.beginPath(); ctx.moveTo(path[0].x, path[0].y);
    for (var i = 1; i < path.length; i++) ctx.lineTo(path[i].x, path[i].y); ctx.stroke();
    ctx.strokeStyle = pathInner; ctx.lineWidth = pathWidth * 1.2;
    ctx.beginPath(); ctx.moveTo(path[0].x, path[0].y);
    for (var j = 1; j < path.length; j++) ctx.lineTo(path[j].x, path[j].y); ctx.stroke();
    ctx.strokeStyle = pathCenter; ctx.lineWidth = 2; ctx.setLineDash([12, 10]);
    ctx.beginPath(); ctx.moveTo(path[0].x, path[0].y);
    for (var k = 1; k < path.length; k++) ctx.lineTo(path[k].x, path[k].y); ctx.stroke();
    ctx.setLineDash([]);

    // 3. Entry/Exit markers at path[0] and path[last]
    var entryColor = theme.entry || '#44ff88';
    var exitColor = theme.exit || '#ff4466';
    ctx.fillStyle = entryColor;
    ctx.beginPath(); ctx.arc(path[0].x, path[0].y, 14, 0, Math.PI*2); ctx.fill();
    ctx.font = 'bold 10px sans-serif'; ctx.textAlign = 'center';
    ctx.fillStyle = '#fff'; ctx.fillText('入', path[0].x, path[0].y + 4);
    var exit = path[path.length-1];
    ctx.fillStyle = exitColor;
    ctx.beginPath(); ctx.arc(exit.x, exit.y, 14, 0, Math.PI*2); ctx.fill();
    ctx.fillStyle = '#fff'; ctx.fillText('出', exit.x, exit.y + 4);

    // 4. Placement preview
    if (S.selectedTowerType !== null && !S.selectedTower && S.hoverPlaceX !== undefined) {
        var pd = window.TOWER_DATA[S.selectedTowerType] || {};
        var canPlace = C.canPlaceAt(S.hoverPlaceX, S.hoverPlaceY);
        var px = S.hoverPlaceX*C.TS + C.TS/2, py = S.hoverPlaceY*C.TS + C.TS/2;
        ctx.fillStyle = canPlace ? 'rgba(68,255,136,0.25)' : 'rgba(255,68,102,0.25)';
        ctx.fillRect(S.hoverPlaceX*C.TS, S.hoverPlaceY*C.TS, C.TS, C.TS);
        ctx.strokeStyle = canPlace ? '#44ff88' : '#ff4466'; ctx.lineWidth = 2; ctx.setLineDash([5, 4]);
        ctx.beginPath(); ctx.arc(px, py, pd.range || 100, 0, Math.PI*2); ctx.stroke();
        ctx.setLineDash([]);
    }
    // 5. Towers
    for (var ti = 0; ti < S.towers.length; ti++) C.drawTower(ctx, S.towers[ti]);
    // 6. Enemies
    for (var ei = 0; ei < S.enemies.length; ei++) C.drawEnemy(ctx, S.enemies[ei]);
    // 7. Bullets
    for (var bi = 0; bi < S.bullets.length; bi++) C.drawBullet(ctx, S.bullets[bi]);
    // 8. Particles
    C.drawParticles(ctx);
    // 9. Floats
    C.drawFloats(ctx);
    ctx.restore();
};

// MAIN LOOP
(function () {
    var C = window.Core, S = window.GameState, _running = false, _last = 0, _cb = null;
    C.startLoop = function (callback) {
        _cb = callback; _running = true; _last = performance.now();
        function frame(now) {
            if (!_running) return;
            var dt = Math.min(0.05, (now - _last) / 1000);
            _last = now;
            if (!S.paused && _cb) _cb(dt * S.speed);
            if (window._ctx) C.render(window._ctx);
            requestAnimationFrame(frame);
        }
        requestAnimationFrame(frame);
    };
    C.stopLoop = function () { _running = false; };
})();

// INIT — build placeable map with default path
window.Core.buildPlaceableMap();
console.log('Core engine ready with dynamic level support');
