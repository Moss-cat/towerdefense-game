/* ================================================================
   main.js v2 — 双屏幕状态机 · 解锁模型
   MENU (主菜单) ↔ BATTLE (战斗画面)
   战斗塔栏 = ownedTowers (基础, 无限建造) + craftedTowers (合成)
   升级/出售使用 GS.gold (战斗临时金币)
   通关弹 modal 显示 rewardChips + rewardCredits
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
  GS.availableLoadout = [];     // 所有可建造塔 = owned + crafted (战斗里复制)
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

  function bindMenuTabs(){
    document.querySelectorAll('.tab-btn').forEach(btn => {
      btn.addEventListener('click', () => switchMenuTab(btn.dataset.tab));
    });
  }

  function switchMenuTab(tab){
    currentMenuTab = tab;
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.toggle('active', b.dataset.tab === tab));
    const shopContainer = $('shopContainer');
    const centerPanel = document.querySelector('.center-panel');
    const levelPanel = $('levelPanel');
    const chSec = $('chipInventorySection');
    const loSec = $('loadoutSection');
    const tdSec = $('towerDetailSection');
    const stSec = document.querySelector('.stats-section');
    const bsSec = document.getElementById('blacksmithSection');

    if (levelPanel) levelPanel.style.display = (tab === 'level') ? '' : 'none';
    if (shopContainer) shopContainer.style.display = (tab === 'shop') ? '' : 'none';
    if (centerPanel) centerPanel.style.display = (tab === 'level') ? 'none' : '';
    if (bsSec) bsSec.style.display = (tab === 'blacksmith') ? '' : 'none';

    if (tab === 'shop'){
      if (tdSec) tdSec.style.display = '';
      if (chSec) chSec.style.display = 'none';
      if (loSec) loSec.style.display = 'none';
      if (stSec) stSec.style.display = '';
    } else if (tab === 'blacksmith'){
      // 直接进入铁匠铺
    } else if (tab === 'chip'){
      if (tdSec) tdSec.style.display = 'none';
      if (chSec) chSec.style.display = '';
      if (loSec) loSec.style.display = '';
      if (stSec) stSec.style.display = '';
      ChipSystem.initMenu();
    } else if (tab === 'achievement'){
      if (tdSec) tdSec.style.display = 'none';
      if (chSec) chSec.style.display = 'none';
      if (loSec) loSec.style.display = 'none';
      if (stSec){ stSec.style.display = ''; renderAchievements(stSec); }
    } else if (tab === 'level'){
      initLevelSelector();
    }
    if (window.AudioFX) AudioFX.play('click');
  }

  /* =========================================================
   * 3. 选关
   * ========================================================= */
  let levelPage = 0;
  const LEVEL_PAGE_SIZE = 25;

  function initLevelSelector(){
    renderLevelGrid();
    if (!$('prevLevelPageBtn').dataset.bound){
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

  function renderLevelGrid(){
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
    for (let n = start + 1; n <= end; n++){
      const level = window.LEVELS[n - 1];
      if (!level) continue;
      const locked = n > ul;
      const cleared = cl.includes(n);
      const t = level.theme || {};
      html += `<div class="level-card" data-level="${n}" style="cursor:${locked ? 'not-allowed' : 'pointer'};border-left:4px solid ${t.pathCenter || '#ffe27a'};background:linear-gradient(135deg,${t.bgTop || '#1a1a2e'},${t.bgBot || '#16213e'});opacity:${locked ? 0.45 : 1}">
        <div style="display:flex;justify-content:space-between;font-weight:bold;color:${t.pathCenter || '#ffe27a'};"><span>#${n}</span><span>${algoIcons[level.algoKey] || '·'} ${cleared ? '✓' : locked ? '🔒' : ''}</span></div>
        <div style="font-size:11px;color:#c8d0e0;margin-top:2px;">${t.name || ''}</div>
        <div style="font-size:10px;color:#7a86a0;margin-top:1px;">${level.waveCount}波 · 难度${level.difficulty} · 奖励${level.rewardChips || 1}芯片</div>
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
  function renderAchievements(container){
    const achs = window.ACHIEVEMENTS || [];
    const unlocked = saveData.achievementsUnlocked || [];
    let html = `<div style="margin-top:12px;"><h3 style="color:#ffe27a;">🏆 成就 (${unlocked.length}/${achs.length})</h3><div style="display:grid;grid-template-columns:1fr 1fr;gap:6px;max-height:400px;overflow-y:auto;">`;
    for (const a of achs){
      const done = unlocked.includes(a.id);
      html += `<div style="padding:6px;border-radius:4px;border-left:3px solid ${done ? '#ffe27a' : '#555'};background:${done ? '#2a2a14' : '#1a1a2e'};opacity:${done ? 1 : 0.6};">
        <div style="font-size:12px;color:${done ? '#ffe27a' : '#7a86a0'};">${a.icon || '🏆'} ${a.name} ${done ? '✓' : ''}</div>
        <div style="font-size:10px;color:#9aa4bd;">${a.desc || ''} · 奖励 ${a.rewardAmount || 1} ${a.rewardType || ''}</div></div>`;
    }
    html += '</div></div>';
    container.innerHTML = html;
  }

  /* =========================================================
   * 5. buildWave
   * ========================================================= */
  function buildWave(level, waveIdx){
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
    for (let i = 0; i < count; i++){
      const pick = pool[Math.floor(Math.random() * pool.length)];
      wave.push({ enemy: pick, time: i * 0.7, delay: i * 0.7, waveHpMult: hpMult });
    }
    if (waveIdx === (level.bossWave || level.waveCount) - 1){
      const ELITE = window.ELITE_DATA || [];
      if (ELITE.length > 0){
        const elite = ELITE[Math.floor(Math.random() * ELITE.length)];
        const scaled = Object.assign({}, elite, { baseHp: Math.round((elite.hp || 500) * hpScale * hpMult * 1.5), isBoss: true });
        wave.push({ enemy: scaled, time: count * 0.7 + 1, delay: count * 0.7 + 1, waveHpMult: 1 });
      }
    } else if (waveIdx >= 1 && waveIdx % 2 === 1 && (window.ELITE_DATA || []).length > 0){
      const elite = window.ELITE_DATA[Math.floor(Math.random() * window.ELITE_DATA.length)];
      const scaled = Object.assign({}, elite, { baseHp: Math.round((elite.hp || 300) * hpScale * hpMult * 1.2), isElite: true });
      wave.push({ enemy: scaled, time: count * 0.7 + 0.5, delay: count * 0.7 + 0.5, waveHpMult: 1 });
    }
    return wave;
  }

  /* =========================================================
   * 6. enterBattle(n)
   * ========================================================= */
  function enterBattle(n){
    const LEVEL_COUNT = window.LEVEL_COUNT || 500;
    if (n < 1 || n > LEVEL_COUNT) return;
    const level = window.LEVELS[n - 1];

    // 没解锁任何塔
    if (!saveData.ownedTowers || saveData.ownedTowers.length === 0){
      alert('先在商店解锁至少一座炮塔!');
      return;
    }

    Core.setLevel(level);
    GS.path = level.path;

    GS.towers = []; GS.enemies = []; GS.bullets = [];
    GS.particles = []; GS.floats = []; GS.spawnQueue = [];
    GS.towerChips = {};
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

    // === 构建战斗塔栏：ownedTowers (基础, 无限建造) + craftedTowers ===
    GS.availableLoadout = [];
    const TOWERS = window.TOWER_DATA || [];
    for (const towerId of (saveData.ownedTowers || [])){
      const td = TOWERS[towerId];
      if (!td) continue;
      GS.availableLoadout.push({
        kind: 'base',
        id: towerId,
        label: 'base_' + towerId,
        name: td.name, symbol: td.symbol || '🔫', color: td.color,
        cost: td.cost || 100,
        damage: td.damage, range: td.range, fireRate: td.fireRate,
        _td: td
      });
    }
    for (const ct of (saveData.craftedTowers || [])){
      const td = TOWERS[ct.baseType];
      GS.availableLoadout.push({
        kind: 'crafted',
        id: ct.uid,
        label: 'crafted_' + ct.uid,
        name: ct.name, symbol: td?.symbol || '🔨', color: td?.color || '#ffd93d',
        cost: td?.cost || 100,
        damage: ct.stats.damage, range: ct.stats.range, fireRate: ct.stats.fireRate,
        _ct: ct, _baseTd: td
      });
    }

    GS.screen = 'battle';
    $('menuScreen')?.classList.add('hidden');
    $('battleScreen')?.classList.remove('hidden');

    buildBattleLoadoutSlots();

    if (window.GameLogic && typeof window.GameLogic.reset === 'function') window.GameLogic.reset();

    GS._battleActive = true;
    GS._battleLastTime = performance.now();
    GS.running = true;
    if (window.AudioFX) AudioFX.init();
    updateBattleUI();
    requestAnimationFrame(battleFrame);
  }

  /* =========================================================
   * 7. exitBattle(won) — 回主菜单，结算积分+芯片
   * ========================================================= */
  function exitBattle(won){
    GS._battleActive = false;
    GS.running = false;

    // 统计
    saveData.totalKills = (saveData.totalKills || 0) + (GS.kills || 0);
    if (GS.combo) saveData.bestCombo = Math.max(saveData.bestCombo || 0, GS.combo.best || 0);
    saveData.bestScore = Math.max(saveData.bestScore || 0, GS.score || 0);

    let rewardSummary = null;

    if (won){
      const n = GS.currentLevel;
      const levelObj = window.LEVELS[n - 1];

      // 通关奖励积分
      const rewardCredits = levelObj.rewardCredits || (levelObj.difficulty || 1) * 50;
      saveData.credits = (saveData.credits || 0) + rewardCredits;

      // 通关奖励芯片
      const rewardChipsCount = levelObj.rewardChips || 1;
      const lib = window.CHIP_LIBRARY || [];
      const pickedChips = [];
      for (let i = 0; i < rewardChipsCount; i++){
        const pick = lib[Math.floor(Math.random() * lib.length)];
        if (pick){
          window.addChipToInventory(pick.libraryId, 1);
          pickedChips.push(pick);
        }
      }

      // 关卡进度
      saveData.unlockedLevel = Math.max(saveData.unlockedLevel || 1, n + 1);
      saveData.clearedLevels = saveData.clearedLevels || [];
      if (!saveData.clearedLevels.includes(n)){
        saveData.clearedLevels.push(n);
        saveData.clearedCount = (saveData.clearedCount || 0) + 1;
      }
      if (window.AchievementSystem) window.AchievementSystem.checkAll();

      rewardSummary = { levelObj, rewardCredits, pickedChips };
    }

    SaveSystem.save(saveData);

    // 清理
    GS.towers = []; GS.enemies = []; GS.bullets = [];
    GS.particles = []; GS.floats = []; GS.spawnQueue = [];
    GS.availableLoadout = [];

    GS.screen = 'menu';
    $('battleScreen')?.classList.add('hidden');
    $('menuScreen')?.classList.remove('hidden');

    refreshMenu();

    // 如果赢了，最后弹奖励 modal
    if (rewardSummary) showVictoryModal(rewardSummary);
  }

  function showVictoryModal({ levelObj, rewardCredits, pickedChips }){
    const overlay = document.createElement('div');
    overlay.style.cssText = 'position:fixed;inset:0;background:rgba(10,14,22,0.92);z-index:99999;display:flex;align-items:center;justify-content:center;';
    let chipHtml = pickedChips.map(c => {
      const rc = c.color || '#9aa4bd';
      return `<div style="padding:8px;background:rgba(10,14,26,.6);border-left:3px solid ${rc};border-radius:0 4px 4px 0;font-size:12px;margin-bottom:6px;">
        <span style="color:${rc}">${c.icon || '⚙'} ${c.name}</span>
        <span style="color:#9aa4bd;margin-left:4px;">· ${c.rarityName || '普通'}</span>
        <span style="color:var(--text3);font-size:10px;margin-left:4px;">+1 进库存</span>
      </div>`;
    }).join('');
    overlay.innerHTML = `
      <div style="background:#1a2234;border:2px solid #ffe27a;border-radius:12px;padding:20px;max-width:420px;width:90%;max-height:85vh;overflow:auto;">
        <h2 style="margin:0 0 6px;color:#ffe27a;text-align:center;font-size:20px;">✨ 通关成功!</h2>
        <div style="text-align:center;color:#c8d0e0;font-size:13px;margin-bottom:14px;">第 ${levelObj.level} 关 · ${levelObj.name}</div>
        <div style="background:#2a3248;border-radius:8px;padding:10px;margin-bottom:12px;">
          <div style="color:#6bff6b;font-size:14px;margin-bottom:8px;">💎 +${rewardCredits} 积分</div>
          <div style="color:#ffe27a;font-size:13px;margin-bottom:6px;">⚙ +${pickedChips.length} 芯片 (已进库存)</div>
          ${chipHtml}
        </div>
        <div style="font-size:11px;color:#9aa4bd;margin-bottom:14px;text-align:center;">
          击杀 ${GS.kills} · 得分 ${GS.score} · 解锁第 ${saveData.unlockedLevel} 关
        </div>
        <button class="btn gold" style="width:100%;padding:10px;font-size:14px;" onclick="this.parentElement.parentElement.remove()">太棒了!</button>
      </div>`;
    document.body.appendChild(overlay);
    if (window.AudioFX) AudioFX.play('levelup');
  }

  /* =========================================================
   * 8. 战斗主循环
   * ========================================================= */
  let pendingPlace = null;  // { kind:'base'|'crafted', id, _td, _ct }

  function battleFrame(ts){
    if (!GS._battleActive) return;
    let dt = Math.min(0.05, (ts - GS._battleLastTime) / 1000);
    GS._battleLastTime = ts;
    if (GS.paused) dt = 0; else dt *= GS.speed;

    if (GS.running && !GS.paused){
      GS.path = Core.getCurrentPath();
      if (window.GameLogic && typeof window.GameLogic.tick === 'function'){
        try { window.GameLogic.tick(dt); } catch (e){ console.warn('GameLogic tick:', e); }
      }
      try { Core.updateParticles && Core.updateParticles(dt); } catch (e){}
      try { Core.updateFloats && Core.updateFloats(dt); } catch (e){}
    }

    if (GS.gameOver){
      GS.running = false; GS._battleActive = false;
      setTimeout(() => { alert('💀 第 ' + GS.currentLevel + ' 关 · 失败\n\n击杀:' + GS.kills + ' 得分:' + GS.score); exitBattle(false); }, 200);
    } else if (GS.gameWon){
      GS.running = false; GS._battleActive = false;
      setTimeout(() => exitBattle(true), 200);
    }

    if (ctx && typeof Core.render === 'function'){
      try { Core.render(ctx); } catch (e){}
    }
    updateBattleUI();
    requestAnimationFrame(battleFrame);
  }

  /* =========================================================
   * 9. 战斗塔栏 —— 滚动显示所有 owned + crafted (无限建造)
   * ========================================================= */
  function buildBattleLoadoutSlots(){
    const container = $('battleLoadoutSlots');
    if (!container) return;
    container.innerHTML = '';

    const TOWERS = window.TOWER_DATA || [];

    // 合并成一个大列表
    const entries = [];
    for (const towerId of (saveData.ownedTowers || [])){
      const td = TOWERS[towerId];
      if (!td) continue;
      entries.push({ kind: 'base', id: towerId, name: td.name, symbol: td.symbol || '🔫', color: td.color, cost: td.cost || 100, _td: td });
    }
    for (const ct of (saveData.craftedTowers || [])){
      const td = TOWERS[ct.baseType];
      entries.push({ kind: 'crafted', id: ct.uid, name: ct.name + ' ✨', symbol: td?.symbol || '🔨', color: td?.color || '#ffd93d', cost: td?.cost || 100, _ct: ct, _baseTd: td });
    }

    if (entries.length === 0){
      container.innerHTML = '<div style="padding:10px;color:#ff5a2a;font-size:11px;text-align:center;">先去商店解锁炮塔!</div>';
      return;
    }

    // 为每个条目创建 slot（横向滚动）
    for (let i = 0; i < entries.length; i++){
      const e = entries[i];
      const div = document.createElement('div');
      div.className = 'battle-slot';
      div.style.cssText = `border-left:3px solid ${e.color};`;
      div.innerHTML = `<div class="battle-tower-chip" style="border-color:${e.color};"><span style="color:${e.color};">${e.symbol}</span><span>${e.name}</span><span class="lv-badge">无限</span></div>`;
      div.onclick = () => {
        pendingPlace = e;
        if (window.AudioFX) AudioFX.play('click');
      };
      container.appendChild(div);
    }
  }

  function placeTowerAt(gx, gy){
    if (!pendingPlace) return false;
    const entry = pendingPlace;
    const TS = Core.TS || 40;
    const x = gx * TS + TS / 2, y = gy * TS + TS / 2;

    // 重叠检测
    if (!Core.canPlaceAt(gx, gy)){
      Core.spawnFloat && Core.spawnFloat(x, y, '❌ 无法放置', '#ff5a2a');
      if (window.AudioFX) AudioFX.play('hurt');
      return false;
    }

    // 局内造价
    const cost = entry.cost || 100;
    if (GS.gold < cost){
      Core.spawnFloat && Core.spawnFloat(x, y, '💰 金币不足 (' + cost + ')', '#ff5a2a');
      if (window.AudioFX) AudioFX.play('hurt');
      return false;
    }
    GS.gold -= cost;

    // 创建临时 tower instance
    const instanceId = 'bt_' + Date.now() + '_' + Math.random().toString(36).slice(2, 5);
    let towerData;
    if (entry.kind === 'base'){
      towerData = entry._td;
    } else {
      // crafted —— 用合成的 stats
      towerData = Object.assign({}, entry._baseTd, entry._ct.stats, { color: entry.color, symbol: entry.symbol, craftedName: entry.name });
    }

    const tower = {
      instanceId,
      type: entry.kind === 'base' ? entry.id : entry._ct.baseType,
      _baseKind: entry.kind,
      _craftedStats: entry._ct ? entry._ct.stats : null,
      gx: x, gy: y, x, y,
      angle: 0, level: 1, cooldown: 0,
      chips: [], kills: 0,
      costAtPlace: cost,
      damage: towerData.damage,
      range: towerData.range,
      fireRate: towerData.fireRate,
      color: towerData.color,
      bulletSpeed: towerData.bulletSpeed,
      pierce: towerData.pierce || 1,
      chain: towerData.chain || 0,
      critChance: towerData.critChance || 0,
      symbol: towerData.symbol,
      element: towerData.element,
      class: towerData.class,
      proto: towerData.proto
    };
    GS.towers.push(tower);
    Core.spawnParticles && Core.spawnParticles(x, y, entry.color, 20, 120, 0.6);
    Core.spawnFloat && Core.spawnFloat(x, y, '+' + entry.name.slice(0, 6), '#ffe27a');
    if (window.AudioFX) AudioFX.play('place');
    return true;
  }

  /* =========================================================
   * 10. Canvas 事件
   * ========================================================= */
  function bindBattleCanvas(){
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
      if (GS.sellMode){
        for (let i = GS.towers.length - 1; i >= 0; i--){
          const t = GS.towers[i];
          if (Math.hypot(t.gx - mx, t.gy - my) < 22){ sellTowerInBattle(t); GS.sellMode = false; return; }
        }
        return;
      }

      // 点击已放塔 → 选中（弹出升级面板）
      for (const t of GS.towers){
        if (Math.hypot(t.gx - mx, t.gy - my) < 22){
          GS.selectedTower = t;
          GS.sellMode = false;
          showTowerPanel(t);
          return;
        }
      }

      // 从塔栏放置
      if (pendingPlace){
        const gx = Math.floor(mx / TS), gy = Math.floor(my / TS);
        if (placeTowerAt(gx, gy)){
          // 成功放置后保留 pendingPlace（可以继续建造同类型！无限建造）
          // 如果想让用户手动取消，可以右键取消
        }
        return;
      }

      GS.selectedTower = null;
      hideTowerPanel();
    });
    canvas.addEventListener('contextmenu', e => {
      e.preventDefault();
      pendingPlace = null; GS.selectedTower = null; GS.sellMode = false;
      hideTowerPanel();
    });
  }

  /* =========================================================
   * 11. 战斗内 tower panel — 升级 / 出售
   * ========================================================= */
  function showTowerPanel(tower){
    // 用 chipPanel 重新展示
    const panel = $('chipPanel');
    if (!panel) return;
    panel.classList.add('show');
    const body = $('chipPanelBody');
    if (!body) return;

    const cost = tower.costAtPlace || 100;
    const upgradeCost = Math.round(cost * 0.8 * tower.level);
    const sellRefund = Math.round(cost * tower.level * 0.6);

    body.innerHTML = `
      <div style="padding:10px;background:#2a3248;border-radius:6px;margin-bottom:8px;">
        <div style="font-size:14px;font-weight:bold;color:${tower.color || '#ffe27a'};margin-bottom:4px;">
          ${tower.symbol || '🔫'} ${tower._baseKind === 'crafted' ? (tower.craftedName || '合成塔') : '炮塔'} · Lv.${tower.level}
        </div>
        <div style="font-size:11px;color:#9aa4bd;">⚔${Math.round(tower.damage * Math.pow(1.15, tower.level - 1))} ◎${Math.round(tower.range)} ⏱${tower.fireRate}s</div>
      </div>
      <div style="display:flex;gap:6px;margin-bottom:8px;">
        <button id="panelUpgradeBtn" class="btn gold" style="flex:1;" ${GS.gold < upgradeCost ? 'disabled' : ''}>⬆ 升级 (${upgradeCost}💰)</button>
        <button id="panelSellBtn" class="btn danger" style="flex:1;">💰 出售 (+${sellRefund}💰)</button>
      </div>
      <div style="font-size:10px;color:#9aa4bd;text-align:center;">升级 → 数值 +15%</div>
    `;

    const upBtn = $('panelUpgradeBtn');
    const sellBtn = $('panelSellBtn');
    if (upBtn) upBtn.onclick = () => upgradeTowerInBattle(tower);
    if (sellBtn) sellBtn.onclick = () => { sellTowerInBattle(tower); hideTowerPanel(); };
  }

  function hideTowerPanel(){
    const panel = $('chipPanel');
    if (panel) panel.classList.remove('show');
  }

  function upgradeTowerInBattle(tower){
    const cost = tower.costAtPlace || 100;
    const upgradeCost = Math.round(cost * 0.8 * tower.level);
    if (GS.gold < upgradeCost){
      Core.spawnFloat && Core.spawnFloat(tower.gx, tower.gy - 10, '💰 金币不足', '#ff5a2a');
      if (window.AudioFX) AudioFX.play('hurt');
      return;
    }
    GS.gold -= upgradeCost;
    tower.level++;
    // 数值提升 15% (简单模型：updateTowers 里 Core.computeTowerStats 会根据 level 加成)
    // 我们同时在 tower 上直接加 damage，让视觉立即体现
    tower.damage = Math.round(tower.damage * 1.15);
    tower.range = Math.round(tower.range * 1.05);

    Core.spawnParticles && Core.spawnParticles(tower.gx, tower.gy, '#ffe27a', 25, 150, 0.7);
    Core.spawnFloat && Core.spawnFloat(tower.gx, tower.gy - 10, '⬆ Lv.' + tower.level, '#ffe27a');
    if (window.AudioFX) AudioFX.play('levelup');

    SaveSystem.save(saveData);
    showTowerPanel(tower);
  }

  function sellTowerInBattle(tower){
    const refund = Math.round((tower.costAtPlace || 100) * tower.level * 0.6);
    GS.gold += refund;
    Core.spawnFloat && Core.spawnFloat(tower.gx, tower.gy - 10, '+' + refund, '#ffe27a');
    Core.spawnParticles && Core.spawnParticles(tower.gx, tower.gy, '#ffe27a', 25, 150, 0.7);
    GS.towers = GS.towers.filter(x => x !== tower);
    if (window.AudioFX) AudioFX.play('coin');
    GS.selectedTower = null;
  }

  /* =========================================================
   * 12. HUD
   * ========================================================= */
  function updateBattleUI(){
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

  function renderMinimap(){
    const mm = $('minimap');
    if (!mm || GS.screen !== 'battle') return;
    const mctx = mm.getContext('2d');
    const W = Core.W || 1100, H = Core.H || 720;
    const sx = 200 / W, sy = 130 / H;
    mctx.fillStyle = '#080c16'; mctx.fillRect(0, 0, 200, 130);
    const theme = GS.levelTheme || { pathColor: '#2a3450', pathBorder: '#1a2030' };
    const path = GS.path || Core.getCurrentPath();
    if (path){
      mctx.strokeStyle = theme.pathBorder; mctx.lineWidth = 4;
      mctx.beginPath(); mctx.moveTo(path[0].x * sx, path[0].y * sy);
      for (let i = 1; i < path.length; i++) mctx.lineTo(path[i].x * sx, path[i].y * sy); mctx.stroke();
      mctx.strokeStyle = theme.pathColor; mctx.lineWidth = 2;
      mctx.beginPath(); mctx.moveTo(path[0].x * sx, path[0].y * sy);
      for (let i = 1; i < path.length; i++) mctx.lineTo(path[i].x * sx, path[i].y * sy); mctx.stroke();
    }
    mctx.fillStyle = '#6ca8ff';
    for (const t of GS.towers) mctx.fillRect(t.gx * sx - 1, t.gy * sy - 1, 3, 3);
    for (const e of GS.enemies){
      mctx.fillStyle = e.isBoss ? '#ff5a2a' : e.isElite ? '#c060ff' : (e.color || '#fff');
      mctx.fillRect(e.x * sx - 1, e.y * sy - 1, 2, 2);
    }
    mctx.fillStyle = '#9aa4bd'; mctx.font = '10px sans-serif';
    mctx.fillText(`塔:${GS.towers.length} 敌:${GS.enemies.length}`, 4, 126);
  }

  /* =========================================================
   * 13. 战斗按钮绑定
   * ========================================================= */
  function bindBattleControls(){
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
    $('btnSell')?.addEventListener('click', () => { GS.sellMode = !GS.sellMode; pendingPlace = null; });
    $('btnRestartLevel')?.addEventListener('click', () => { const n = GS.currentLevel; exitBattle(false); setTimeout(() => enterBattle(n), 50); });
    $('returnHomeBtn')?.addEventListener('click', () => { if (confirm('放弃战斗返回主页？')) { exitBattle(false); } });

    // panel buttons
    $('chipBtnClose')?.addEventListener('click', () => { GS.selectedTower = null; hideTowerPanel(); });
    $('chipBtnInv')?.addEventListener('click', () => { showInventoryModal(); });
    $('chipBtnUpgrade')?.addEventListener('click', () => {
      if (GS.selectedTower) upgradeTowerInBattle(GS.selectedTower);
    });
    $('chipBtnSell')?.addEventListener('click', () => {
      if (GS.selectedTower){ sellTowerInBattle(GS.selectedTower); hideTowerPanel(); }
    });

    // 键盘
    document.addEventListener('keydown', e => {
      if (GS.screen !== 'battle') return;
      if (e.key === 'Escape'){ GS.paused = !GS.paused; pendingPlace = null; hideTowerPanel(); }
      if (e.key === ' '){
        e.preventDefault();
        if (GS.running && !GS.waveInProgress && GS.waveIndex < GS.totalWavesInLevel) $('btnStartWave')?.click();
      }
    });
  }

  /* =========================================================
   * 14. 库存 modal（战斗中也能看 chip 库存）
   * ========================================================= */
  function showInventoryModal(){
    const lib = window.CHIP_LIBRARY || [];
    const invChips = (window.saveData.inventory && window.saveData.inventory.chips) || {};
    const entries = [];
    for (const id in invChips){
      const count = invChips[id];
      const libId = parseInt(id);
      const chip = lib.find(x => x.libraryId === libId);
      if (chip) entries.push({ chip, count });
    }
    if (entries.length === 0){
      alert('芯片库存为空');
      return;
    }
    let overlay = document.getElementById('invModal');
    if (!overlay){
      overlay = document.createElement('div');
      overlay.id = 'invModal';
      overlay.style.cssText = 'position:fixed;inset:0;background:rgba(10,14,22,.95);z-index:9999;display:flex;align-items:center;justify-content:center;';
      overlay.innerHTML = `<div style="width:600px;max-width:95vw;max-height:80vh;background:#1a2234;border:2px solid #2a3248;border-radius:10px;padding:14px;display:flex;flex-direction:column;">
        <div style="display:flex;justify-content:space-between;margin-bottom:8px;">
          <h3 style="color:#ffe27a;margin:0;">⚙ 芯片库存 (${entries.length})</h3>
          <button class="btn" onclick="document.getElementById('invModal').remove()">✕</button>
        </div>
        <div id="invModalBody" style="flex:1;overflow-y:auto;display:grid;grid-template-columns:repeat(auto-fill,minmax(120px,1fr));gap:6px;"></div>
      </div>`;
      document.body.appendChild(overlay);
    }
    const body = document.getElementById('invModalBody');
    let html = '';
    for (const { chip, count } of entries){
      const rc = chip.color || '#9aa4bd';
      html += `<div style="padding:6px;background:#2a3248;border-left:3px solid ${rc};border-radius:0 4px 4px 0;font-size:11px;">
        <span style="color:${rc}">${chip.icon || '⚙'}</span>
        <b style="color:${rc};margin-left:4px;">${chip.name}</b>
        <span style="color:#ffe27a;font-weight:bold;margin-left:6px;">×${count}</span>
      </div>`;
    }
    body.innerHTML = html;
  }

  /* =========================================================
   * 15. 刷新菜单 & 菜单购买
   * ========================================================= */
  function bindShopBuy(){
    const buyBtn = $('buySelectedTowerBtn');
    if (buyBtn){
      buyBtn.addEventListener('click', () => {
        const TOWERS = window.TOWER_DATA || [];
        const td = TOWERS[Shop?.selectedId];
        if (!td) return;
        const price = Shop._towerPrice(td);
        if ((saveData.credits || 0) < price){ alert('积分不足!'); if (window.AudioFX) AudioFX.play('hurt'); return; }
        saveData.credits -= price;
        if (!saveData.ownedTowers) saveData.ownedTowers = [];
        if (!saveData.ownedTowers.includes(td.id)) saveData.ownedTowers.push(td.id);
        SaveSystem.save(saveData);
        if (window.AudioFX) AudioFX.play('coin');
        refreshMenu();
      });
    }
  }

  function refreshMenu(){
    updateMenuCurrency();
    if (Shop && typeof Shop.render === 'function') Shop.render();
    if (ChipSystem && typeof ChipSystem.initMenu === 'function') ChipSystem.initMenu();
    if (currentMenuTab === 'level') renderLevelGrid();
    if (currentMenuTab === 'blacksmith' && window.Blacksmith && typeof Blacksmith.render === 'function') Blacksmith.render();
  }

  function updateMenuCurrency(){
    const set = (id, v) => { const el = $(id); if (el) el.textContent = String(v); };
    set('statGold', saveData.credits || 0);
    set('statTotalOwned', (saveData.ownedTowers || []).length + (saveData.craftedTowers || []).length);
    // 统计芯片总数
    let chipCount = 0;
    if (saveData.inventory && saveData.inventory.chips){
      for (const k in saveData.inventory.chips) chipCount += saveData.inventory.chips[k];
    }
    set('statChips', chipCount);
    set('statHighestLevel', saveData.unlockedLevel || 1);
  }

  /* =========================================================
   * 16. DOM Ready
   * ========================================================= */
  document.addEventListener('DOMContentLoaded', () => {
    if (canvas){ canvas.width = Core.W || 1100; canvas.height = Core.H || 720; }
    const firstLevel = (window.LEVELS || [])[0];
    if (firstLevel){ Core.setLevel(firstLevel); GS.path = firstLevel.path; }

    GS.screen = 'menu';
    $('menuScreen')?.classList.remove('hidden');
    $('battleScreen')?.classList.add('hidden');

    // Shop init
    if (Shop && typeof Shop.init === 'function') Shop.init($('shopContainer'));
    if (ChipSystem && typeof ChipSystem.initMenu === 'function') ChipSystem.initMenu();
    // Blacksmith init
    if (window.Blacksmith && typeof Blacksmith.init === 'function') window.Blacksmith.init(document.getElementById('blacksmithSection'));

    bindMenuTabs();
    bindShopBuy();
    bindBattleCanvas();
    bindBattleControls();
    switchMenuTab('shop');

    document.addEventListener('tdf:currency-changed', updateMenuCurrency);
    setInterval(() => { if (GS.screen === 'battle' && GS.running) SaveSystem.save(saveData); }, 5000);
    setInterval(() => { if (window.AchievementSystem) AchievementSystem.checkAll(); }, 10000);

    updateMenuCurrency();
    $('overlay')?.classList.add('hidden');

    // 外部页面跳转 pending level
    const pending = sessionStorage.getItem('tdf_pendingLevel');
    if (pending){
      sessionStorage.removeItem('tdf_pendingLevel');
      const pendingN = parseInt(pending);
      const UL = saveData.unlockedLevel || 1;
      if (!isNaN(pendingN) && pendingN >= 1 && pendingN <= (window.LEVEL_COUNT || 500) && pendingN <= UL){
        setTimeout(() => enterBattle(pendingN), 50);
        return;
      }
    }

    console.log('✅ Main.js v2 ready');
    console.log('📊 存档: credits=%d owned=%d crafted=%d chipTypes=%d',
      saveData.credits || 0,
      (saveData.ownedTowers || []).length,
      (saveData.craftedTowers || []).length,
      Object.keys((saveData.inventory && saveData.inventory.chips) || {}).length);
  });

  window.enterBattle = enterBattle;
  window.exitBattle = exitBattle;
  window.isOnPath = function (px, py){ return Core.isOnPath(px, py); };
  window.buildWave = buildWave;

})();
