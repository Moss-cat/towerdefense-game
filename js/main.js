/* ================================================================
   main.js — 主协调器 · 双屏幕状态机
   MENU (主菜单) ↔ BATTLE (战斗画面)
   依赖: save.js, core.js, game.js, shop.js, chip_nesting.js
   所有子模块 API 保持不变，main.js 只做编排
   ================================================================ */
(function () {
  'use strict';

  const GS = window.GameState;
  const Core = window.Core;
  const Shop = window.Shop;
  const ChipSystem = window.ChipSystem;

  /* =========================================================
   * 0. 扩展 GameState
   * ========================================================= */
  GS.screen = 'menu';
  GS.availableLoadout = [];     // 从 saveData.loadout 构建的战斗可用列表
  GS.currentLevel = 0;
  GS.totalWavesInLevel = 0;
  GS.waveIndex = 0;
  GS._battleLastTime = 0;
  GS._battleActive = false;

  /* =========================================================
   * 1. DOM & Canvas
   * ========================================================= */
  const $ = (id) => document.getElementById(id);
  const canvas = $('gameCanvas');
  const ctx = canvas ? canvas.getContext('2d') : null;
  window._ctx = ctx;

  /* =========================================================
   * 2. 菜单 Tab 切换
   * ========================================================= */
  let currentMenuTab = 'shop';

  function bindMenuTabs() {
    document.querySelectorAll('.tab-btn').forEach(btn => {
      btn.addEventListener('click', () => switchMenuTab(btn.dataset.tab));
    });
  }

  function switchMenuTab(tab) {
    currentMenuTab = tab;
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.toggle('active', b.dataset.tab === tab));
    const shopContainer = $('shopContainer');
    const centerPanel = document.querySelector('.center-panel');
    const levelPanel = $('levelPanel');
    const chSec = $('chipInventorySection');
    const loSec = $('loadoutSection');
    const tdSec = $('towerDetailSection');
    const stSec = document.querySelector('.stats-section');

    if (levelPanel) levelPanel.style.display = (tab === 'level') ? '' : 'none';
    if (shopContainer) shopContainer.style.display = (tab === 'shop') ? '' : 'none';
    if (centerPanel) centerPanel.style.display = (tab === 'level') ? 'none' : '';

    if (tab === 'shop') {
      if (tdSec) tdSec.style.display = '';
      if (chSec) chSec.style.display = 'none';
      if (loSec) loSec.style.display = 'none';
      if (stSec) stSec.style.display = '';
    } else if (tab === 'chip') {
      if (tdSec) tdSec.style.display = 'none';
      if (chSec) chSec.style.display = '';
      if (loSec) loSec.style.display = '';
      if (stSec) stSec.style.display = '';
      ChipSystem.initMenu();
    } else if (tab === 'achievement') {
      if (tdSec) tdSec.style.display = 'none';
      if (chSec) chSec.style.display = 'none';
      if (loSec) loSec.style.display = 'none';
      if (stSec) { stSec.style.display = ''; renderAchievements(stSec); }
    } else if (tab === 'level') {
      initLevelSelector();
    }
    if (window.AudioFX) AudioFX.play('click');
  }

  /* =========================================================
   * 3. 选关 —— 右栏内置网格
   * ========================================================= */
  let levelPage = 0;
  const LEVEL_PAGE_SIZE = 25;

  function initLevelSelector() {
    renderLevelGrid();
    if (!$('prevLevelPageBtn').dataset.bound) {
      $('prevLevelPageBtn').addEventListener('click', () => { levelPage = Math.max(0, levelPage - 1); renderLevelGrid(); });
      $('nextLevelPageBtn').addEventListener('click', () => { levelPage = Math.min(Math.ceil((window.LEVEL_COUNT || 500) / LEVEL_PAGE_SIZE) - 1, levelPage + 1); renderLevelGrid(); });
      $('btnStartLevelSelect').addEventListener('click', () => {
        const ul = saveData.unlockedLevel || 1;
        const total = Math.ceil((window.LEVEL_COUNT || 500) / LEVEL_PAGE_SIZE);
        levelPage = Math.min(total - 1, Math.floor((ul - 1) / LEVEL_PAGE_SIZE));
        renderLevelGrid();
      });
      $('prevLevelPageBtn').dataset.bound = '1';
    }
  }

  function renderLevelGrid() {
    const grid = $('levelGrid');
    if (!grid) return;
    const LEVEL_COUNT = window.LEVEL_COUNT || 500;
    const totalPages = Math.ceil(LEVEL_COUNT / LEVEL_PAGE_SIZE);
    const cl = saveData.clearedLevels || [];
    const ul = saveData.unlockedLevel || 1;
    const start = levelPage * LEVEL_PAGE_SIZE;
    const end = Math.min(start + LEVEL_PAGE_SIZE, LEVEL_COUNT);
    const algoIcons = { zigzag: '⇄', snake: '🐍', sCurve: '∿', spiral: '🌀', wave: '〰', stair: '⫘', figure8: '∞', labyrinth: '🧩', canyon: '⛰', cross: '✚' };

    let html = '';
    for (let n = start + 1; n <= end; n++) {
      const level = window.LEVELS[n - 1];
      if (!level) continue;
      const locked = n > ul;
      const cleared = cl.includes(n);
      const t = level.theme || {};
      html += `<div class="level-card" data-level="${n}" style="cursor:${locked?'not-allowed':'pointer'};border-left:4px solid ${t.pathCenter||'#ffe27a'};background:linear-gradient(135deg,${t.bgTop||'#1a1a2e'},${t.bgBot||'#16213e'});opacity:${locked?0.45:1}">
        <div style="display:flex;justify-content:space-between;font-weight:bold;color:${t.pathCenter||'#ffe27a'};"><span>#${n}</span><span>${algoIcons[level.algoKey]||'·'} ${cleared?'✓':locked?'🔒':''}</span></div>
        <div style="font-size:11px;color:#c8d0e0;margin-top:2px;">${t.name||''}</div>
        <div style="font-size:10px;color:#7a86a0;margin-top:1px;">${level.waveCount}波 · 难度${level.difficulty}</div>
      </div>`;
    }
    grid.innerHTML = html;
    $('levelPageLabel').textContent = `第 ${levelPage + 1} / ${totalPages} 页`;

    grid.querySelectorAll('.level-card').forEach(card => {
      card.addEventListener('click', () => {
        const lv = parseInt(card.dataset.level);
        if (lv > (saveData.unlockedLevel || 1)) return;
        enterBattle(lv);
      });
    });
  }

  /* =========================================================
   * 4. 成就 Tab
   * ========================================================= */
  function renderAchievements(container) {
    const achs = window.ACHIEVEMENTS || [];
    const unlocked = saveData.achievementsUnlocked || [];
    let html = `<div style="margin-top:12px;"><h3 style="color:#ffe27a;">🏆 成就 (${unlocked.length}/${achs.length})</h3><div style="display:grid;grid-template-columns:1fr 1fr;gap:6px;max-height:400px;overflow-y:auto;">`;
    for (const a of achs) {
      const done = unlocked.includes(a.id);
      html += `<div style="padding:6px;border-radius:4px;border-left:3px solid ${done?'#ffe27a':'#555'};background:${done?'#2a2a14':'#1a1a2e'};opacity:${done?1:0.6};">
        <div style="font-size:12px;color:${done?'#ffe27a':'#7a86a0'};">${a.icon||'🏆'} ${a.name} ${done?'✓':''}</div>
        <div style="font-size:10px;color:#9aa4bd;">${a.desc||''} · 奖励 ${a.rewardAmount||1} ${a.rewardType||''}</div></div>`;
    }
    html += '</div></div>';
    container.innerHTML = html;
  }

  /* =========================================================
   * 5. buildWave —— 关卡特定敌人池构建
   * ========================================================= */
  function buildWave(level, waveIdx) {
    if (!level) return [];
    const ENEMIES = window.ENEMY_DATA || [];
    if (ENEMIES.length === 0) return [];
    const tierScore = { s: 1, m: 2, l: 3, xl: 4, boss: 5 };
    const tierMax = Math.min(5, 2 + Math.floor(level.difficulty / 2) + Math.floor(waveIdx / 2));
    const pool = ENEMIES.filter(e => (tierScore[e.tier] || 2) <= tierMax);
    const hpScale = level.hpScale || 1;
    const hpMult = 1 + waveIdx * (0.1 + level.difficulty * 0.02);
    const count = 4 + Math.floor(level.difficulty * 1.2) + waveIdx * 2;
    const wave = [];
    for (let i = 0; i < count; i++) {
      const pick = pool[Math.floor(Math.random() * pool.length)];
      wave.push({ enemy: pick, time: i * 0.7, delay: i * 0.7, waveHpMult: hpMult });
    }
    // 最后一波 Boss
    if (waveIdx === (level.bossWave || level.waveCount) - 1) {
      const ELITE = window.ELITE_DATA || [];
      if (ELITE.length > 0) {
        const elite = ELITE[Math.floor(Math.random() * ELITE.length)];
        const scaled = Object.assign({}, elite, { baseHp: Math.round((elite.hp || 500) * hpScale * hpMult * 1.5), isBoss: true });
        wave.push({ enemy: scaled, time: count * 0.7 + 1, delay: count * 0.7 + 1, waveHpMult: 1 });
      }
    } else if (waveIdx >= 1 && waveIdx % 2 === 1 && (window.ELITE_DATA || []).length > 0) {
      const elite = window.ELITE_DATA[Math.floor(Math.random() * window.ELITE_DATA.length)];
      const scaled = Object.assign({}, elite, { baseHp: Math.round((elite.hp || 300) * hpScale * hpMult * 1.2), isElite: true });
      wave.push({ enemy: scaled, time: count * 0.7 + 0.5, delay: count * 0.7 + 0.5, waveHpMult: 1 });
    }
    return wave;
  }

  /* =========================================================
   * 6. enterBattle(n) —— 核心入口
   * ========================================================= */
  function enterBattle(n) {
    const LEVEL_COUNT = window.LEVEL_COUNT || 500;
    if (n < 1 || n > LEVEL_COUNT) return;
    if ((saveData.loadout || []).length < 1) {
      alert('先在主页面编队炮塔！去 [商店] 购买 → [芯片/出战] Tab 加入配置');
      return;
    }

    const level = window.LEVELS[n - 1];

    // 设置关卡
    Core.setLevel(level);
    GS.path = level.path;

    // 清空战斗状态
    GS.towers = []; GS.enemies = []; GS.bullets = [];
    GS.particles = []; GS.floats = []; GS.spawnQueue = [];
    GS.towerChips = {}; GS.availableLoadout = [];
    GS.currentLevel = n;
    GS.totalWavesInLevel = level.waveCount;
    GS.waveIndex = 0; GS.wave = 0; GS.maxWave = level.waveCount;
    GS.gold = 200; GS.lives = level.startLives || 15;
    GS.score = 0; GS.kills = 0;
    GS.levelTheme = Core.getCurrentTheme();
    GS.levelPath = level.path;
    GS.levelPathWidth = level.pathWidth || Core.defaultPathWidth;
    GS.selectedTower = null; GS.selectedTowerType = null;
    GS.sellMode = false; GS.waveInProgress = false;
    GS.spawnTimer = 0; GS.paused = false;
    GS.gameOver = false; GS.gameWon = false;
    GS.combo = { count: 0, lastKillTime: 0, timer: 0, best: 0 };

    // 构建出战列表
    const TOWERS = window.TOWER_DATA || [];
    for (const runtimeId of (saveData.loadout || [])) {
      const owned = (saveData.ownedTowers || []).find(t => t.runtimeId === runtimeId);
      if (!owned) continue;
      const td = TOWERS[owned.towerTypeId];
      if (!td) continue;
      GS.availableLoadout.push({
        runtimeId: owned.runtimeId,
        towerTypeId: owned.towerTypeId,
        level: owned.level,
        chips: owned.chips || [],
        name: td.name, symbol: td.symbol || '🔫', color: td.color
      });
    }

    // 切屏幕
    GS.screen = 'battle';
    $('menuScreen')?.classList.add('hidden');
    $('battleScreen')?.classList.remove('hidden');

    // 刷新左栏
    buildBattleLoadoutSlots();

    // 启动 GameLogic 重置
    if (window.GameLogic && typeof window.GameLogic.reset === 'function') window.GameLogic.reset();

    GS._battleActive = true;
    GS._battleLastTime = performance.now();
    GS.running = true;
    if (window.AudioFX) AudioFX.init();
    updateBattleUI();
    requestAnimationFrame(battleFrame);
  }

  /* =========================================================
   * 7. exitBattle(won) —— 退出战斗回主菜单
   * ========================================================= */
  function exitBattle(won) {
    GS._battleActive = false;
    GS.running = false;

    // 金币结算
    const earned = Math.max(0, GS.gold || 0);
    if (won) saveData.gold = (saveData.gold || 0) + Math.round(earned);
    else saveData.gold = (saveData.gold || 0) + Math.round(earned * 0.3);

    // 芯片掉落保存（GameLogic.killEnemy 可能已直接写 saveData）
    if (GS.chips && GS.chips.length > 0) {
      saveData.chipInventory = saveData.chipInventory || [];
      for (const c of GS.chips) saveData.chipInventory.push(c);
    }

    // 通关进度
    if (won) {
      const n = GS.currentLevel;
      saveData.unlockedLevel = Math.max(saveData.unlockedLevel || 1, n + 1);
      saveData.clearedLevels = saveData.clearedLevels || [];
      if (!saveData.clearedLevels.includes(n)) {
        saveData.clearedLevels.push(n);
        saveData.clearedCount = (saveData.clearedCount || 0) + 1;
      }
      if (window.AchievementSystem) window.AchievementSystem.checkAll();
    }

    // 统计
    saveData.totalKills = (saveData.totalKills || 0) + (GS.kills || 0);
    if (GS.combo) {
      saveData.bestCombo = Math.max(saveData.bestCombo || 0, GS.combo.best || 0);
    }
    saveData.bestScore = Math.max(saveData.bestScore || 0, GS.score || 0);
    SaveSystem.save(saveData);

    // 清理
    GS.towers = []; GS.enemies = []; GS.bullets = [];
    GS.particles = []; GS.floats = []; GS.spawnQueue = [];
    GS.availableLoadout = []; GS.chips = [];

    // 切回菜单
    GS.screen = 'menu';
    $('battleScreen')?.classList.add('hidden');
    $('menuScreen')?.classList.remove('hidden');

    refreshMenu();
  }

  /* =========================================================
   * 8. 战斗主循环 —— battleFrame
   * ========================================================= */
  let pendingPlaceRuntime = null;

  function battleFrame(ts) {
    if (!GS._battleActive) return;
    let dt = Math.min(0.05, (ts - GS._battleLastTime) / 1000);
    GS._battleLastTime = ts;
    if (GS.paused) dt = 0; else dt *= GS.speed;

    if (GS.running && !GS.paused) {
      GS.path = Core.getCurrentPath();
      // GameLogic.tick 已提供完整敌人/炮塔/子弹/波次逻辑
      if (window.GameLogic && typeof window.GameLogic.tick === 'function') {
        try { window.GameLogic.tick(dt); } catch (e) { console.warn('GameLogic tick:', e); }
      }
      // 降级粒子（如果 Core.updateParticles 存在）
      try { Core.updateParticles && Core.updateParticles(dt); } catch (e) {}
      try { Core.updateFloats && Core.updateFloats(dt); } catch (e) {}
    }

    // 胜负检测
    if (GS.gameOver) {
      GS.running = false; GS._battleActive = false;
      setTimeout(() => { alert(`💀 第 ${GS.currentLevel} 关 · 失败\n\n击杀:${GS.kills} 得分:${GS.score}`); exitBattle(false); }, 200);
    } else if (GS.gameWon) {
      GS.running = false; GS._battleActive = false;
      const levelObj = window.LEVELS[GS.currentLevel - 1];
      setTimeout(() => { alert(`✨ 第 ${GS.currentLevel} 关 · 通关!\n${levelObj?.name || ''}\n\n击杀:${GS.kills} 得分:${GS.score}\n战斗金币:${GS.gold} → 全额结算`); exitBattle(true); }, 200);
    }

    // 渲染
    if (ctx && typeof Core.render === 'function') {
      try { Core.render(ctx); } catch (e) {}
    }
    updateBattleUI();
    requestAnimationFrame(battleFrame);
  }

  /* =========================================================
   * 9. 出战配置左栏 + 放置塔
   * ========================================================= */
  function buildBattleLoadoutSlots() {
    const TOWERS = window.TOWER_DATA || [];
    document.querySelectorAll('#battleLoadoutSlots .battle-slot').forEach((slotEl, idx) => {
      slotEl.innerHTML = '';
      const item = GS.availableLoadout[idx];
      if (!item) { slotEl.innerHTML = '<span class="slot-empty">—</span>'; return; }
      const td = TOWERS[item.towerTypeId];
      slotEl.innerHTML = `<div class="battle-tower-chip" style="border-color:${td.color};"><span style="color:${td.color};">${td.symbol||'🔫'}</span><span>${td.name}</span><span class="lv-badge">L${item.level}</span></div>`;
      slotEl.dataset.runtime = item.runtimeId;
      slotEl.onclick = () => {
        pendingPlaceRuntime = item.runtimeId;
        GS.selectedTowerType = item.towerTypeId;
        GS.sellMode = false;
        if (window.AudioFX) AudioFX.play('click');
      };
    });
  }

  function placeTowerFromLoadout(runtimeId, gx, gy) {
    const owned = (saveData.ownedTowers || []).find(t => t.runtimeId === runtimeId);
    if (!owned) return false;
    const td = window.TOWER_DATA[owned.towerTypeId];
    if (!td) return false;
    const TS = Core.TS || 40;
    const x = gx * TS + TS / 2, y = gy * TS + TS / 2;

    // 🔧 重叠检测 — 不能放已有炮塔的格子
    if (!Core.canPlaceAt(gx, gy)) {
      Core.spawnFloat && Core.spawnFloat(x, y, '❌ 无法放置', '#ff5a2a');
      if (window.AudioFX) AudioFX.play('hurt');
      return false;
    }

    // 🔧 扣局内造价 — 用 JSON cost 字段（data_from_json 已注入）
    const cost = td.cost || 100;
    if (GS.gold < cost) {
      Core.spawnFloat && Core.spawnFloat(x, y, '💰 金币不足 (' + cost + ')', '#ff5a2a');
      if (window.AudioFX) AudioFX.play('hurt');
      return false;
    }
    GS.gold -= cost;

    const instanceId = 'bt_' + Date.now() + '_' + Math.random().toString(36).slice(2, 5);
    const tower = {
      instanceId, type: owned.towerTypeId, gx: x, gy: y, x, y,
      angle: 0, level: owned.level, cooldown: 0, chips: (owned.chips || []).slice(), kills: 0,
      costAtPlace: cost   // 记录局内造价，出售时按 50% 退
    };
    GS.towers.push(tower);
    GS.towerChips[instanceId] = (owned.chips || []).slice();
    Core.spawnParticles && Core.spawnParticles(x, y, td.color, 20, 120, 0.6);
    Core.spawnFloat && Core.spawnFloat(x, y, '+' + td.name.slice(0, 4), '#ffe27a');
    if (window.AudioFX) AudioFX.play('place');

    // 消耗一个 availableLoadout 条目（已放置）
    GS.availableLoadout = GS.availableLoadout.filter(i => i.runtimeId !== runtimeId);
    buildBattleLoadoutSlots();
    pendingPlaceRuntime = null;
    GS.selectedTowerType = null;
    return true;
  }

  /* =========================================================
   * 10. Canvas 事件
   * ========================================================= */
  function bindBattleCanvas() {
    if (!canvas) return;
    canvas.addEventListener('mousemove', e => {
      const r = canvas.getBoundingClientRect();
      const sx = canvas.width / r.width, sy = canvas.height / r.height;
      GS.mouse = { x: (e.clientX - r.left) * sx, y: (e.clientY - r.top) * sy };
    });
    canvas.addEventListener('click', () => {
      if (GS.screen !== 'battle' || !GS.mouse) return;
      const mx = GS.mouse.x, my = GS.mouse.y;
      const TS = Core.TS || 40;

      // 出售模式
      if (GS.sellMode) {
        for (let i = GS.towers.length - 1; i >= 0; i--) {
          const t = GS.towers[i];
          if (Math.hypot(t.gx - mx, t.gy - my) < 22) { sellTowerInBattle(t); GS.sellMode = false; return; }
        }
        return;
      }

      // 点击已放塔 → 选中
      for (const t of GS.towers) {
        if (Math.hypot(t.gx - mx, t.gy - my) < 22) {
          GS.selectedTower = t; GS.selectedTowerType = null;
          $('chipPanel')?.classList.add('show');
          if (ChipSystem && typeof ChipSystem.renderPanel === 'function') ChipSystem.renderPanel(t, $('chipPanelBody'));
          return;
        }
      }

      // 从 loadout 放置
      if (pendingPlaceRuntime) {
        placeTowerFromLoadout(pendingPlaceRuntime, Math.floor(mx / TS), Math.floor(my / TS));
        return;
      }

      GS.selectedTower = null; GS.selectedTowerType = null;
      $('chipPanel')?.classList.remove('show');
    });
    canvas.addEventListener('contextmenu', e => {
      e.preventDefault();
      pendingPlaceRuntime = null; GS.selectedTowerType = null; GS.selectedTower = null; GS.sellMode = false;
      $('chipPanel')?.classList.remove('show');
    });
  }

  function sellTowerInBattle(tower) {
    // 按实际局内造价的 50% 退
    const refund = Math.round((tower.costAtPlace || 100) * 0.5);
    GS.gold += refund;
    Core.spawnFloat && Core.spawnFloat(tower.gx, tower.gy - 10, '+' + refund, '#ffe27a');
    Core.spawnParticles && Core.spawnParticles(tower.gx, tower.gy, '#ffe27a', 25, 150, 0.7);
    GS.towers = GS.towers.filter(x => x !== tower);
    delete GS.towerChips[tower.instanceId];
    if (window.AudioFX) AudioFX.play('coin');
    GS.selectedTower = null;
    $('chipPanel')?.classList.remove('show');
  }

  /* =========================================================
   * 11. 战斗 HUD
   * ========================================================= */
  function updateBattleUI() {
    const set = (id, v) => { const el = $(id); if (el) el.textContent = String(v); };
    set('uiLevel', GS.currentLevel || '—');
    set('uiLevelName', GS.currentLevel ? (window.LEVELS[GS.currentLevel - 1]?.name || '') : '');
    set('uiWave', GS.waveIndex);
    set('uiMaxWave', GS.totalWavesInLevel);
    set('uiLives', Math.max(0, GS.lives));
    set('uiGold', GS.gold);
    set('uiScore', GS.score);
    set('uiKills', GS.kills);
    const btnSpeed = $('btnSpeed'); if (btnSpeed) btnSpeed.textContent = '速度×' + GS.speed;
    const btnSell = $('btnSell'); if (btnSell) btnSell.textContent = GS.sellMode ? '出售 ✓' : '出售';
    renderMinimap();
  }

  function renderMinimap() {
    const mm = $('minimap');
    if (!mm || GS.screen !== 'battle') return;
    const mctx = mm.getContext('2d');
    const W = Core.W || 1100, H = Core.H || 720;
    const sx = 200 / W, sy = 130 / H;
    mctx.fillStyle = '#080c16'; mctx.fillRect(0, 0, 200, 130);
    const theme = GS.levelTheme || { pathColor: '#2a3450', pathBorder: '#1a2030' };
    const path = GS.path || Core.getCurrentPath();
    if (path) {
      mctx.strokeStyle = theme.pathBorder; mctx.lineWidth = 4;
      mctx.beginPath(); mctx.moveTo(path[0].x * sx, path[0].y * sy);
      for (let i = 1; i < path.length; i++) mctx.lineTo(path[i].x * sx, path[i].y * sy); mctx.stroke();
      mctx.strokeStyle = theme.pathColor; mctx.lineWidth = 2;
      mctx.beginPath(); mctx.moveTo(path[0].x * sx, path[0].y * sy);
      for (let i = 1; i < path.length; i++) mctx.lineTo(path[i].x * sx, path[i].y * sy); mctx.stroke();
    }
    mctx.fillStyle = '#6ca8ff';
    for (const t of GS.towers) mctx.fillRect(t.gx * sx - 1, t.gy * sy - 1, 3, 3);
    for (const e of GS.enemies) {
      mctx.fillStyle = e.isBoss ? '#ff5a2a' : e.isElite ? '#c060ff' : (e.color || '#fff');
      mctx.fillRect(e.x * sx - 1, e.y * sy - 1, 2, 2);
    }
    mctx.fillStyle = '#9aa4bd'; mctx.font = '10px sans-serif';
    mctx.fillText(`塔:${GS.towers.length} 敌:${GS.enemies.length}`, 4, 126);
  }

  /* =========================================================
   * 12. 战斗按钮绑定
   * ========================================================= */
  function bindBattleControls() {
    // 开始下一波 —— 用我们的 buildWave（关卡特定），兼容 GameLogic.spawnEnemy
    $('btnStartWave')?.addEventListener('click', () => {
      if (GS.waveInProgress || !GS.running || GS.waveIndex >= GS.totalWavesInLevel) return;
      GS.waveIndex++; GS.wave = GS.waveIndex;
      const levelObj = window.LEVELS[GS.currentLevel - 1];
      const wave = buildWave(levelObj, GS.waveIndex - 1);
      GS.spawnQueue = wave.map(w => ({ enemy: w.enemy, time: w.delay, waveHpMult: w.waveHpMult }));
      GS.spawnTimer = 0; GS.waveInProgress = true;
      if (window.AudioFX) AudioFX.play('wave');
      updateBattleUI();
    });
    $('btnSpeed')?.addEventListener('click', () => { GS.speed = GS.speed === 1 ? 2 : GS.speed === 2 ? 3 : 1; });
    $('btnSell')?.addEventListener('click', () => { GS.sellMode = !GS.sellMode; pendingPlaceRuntime = null; });
    $('btnRestartLevel')?.addEventListener('click', () => { const n = GS.currentLevel; exitBattle(false); setTimeout(() => enterBattle(n), 50); });
    $('returnHomeBtn')?.addEventListener('click', () => { if (confirm('放弃战斗返回主页？金币按 30% 结算')) { GS.gold = Math.round(GS.gold * 0.3); exitBattle(false); } });

    // ChipPanel
    $('chipBtnClose')?.addEventListener('click', () => { GS.selectedTower = null; $('chipPanel')?.classList.remove('show'); });
    $('chipBtnInv')?.addEventListener('click', () => { if (ChipSystem && ChipSystem.openInventoryModal) ChipSystem.openInventoryModal(); });
    $('chipBtnUpgrade')?.addEventListener('click', () => {
      if (!GS.selectedTower) return;
      if (Shop && Shop.upgradeTower) Shop.upgradeTower(GS.selectedTower);
      if (ChipSystem && ChipSystem.renderPanel) ChipSystem.renderPanel(GS.selectedTower, $('chipPanelBody'));
    });
    $('chipBtnSell')?.addEventListener('click', () => { if (GS.selectedTower) sellTowerInBattle(GS.selectedTower); });

    // 键盘
    document.addEventListener('keydown', e => {
      if (GS.screen !== 'battle') return;
      if (e.key === 'Escape') GS.paused = !GS.paused;
      if (e.key === ' ') {
        e.preventDefault();
        if (GS.running && !GS.waveInProgress && GS.waveIndex < GS.totalWavesInLevel) $('btnStartWave')?.click();
      }
      // 1~5 快捷选择出战槽
      const num = parseInt(e.key);
      if (num >= 1 && num <= 5) {
        const item = GS.availableLoadout[num - 1];
        if (item) { pendingPlaceRuntime = item.runtimeId; GS.selectedTowerType = item.towerTypeId; }
      }
    });

    // GameLogic 没有提供 wave 完成时发奖励/结束关卡的逻辑 —— 需要自己检查
    // 通过 setInterval 每帧在 battleFrame 里已处理 gameWon/gameOver
    // 但 GameLogic.waveInProgress 是 GameLogic.startWave 里设的，我们自己管理 GS.waveInProgress
  }

  /* =========================================================
   * 13. 商店购买
   * ========================================================= */
  function bindShopBuy() {
    const buyBtn = $('buySelectedTowerBtn');
    if (buyBtn) {
      buyBtn.addEventListener('click', () => {
        const TOWERS = window.TOWER_DATA || [];
        const td = TOWERS[Shop?.selectedId];
        if (!td) return;
        if ((saveData.gold || 0) < td.cost) { alert('金币不足！'); if (window.AudioFX) AudioFX.play('hurt'); return; }
        saveData.gold -= td.cost;
        ChipSystem.addOwnedTower(td.id);
        if (!saveData.unlockedTowers.includes(td.id)) saveData.unlockedTowers.push(td.id);
        saveData.totalTowersBuilt = (saveData.totalTowersBuilt || 0) + 1;
        SaveSystem.save(saveData);
        Core.spawnFloat && Core.spawnFloat(Core.W / 2, 40, `购买 ${td.name}!`, '#ffe27a');
        if (window.AudioFX) AudioFX.play('coin');
        refreshMenu();
      });
    }
  }

  function bindShopDetail() {
    const orig = Shop?.onSelectTower;
    if (Shop && orig) {
      Shop.onSelectTower = function (towerId) { orig.call(this, towerId); showTowerDetail(towerId); };
    }
  }

  function showTowerDetail(towerId) {
    const TOWERS = window.TOWER_DATA || [];
    const td = TOWERS[towerId];
    const detail = $('towerDetail');
    const buyBtn = $('buySelectedTowerBtn');
    if (!td || !detail) return;
    const owned = (saveData.ownedTowers || []).filter(t => t.towerTypeId === towerId).length;
    detail.innerHTML = `
      <div style="display:flex;align-items:center;gap:10px;margin-bottom:8px;">
        <span style="font-size:28px;color:${td.color};">${td.symbol || '🔫'}</span>
        <div><div style="color:${td.color};font-weight:bold;font-size:15px;">${td.name}</div>
        <div style="font-size:11px;color:#9aa4bd;">${td.desc || ''}</div></div></div>
      <div class="kv"><span>伤害</span><span>${td.damage}</span></div>
      <div class="kv"><span>射程</span><span>${td.range}</span></div>
      <div class="kv"><span>攻速</span><span>${td.fireRate}s</span></div>
      <div class="kv"><span>溅射</span><span>${td.splash || 0}</span></div>
      <div class="kv"><span>穿透</span><span>${td.pierce || 1}</span></div>
      <div class="kv"><span>元素</span><span>${td.element}</span></div>
      <div style="margin-top:8px;font-size:11px;color:#9aa4bd;">已拥有 ${owned} 座 · 商店价 ${td.cost}</div>`;
    if (buyBtn) {
      buyBtn.classList.remove('hidden');
      buyBtn.textContent = `💸 买此塔 (${td.cost})`;
      buyBtn.disabled = (saveData.gold || 0) < td.cost;
    }
  }

  /* =========================================================
   * 14. 刷新菜单
   * ========================================================= */
  function refreshMenu() {
    updateMenuCurrency();
    if (Shop && typeof Shop.renderFeatured === 'function') Shop.renderFeatured();
    if (ChipSystem && typeof ChipSystem.initMenu === 'function') ChipSystem.initMenu();
    if (currentMenuTab === 'level') renderLevelGrid();
  }

  function updateMenuCurrency() {
    const set = (id, v) => { const el = $(id); if (el) el.textContent = String(v); };
    set('statGold', saveData.gold || 0);
    set('statTotalOwned', (saveData.ownedTowers || []).length);
    set('statChips', (saveData.chipInventory || []).length);
    set('statHighestLevel', saveData.unlockedLevel || 1);
  }

  /* =========================================================
   * 15. DOM Ready
   * ========================================================= */
  document.addEventListener('DOMContentLoaded', () => {
    if (canvas) { canvas.width = Core.W || 1100; canvas.height = Core.H || 720; }
    // 关卡主题初始
    const firstLevel = (window.LEVELS || [])[0];
    if (firstLevel) { Core.setLevel(firstLevel); GS.path = firstLevel.path; }

    // 屏幕初始：菜单可见
    GS.screen = 'menu';
    $('menuScreen')?.classList.remove('hidden');
    $('battleScreen')?.classList.add('hidden');

    // 初始化 Shop + ChipSystem
    if (Shop && typeof Shop.init === 'function') Shop.init($('shopContainer'));
    if (ChipSystem && typeof ChipSystem.initMenu === 'function') ChipSystem.initMenu();

    // 绑定事件
    bindMenuTabs();
    bindShopBuy();
    bindShopDetail();
    bindBattleCanvas();
    bindBattleControls();
    switchMenuTab('shop');

    // 监听货币变化
    document.addEventListener('tdf:currency-changed', updateMenuCurrency);

    // 自动保存 & 成就检查
    setInterval(() => { if (GS.screen === 'battle' && GS.running) SaveSystem.save(saveData); }, 5000);
    setInterval(() => { if (window.AchievementSystem) AchievementSystem.checkAll(); }, 10000);

    // 初始 Shop 选中
    if (Shop?.selectedId != null) showTowerDetail(Shop.selectedId);
    updateMenuCurrency();

    // 隐藏初始 overlay
    $('overlay')?.classList.add('hidden');

    // === 外部跳转：关卡选择页/世界地图页传来的 pending level ===
    const pending = sessionStorage.getItem('tdf_pendingLevel');
    if (pending) {
      sessionStorage.removeItem('tdf_pendingLevel');
      const pendingN = parseInt(pending);
      const UL = saveData.unlockedLevel || 1;
      if (!isNaN(pendingN) && pendingN >= 1 && pendingN <= (window.LEVEL_COUNT || 500) && pendingN <= UL) {
        console.log('🚀 自动进入关卡 %d （来自外部页面跳转）', pendingN);
        // 延迟一帧，让 DOM 先完全就绪
        setTimeout(() => enterBattle(pendingN), 50);
        return; // 直接切战斗，不再打印下方菜单初始化日志
      }
    }

    console.log('✅ Main.js · 双屏幕状态机 ready');
    console.log('📊 存档: gold=%d owned=%d loadout=%d unlockedLv=%d',
      saveData.gold || 0, (saveData.ownedTowers || []).length,
      (saveData.loadout || []).length, saveData.unlockedLevel || 1);
  });

  /* =========================================================
   * 16. 全局暴露
   * ========================================================= */
  window.enterBattle = enterBattle;
  window.exitBattle = exitBattle;
  window.isOnPath = function (px, py) { return Core.isOnPath(px, py); };
  window.buildWave = buildWave;

})();
