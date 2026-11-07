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
    C.drawTower = function (ctx, tw) {
        var data = window.TOWER_DATA[tw.type] || {};
        var col = data.color || '#888899';
        var glow = data.glow || '#aaa';
        var proto = data.proto || 'archer';
        var rarity = data.rarity || '普通';
        var lvl = tw.level || 1;
        var time = Date.now() * 0.001;
        var cx = tw.x, cy = tw.y;

        // === 稀有度脉动光环 ===
        var rareGlow = { '普通':'#9aa4bd','稀有':'#6bff6b','史诗':'#c060ff','传奇':'#ffd93d','神话':'#ff5a2a' };
        var rg = rareGlow[rarity] || '#9aa4bd';
        var pulse = 0.18 + Math.sin(time*2 + (tw._spawnOffset||0))*0.1;
        ctx.globalAlpha = pulse;
        ctx.fillStyle = rg;
        ctx.beginPath(); ctx.arc(cx, cy, 20 + Math.sin(time*3)*2, 0, Math.PI*2); ctx.fill();
        ctx.globalAlpha = 1;

        // === 锻造塔额外光环 ===
        var useProto = proto;
        if(tw.isForged){
            ctx.strokeStyle = '#ffd93d'; ctx.lineWidth = 1;
            ctx.globalAlpha = 0.5 + Math.sin(time*3)*0.3;
            ctx.beginPath(); ctx.arc(cx, cy, 22 + Math.sin(time*2), 0, Math.PI*2); ctx.stroke();
            ctx.globalAlpha = 1;
            useProto = 'forge'; // 锻造塔用特殊模板
        }

        // === 16x16 像素炮塔身体 ===
        ctx.imageSmoothingEnabled = false;
        C.drawPixelTower(ctx, cx, cy, useProto, col, glow, 2.2);
        ctx.imageSmoothingEnabled = true;

        // === 等级 ===
        if(lvl > 1){
            ctx.font = 'bold 10px monospace';
            ctx.textAlign = 'center';
            ctx.fontVariantNumeric = 'tabular-nums';
            var starColor = rarity === '神话' || rarity === '传奇' ? '#ffe27a' : (rarity === '史诗' ? '#c060ff' : '#ffffff');
            ctx.fillStyle = starColor;
            ctx.fillText('Lv.' + lvl, cx, cy - 22);
        }

        // === forgeName 悬浮 ===
        if(tw.forgeName){
            ctx.font = '10px monospace';
            ctx.fillStyle = '#ffe27a'; ctx.textAlign = 'center';
            ctx.fillText(tw.forgeName, cx, cy - 30);
        }

        // === 选中圈 + 范围 ===
        if (window.GameState && window.GameState.selectedTower === tw) {
            var stats = C.computeTowerStats(tw);
            ctx.strokeStyle = 'rgba(255, 226, 122, 0.5)'; ctx.lineWidth = 1; ctx.setLineDash([6, 4]);
            ctx.beginPath(); ctx.arc(cx, cy, stats.range, 0, Math.PI * 2); ctx.stroke(); ctx.setLineDash([]);
            ctx.strokeStyle = '#ffe27a'; ctx.lineWidth = 2;
            ctx.strokeRect(cx-18, cy-18, 36, 36);
        }
    };

    // _towerDecor 现在空壳（像素模板自带视觉，旧装饰逻辑不再需要）
    C._towerDecor = function(){};

    // ============================================================
    // drawChip — 精致芯片图标绘制（八边形 + 稀有度脉动光环 + 中心图标 + 底部数值）
    // ============================================================
    // drawChip — 像素版芯片图标（16x16 模板 + 稀有度光环 + 数值）
    // ============================================================
    C.drawChip = function(ctx, chip, cx, cy, size){
        size = size || 40;
        var t = Date.now() * 0.001;
        var rarityMap = {
            '普通': '#9aa4bd', 'N': '#9aa4bd',
            '稀有': '#6bff6b', 'R': '#6bff6b',
            '史诗': '#c060ff', 'SR': '#c060ff',
            '传奇': '#ffd93d', 'SSR': '#ffd93d', 'UR': '#ffd93d',
            '神话': '#ff5a2a', 'MY': '#ff5a2a'
        };
        var rarity = chip.rarityName || chip.rarity || '普通';
        var glowColor = rarityMap[rarity] || chip.color || '#9aa4bd';

        // 像素缩放：根据传入 size 自适应
        var scale = Math.max(1.5, Math.floor(size / 18));
        var pixSize = 16 * scale;
        var pixCx = cx - (size - pixSize) / 2; // 居中偏移
        var pixCy = cy - (size - pixSize) / 2;

        // === 稀有度脉动光环 ===
        var pulse = 0.18 + Math.sin(t * 2.5) * 0.1;
        ctx.globalAlpha = pulse;
        ctx.fillStyle = glowColor;
        ctx.beginPath(); ctx.arc(cx, cy, size*0.6, 0, Math.PI*2); ctx.fill();
        ctx.globalAlpha = 1;

        // === 16x16 像素芯片主体 ===
        ctx.imageSmoothingEnabled = false;
        C.drawPixelChip(ctx, pixCx + pixSize/2, pixCy + pixSize/2, glowColor, rarity, scale);
        ctx.imageSmoothingEnabled = true;

        // === bottom value ===
        var valText = (chip.value !== undefined && chip.value !== null)
            ? chip.value + (chip.unit || '')
            : '';
        if(valText){
            ctx.font = 'bold 10px monospace';
            ctx.textAlign = 'center';
            ctx.fillStyle = glowColor;
            ctx.fillText(valText, cx, cy + size*0.42);
        }

        // === nestedSlots 小树 ===
        if(chip.nestedSlots && chip.nestedSlots > 0){
            ctx.font = '9px monospace';
            ctx.fillStyle = '#6bff6b';
            ctx.textAlign = 'left';
            ctx.textBaseline = 'top';
            ctx.fillText('🌲×' + chip.nestedSlots, cx - size/2 + 2, cy - size/2 + 2);
        }
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
    // 像素画敌人 — 16x16 科幻像素模板
    // ============================================================

    // ---- 像素模板 (16行 × 16字符, ' '=透明) ----
    // 字符映射: .=主色 o=高光 #=暗 e=白眼 E=红瞳 w=金属 W=能量 x=装甲 g=发光核心
    var PX = {
      humanoid: [ // 普通杂兵
        '................',
        '....hhhhhh......',
        '...hheeee.h.....',
        '...hheEee.h.....',
        '....hhhhhh......',
        '....oooooo......',
        '...o######o.....',
        '...ol####ro.....',
        '...olwwWWro.....',
        '...ol###wwro....',
        '...o######o.....',
        '....oooooo......',
        '....ff...ff.....',
        '....ff...ff.....',
        '................',
        '................'
      ],
      winged: [ // 飞行无人机
        '................',
        '....oooooo......',
        '...o######o.....',
        '...o#eE#E#o.....',
        '...o######o.....',
        '..ooooooWooooo..',
        '.oo#########ooo.',
        'o############o..',
        '.oo#########ooo.',
        '..ooooooWooooo..',
        '...o######o.....',
        '...o######o.....',
        '....oooooo......',
        '................',
        '................',
        '................'
      ],
      mecha: [ // 机械/重甲
        '................',
        '....xxxxx.......',
        '...xeeeeox......',
        '...xEExxxox.....',
        '....xxxxx.......',
        '...xxxxxxxx.....',
        '..x#########x...',
        '..x#xg###gx#x...',
        '..x#########x...',
        '..xx##WWW##xx...',
        '...xxxxxxxx.....',
        '....xxxxx.......',
        '...xx...xx......',
        '...xx...xx......',
        '................',
        '................'
      ],
      splitter: [ // 分裂 (圆球形)
        '................',
        '.....oooo.......',
        '...o######o.....',
        '..o#e####e#o....',
        '..o##g##g##o....',
        '..o#######g#o...',
        '..o#g######o....',
        '..o#######e#o...',
        '...o######o.....',
        '....oooooo......',
        '................',
        '................',
        '................',
        '................',
        '................',
        '................'
      ],
      bomber: [ // 自爆
        '................',
        '.....oooo.......',
        '....oTTTTTo.....',
        '....oTNT#o......',
        '.....oooo.......',
        '...eE#####E.....',
        '..o#########o...',
        '..o#WWWWWg#o....',
        '..o#########o...',
        '...o######o.....',
        '....oooooo......',
        '....ff...ff.....',
        '....ff...ff.....',
        '................',
        '................',
        '................'
      ],
      elite: [ // 精英 (人形+冠+肩甲)
        '................',
        '....gggggg......',
        '...gghhhhgg.....',
        '....hhhhhh......',
        '...hheeee.h.....',
        '...hheEee.h.....',
        '....hhhhhh......',
        '...xoooooox.....',
        '..x##wwWW##x....',
        '..x##wwWW##x....',
        '...xoooooox.....',
        '....oooooo......',
        '....ff...ff.....',
        '....ff...ff.....',
        '................',
        '................'
      ],
      boss: [ // Boss (大+冠+核心+武器)
        '...g...g...g....',
        '..ggggggggg.....',
        '.ggghhhhhhgg....',
        '...hhhhhhhh.....',
        '..hheeeeeehh....',
        '..hheEeeEehh....',
        '...hhhhhhhh.....',
        '..xooooooooox....',
        '.x##ww###ww##x...',
        '.x#WWggggWW##x...',
        '.x##ww###ww##x...',
        '..xooooooooox....',
        '...ooooooooo.....',
        '....ff..ff......',
        '....ff..ff......',
        '................'
      ]
    };

    // ---- 字符→颜色映射 ----
    var PX_COLOR = {
      '.': function(c){ return c; },                    // 主色
      'o': function(c){ return C._lighten(c, 0.35); },  // 高光
      '#': function(c){ return C._darken(c, 0.35); },   // 暗部
      'e': function(c){ return '#ffffff'; },           // 白眼
      'E': function(c){ return '#ff2a40'; },            // 红瞳
      'w': function(c){ return '#8899aa'; },            // 武器金属
      'W': function(c){ return '#ffdd44'; },            // 武器发光/能量
      'x': function(c){ return C._darken(c, 0.15); },   // 装甲
      'g': function(c){ return '#00ffe0'; },            // 发光核心
      'h': function(c){ return C._lighten(c, 0.15); }, // 头盔/头
      'f': function(c){ return C._darken(c, 0.25); },   // 腿
      'T': function(c){ return '#ff5a2a'; }             // TNT
    };

    // 根据敌人选模板
    function _pickEnemyTemplate(e){
      if(e.isBoss) return PX.boss;
      if(e.isElite) return PX.elite;
      var t = (e.trait||'') + ' ' + (e.shape||'');
      if(e.flying || e.trait==='飞行') return PX.winged;
      if(e.trait==='机械') return PX.mecha;
      if(e.trait==='重甲' || e.trait==='护甲') return PX.mecha;
      if(e.trait==='自爆') return PX.bomber;
      if(e.trait==='分裂') return PX.splitter;
      return PX.humanoid;
    }

    // 绘制 16x16 像素模板（缩放 scale 倍）
    C.drawPixelSprite = function(ctx, cx, cy, template, mainColor, scale, flipX){
      var pad = scale; // 周围留 1px 阴影空间
      var w = 16 * scale;
      var h = 16 * scale;
      var x0 = cx - w/2;
      var y0 = cy - h/2;

      // 整体阴影（像素化）
      ctx.fillStyle = 'rgba(0,0,0,0.35)';
      for(var sx=0; sx<4; sx++){
        ctx.fillRect(x0 + 2*scale + sx*scale, y0 + h - scale, 4*scale - sx*scale, scale);
      }

      for(var r=0; r<16; r++){
        var row = template[r];
        for(var c=0; c<16; c++){
          var ch = row[c] || ' ';
          if(ch === ' ') continue;
          var colFn = PX_COLOR[ch];
          if(!colFn) continue;
          var px = x0 + (flipX ? (15 - c) : c) * scale;
          var py = y0 + r * scale;
          ctx.fillStyle = colFn(mainColor);
          ctx.fillRect(px, py, scale, scale);
        }
      }
    };

    // ============================================================
    // 像素炮塔 & 芯片 — 16x16 模板
    // ============================================================

    var PX_TOWER = {
      archer: [ // 弓手塔: 长管 + 箭
        '................',
        '................',
        '.....ggggg......',
        '....ggggggg.....',
        '....xxxxxwwww..',
        '....xxxxxxwwww.',
        '....xxxxxwwwwww',
        '....gggggWWWWW.',
        '....ggggggggg...',
        '...dd####dbbbd..',
        '..dd####dddbbbd.',
        '..d###########d.',
        '..d###########d.',
        '...dd####dddbd..',
        '....dddddddddd..',
        '................'
      ],
      cannon: [ // 火炮: 粗管 + 炮口
        '................',
        '................',
        '.......xxx......',
        '......xxxxx.....',
        '.....xxxxxWW...',
        '....xxxxxWWWW..',
        '....xxxxxWWWWW.',
        '....xxxxxWWWWW.',
        '....ggggggg.....',
        '...dd####dbbbd..',
        '..dd####dddbbbd.',
        '..d###########d.',
        '..d###########d.',
        '...dd####dddbd..',
        '....dddddddddd..',
        '................'
      ],
      laser: [ // 激光塔: 细管 + 能量水晶
        '................',
        '.......ggg......',
        '......ggggg.....',
        '.......ggg......',
        '......xxxgggx...',
        '.....xxxxxxx....',
        '......xxxgggx...',
        '.....xxxxxxx....',
        '.....xxgggxxx....',
        '...dd####dbbbd..',
        '..dd####dddbbbd.',
        '..d###########d.',
        '..d###########d.',
        '...dd####dddbd..',
        '....dddddddddd..',
        '................'
      ],
      storm: [ // 风暴塔: 双管 + 旋转
        '................',
        '................',
        '....gg...gg.....',
        '....xxx.xxx.....',
        '....xxxggxxx....',
        '....xxxggxxx....',
        '.....xxgggxx....',
        '......ggggg.....',
        '.....gggggg.....',
        '...dd####dbbbd..',
        '..dd####dddbbbd.',
        '..d###########d.',
        '..d###########d.',
        '...dd####dddbd..',
        '....dddddddddd..',
        '................'
      ],
      forge: [ // 锻造/合成塔: 额外光环
        '................',
        '....o..g..o.....',
        '....ooooooo.....',
        '....ogggggg.....',
        '....ggggggg.....',
        '....gggWWggg....',
        '....ggggggg.....',
        '....ggggggg.....',
        '....ggggggg.....',
        '...dd####dbbbd..',
        '..dd####dddbbbd.',
        '..d###########d.',
        '..d###########d.',
        '...dd####dddbd..',
        '....dddddddddd..',
        '................'
      ]
    };

    var PX_TOWER_COLOR = {
      'g': function(c){ return C._lighten(c, 0.25); },   // 炮塔中色
      'G': function(c){ return c; },                     // 炮塔主色
      'x': function(c){ return C._darken(c, 0.15); },  // 装甲
      'd': function(c){ return '#1a1e30'; },            // 底座暗
      'b': function(c){ return '#2a3050'; },            // 底座亮
      'w': function(c){ return '#aaaaaa'; },            // 武器金属
      'W': function(c){ return '#ffdd44'; },            // 武器发光
      '.': function(c){ return null; }                  // 透明
    };

    var PX_CHIP = {
      common: [   // 普通: 简单方形
        '................',
        '................',
        '....########....',
        '...#........#...',
        '..#..........#..',
        '..#..oooooooo..#',
        '..#..ooxxxooo..#',
        '..#..oxgggxoo..#',
        '..#..ooxxxooo..#',
        '..#..oooooooo..#',
        '..#..........#..',
        '...#........#...',
        '....########....',
        '................',
        '................',
        '................'
      ],
      rare: [   // 稀有: 六边形
        '................',
        '.....gggggg.....',
        '....gggggggg....',
        '...gggggggggg...',
        '..gggggggggggg..',
        '..ggooooooooogg.',
        '..ggoxxxxggoggg.',
        '..ggoxggxggoggg.',
        '..ggoxxxxggoggg.',
        '..ggooooooooogg.',
        '..gggggggggggg..',
        '...gggggggggg...',
        '....gggggggg....',
        '.....gggggg.....',
        '................',
        '................'
      ],
      epic: [   // 史诗: 八边形 + 光环
        '................',
        '....#..####..#..',
        '...####....####.',
        '..###........###',
        '..#............#',
        '..#...oooooo...#',
        '..#...oxxxxxx..#',
        '..#...oxggggx..#',
        '..#...oxxxxxx..#',
        '..#...oooooo...#',
        '..#............#',
        '..###........###',
        '...####....####.',
        '....#..####..#..',
        '................',
        '................'
      ],
      legendary: [   // 传奇: 多光环 + 星
        '................',
        '....#........#..',
        '...####....####.',
        '..###..#########',
        '..#..##########.',
        '..#..##########.',
        '..#..##ooooo##..',
        '..#..##oxxxx##..',
        '..#..##oxggx##..',
        '..#..##oxxxx##..',
        '..#..##########.',
        '..#..##########.',
        '..###..#########',
        '...####....####.',
        '....#........#..',
        '................'
      ],
      mythic: [   // 神话: 十字 + 皇冠
        '.......ggg......',
        '......ggggg.....',
        '...gggggggggggg.',
        '...gggggggggggg.',
        'gggggggggggggggg',
        'gggggg########gg',
        'gggg#oooooooo#gg',
        'ggg#oxxxxxxx#ggg',
        'ggg#oxgggggx#ggg',
        'ggg#oxxxxxxx#ggg',
        'gggg#oooooooo#gg',
        'gggggg########gg',
        'gggggggggggggggg',
        '...gggggggggggg.',
        '...gggggggggggg.',
        '................'
      ]
    };

    // 绘制 16x16 像素模板（炮塔专用，按 proto 选模板）
    function _pickTowerTemplate(proto){
      return PX_TOWER[proto] || PX_TOWER.archer;
    }
    function _pickChipTemplate(rarity){
      return PX_CHIP[rarity] || PX_CHIP.common;
    }

    C.drawPixelTower = function(ctx, cx, cy, proto, mainColor, glow, scale){
      scale = scale || 2;
      var tmpl = _pickTowerTemplate(proto);
      var w = 16 * scale, h = 16 * scale;
      var x0 = cx - w/2, y0 = cy - h/2;
      // 像素化阴影
      ctx.fillStyle = 'rgba(0,0,0,0.4)';
      for(var sx=0; sx<4; sx++){
        ctx.fillRect(x0 + 2*scale + sx*scale, y0 + h - scale, 4*scale - sx*scale, scale);
      }
      for(var r=0; r<16; r++){
        var row = tmpl[r];
        for(var c=0; c<16; c++){
          var ch = row[c] || '.';
          var colFn = PX_TOWER_COLOR[ch];
          if(!colFn) continue;
          var col = colFn(mainColor);
          if(!col) continue;
          ctx.fillStyle = col;
          ctx.fillRect(x0 + c*scale, y0 + r*scale, scale, scale);
        }
      }
    };

    C.drawPixelChip = function(ctx, cx, cy, chipMainColor, rarity, scale){
      scale = scale || 2;
      var tmpl = _pickChipTemplate(rarity);
      var w = 16 * scale, h = 16 * scale;
      var x0 = cx - w/2, y0 = cy - h/2;
      // 稀有度光环
      var glowR = rarity === '神话' ? 18 : rarity === '传奇' ? 15 : rarity === '史诗' ? 12 : 8;
      ctx.globalAlpha = 0.15;
      ctx.fillStyle = chipMainColor;
      ctx.beginPath(); ctx.arc(cx, cy, glowR + scale, 0, Math.PI*2); ctx.fill();
      ctx.globalAlpha = 1;

      for(var r=0; r<16; r++){
        var row = tmpl[r];
        for(var c=0; c<16; c++){
          var ch = row[c] || '.';
          var col = null;
          switch(ch){
            case '#': col = chipMainColor; break;
            case 'G': col = C._darken(chipMainColor, 0.2); break;
            case 'g': col = C._lighten(chipMainColor, 0.25); break;
            case 'o': col = C._lighten(chipMainColor, 0.5); break;
            case 'x': col = C._darken(chipMainColor, 0.1); break;
            default: col = null;
          }
          if(!col) continue;
          ctx.fillStyle = col;
          ctx.fillRect(x0 + c*scale, y0 + r*scale, scale, scale);
        }
      }
    };

    // ============================================================
    // 像素版 drawEnemy — 16x16 模板 + 光环 + 状态圈 + HP bar
    // ============================================================
    C.drawEnemy = function (ctx, e) {
        var t = Date.now() * 0.001;
        var size = e.size || 14;
        var cx = e.x, cy = e.y;
        var col = e.color || '#aabbcc';

        // 像素缩放：根据敌人大小自适应
        var scale = 2; // 16*2=32px 默认
        if(e.isBoss) scale = 3;    // 16*3=48px
        else if(e.isElite) scale = 2.5; // 40px
        else if(size < 10) scale = 1.5;  // 24px
        var flipX = e._flip ? true : false;

        // === Boss/精英 光环 ===
        if (e.isBoss) {
            ctx.globalAlpha = 0.25 + Math.sin(t*4)*0.08;
            ctx.fillStyle = col;
            ctx.beginPath(); ctx.arc(cx, cy, 28 + Math.sin(t*2)*3, 0, Math.PI*2); ctx.fill();
            ctx.globalAlpha = 0.15;
            ctx.fillStyle = '#ffd93d';
            ctx.beginPath(); ctx.arc(cx, cy, 38 + Math.sin(t*3)*4, 0, Math.PI*2); ctx.fill();
            ctx.globalAlpha = 1;
        } else if (e.isElite) {
            ctx.globalAlpha = 0.22;
            ctx.fillStyle = col;
            ctx.beginPath(); ctx.arc(cx, cy, 22 + Math.sin(t*3)*2, 0, Math.PI*2); ctx.fill();
            ctx.globalAlpha = 1;
        }

        // === 状态圈（像素版简化：几个像素方块） ===
        var pixW = 16 * scale;
        var pixH = 16 * scale;
        var px0 = cx - pixW/2;
        var py0 = cy - pixH/2;

        if(e.stunned){
            // 眩晕：头顶三颗旋转星星（像素化）
            for(var si=0; si<3; si++){
                var ang = t*2 + si*Math.PI*2/3;
                var sx = cx + Math.cos(ang)*10;
                var sy = cy - pixH/2 - 6 + Math.sin(ang)*4;
                ctx.fillStyle = '#ffdd44';
                ctx.fillRect(sx-2, sy-2, 4, 4);
            }
        }
        if(e.suppressed){
            ctx.strokeStyle = '#aa44ff'; ctx.lineWidth = 1.5;
            ctx.globalAlpha = 0.5 + Math.sin(t*8)*0.3;
            ctx.beginPath(); ctx.arc(cx, cy, pixW*0.7, 0, Math.PI*2); ctx.stroke();
            ctx.globalAlpha = 1;
        }
        if(e.freezeDur > 0){
            // 冰冻：周围飘雪花（像素点）
            ctx.fillStyle = '#88ddff';
            for(var fi=0; fi<4; fi++){
                var fx = px0 + Math.sin(t*3+fi)*pixW*0.4 + pixW/2;
                var fy = py0 + Math.cos(t*2+fi*1.5)*pixH*0.4 + pixH/2;
                ctx.fillRect(fx-1, fy-1, 2, 2);
            }
        }
        if(e.dotTimer > 0){
            // 燃烧/中毒：泡泡
            var dc = (e.trait==='亡灵') ? '#44ff88' : '#ff8844';
            ctx.fillStyle = dc;
            for(var di=0; di<3; di++){
                var bx = cx + Math.sin(t*5+di)*8;
                var by = cy - pixH/2 - 2 - ((t*20 + di*8)%10);
                ctx.globalAlpha = 0.5;
                ctx.fillRect(bx-1, by-1, 2, 2);
            }
            ctx.globalAlpha = 1;
        }
        if(e.shield > 0){
            ctx.strokeStyle = '#88ccff'; ctx.lineWidth = 2;
            ctx.globalAlpha = 0.5 + Math.sin(t*6)*0.2;
            ctx.beginPath(); ctx.arc(cx, cy, pixW*0.75, 0, Math.PI*2); ctx.stroke();
            ctx.globalAlpha = 1;
        }

        // === 16x16 像素身体 ===
        var bob = Math.sin(t*6 + (e._spawnOffset||0)) * 1.5;
        var tmpl = _pickEnemyTemplate(e);
        ctx.imageSmoothingEnabled = false; // 硬边像素
        C.drawPixelSprite(ctx, cx, cy + bob, tmpl, col, scale, flipX);
        ctx.imageSmoothingEnabled = true;

        // === HP bar ===
        var hpRatio = e.hp / e.maxHp;
        var barW = Math.max(24, pixW * 0.9);
        var barY = cy - pixH/2 - 8;
        ctx.fillStyle = 'rgba(0,0,0,0.8)';
        ctx.fillRect(cx - barW/2 - 1, barY - 1, barW + 2, 5);
        ctx.fillStyle = '#2a2a30';
        ctx.fillRect(cx - barW/2, barY, barW, 3);
        var hpColor = hpRatio > 0.5 ? '#6bff6b' : (hpRatio > 0.25 ? '#ffd93d' : '#ff5a2a');
        ctx.fillStyle = hpColor;
        ctx.fillRect(cx - barW/2, barY, barW * hpRatio, 3);
        if(e.isBoss || e.isElite){
            ctx.globalAlpha = 0.5 + Math.sin(t*6)*0.3;
            ctx.fillStyle = hpColor;
            ctx.fillRect(cx - barW/2, barY - 1, barW * hpRatio, 1);
            ctx.globalAlpha = 1;
        }
    };

    // --- 老矢量函数保留空壳（避免旧引用报错）---
    C._enemyBody = function(){};
    C._enemyShapePath = function(){};
    C._enemyEyes = function(){};
    C._enemyDecor = function(){};
    C._enemyStatus = function(){};

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
