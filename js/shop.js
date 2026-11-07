/* Shop v4 — credits + 解锁炮塔 + chip inventory 计数 + 保底稀有度
   炮塔：买一次永久解锁 (ownedTowers.push(towerId))，战斗里可无限次建造
   芯片：重复购买增加 inventory.chips[libraryId] 的 count
*/
window.Shop = {
  ready: false,
  refreshCost: 50,
  slotList: [],                 // [{towerData, key}] (12)
  chipSlotList: [],             // [{chip, key}] (12)
  rarityWeights: { '普通': 55, '稀有': 25, '史诗': 13, '传奇': 5, '神话': 2 },
  rarityFilter: null,
  _TIER_ORDER: ['普通', '稀有', '史诗', '传奇', '神话'],

  // === 芯片价格（按稀有度固定） ===
  CHIP_PRICE: { '普通': 480, '稀有': 1000, '史诗': 1800, '传奇': 3200, '神话': 6000 },

  /* ============ 初始化 ============ */
  init(containerEl){
    this.containerEl = containerEl;
    if (this._isJsonReady()){
      this.rollSlots(true);
      this.rollChipSlots(true);
    }
    this.render();
  },
  _isJsonReady(){ return !!((window.TOWER_DATA || []).length > 0 && (window.TOWER_DATA[0]._jsonLoaded !== false)); },
  notifyDataReady(){
    this.ready = true;
    this.rollSlots(true);
    this.rollChipSlots(true);
    this.render();
  },

  /* ============ 加权辅助 ============ */
  _weightedPick(items, weights, weightKey){
    if (!items || items.length === 0) return null;
    const totalW = items.reduce((s, it) => s + (weights[it[weightKey]] || 0), 0);
    if (totalW <= 0) return items[Math.floor(Math.random() * items.length)];
    let r = Math.random() * totalW;
    for (const it of items){ r -= (weights[it[weightKey]] || 0); if (r <= 0) return it; }
    return items[items.length - 1];
  },
  _rarityFilterInfo(){
    const tier = this.rarityFilter === '传奇+' ? '传奇' : this.rarityFilter === '史诗+' ? '史诗' : null;
    return tier ? { tier, idx: this._TIER_ORDER.indexOf(tier) } : null;
  },
  _passesRarityFilter(item, rarityKey){
    const f = this._rarityFilterInfo();
    if (!f) return true;
    return this._TIER_ORDER.indexOf(item[rarityKey]) >= f.idx;
  },
  _rollUnique(list, weightKey, idKey, slotMaker){
    if (!list || list.length === 0) return [];
    const W = this.rarityWeights;
    const used = new Set();
    const out = [];
    for (let pass = 0; pass < 2 && out.length < 12; pass++){
      let safety = 0;
      while (out.length < 12 && safety++ < 2000){
        const pick = this._weightedPick(list, W, weightKey);
        if (!pick || used.has(pick[idKey])) continue;
        if (pass === 0 && !this._passesRarityFilter(pick, weightKey)) continue;
        used.add(pick[idKey]);
        out.push(slotMaker(pick, out.length));
      }
    }
    return out;
  },

  /* ============ 强制保底的芯片抽取 ============ */
  _rollChipsWithGuarantee(){
    const lib = window.CHIP_LIBRARY || [];
    if (lib.length === 0) return [];
    const result = [];
    const used = new Set();

    // 先抽保底 1 史诗 + 1 稀有（从高到低）
    const guarantee = [
      { tier: '史诗+', count: 1 },   // 至少史诗级
      { tier: '稀有+', count: 1 },   // 至少稀有级（可以和上面同一张，但要不同）
    ];
    for (const g of guarantee){
      const minIdx = this._TIER_ORDER.indexOf(g.tier === '史诗+' ? '史诗' : '稀有');
      const pool = lib.filter(c => {
        const ri = this._TIER_ORDER.indexOf(c.rarityName || c.rarity || '普通');
        return ri >= minIdx && !used.has(c.libraryId);
      });
      if (pool.length === 0) continue;
      const pick = pool[Math.floor(Math.random() * pool.length)];
      used.add(pick.libraryId);
      result.push({ chip: pick, key: `c_${pick.libraryId}_${Date.now()}_guar_${g.tier}` });
    }

    // 剩下来的用权重随机
    const weights = this.rarityWeights;
    while (result.length < 12){
      let safety = 0;
      while (safety++ < 2000){
        const pick = this._weightedPick(lib, weights, 'rarityName');
        if (!pick || used.has(pick.libraryId)) continue;
        used.add(pick.libraryId);
        result.push({ chip: pick, key: `c_${pick.libraryId}_${Date.now()}_${result.length}` });
        break;
      }
      if (safety >= 2000) break;
    }
    return result;
  },

  /* ============ 价格 ============ */
  _chipCost(c){
    const rarity = c.rarityName || c.rarity || '普通';
    return this.CHIP_PRICE[rarity] || 480;
  },
  _towerPrice(t){
    // 炮塔解锁价：按稀有度阶梯
    const rarity = t.rarity || '普通';
    const tierMult = ({ '普通': 1, '稀有': 3, '史诗': 8, '传奇': 20, '神话': 60 })[rarity] || 1;
    const base = Math.max(100, (t.cost || 100));
    return Math.round(base * tierMult);
  },

  /* ============ 随机生成 ============ */
  rollSlots(firstLoad){
    this.slotList = this._rollUnique(
      window.TOWER_DATA || [], 'rarity', 'id',
      (t, i) => ({ towerData: t, key: `t_${t.id}_${Date.now()}_${i}` })
    );
    if (!firstLoad && window.AudioFX) AudioFX.play('chip');
  },
  rollChipSlots(firstLoad){
    this.chipSlotList = this._rollChipsWithGuarantee();
    if (!firstLoad && window.AudioFX) AudioFX.play('chip');
  },

  /* ============ 刷新 ============ */
  refreshAll(){
    const credits = (window.saveData && window.saveData.credits) ?? 0;
    if (credits < this.refreshCost){
      this._showToast('重刷需要 ' + this.refreshCost + ' 积分!', '#ff5a2a');
      if (window.AudioFX) AudioFX.play('hurt');
      return;
    }
    window.saveData.credits -= this.refreshCost;
    this.rollSlots();
    this.rollChipSlots();
    this.render();
    this._showToast('🔄 商店已重刷! (-' + this.refreshCost + ' 积分)', '#ffe27a');
  },
  toggleRarityFilter(level){
    this.rarityFilter = level || null;
    this.render();
  },

  /* ============ 渲染 ============ */
  render(){
    const el = this.containerEl;
    if (!el) return;
    if (!this.ready && !this._isJsonReady()){
      el.innerHTML = `
        <div style="display:flex;flex-direction:column;align-items:center;justify-content:center;min-height:400px;color:#ffe27a;gap:16px;">
          <div style="font-size:48px;animation:shopPulse 1.5s infinite;">⏳</div>
          <div style="font-size:18px;">正在加载 JSON 数据...</div>
          <div style="font-size:13px;opacity:0.6">首次进入请稍候，完整炮塔/芯片数据来自 JSON 文件</div>
        </div>
        <style>@keyframes shopPulse{0%,100%{opacity:0.4}50%{opacity:1}}</style>`;
      return;
    }
    if (!this.ready) this.ready = true;

    const credits = (window.saveData && window.saveData.credits) ?? 0;
    const ownedSet = new Set(window.saveData.ownedTowers || []);
    const invChips = (window.saveData.inventory && window.saveData.inventory.chips) || {};

    const filt = this.rarityFilter;
    const filterBtns = [
      { label: '全部', val: null, active: filt === null },
      { label: '只看史诗+', val: '史诗+', active: filt === '史诗+' },
      { label: '只看传奇+', val: '传奇+', active: filt === '传奇+' },
    ].map(b => {
      const v = b.val === null ? 'null' : `'${b.val}'`;
      return `<button class="btn ${b.active ? 'gold' : ''}" onclick="Shop.toggleRarityFilter(${v})">${b.label}</button>`;
    }).join('');

    let html = `
      <div class="shop-header">
        <div class="shop-title">🏪 炮塔商店 · 积分 <span style="font-size:12px;opacity:0.6;font-weight:normal">解锁制 + 芯片堆叠</span></div>
        <div class="shop-gold">💎 ${credits}</div>
      </div>
      <div class="shop-roll-bar">
        <button class="btn gold" onclick="Shop.refreshAll()">🔄 重刷商店 (-${this.refreshCost}💎)</button>
        <span style="margin:0 8px;color:#9aa4bd;font-size:13px">稀有度:</span>
        ${filterBtns}
        <button class="btn" style="margin-left:auto" onclick="Shop.openCodex()">📖 图鉴</button>
      </div>
      <div class="shop-section">
        <div class="shop-section-title">🔫 炮塔 (12/轮) · 永久解锁，战斗无限建造</div>
        <div class="shop-grid shop-tower-grid">`;

    if (this.slotList.length === 0) html += '<div style="padding:40px;text-align:center;opacity:0.5">无炮塔数据</div>';
    for (const slot of this.slotList) html += this._towerCard(slot.towerData, credits, ownedSet);

    html += `</div></div>
      <div class="shop-section">
        <div class="shop-section-title">⚙ 芯片 (12/轮) · 保底1史诗+1稀有 · 价格 普480/稀1000/史1800/传3200/神6000</div>
        <div class="shop-grid shop-chip-grid">`;

    if (this.chipSlotList.length === 0) html += '<div style="padding:40px;text-align:center;opacity:0.5">无芯片数据</div>';
    for (const slot of this.chipSlotList) html += this._chipCard(slot.chip, credits, invChips);

    html += `</div></div>`;
    el.innerHTML = html;

    // 画 Canvas 预览
    setTimeout(() => this._paintShopCanvases(), 0);
  },

  _paintShopCanvases(){
    if (!window.Core) return;
    for (const slot of this.slotList){
      const t = slot.towerData;
      const cv = document.getElementById('shop_tower_' + t.id);
      if (!cv) continue;
      const ctx = cv.getContext('2d');
      ctx.clearRect(0, 0, cv.width, cv.height);
      const fake = Core.makeCodexTowerPreview ? Core.makeCodexTowerPreview(t, cv.width / 2, cv.height / 2) : { type: t.id, x: cv.width / 2, y: cv.height / 2, angle: 0, level: 1, chips: [] };
      Core.drawTower(ctx, fake);
    }
    for (const slot of this.chipSlotList){
      const c = slot.chip;
      const cv = document.getElementById('shop_chip_' + c.libraryId);
      if (!cv) continue;
      const ctx = cv.getContext('2d');
      ctx.clearRect(0, 0, cv.width, cv.height);
      Core.drawChip ? Core.drawChip(ctx, c, cv.width / 2, cv.height / 2, cv.width / 2) : null;
    }
  },

  _towerCard(t, credits, ownedSet){
    const price = this._towerPrice(t);
    const owned = ownedSet.has(t.id);
    const canBuy = !owned && credits >= price;
    return `<div class="shop-card tower-slot" style="border-color:${t.color}40;border-left:4px solid ${t.color};${!canBuy ? 'opacity:0.6' : ''}">
      <div class="card-header" style="background:linear-gradient(135deg, ${t.color}30, transparent);">
        <canvas width="48" height="48" id="shop_tower_${t.id}" style="background:#0d111c;border-radius:6px;border:1px solid ${t.color}50"></canvas>
        <span class="card-rarity-tag" style="color:${t.glow || t.color}">${t.rarity || '普通'}</span>
      </div>
      <div class="card-name">${t.name}</div>
      <div class="card-sub">${t.class || ''} · ${t.element || ''}</div>
      <div class="card-stats"><span>⚔${t.damage}</span><span>◎${Math.round(t.range)}</span><span>⏱${t.fireRate}s</span></div>
      <div class="card-bottom">
        ${owned
          ? `<span class="card-owned" style="color:#6bff6b;">✓ 已永久解锁</span>`
          : `<span class="card-cost" style="color:${credits >= price ? '#ffe27a' : '#ff5a2a'}">💎${price}</span>
             <button class="buy-btn btn gold" ${!canBuy ? 'disabled' : ''} onclick="Shop._doBuyTower(${t.id})">${canBuy ? '解锁' : (credits < price ? '积分不足' : '已解锁')}</button>`}
      </div>
      <div class="card-desc">${(t.skillName || t.name) + ' · ' + (t.skillDesc || '')}</div>
    </div>`;
  },

  _chipCard(c, credits, invChips){
    const chipCost = this._chipCost(c);
    const canBuy = credits >= chipCost;
    const have = invChips[c.libraryId] || 0;
    const rc = c.color || '#9aa4bd';
    return `<div class="shop-card chip-slot" style="border-color:${rc}40;border-left:4px solid ${rc};${!canBuy ? 'opacity:0.6' : ''}">
      <div class="card-header" style="background:linear-gradient(135deg, ${rc}30, transparent);">
        <canvas width="48" height="48" id="shop_chip_${c.libraryId}" style="background:#0d111c;border-radius:6px;border:1px solid ${rc}50"></canvas>
        <span class="card-rarity-tag" style="color:${rc}">${c.rarityName || c.rarity}</span>
      </div>
      <div class="card-name" style="color:${rc}">${c.name}</div>
      <div class="card-sub">${c.slot || ''} · ${c.statName || c.statField || ''} Lv.${c.level}</div>
      <div class="card-value"><span style="color:${rc}">${c.statCn || c.statField || ''}</span><span>= ${c.value}${c.unit || ''}</span></div>
      <div class="card-bottom">
        <span class="card-cost" style="color:${canBuy ? '#ffe27a' : '#ff5a2a'}">💎${chipCost}</span>
        <span class="card-owned" style="color:${rc}">持有×${have}</span>
        <button class="buy-btn btn gold" ${!canBuy ? 'disabled' : ''} onclick="Shop._doBuyChip(${c.libraryId})">${canBuy ? '购买+1' : '积分不足'}</button>
      </div>
      ${c.nestedSlots > 0 ? `<div class="card-desc">🌲 嵌套槽 ×${c.nestedSlots}</div>` : ''}
    </div>`;
  },

  /* ============ 购买执行 ============ */
  _doBuyTower(towerId){
    const t = (window.TOWER_DATA || [])[towerId];
    if (!t) return;
    const owned = new Set(window.saveData.ownedTowers || []);
    if (owned.has(towerId)){
      this._showToast('已解锁!', '#ffe27a');
      return;
    }
    const price = this._towerPrice(t);
    const credits = window.saveData.credits ?? 0;
    if (credits < price){
      if (window.Core) Core.spawnFloat && Core.spawnFloat(window.innerWidth / 2, 200, '积分不足!', '#ff5a2a');
      if (window.AudioFX) AudioFX.play('hurt');
      return;
    }
    window.saveData.credits -= price;
    if (!window.saveData.ownedTowers) window.saveData.ownedTowers = [];
    window.saveData.ownedTowers.push(towerId);
    SaveSystem.save(window.saveData);
    if (window.AudioFX){ AudioFX.play('coin'); AudioFX.play('levelup'); }
    this.render();
    this._showToast('🎉 解锁成功: ' + t.name, '#6bff6b');
  },

  _doBuyChip(libraryId){
    const c = (window.CHIP_LIBRARY || []).find(x => x.libraryId === libraryId);
    if (!c) return;
    const chipCost = this._chipCost(c);
    const credits = window.saveData.credits ?? 0;
    if (credits < chipCost){
      if (window.Core) Core.spawnFloat && Core.spawnFloat(window.innerWidth / 2, 200, '积分不足!', '#ff5a2a');
      if (window.AudioFX) AudioFX.play('hurt');
      return;
    }
    window.saveData.credits -= chipCost;
    window.addChipToInventory(libraryId, 1);
    SaveSystem.save(window.saveData);
    if (window.AudioFX) AudioFX.play('chip');
    this.render();
    this._showToast('⚙ +1 芯片: ' + c.name, c.color || '#ffe27a');
  },

  /* ============ Toast ============ */
  _showToast(text, color){
    const t = document.createElement('div');
    t.className = 'ach-toast';
    t.innerHTML = `<div class="ach-name" style="color:${color}">${text}</div>`;
    const c = document.getElementById('achToastContainer');
    if (c) c.appendChild(t);
    else { document.body.appendChild(t); t.style.cssText = 'position:fixed;top:80px;right:20px;z-index:500;'; }
    setTimeout(() => { t.style.animation = 'slideOut .5s forwards'; setTimeout(() => t.remove(), 500); }, 2500);
  },

  /* ============ 图鉴 Codex（保留旧实现） ============ */
  openCodex(){
    let overlay = document.getElementById('codexOverlay');
    if (!overlay){
      overlay = document.createElement('div');
      overlay.id = 'codexOverlay';
      overlay.style.cssText = 'position:fixed;inset:0;background:rgba(10,14,22,0.95);z-index:9999;display:flex;flex-direction:column;padding:20px;color:#e8ecf4;overflow:hidden;';
      overlay.innerHTML = `
        <style>
        .codex-canvas-card { border: 2px solid rgba(255,255,255,0.1); border-radius: 10px; padding: 8px; background: linear-gradient(145deg, #131928, #0d111c); transition: transform .15s ease, box-shadow .15s ease; cursor: pointer; position: relative; text-align: center; }
        .codex-canvas-card:hover { transform: translateY(-3px); box-shadow: 0 6px 18px rgba(108,168,255,0.25); border-color: var(--accent, #6ca8ff); }
        .codex-canvas-card canvas { display: block; margin: 0 auto 6px; }
        .codex-canvas-card .cd-name { font-weight: bold; font-size: 12px; color: #e8ecf4; }
        .codex-canvas-card .cd-sub { font-size: 10px; color: #9aa4bd; margin: 2px 0; }
        .codex-canvas-card .cd-stats { font-size: 10px; color: #c8d0e0; }
        .codex-canvas-card .cd-rarity { position: absolute; top: 4px; right: 6px; font-size: 9px; font-weight: bold; padding: 1px 4px; background: rgba(0,0,0,0.5); border-radius: 4px; }
        </style>
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;">
          <h2 style="margin:0;color:#ffe27a;font-size:22px">📖 图鉴 Codex</h2>
          <button class="btn gold" onclick="Shop.closeCodex()">关闭图鉴</button>
        </div>
        <div id="codexTabs" style="display:flex;gap:6px;margin-bottom:10px;flex-wrap:wrap"></div>
        <div id="codexBody" style="flex:1;overflow:auto;padding:8px;border:1px solid #2a3248;border-radius:8px;background:#111827"></div>
        <div id="codexDetail" style="position:fixed;inset:0;background:rgba(10,14,22,0.98);z-index:10000;display:none;align-items:center;justify-content:center" onclick="if(event.target===this)Shop.closeCodexDetail()">
          <div id="codexDetailPanel" style="max-width:600px;width:90%;max-height:85vh;overflow:auto;background:#1a2234;border:2px solid #ffe27a;border-radius:12px;padding:20px"></div>
        </div>`;
      document.body.appendChild(overlay);
    }
    overlay.style.display = 'flex';
    this._codexActiveTab = this._codexActiveTab || 'tower';
    this._renderCodex();
  },
  closeCodex(){
    const o = document.getElementById('codexOverlay');
    if (o) o.style.display = 'none';
    if (this._codexRafIds) this._codexRafIds.forEach(id => cancelAnimationFrame(id));
    this._codexRafIds = [];
  },
  closeCodexDetail(){
    const d = document.getElementById('codexDetail');
    if (d) d.style.display = 'none';
    if (this._codexDetailRaf) cancelAnimationFrame(this._codexDetailRaf);
    this._codexDetailRaf = null;
  },
  _switchCodexTab(t){ this._codexActiveTab = t; this._renderCodex(); },

  _CODEX_TABS: null,
  _getCodexTabs(){
    if (this._CODEX_TABS) return this._CODEX_TABS;
    this._CODEX_TABS = [
      { key: 'tower', label: '🔫 炮塔',    dataSrc: 'TOWER_DATA',   array: window.TOWER_DATA },
      { key: 'enemy', label: '👾 敌人',    dataSrc: 'ENEMY_DATA',   array: window.ENEMY_DATA },
      { key: 'elite', label: '💀 精英',    dataSrc: 'ELITE_DATA',   array: window.ELITE_DATA },
      { key: 'chip',  label: '⚙ 芯片',    dataSrc: 'CHIP_LIBRARY', array: window.CHIP_LIBRARY },
    ];
    return this._CODEX_TABS;
  },

  _renderCodex(){
    const tabs = this._getCodexTabs().map(t => ({ ...t, array: window[t.dataSrc] || [] }));
    const tabsEl = document.getElementById('codexTabs');
    let tabsHtml = '';
    for (const t of tabs){
      const active = this._codexActiveTab === t.key;
      tabsHtml += `<button class="btn ${active ? 'gold' : ''}" onclick="Shop._switchCodexTab('${t.key}')">${t.label} <span style="opacity:0.6">(${t.array.length})</span></button>`;
    }
    tabsEl.innerHTML = tabsHtml;

    const bodyEl = document.getElementById('codexBody');
    const tab = tabs.find(t => t.key === this._codexActiveTab);
    if (this._codexRafIds) this._codexRafIds.forEach(id => cancelAnimationFrame(id));
    this._codexRafIds = [];
    if (!tab || tab.array.length === 0){
      bodyEl.innerHTML = '<div style="padding:40px;text-align:center;opacity:0.5">数据未加载，请稍候</div>';
      return;
    }
    bodyEl.innerHTML = this._codexGrid(tab);
    this._paintCodexCanvases(tab.key, tab.array);
  },

  _codexGrid(tab){
    let cards = '';
    for (const item of tab.array) cards += this._codexCard(tab.key, item);
    return `<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(180px,1fr));gap:10px;padding:10px">${cards}</div>`;
  },

  _codexCard(tabKey, item){
    let name, sub, rarity, rarityColor, stats, refObj, refId;
    if (tabKey === 'tower'){
      name = item.name || '???'; sub = `${item.class || ''} · ${item.element || ''}`;
      rarity = item.rarity || '普通'; rarityColor = item.glow || item.color || '#9aa4bd';
      stats = `⚔${item.damage} · ◎${item.range} · ⏱${item.fireRate}s · 💰${item.cost}`;
      refObj = 'TOWER_DATA'; refId = item.id;
    } else if (tabKey === 'enemy' || tabKey === 'elite'){
      name = item.name || '???'; sub = `${item.rank || ''} · ${item.movement || ''} · ${item.trait || ''}`;
      rarity = tabKey === 'elite' ? (item.isBoss ? '首领' : '精英') : (item.isBoss ? '首领' : item.rank || '杂兵');
      rarityColor = item.color || '#c060ff';
      stats = `❤️${item.baseHp} · 🏃${item.speed} · 🛡${Math.round((item.armor || 0) * 100)}% · 💰${item.gold}`;
      refObj = tabKey === 'elite' ? 'ELITE_DATA' : 'ENEMY_DATA'; refId = item.id;
    } else {
      name = item.name || '???'; sub = `${item.slot || ''} · Lv.${item.level || ''}`;
      rarity = item.rarityName || item.rarity || '普通'; rarityColor = item.color || '#9aa4bd';
      stats = `${item.statCn || item.statField || ''}=${item.value || ''}${item.unit || ''}${item.nestedSlots > 0 ? ' · 🌲×' + item.nestedSlots : ''}`;
      refObj = 'CHIP_LIBRARY'; refId = item.libraryId;
    }
    return `<div class="codex-canvas-card" onclick="Shop._showCodexDetail('${refObj}', ${refId}, '${tabKey}')">
      <canvas width="80" height="80" id="cx_${tabKey}_${refId}"></canvas>
      <span class="cd-rarity" style="color:${rarityColor}">${rarity}</span>
      <div class="cd-info">
        <div class="cd-name">${name}</div>
        <div class="cd-sub">${sub}</div>
        <div class="cd-stats">${stats}</div>
      </div>
    </div>`;
  },

  _paintCodexCanvases(tabKey, array){
    if (this._codexRafIds) this._codexRafIds.forEach(id => cancelAnimationFrame(id));
    this._codexRafIds = [];
    const self = this;
    const tasks = array.map(item => {
      let refId;
      if (tabKey === 'tower') refId = item.id;
      else if (tabKey === 'enemy' || tabKey === 'elite') refId = item.id;
      else refId = item.libraryId;
      const canvasId = 'cx_' + tabKey + '_' + refId;
      const canvas = document.getElementById(canvasId);
      if (!canvas) return null;
      const ctx = canvas.getContext('2d');
      return { ctx, tabKey, item };
    }).filter(Boolean);

    function drawAll(){
      for (const t of tasks){
        const { ctx, tabKey, item } = t;
        ctx.clearRect(0, 0, 80, 80);
        if (tabKey === 'tower'){
          var fakeTower = Core.makeCodexTowerPreview(item, 40, 40);
          Core.drawTower(ctx, fakeTower);
        } else if (tabKey === 'enemy' || tabKey === 'elite'){
          var fakeEnemy = Core.makeCodexEnemyPreview(item, 40, 40, 22);
          Core.drawEnemy(ctx, fakeEnemy);
        } else if (tabKey === 'chip'){
          Core.drawChip(ctx, item, 40, 40, 40);
        }
      }
      self._codexRafIds.push(requestAnimationFrame(drawAll));
    }
    self._codexRafIds.push(requestAnimationFrame(drawAll));
  },

  _kvs(kvs){
    return kvs.map(([label, value]) =>
      `<tr><td style="padding:4px;color:#9aa4bd;width:110px">${label}</td><td>${value}</td></tr>`
    ).join('');
  },

  _showCodexDetail(refObj, refId, tabKey){
    const list = window[refObj];
    const item = list ? list[refId] : null;
    if (!item) return;
    let html = `<button class="btn" style="float:right" onclick="Shop.closeCodexDetail()">✕ 关闭</button>`;
    html += `<canvas id='codexDetailCanvas' width="180" height="180" style="display:block;margin:0 auto 12px;background:#0d111c;border-radius:8px;border:1px solid #2a3248"></canvas>`;
    html += `<h2 style="margin:0 0 8px;color:${item.color || item.glow || '#ffe27a'};text-align:center">${item.name || '???'}</h2>`;
    html += `<div style="opacity:0.6;font-size:13px;margin-bottom:12px;text-align:center">ID: ${item.id ?? item.libraryId ?? '?'}</div>`;

    let tableHtml = '';
    if (tabKey === 'tower'){
      tableHtml = this._kvs([
        ['类型/类别', `${item.class} · ${item.element}`],
        ['稀有度', `<span style="color:${item.glow}">${item.rarity}</span>`],
        ['伤害/射程', `⚔${item.damage} · ◎${item.range}`],
        ['射速/弹道', `⏱${item.fireRate}s · 💨${item.bulletSpeed}`],
        ['造价', `💰${item.cost}`],
      ]);
    } else if (tabKey === 'enemy' || tabKey === 'elite'){
      tableHtml = this._kvs([
        ['等级/移动', `${item.rank} · ${item.movement}`],
        ['生命值/速度', `❤️${item.baseHp} · 🏃${item.speed}`],
        ['护甲/赏金', `🛡${Math.round((item.armor || 0) * 100)}% · 💰${item.gold}`],
      ]);
    } else {
      tableHtml = this._kvs([
        ['槽位/等级', `${item.slot} · Lv.${item.level} ${item.levelLabel || ''}`],
        ['稀有度', `<span style="color:${item.color}">${item.rarityName || item.rarity}</span>`],
        ['效果/数值', `${item.statCn || item.statField} = ${item.value}${item.unit || ''}`],
        ['商店价格', `💎${this._chipCost(item)}`],
      ]);
    }
    html += `<table style="width:100%;font-size:13px;border-collapse:collapse;margin-bottom:12px">${tableHtml}</table>`;
    if (item.skillName){
      html += `<div style="padding:10px;background:#2a3248;border-radius:6px;margin-bottom:8px"><b style="color:${item.glow}">✨ ${item.skillName}</b><div style="margin-top:4px;font-size:12px;color:#c8d0e0">${item.skillDesc || ''}</div></div>`;
    }
    if (item.desc) html += `<div style="font-size:12px;color:#9aa4bd">${item.desc}</div>`;

    document.getElementById('codexDetailPanel').innerHTML = html;
    document.getElementById('codexDetail').style.display = 'flex';
    const dc = document.getElementById('codexDetailCanvas');
    if (dc && window.Core){
      const dctx = dc.getContext('2d');
      dctx.clearRect(0, 0, 180, 180);
      if (tabKey === 'tower'){
        Core.drawTower(dctx, Core.makeCodexTowerPreview(item, 90, 90));
      } else if (tabKey === 'chip'){
        Core.drawChip(dctx, item, 90, 90, 80);
      } else {
        Core.drawEnemy(dctx, Core.makeCodexEnemyPreview(item, 90, 90, 40));
      }
    }
  }
};
console.log('Shop v4 ready — credits + unlock + chip counting + rarity guarantee');
