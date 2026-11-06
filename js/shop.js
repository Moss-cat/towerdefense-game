/* Shop v3 — 双屏架构 · 加权随机 · 图鉴浏览 · ready 标志 */
window.Shop = {
  ready: false,
  refreshCost: 50,
  slotList: [],                 // [{towerData, key}] (12)
  chipSlotList: [],             // [{chip, key}] (12)
  rarityWeights: { '普通':40, '稀有':25, '史诗':18, '传奇':12, '神话':5 },
  rarityFilter: null,           // null | '史诗+' | '传奇+'
  _TIER_ORDER: ['普通','稀有','史诗','传奇','神话'],

  /* ============ 初始化 ============ */
  init(containerEl){
    this.containerEl = containerEl;
    this.loadFromSave();
    if(this._isJsonReady()){ this.rollSlots(true); this.rollChipSlots(true); }
    this.render();
  },
  _isJsonReady(){ return !!((window.TOWER_DATA||[])[0] && (window.TOWER_DATA[0]._jsonLoaded)); },
  notifyDataReady(){
    if(this.ready) return;
    this.ready = true;
    this.rollSlots(true); this.rollChipSlots(true); this.render();
  },
  loadFromSave(){
    const s = (window.saveData && window.saveData.shopSlots) || null;
    if(s && s.towers) this.slotList = s.towers;
    if(s && s.chips)  this.chipSlotList = s.chips;
  },
  persistSlots(){
    if(!window.saveData || !window.SaveSystem) return;
    window.saveData.shopSlots = { towers: this.slotList, chips: this.chipSlotList };
    SaveSystem.save(window.saveData);
  },

  /* ============ 加权辅助 ============ */
  _weightedPick(items, weights, weightKey){
    if(!items || items.length === 0) return null;
    const totalW = items.reduce((s,it)=>s + (weights[it[weightKey]]||0), 0);
    if(totalW <= 0) return items[Math.floor(Math.random()*items.length)];
    let r = Math.random() * totalW;
    for(const it of items){ r -= (weights[it[weightKey]]||0); if(r<=0) return it; }
    return items[items.length-1];
  },
  _rarityFilterInfo(){
    const tier = this.rarityFilter==='传奇+' ? '传奇' : this.rarityFilter==='史诗+' ? '史诗' : null;
    return tier ? { tier, idx: this._TIER_ORDER.indexOf(tier) } : null;
  },
  _passesRarityFilter(item, rarityKey){
    const f = this._rarityFilterInfo();
    if(!f) return true;
    return this._TIER_ORDER.indexOf(item[rarityKey]) >= f.idx;
  },
  _rollUnique(list, weightKey, idKey, slotMaker){
    if(!list || list.length===0) return [];
    const W = this.rarityWeights;
    const used = new Set();
    const out = [];
    // 第一轮带 rarity filter
    for(let pass=0; pass<2 && out.length<12; pass++){
      let safety = 0;
      while(out.length<12 && safety++<2000){
        const pick = this._weightedPick(list, W, weightKey);
        if(!pick || used.has(pick[idKey])) continue;
        if(pass===0 && !this._passesRarityFilter(pick, weightKey)) continue;
        used.add(pick[idKey]);
        out.push(slotMaker(pick, out.length));
      }
    }
    return out;
  },
  _chipCost(c){
    const rarity = c.rarityName || c.rarity || '普通';
    const mult = ({'普通':12,'稀有':22,'史诗':38,'传奇':60,'神话':100})[rarity] || 12;
    return Math.round( (c.value || 10) * mult );
  },

  /* ============ 随机生成 ============ */
  rollSlots(firstLoad=false){
    this.slotList = this._rollUnique(
      window.TOWER_DATA || [], 'rarity', 'id',
      (t,i) => ({ towerData:t, key:`t_${t.id}_${Date.now()}_${i}` })
    );
    if(!firstLoad && window.AudioFX) AudioFX.play('chip');
  },
  rollChipSlots(firstLoad=false){
    this.chipSlotList = this._rollUnique(
      window.CHIP_LIBRARY || [], 'rarityName', 'libraryId',
      (c,i) => ({ chip:c, key:`c_${c.libraryId}_${Date.now()}_${i}` })
    );
    if(!firstLoad && window.AudioFX) AudioFX.play('chip');
  },

  /* ============ 刷新 + 稀有度过滤 ============ */
  refreshAll(){
    const gold = (window.saveData && window.saveData.gold) ?? 0;
    if(gold < this.refreshCost){
      this._showToast('重刷需要 ' + this.refreshCost + ' 金币!', '#ff5a2a');
      if(window.AudioFX) AudioFX.play('hurt');
      return;
    }
    window.saveData.gold -= this.refreshCost;
    this.rollSlots(); this.rollChipSlots(); this.render();
    this._showToast('🔄 商店已重刷! (-' + this.refreshCost + '💰)', '#ffe27a');
  },
  toggleRarityFilter(level){
    this.rarityFilter = level || null;
    this.render();
  },

  /* ============ 渲染 ============ */
  render(){
    const el = this.containerEl;
    if(!el) return;
    if(!this.ready && !this._isJsonReady()){
      el.innerHTML = `
        <div style="display:flex;flex-direction:column;align-items:center;justify-content:center;min-height:400px;color:#ffe27a;gap:16px;">
          <div style="font-size:48px;animation:shopPulse 1.5s infinite;">⏳</div>
          <div style="font-size:18px;">正在加载 JSON 数据...</div>
          <div style="font-size:13px;opacity:0.6">首次进入请稍候，完整炮塔/芯片数据来自 JSON 文件</div>
        </div>
        <style>@keyframes shopPulse{0%,100%{opacity:0.4}50%{opacity:1}}</style>`;
      return;
    }
    if(!this.ready) this.ready = true;

    const gold = (window.saveData && window.saveData.gold) ?? 500;
    const filt = this.rarityFilter;
    const filterBtns = [
      {label:'全部', val:null,     active: filt===null},
      {label:'只看史诗+', val:'史诗+', active: filt==='史诗+'},
      {label:'只看传奇+', val:'传奇+', active: filt==='传奇+'},
    ].map(b=>{
      const v = b.val===null ? 'null' : `'${b.val}'`;
      return `<button class="btn ${b.active?'gold':''}" onclick="Shop.toggleRarityFilter(${v})">${b.label}</button>`;
    }).join('');

    let html = `
      <div class="shop-header">
        <div class="shop-title">🏪 炮塔商店 <span style="font-size:12px;opacity:0.6;font-weight:normal">（加权刷新）</span></div>
        <div class="shop-gold">💰 ${gold}</div>
      </div>
      <div class="shop-roll-bar">
        <button class="btn gold" onclick="Shop.refreshAll()">🔄 重刷商店 (-${this.refreshCost}💰)</button>
        <span style="margin:0 8px;color:#9aa4bd;font-size:13px">稀有度:</span>
        ${filterBtns}
        <button class="btn" style="margin-left:auto" onclick="Shop.openCodex()">📖 图鉴</button>
      </div>
      <div class="shop-section">
        <div class="shop-section-title">🔫 炮塔 (12/轮) <span style="font-size:12px;opacity:0.5;font-weight:normal">加权: 普40 稀25 史18 传12 神5</span></div>
        <div class="shop-grid shop-tower-grid">`;

    if(this.slotList.length === 0) html += '<div style="padding:40px;text-align:center;opacity:0.5">无炮塔数据</div>';
    for(const slot of this.slotList) html += this._towerCard(slot.towerData, gold);

    html += `</div></div>
      <div class="shop-section">
        <div class="shop-section-title">⚙ 芯片 (12/轮) <span style="font-size:12px;opacity:0.5;font-weight:normal">加权: 普40 稀25 史18 传12 神5</span></div>
        <div class="shop-grid shop-chip-grid">`;

    if(this.chipSlotList.length === 0) html += '<div style="padding:40px;text-align:center;opacity:0.5">无芯片数据</div>';
    for(const slot of this.chipSlotList) html += this._chipCard(slot.chip, gold);

    html += `</div></div>`;
    el.innerHTML = html;
    this.persistSlots();
  },

  _towerCard(t, gold){
    const canBuy = gold >= t.cost;
    const ownedCount = (window.saveData.ownedTowers||[]).filter(o=>o.towerTypeId===t.id).length;
    return `<div class="shop-card tower-slot" style="border-color:${t.color}40;border-left:4px solid ${t.color};${!canBuy?'opacity:0.6':''}">
      <div class="card-header" style="background:linear-gradient(135deg, ${t.color}30, transparent);">
        <span class="card-symbol" style="color:${t.color}">${t.symbol||'🔫'}</span>
        <span class="card-rarity-tag" style="color:${t.glow||t.color}">${t.rarity||'普通'}</span>
      </div>
      <div class="card-name">${t.name}</div>
      <div class="card-sub">${t.class||''} · ${t.element||''}</div>
      <div class="card-stats"><span>⚔${t.damage}</span><span>◎${t.range}</span><span>⏱${t.fireRate}s</span></div>
      <div class="card-bottom">
        <span class="card-cost" style="color:${canBuy?'#ffe27a':'#ff5a2a'}">💰${t.cost}</span>
        ${ownedCount>0?`<span class="card-owned">×${ownedCount}</span>`:''}
        <button class="buy-btn btn gold" ${!canBuy?'disabled':''} onclick="Shop._doBuyTower(${t.id})">${canBuy?'购买':'金币不足'}</button>
      </div>
      <div class="card-desc">${(t.skillName||t.name)+' · '+(t.skillDesc||'')}</div>
    </div>`;
  },

  _chipCard(c, gold){
    const chipCost = this._chipCost(c);
    const canBuy = gold >= chipCost;
    const rc = c.color || '#9aa4bd';
    return `<div class="shop-card chip-slot" style="border-color:${rc}40;border-left:4px solid ${rc};${!canBuy?'opacity:0.6':''}">
      <div class="card-header" style="background:linear-gradient(135deg, ${rc}30, transparent);">
        <span class="card-symbol" style="color:${rc}">${c.icon||'⚙'}</span>
        <span class="card-rarity-tag" style="color:${rc}">${c.rarityName||c.rarity}</span>
      </div>
      <div class="card-name" style="color:${rc}">${c.name}</div>
      <div class="card-sub">${c.slot||''} · ${c.statName||c.statField||''} Lv.${c.level}</div>
      <div class="card-value"><span style="color:${rc}">${c.statCn||c.statField||''}</span><span>= ${c.value}${c.unit||''}</span></div>
      <div class="card-bottom">
        <span class="card-cost" style="color:${canBuy?'#ffe27a':'#ff5a2a'}">💰${chipCost}</span>
        <button class="buy-btn btn gold" ${!canBuy?'disabled':''} onclick="Shop._doBuyChip(${c.libraryId})">${canBuy?'购买':'金币不足'}</button>
      </div>
      ${c.nestedSlots>0?`<div class="card-desc">🌲 嵌套槽 ×${c.nestedSlots}</div>`:''}
    </div>`;
  },

  /* ============ 购买执行 ============ */
  _doBuyTower(towerId){
    const t = (window.TOWER_DATA||[])[towerId];
    if(!t) return;
    const gold = window.saveData.gold ?? 0;
    if(gold < t.cost){
      if(window.Core) Core.spawnFloat(window.innerWidth/2, 200, '金币不足!','#ff5a2a');
      if(window.AudioFX) AudioFX.play('hurt');
      return;
    }
    window.saveData.gold -= t.cost;
    const instance = {
      instanceId: 'ot_' + Date.now() + '_' + Math.random().toString(36).slice(2,6),
      towerTypeId: towerId, level: 1, chips: [null,null,null], buyTime: Date.now()
    };
    if(!window.saveData.ownedTowers) window.saveData.ownedTowers = [];
    window.saveData.ownedTowers.push(instance);
    if(!window.saveData.unlockedTowers) window.saveData.unlockedTowers = [];
    if(!window.saveData.unlockedTowers.includes(towerId)) window.saveData.unlockedTowers.push(towerId);
    if(window.SaveSystem) SaveSystem.save(window.saveData);
    if(window.AudioFX){ AudioFX.play('coin'); AudioFX.play('levelup'); }
    this.render();
    this._showToast('🎉 购买成功: ' + t.name, '#6bff6b');
  },

  _doBuyChip(libraryId){
    const c = (window.CHIP_LIBRARY||[])[libraryId];
    if(!c) return;
    const chipCost = this._chipCost(c);
    const gold = window.saveData.gold ?? 0;
    if(gold < chipCost){
      if(window.Core) Core.spawnFloat(window.innerWidth/2, 200, '金币不足!','#ff5a2a');
      if(window.AudioFX) AudioFX.play('hurt');
      return;
    }
    window.saveData.gold -= chipCost;
    const instance = Object.assign({}, c, {
      runtimeId: 'chip_' + Date.now() + '_' + Math.random().toString(36).slice(2,6),
      chips: []
    });
    if(!window.saveData.chipInventory) window.saveData.chipInventory = [];
    window.saveData.chipInventory.push(instance);
    window.saveData.totalChipsCollected = (window.saveData.totalChipsCollected||0) + 1;
    if(window.SaveSystem) SaveSystem.save(window.saveData);
    if(window.AudioFX) AudioFX.play('chip');
    this.render();
    this._showToast('⚙ 获得芯片: ' + c.name, c.color || '#ffe27a');
  },

  /* ============ 出售 ============ */
  sellOwnedTower(instanceId){
    if(!window.saveData.ownedTowers) return;
    const idx = window.saveData.ownedTowers.findIndex(ot=>ot.instanceId===instanceId);
    if(idx<0) return;
    const ot = window.saveData.ownedTowers[idx];
    const t = (window.TOWER_DATA||[])[ot.towerTypeId];
    const refund = Math.round( (t?.cost||50) * 0.6 * ot.level );
    window.saveData.gold += refund;
    for(const slot of ot.chips || []) this._collectChipsRecursive(slot);
    window.saveData.ownedTowers.splice(idx,1);
    if(window.saveData.loadout) window.saveData.loadout = window.saveData.loadout.filter(id=>id!==instanceId);
    if(window.SaveSystem) SaveSystem.save(window.saveData);
    if(window.AudioFX) AudioFX.play('coin');
    this.render();
    this._showToast('💰 出售 ' + (t?.name||'塔') + ' +' + refund, '#ffe27a');
  },
  _collectChipsRecursive(c){
    if(!c) return;
    if(!window.saveData.chipInventory) window.saveData.chipInventory = [];
    window.saveData.chipInventory.push(c);
    for(const child of (c.chips||c.children||[])) this._collectChipsRecursive(child);
  },

  /* ============ 编队 ============ */
  addToLoadout(instanceId){
    if(!window.saveData.loadout) window.saveData.loadout = [];
    if(window.saveData.loadout.includes(instanceId)) return;
    if(window.saveData.loadout.length >= 5) window.saveData.loadout.shift();
    window.saveData.loadout.push(instanceId);
    if(window.SaveSystem) SaveSystem.save(window.saveData);
    if(window.AudioFX) AudioFX.play('click');
    this._showToast('✅ 已加入编队 (' + window.saveData.loadout.length + '/5)', '#6bff6b');
  },
  removeFromLoadout(instanceId){
    window.saveData.loadout = (window.saveData.loadout||[]).filter(id=>id!==instanceId);
    if(window.SaveSystem) SaveSystem.save(window.saveData);
    if(window.AudioFX) AudioFX.play('click');
  },

  /* ============ Toast ============ */
  _showToast(text, color){
    const t = document.createElement('div');
    t.className='ach-toast';
    t.innerHTML = `<div class="ach-name" style="color:${color}">${text}</div>`;
    const c = document.getElementById('achToastContainer');
    if(c) c.appendChild(t);
    else { document.body.appendChild(t); t.style.cssText='position:fixed;top:80px;right:20px;z-index:500;'; }
    setTimeout(()=>{ t.style.animation='slideOut .5s forwards'; setTimeout(()=>t.remove(),500); }, 2500);
  },

  /* ============ 图鉴 Codex ============ */
  openCodex(){
    let overlay = document.getElementById('codexOverlay');
    if(!overlay){
      overlay = document.createElement('div');
      overlay.id = 'codexOverlay';
      overlay.style.cssText = 'position:fixed;inset:0;background:rgba(10,14,22,0.95);z-index:9999;display:flex;flex-direction:column;padding:20px;color:#e8ecf4;overflow:hidden;';
      overlay.innerHTML = `
        <style>
        .codex-canvas-card {
          border: 2px solid rgba(255,255,255,0.1); border-radius: 10px;
          padding: 8px; background: linear-gradient(145deg, #131928, #0d111c);
          transition: transform .15s ease, box-shadow .15s ease; cursor: pointer;
          position: relative;
          text-align: center;
        }
        .codex-canvas-card:hover {
          transform: translateY(-3px); box-shadow: 0 6px 18px rgba(108,168,255,0.25);
          border-color: var(--accent, #6ca8ff);
        }
        .codex-canvas-card canvas { display: block; margin: 0 auto 6px; }
        .codex-canvas-card .cd-name { font-weight: bold; font-size: 12px; color: #e8ecf4; }
        .codex-canvas-card .cd-sub { font-size: 10px; color: #9aa4bd; margin: 2px 0; }
        .codex-canvas-card .cd-stats { font-size: 10px; color: #c8d0e0; }
        .codex-canvas-card .cd-rarity {
          position: absolute; top: 4px; right: 6px;
          font-size: 9px; font-weight: bold; padding: 1px 4px;
          background: rgba(0,0,0,0.5); border-radius: 4px;
        }
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
    if(o) o.style.display = 'none';
    if(this._codexRafIds) this._codexRafIds.forEach(id => cancelAnimationFrame(id));
    this._codexRafIds = [];
  },
  closeCodexDetail(){
    const d = document.getElementById('codexDetail');
    if(d) d.style.display = 'none';
    if(this._codexDetailRaf) cancelAnimationFrame(this._codexDetailRaf);
    this._codexDetailRaf = null;
  },
  _switchCodexTab(t){ this._codexActiveTab=t; this._renderCodex(); },

  _CODEX_TABS: null,
  _getCodexTabs(){
    if(this._CODEX_TABS) return this._CODEX_TABS;
    this._CODEX_TABS = [
      { key:'tower', label:'🔫 炮塔',    dataSrc:'TOWER_DATA',  array:window.TOWER_DATA  },
      { key:'enemy', label:'👾 敌人',    dataSrc:'ENEMY_DATA',  array:window.ENEMY_DATA  },
      { key:'elite', label:'💀 精英',    dataSrc:'ELITE_DATA',  array:window.ELITE_DATA  },
      { key:'chip',  label:'⚙ 芯片',    dataSrc:'CHIP_LIBRARY',array:window.CHIP_LIBRARY},
    ];
    return this._CODEX_TABS;
  },

  _renderCodex(){
    const tabs = this._getCodexTabs().map(t=> ({...t, array: window[t.dataSrc] || []}));
    const tabsEl = document.getElementById('codexTabs');
    let tabsHtml = '';
    for(const t of tabs){
      const active = this._codexActiveTab === t.key;
      tabsHtml += `<button class="btn ${active?'gold':''}" onclick="Shop._switchCodexTab('${t.key}')">${t.label} <span style="opacity:0.6">(${t.array.length})</span></button>`;
    }
    tabsEl.innerHTML = tabsHtml;

    const bodyEl = document.getElementById('codexBody');
    const tab = tabs.find(t=>t.key===this._codexActiveTab);
    // 先取消旧 rAF
    if(this._codexRafIds) this._codexRafIds.forEach(id=>cancelAnimationFrame(id));
    this._codexRafIds = [];
    if(!tab || tab.array.length===0){
      bodyEl.innerHTML = '<div style="padding:40px;text-align:center;opacity:0.5">数据未加载，请稍候</div>';
      return;
    }
    bodyEl.innerHTML = this._codexGrid(tab);
    this._paintCodexCanvases(tab.key, tab.array);
  },

  _codexGrid(tab){
    let cards = '';
    for(const item of tab.array) cards += this._codexCard(tab.key, item);
    return `<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(180px,1fr));gap:10px;padding:10px">${cards}</div>`;
  },

  _codexCard(tabKey, item){
    // 统一从 item 上提取显示字段
    let name, sub, rarity, rarityColor, stats, refObj, refId;
    const W = window;
    if(tabKey==='tower'){
      name = item.name||'???';
      sub = `${item.class||''} · ${item.element||''}`;
      rarity = item.rarity||'普通'; rarityColor = item.glow||item.color||'#9aa4bd';
      stats = `⚔${item.damage} · ◎${item.range} · ⏱${item.fireRate}s · 💰${item.cost}`;
      refObj = 'TOWER_DATA'; refId = item.id;
    } else if(tabKey==='enemy' || tabKey==='elite'){
      name = item.name||'???';
      sub = `${item.rank||''} · ${item.movement||''} · ${item.trait||''}`;
      rarity = tabKey==='elite' ? (item.isBoss?'首领':'精英') : (item.isBoss?'首领':item.rank||'杂兵');
      rarityColor = item.color||'#c060ff';
      stats = `❤️${item.baseHp} · 🏃${item.speed} · 🛡${Math.round((item.armor||0)*100)}% · 💰${item.gold}`;
      refObj = tabKey==='elite' ? 'ELITE_DATA' : 'ENEMY_DATA'; refId = item.id;
    } else {
      name = item.name||'???';
      sub = `${item.slot||''} · Lv.${item.level||''}`;
      rarity = item.rarityName||item.rarity||'普通'; rarityColor = item.color||'#9aa4bd';
      stats = `${item.statCn||item.statField||''}=${item.value||''}${item.unit||''}${item.nestedSlots>0?' · 🌲×'+item.nestedSlots:''}`;
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
    // 取消旧 rAF
    if(this._codexRafIds) this._codexRafIds.forEach(id=>cancelAnimationFrame(id));
    this._codexRafIds = [];
    const self = this;

    // 构建每个 canvas 的绘制配置
    const tasks = array.map(item => {
      let refId;
      if(tabKey==='tower') refId = item.id;
      else if(tabKey==='enemy' || tabKey==='elite') refId = item.id;
      else refId = item.libraryId;
      const canvasId = 'cx_' + tabKey + '_' + refId;
      const canvas = document.getElementById(canvasId);
      if(!canvas) return null;
      const ctx = canvas.getContext('2d');
      return { ctx, tabKey, item };
    }).filter(Boolean);

    function drawAll(){
      for(const t of tasks){
        const { ctx, tabKey, item } = t;
        ctx.clearRect(0, 0, 80, 80);
        if(tabKey==='tower'){
          var fakeTower = Core.makeCodexTowerPreview(item, 40, 40);
          Core.drawTower(ctx, fakeTower);
        } else if(tabKey==='enemy' || tabKey==='elite'){
          var fakeEnemy = Core.makeCodexEnemyPreview(item, 40, 40, 22);
          Core.drawEnemy(ctx, fakeEnemy);
        } else if(tabKey==='chip'){
          Core.drawChip(ctx, item, 40, 40, 40);
        }
      }
      self._codexRafIds.push(requestAnimationFrame(drawAll));
    }

    // 启动 rAF 循环
    self._codexRafIds.push(requestAnimationFrame(drawAll));
  },

  _kvs(kvs){
    return kvs.map(([label, value])=>
      `<tr><td style="padding:4px;color:#9aa4bd;width:110px">${label}</td><td>${value}</td></tr>`
    ).join('');
  },

  _showCodexDetail(refObj, refId, tabKey){
    const list = window[refObj];
    const item = list ? list[refId] : null;
    if(!item) return;
    let html = `<button class="btn" style="float:right" onclick="Shop.closeCodexDetail()">✕ 关闭</button>`;
    // 顶部 canvas 预览
    html += `<canvas id='codexDetailCanvas' width="180" height="180" style="display:block;margin:0 auto 12px;background:#0d111c;border-radius:8px;border:1px solid #2a3248"></canvas>`;
    html += `<h2 style="margin:0 0 8px;color:${item.color||item.glow||'#ffe27a'};text-align:center">${item.name||'???'}</h2>`;
    html += `<div style="opacity:0.6;font-size:13px;margin-bottom:12px;text-align:center">ID: ${item.id ?? item.libraryId ?? '?'}</div>`;

    let tableHtml = '';
    if(tabKey==='tower'){
      tableHtml = this._kvs([
        ['类型/类别', `${item.class} · ${item.element}`],
        ['稀有度', `<span style="color:${item.glow}">${item.rarity}</span>`],
        ['伤害/射程', `⚔${item.damage} · ◎${item.range}`],
        ['射速/弹道', `⏱${item.fireRate}s · 💨${item.bulletSpeed}`],
        ['暴击/穿透', `✦${Math.round((item.critChance||0)*100)}% · ➤${item.pierce} · ⟲${item.chain||0}`],
        ['减速/持续', `❄${Math.round((item.slow||0)*100)}% · ☠${item.dot||0}/s`],
        ['造价/升级', `💰${item.cost} · 升级${item.upgradeCost}`],
        ['目标/原型', `${item.targeting} · ${item.proto}`],
      ]);
    } else if(tabKey==='enemy' || tabKey==='elite'){
      tableHtml = this._kvs([
        ['等级/移动', `${item.rank} · ${item.movement}`],
        ['特性/机制', `${item.trait||'-'} · ${item.mechanic||'-'}`],
        ['生命值/速度', `❤️${item.baseHp} · 🏃${item.speed}`],
        ['护甲/魔抗', `🛡${Math.round((item.armor||0)*100)}% · 🪄${Math.round((item.magicResist||0)*100)}%`],
        ['盾/赏金', `💎${item.shield||0} · 💰${item.gold}`],
        ['泄露伤害', `💔${item.leakDamage}`],
      ]);
    } else {
      tableHtml = this._kvs([
        ['槽位/等级', `${item.slot} · Lv.${item.level} ${item.levelLabel||''}`],
        ['稀有度', `<span style="color:${item.color}">${item.rarityName||item.rarity}</span>`],
        ['效果/数值', `${item.statCn||item.statField} = ${item.value}${item.unit||''}`],
        ['嵌套槽/能量', `🌲×${item.nestedSlots||0} · ⚡${item.energyCost||1}`],
        ['触发/叠层', `${item.trigger||''} · 叠${item.stackLimit||1}`],
        ['商店价格', `💰${this._chipCost(item)}`],
      ]);
    }
    html += `<table style="width:100%;font-size:13px;border-collapse:collapse;margin-bottom:12px">${tableHtml}</table>`;

    if(tabKey==='tower' && item.skillName){
      html += `<div style="padding:10px;background:#2a3248;border-radius:6px;margin-bottom:8px"><b style="color:${item.glow}">✨ ${item.skillName}</b><div style="margin-top:4px;font-size:12px;color:#c8d0e0">${item.skillDesc||''}</div></div>`;
    }
    if((tabKey==='enemy' || tabKey==='elite') && item.weakness){
      html += `<div style="font-size:12px;margin-bottom:6px">弱点: <span style="color:#ff5a2a">${item.weakness}</span></div>`;
    }
    if((tabKey==='enemy' || tabKey==='elite') && item.abilities && item.abilities.length){
      html += `<div style="padding:10px;background:#2a3248;border-radius:6px;margin-bottom:8px"><b style="color:${item.color}">⚡ 技能</b>`;
      for(const a of item.abilities) html += `<div style="margin-top:4px;font-size:12px">${a.name||a} — ${a.description||''}</div>`;
      html += `</div>`;
    }
    if(tabKey==='chip' && item.synergy){
      html += `<div style="font-size:12px;margin-bottom:6px;color:#ffd93d">🤝 协同: ${item.synergy}</div>`;
    }
    if(item.desc) html += `<div style="font-size:12px;color:#9aa4bd">${item.desc}</div>`;

    document.getElementById('codexDetailPanel').innerHTML = html;
    document.getElementById('codexDetail').style.display = 'flex';

    // 绘制 detail canvas
    const dc = document.getElementById('codexDetailCanvas');
    if(dc && window.Core){
      const dctx = dc.getContext('2d');
      dctx.clearRect(0, 0, 180, 180);
      if(tabKey==='tower'){
        Core.drawTower(dctx, Core.makeCodexTowerPreview(item, 90, 90));
      } else if(tabKey==='chip'){
        Core.drawChip(dctx, item, 90, 90, 80);
      } else {
        Core.drawEnemy(dctx, Core.makeCodexEnemyPreview(item, 90, 90, 40));
      }
    }
  }
};
console.log('Shop v3 ready — weighted roll + codex + ready flag');
