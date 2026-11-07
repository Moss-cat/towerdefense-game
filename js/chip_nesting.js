/* ChipSystem v2 — 兼容新存档模型
   chipInventory 旧格式已废弃，改为 saveData.inventory.chips: {libraryId: count}
   ownedTowers 旧格式 [{runtimeId, towerTypeId}] 已废弃，改为 int[]
   旧 API 保留空壳避免报错，菜单渲染改为新模型
*/
window.ChipSystem = {
  currentTower: null,
  currentContainer: null,

  /* ==== 菜单屏幕：初始化库存 + 出战配置渲染 ==== */
  initMenu(){
    this.renderInventory();
    this.renderOwnedPool();
  },

  // 把 inventory.chips {id: count} 合并成显示条目
  _getChipInventoryEntries(){
    const lib = window.CHIP_LIBRARY || [];
    const invChips = (saveData.inventory && saveData.inventory.chips) || {};
    const entries = [];
    for (const id in invChips){
      const count = invChips[id];
      if (count <= 0) continue;
      const libId = parseInt(id);
      const chip = lib.find(x => x.libraryId === libId);
      if (chip) entries.push({ chip, count });
    }
    return entries;
  },

  renderInventory(){
    const grid = document.getElementById('chipInventoryGrid');
    if (!grid) return;
    const entries = this._getChipInventoryEntries();
    if (entries.length === 0){
      grid.innerHTML = '<p class="empty-hint">暂无芯片 — 击杀敌人/通关获得</p>';
      return;
    }
    let html = '';
    for (const { chip, count } of entries){
      const rc = chip.color || '#9aa4bd';
      html += `<div class="chip-inv-card" style="border-color:${rc};background:linear-gradient(135deg,${rc}22,#00000044);">
        <div class="chip-icon" style="color:${rc};">${chip.icon || '⚙'}</div>
        <div class="chip-name" style="color:${rc};">${chip.name} · ${chip.rarityName || '普通'}</div>
        <div class="chip-stat">${chip.statCn || chip.statField || ''}=${chip.value}${chip.unit || ''}</div>
        <div style="color:#ffe27a;font-weight:bold;font-size:12px;">持有 ×${count}</div>
      </div>`;
    }
    grid.innerHTML = html;
  },

  renderOwnedPool(){
    const pool = document.getElementById('ownedTowerPool');
    if (!pool) return;
    const TOWERS = window.TOWER_DATA || [];
    const htmls = [];
    // 基础塔
    for (const towerId of (saveData.ownedTowers || [])){
      const td = TOWERS[towerId];
      if (!td) continue;
      htmls.push(`<div class="owned-tower-card" style="border-color:${td.color};">
        <span style="color:${td.color};">${td.symbol || '🔫'}</span>
        <span>${td.name}</span>
        <span class="lv-badge">已解锁</span>
      </div>`);
    }
    // 合成塔
    for (const ct of (saveData.craftedTowers || [])){
      const td = TOWERS[ct.baseType];
      htmls.push(`<div class="owned-tower-card" style="border-color:${td?.color || '#ffd93d'};">
        <span style="color:${td?.color || '#ffd93d'};">${td?.symbol || '🔨'}</span>
        <span style="color:#ffd93d;">${ct.name} ✨</span>
        <span class="lv-badge">合成</span>
      </div>`);
    }
    pool.innerHTML = htmls.length > 0 ? htmls.join('') : '<p class="empty-hint">还没有炮塔 — 去商店解锁吧</p>';
  },

  // 保留旧方法壳（主流程不再需要 loadout 数组）
  renderLoadoutSlots(){},
  _bindLoadoutEvents(){},

  _emitCurrency(){
    const ev = new CustomEvent('tdf:currency-changed');
    document.dispatchEvent(ev);
  },

  // 旧壳：addOwnedTower 不再需要（Shop._doBuyTower 直接 push ownedTowers int[]）
  addOwnedTower(towerTypeId){
    if (!saveData.ownedTowers) saveData.ownedTowers = [];
    if (!saveData.ownedTowers.includes(towerTypeId)) saveData.ownedTowers.push(towerTypeId);
    SaveSystem.save(saveData);
  },

  /* ==== 战斗内芯片槽位（保留旧 API，但 chip panel 现在由 main.js 管）==== */
  getChips(tower){
    const GS = window.GameState;
    return GS.towerChips[tower.instanceId] || [null, null, null];
  },
  applyStats(tower){ return []; },
  _collectNestedChips(){ return []; },

  // 战斗内 chip 操作现在基本废弃（我们用合成预加 stat）
  equipToSlot(){ return false; },
  removeFromSlot(){ return null; },
  nestChip(){ return false; },
  collectAllChips(){ return 0; },
  getChipDepth(){ return 0; },

  renderPanel(tower, containerEl){
    if (!tower || !containerEl) return;
    // 旧 ChipSystem 的 panel — 用 main.js 里的 showTowerPanel 已实现
    // 这里留空壳让旧调用不报错
  },

  openInventoryBrowser(){},
  openInventoryModal(){
    if (window.mainJS_showInventoryModal) mainJS_showInventoryModal();
  }
};
console.log('ChipSystem v2 ready — new inventory model');
