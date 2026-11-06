/* ChipSystem — 芯片嵌套系统 */
window.ChipSystem = {
  currentTower: null,
  currentContainer: null,

  /* ==== 菜单屏幕：初始化库存 + 出战配置渲染 ==== */
  initMenu(){
    this.renderInventory();
    this.renderOwnedPool();
    this.renderLoadoutSlots();
    this._bindLoadoutEvents();
  },

  renderInventory(){
    const grid = document.getElementById('chipInventoryGrid');
    if(!grid) return;
    const inv = saveData.chipInventory || [];
    if(inv.length===0){
      grid.innerHTML = '<p class="empty-hint">暂无芯片 — 击杀敌人会掉落</p>';
      return;
    }
    // 按稀有度排序
    const rarityOrder = {legendary:0,epic:1,rare:2,common:3};
    const sorted = [...inv].sort((a,b)=>(rarityOrder[a.rarity]||99)-(rarityOrder[b.rarity]||99)||b.level-a.level);
    let html = '';
    for(const c of sorted){
      html += `<div class="chip-inv-card" style="border-color:${c.color};background:linear-gradient(135deg,${c.color}22,#00000044);">
        <div class="chip-icon" style="color:${c.color};">${c.icon}</div>
        <div class="chip-name" style="color:${c.color};">${c.rarityName} Lv.${c.level}</div>
        <div class="chip-stat">${c.statName}=${c.value}</div>
      </div>`;
    }
    grid.innerHTML = html;
  },

  renderOwnedPool(){
    const pool = document.getElementById('ownedTowerPool');
    if(!pool) return;
    const TOWERS = window.TOWER_DATA || [];
    const owned = saveData.ownedTowers || [];
    if(owned.length===0){
      pool.innerHTML = '<p class="empty-hint">还没有炮塔 — 去商店购买吧</p>';
      return;
    }
    let html = '';
    for(const ot of owned){
      const td = TOWERS[ot.towerTypeId];
      if(!td) continue;
      const inLoadout = (saveData.loadout||[]).includes(ot.runtimeId);
      html += `<div class="owned-tower-card" data-runtime="${ot.runtimeId}" style="border-color:${td.color};opacity:${inLoadout?0.4:1};">
        <span style="color:${td.color};">${td.symbol||'🔫'}</span>
        <span>${td.name}</span>
        <span class="lv-badge">Lv.${ot.level}</span>
        <span class="chip-count">⚙${(ot.chips||[]).length}</span>
      </div>`;
    }
    pool.innerHTML = html;
  },

  renderLoadoutSlots(){
    const slotsEl = document.getElementById('loadoutSlots');
    if(!slotsEl) return;
    const TOWERS = window.TOWER_DATA || [];
    const slots = slotsEl.querySelectorAll('.loadout-slot');
    const loadout = saveData.loadout || [];
    slots.forEach((slotEl, idx)=>{
      slotEl.innerHTML = '';
      const rid = loadout[idx];
      if(!rid){
        slotEl.innerHTML = '<span class="slot-empty">空槽</span>';
        return;
      }
      const owned = saveData.ownedTowers.find(t=>t.runtimeId===rid);
      if(!owned){ slotEl.innerHTML = '<span class="slot-empty">丢失</span>'; return; }
      const td = TOWERS[owned.towerTypeId];
      if(!td){ slotEl.innerHTML = '<span class="slot-empty">?</span>'; return; }
      slotEl.innerHTML = `<div class="loadout-chip" style="border-color:${td.color};">
        <span style="color:${td.color};">${td.symbol||'🔫'}</span>
        <span>${td.name.slice(0,3)}</span>
        <span class="lv-badge">L${owned.level}</span>
      </div>
      <button class="slot-remove" data-rid="${rid}" title="移出">✕</button>`;
    });
  },

  _bindLoadoutEvents(){
    const self = this;
    // 点击 owned pool → 加入 loadout
    document.getElementById('ownedTowerPool')?.addEventListener('click', e=>{
      const card = e.target.closest('.owned-tower-card');
      if(!card) return;
      const rid = card.dataset.runtime;
      if((saveData.loadout||[]).length >= 5){ alert('出战配置已满（最多 5 个）'); return; }
      if(!saveData.loadout) saveData.loadout = [];
      if(!saveData.loadout.includes(rid)){
        saveData.loadout.push(rid);
        SaveSystem.save(saveData);
        self.renderOwnedPool(); self.renderLoadoutSlots(); self._emitCurrency();
        if(window.AudioFX) AudioFX.play('chip');
      }
    });
    // 点击 slot remove
    document.getElementById('loadoutSlots')?.addEventListener('click', e=>{
      const btn = e.target.closest('.slot-remove');
      if(!btn) return;
      const rid = btn.dataset.rid;
      saveData.loadout = (saveData.loadout||[]).filter(r=>r!==rid);
      SaveSystem.save(saveData);
      self.renderOwnedPool(); self.renderLoadoutSlots(); self._emitCurrency();
    });
  },

  _emitCurrency(){
    // 通知 main.js 刷新货币显示
    const ev = new CustomEvent('tdf:currency-changed');
    document.dispatchEvent(ev);
  },

  /* ==== 购买一个塔（菜单里 Shop 购买后调用）==== */
  addOwnedTower(towerTypeId){
    const TOWERS = window.TOWER_DATA || [];
    const td = TOWERS[towerTypeId];
    if(!td) return null;
    const owned = {
      runtimeId: 'owned_' + Date.now() + '_' + Math.random().toString(36).slice(2,6),
      towerTypeId,
      level: 1,
      chips: []
    };
    if(!saveData.ownedTowers) saveData.ownedTowers = [];
    saveData.ownedTowers.push(owned);
    SaveSystem.save(saveData);
    return owned;
  },

  getChips(tower){
    const GS = window.GameState;
    return GS.towerChips[tower.instanceId] || [null,null,null];
  },

  applyStats(tower){
    // 递归 walk 所有嵌套芯片，返回 flat 列表
    const chips = this._collectNestedChips(tower);
    return chips;
  },

  _collectNestedChips(tower){
    const top = this.getChips(tower);
    const flat = [];
    function walk(c){
      if(!c) return;
      flat.push(c);
      for(const child of (c.children||[])) walk(child);
    }
    for(const c of top) walk(c);
    return flat;
  },

  equipToSlot(tower, slotIndex, chipFromInventory){
    const GS = window.GameState;
    const chips = this.getChips(tower);
    if(chips[slotIndex]) return false;
    chips[slotIndex] = chipFromInventory;
    // remove from inventory
    const idx = saveData.chipInventory.indexOf(chipFromInventory);
    if(idx>=0) saveData.chipInventory.splice(idx,1);
    AudioFX.play('chip');
    SaveSystem.save(saveData);
    return true;
  },

  removeFromSlot(tower, slotIndex){
    const chips = this.getChips(tower);
    const chip = chips[slotIndex];
    if(!chip) return null;
    // collect all nested
    const all = [];
    function walk(c){ all.push(c); for(const child of (c.children||[])) walk(child); }
    walk(chip);
    for(const c of all){
      if(!saveData.chipInventory) saveData.chipInventory=[];
      saveData.chipInventory.push(c);
    }
    chips[slotIndex] = null;
    AudioFX.play('chip');
    SaveSystem.save(saveData);
    return chip;
  },

  nestChip(tower, chipFromInventory){
    // BFS on top-level chips on tower, find first chip with free nested slot
    const top = this.getChips(tower);
    let added = false;
    function bfs(list){
      if(added) return;
      for(const c of list){
        if(!c) continue;
        if((c.children||[]).length < (c.nestedSlots||0)){
          if(!c.children) c.children=[];
          c.children.push(chipFromInventory);
          added = true; return;
        }
        bfs(c.children||[]);
      }
    }
    bfs(top);
    if(added){
      const idx = saveData.chipInventory.indexOf(chipFromInventory);
      if(idx>=0) saveData.chipInventory.splice(idx,1);
      AudioFX.play('chip');
      SaveSystem.save(saveData);
    }
    return added;
  },

  getChipDepth(chip){
    if(!chip || !chip.children || chip.children.length===0) return 0;
    let max = 0;
    for(const c of chip.children) max = Math.max(max, this.getChipDepth(c));
    return 1 + max;
  },

  collectAllChips(tower){
    const all = [];
    const top = this.getChips(tower);
    function walk(c){ if(!c) return; all.push(c); for(const child of (c.children||[])) walk(child); }
    for(const c of top) walk(c);
    for(const c of all){
      if(!saveData.chipInventory) saveData.chipInventory=[];
      saveData.chipInventory.push(c);
    }
    // Clear tower slots
    const GS = window.GameState;
    GS.towerChips[tower.instanceId] = [null,null,null];
    return all.length;
  },

  renderPanel(tower, containerEl){
    if(!tower || !containerEl) return;
    const TOWERS = window.TOWER_DATA || [];
    const Core = window.Core;
    const tData = TOWERS[tower.type];
    const effStats = Core.computeTowerStats(tower);
    const topChips = this.getChips(tower);

    let html = `<div style="display:flex;gap:16px;align-items:flex-start;">
      <div style="min-width:180px;">
        <div style="color:${tData.color};font-weight:bold;font-size:13px;">
          <span style="display:inline-block;width:14px;height:14px;border-radius:3px;background:${tData.color};vertical-align:middle;margin-right:4px;"></span>
          ${tData.symbol||'🔫'} ${tData.name} · Lv.${tower.level}
        </div>
        <div style="font-size:10px;color:#7a86a0;margin-top:2px;">${tData.desc||''}</div>
        <div style="margin-top:8px;font-size:11px;">
          <div class="kv"><span>实际伤害</span><span>${effStats.damage.toFixed(1)}</span></div>
          <div class="kv"><span>实际射程</span><span>${effStats.range.toFixed(0)}</span></div>
          <div class="kv"><span>实际攻速</span><span>${effStats.fireRate.toFixed(2)}s</span></div>
          <div class="kv"><span>暴击率</span><span>${(effStats.critChance*100).toFixed(0)}%</span></div>
          ${effStats.splash?`<div class="kv"><span>溅射</span><span>${effStats.splash.toFixed(0)}</span></div>`:''}
          ${effStats.chain?`<div class="kv"><span>链锁</span><span>${effStats.chain}</span></div>`:''}
          ${effStats.slow>0?`<div class="kv"><span>减速</span><span>${(effStats.slow*100).toFixed(0)}%</span></div>`:''}
          ${effStats.dot?`<div class="kv"><span>DOT</span><span>${effStats.dot.toFixed(0)}/s</span></div>`:''}
        </div>
      </div>
      <div style="flex:1;">
        <div style="font-size:11px;color:#6ca8ff;margin-bottom:6px;">⚙️ 芯片槽位 (点击装备/嵌套)</div>`;

    for(let i=0;i<3;i++){
      const c = topChips[i];
      html += `<div class="chip-slot ${c?'filled':''}" data-slot="${i}">`;
      if(c){
        html += `<div class="icon" style="color:${c.color};">${c.icon}</div>
          <div class="lv">Lv.${c.level}</div>
          <div class="rarity-name" style="color:${c.color};">${c.rarityName}</div>
          <div style="font-size:9px;color:#9aa4bd;">子槽${c.nestedSlots||0} · 子${(c.children||[]).length}</div>
          <div class="chip-child-wrap">${this._renderChildren(c.children||[])}</div>
          <button class="chip-chip-btn" data-act="equip" data-slot="${i}">换</button>
          <button class="chip-chip-btn danger" data-act="remove" data-slot="${i}">拆</button>
          <button class="chip-chip-btn" data-act="nest" data-slot="${i}">嵌</button>`;
      }else{
        html += `<div style="font-size:10px;color:#5a6880;">空槽 [${i+1}]</div>`;
      }
      html += `</div>`;
    }

    html += `<div style="margin-top:8px;font-size:10px;color:#7a86a0;">💡 稀有度越高 → 嵌套槽越多 → 3层深度加成</div>
      </div></div>`;
    containerEl.innerHTML = html;
    this.currentTower = tower;
    this.currentContainer = containerEl;
    // bind buttons
    containerEl.querySelectorAll('[data-act]').forEach(btn=>{
      btn.addEventListener('click', e=>{
        e.stopPropagation();
        const act = btn.dataset.act;
        const slotIdx = parseInt(btn.dataset.slot);
        if(act==='remove'){ this.removeFromSlot(tower, slotIdx); this.renderPanel(tower, containerEl); }
        else if(act==='equip'){ this._promptEquip(tower, slotIdx, containerEl); }
        else if(act==='nest'){ this._promptNestSlot(tower, slotIdx, containerEl); }
      });
    });
  },

  _renderChildren(list, depth=1){
    if(!list || list.length===0) return '';
    let html = '';
    for(const c of list){
      const d = this.getChipDepth(c);
      html += `<div class="chip-child" style="color:${c.color};padding-left:${depth*8}px;">
        └ ${c.icon} ${c.rarityName} Lv.${c.level} (深度${d}/${c.nestedSlots})
        ${this._renderChildren(c.children||[], depth+1)}
      </div>`;
    }
    return html;
  },

  _promptEquip(tower, slotIdx, containerEl){
    const inv = saveData.chipInventory||[];
    if(inv.length===0){ alert('芯片背包是空的！击杀敌人会掉落芯片'); return; }
    this.openInventoryBrowser(tower, slotIdx);
  },

  _promptNestSlot(tower, slotIdx, containerEl){
    const top = this.getChips(tower);
    const parentChip = top[slotIdx];
    if(!parentChip){ alert('该槽位为空，先装备芯片吧'); return; }
    if((parentChip.children||[]).length >= (parentChip.nestedSlots||0)){ alert('父芯片嵌套槽已满'); return; }
    const inv = saveData.chipInventory||[];
    if(inv.length===0){ alert('芯片背包是空的'); return; }
    this.openInventoryBrowser(tower, slotIdx, true);
  },

  openInventoryBrowser(tower, slotIdx, forNest){
    const inv = saveData.chipInventory||[];
    if(inv.length===0){ alert('没有芯片'); return; }
    const overlay = document.createElement('div');
    overlay.className='browse-overlay';
    let html = `<h2>${forNest?'嵌套芯片到槽位':'装备芯片到槽位'} [${slotIdx+1}] — 共 ${inv.length} 枚</h2>
      <div class="browse-grid">`;
    for(let i=0;i<inv.length;i++){
      const c = inv[i];
      html += `<div class="browse-card" data-idx="${i}" style="border-left:4px solid ${c.color};">
        <div class="name" style="color:${c.color};font-size:14px;">${c.icon} ${c.rarityName} Lv.${c.level}</div>
        <div class="stats">属性: ${c.statName||c.statType} = ${c.value}</div>
        <div class="stats">嵌套槽: ${c.nestedSlots||0}</div>
      </div>`;
    }
    html += `</div><button class="btn browse-close" onclick="this.parentElement.remove()">取消</button>`;
    overlay.innerHTML = html;
    overlay.onclick = e=>{ if(e.target===overlay) overlay.remove(); };
    document.body.appendChild(overlay);
    overlay.querySelectorAll('.browse-card').forEach(card=>{
      card.addEventListener('click',()=>{
        const idx = parseInt(card.dataset.idx);
        const chip = inv[idx];
        if(forNest){
          // nest under chip in slot
          const top = this.getChips(tower);
          const parent = top[slotIdx];
          if((parent.children||[]).length >= (parent.nestedSlots||0)){ alert('父芯片槽满'); return; }
          if(!parent.children) parent.children=[];
          parent.children.push(chip);
          inv.splice(idx,1);
          AudioFX.play('chip');
          Core.spawnFloat(tower.gx, tower.gy-30, '🔗 嵌套!', chip.color);
          Core.spawnParticles(tower.gx,tower.gy,chip.color,15,120,0.5);
        }else{
          // equip to slot
          this.equipToSlot(tower, slotIdx, chip);
        }
        overlay.remove();
        if(this.currentTower) this.renderPanel(this.currentTower, this.currentContainer);
      });
    });
  },

  openInventoryModal(){
    const inv = saveData.chipInventory||[];
    const overlay = document.createElement('div');
    overlay.className='browse-overlay';
    // sort by rarity
    const rarityOrder = {legendary:0,epic:1,rare:2,common:3};
    const sorted = [...inv].sort((a,b)=>{
      return (rarityOrder[a.rarity]||99) - (rarityOrder[b.rarity]||99) || b.level-a.level;
    });
    let html = `<h2>🎒 芯片背包 (${inv.length} 枚)</h2>
      <div class="browse-grid">`;
    for(const c of sorted){
      html += `<div class="browse-card" style="border-left:4px solid ${c.color};">
        <div class="name" style="color:${c.color};">${c.icon} ${c.rarityName} Lv.${c.level}</div>
        <div class="stats">${c.statName||c.statType} = ${c.value}</div>
        <div class="stats">嵌套槽 ${c.nestedSlots||0} · 深度 ${this.getChipDepth(c)}</div>
        <div>${this._renderChildren(c.children||[])}</div>
      </div>`;
    }
    html += `</div><button class="btn danger browse-close" onclick="this.parentElement.remove()">✕ 关闭</button>`;
    overlay.innerHTML = html;
    overlay.onclick = e=>{ if(e.target===overlay) overlay.remove(); };
    document.body.appendChild(overlay);
  }
};
console.log('ChipSystem ready');
