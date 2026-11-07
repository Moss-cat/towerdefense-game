/* Blacksmith v2 — 铁匠铺 · 解锁模型
   选 baseType (只能是 ownedTowers 里有的)
   从 inventory.chips (count>0) 选最多 5 个
   积分费: 100 + Σ CRAFT_CHIP_FEE[rarity]
   成功 → saveData.craftedTowers.push({uid, baseType, chipIds, name, stats}) → 进战斗塔栏
*/
window.Blacksmith = {
  ready: false,
  selectedBaseId: null,       // int (TOWER_DATA id)
  chipSlots: [null, null, null, null, null],   // 每项 = CHIP_LIBRARY entry (含 libraryId)
  currentName: '',
  _swapFirstIdx: -1,
  containerEl: null,

  CRAFT_CHIP_FEE: { '普通': 20, '稀有': 50, '史诗': 100, '传奇': 160, '神话': 300 },
  BASE_FEE: 100,

  /* ============ 初始化 ============ */
  init(containerEl){
    if (containerEl) this.containerEl = containerEl;
    else if (!this.containerEl){
      const auto = document.getElementById('blacksmithSection');
      if (auto) this.containerEl = auto;
    }
    if (this.containerEl && !this.containerEl.innerHTML) this.render();
    this.ready = true;
  },

  /* ============ 开关 ============ */
  open(){
    const sec = document.getElementById('blacksmithSection');
    if (sec) sec.classList.remove('hidden');
    this.render();
  },
  close(){
    const sec = document.getElementById('blacksmithSection');
    if (sec) sec.classList.add('hidden');
  },

  /* ============ 渲染入口 ============ */
  render(){
    const el = this.containerEl;
    if (!el) return;

    if (!this._isJsonReady()){
      el.innerHTML = `
        <div style="display:flex;flex-direction:column;align-items:center;justify-content:center;min-height:400px;color:#ffe27a;gap:16px;">
          <div style="font-size:48px;animation:bsPulse 1.5s infinite;">⏳</div>
          <div style="font-size:18px;">正在加载数据...</div>
        </div>
        <style>@keyframes bsPulse{0%,100%{opacity:0.4}50%{opacity:1}}</style>`;
      return;
    }

    const credits = (window.saveData && saveData.credits) ?? 0;
    const cost = this._calcTotalCost();
    const canForge = this._canForge();

    let html = `
      <div class="bs-header" style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;">
        <div class="bs-title" style="font-size:18px;color:var(--gold);font-weight:bold;text-shadow:0 0 10px rgba(255,226,122,.3);">🔥 铁匠铺 <span style="font-size:11px;opacity:0.5;font-weight:normal;">合成自定义炮塔</span></div>
        <div style="font-size:16px;color:var(--gold);font-weight:bold;">💎 ${credits}</div>
      </div>
      <div class="bs-body" style="display:grid;grid-template-columns:240px 1fr 260px;gap:10px;min-height:480px;">
        ${this._renderBasePool()}
        ${this._renderChipSlots()}
        ${this._renderRightPanel()}
      </div>
      <div class="bs-footer" style="margin-top:10px;padding-top:10px;border-top:1px dashed var(--border);display:flex;justify-content:space-between;align-items:center;gap:12px;">
        <div style="flex:1;">
          <div style="font-size:11px;color:var(--text2);margin-bottom:4px;">⚒ 成品命名 (1-16字, 唯一)</div>
          <input id="bsNameInput" maxlength="16" value="${this.currentName}" placeholder="给你的杰作起个名字..."
            style="width:100%;padding:8px 12px;background:var(--bg2);border:1px solid var(--border2);border-radius:6px;color:var(--text);font-family:inherit;font-size:13px;outline:none;"
            oninput="Blacksmith._onNameInput(this.value)" />
          <div id="bsNameErr" style="font-size:11px;color:var(--danger);min-height:14px;margin-top:3px;"></div>
        </div>
        ${this._renderCost()}
        <button id="bsForgeBtn" class="btn gold" style="padding:12px 24px;font-size:14px;white-space:nowrap;${!canForge ? 'opacity:0.4;cursor:not-allowed;' : ''}"
          onclick="Blacksmith.forge()" ${!canForge ? 'disabled' : ''}>🔥 合成!</button>
      </div>`;

    el.innerHTML = html;

    const ni = document.getElementById('bsNameInput');
    if (ni){ ni.value = this.currentName; ni.focus(); }
  },

  _isJsonReady(){
    const t = (window.TOWER_DATA || [])[0];
    return !!(t && (t._jsonLoaded || t.id != null));
  },

  /* ============ 左: 基础炮塔池（只显示 ownedTowers 里有的） ============ */
  _renderBasePool(){
    const TOWERS = window.TOWER_DATA || [];
    const owned = new Set(window.saveData.ownedTowers || []);
    const baseList = [];
    for (let i = 0; i < TOWERS.length; i++){
      if (owned.has(i)) baseList.push(TOWERS[i]);
    }

    let html = `<div style="background:var(--panel);border:1px solid var(--border);border-radius:var(--radius);padding:10px;overflow-y:auto;max-height:500px;">
      <div style="font-size:12px;color:var(--accent);font-weight:bold;margin-bottom:8px;padding-bottom:4px;border-bottom:1px solid var(--border);">📜 基础炮塔 (已解锁)</div>`;

    if (baseList.length === 0){
      html += '<div style="opacity:0.5;font-size:11px;padding:8px;">还没有解锁任何炮塔 — 先去商店解锁!</div>';
    } else {
      for (const t of baseList){
        const sel = this.selectedBaseId === t.id;
        const color = t.color || '#888';
        html += `<div onclick="Blacksmith._selectBase(${t.id})" style="cursor:pointer;margin-bottom:6px;padding:8px;border:1px solid ${sel ? 'var(--gold)' : 'var(--border)'};border-radius:6px;background:${sel ? '#2a2414' : 'transparent'};border-left:3px solid ${color};transition:all .15s;">
          <div style="display:flex;justify-content:space-between;align-items:center;">
            <span style="font-size:16px;color:${color}">${t.symbol || '🔫'}</span>
            <span style="font-size:10px;color:${color}">${t.rarity || '普通'}</span>
          </div>
          <div style="font-size:12px;color:var(--text);margin-top:2px;font-weight:bold;">${t.name}</div>
          <div style="font-size:10px;color:var(--text2);">${t.class || ''} · ${t.element || ''}</div>
          <div style="font-size:10px;color:var(--text3);margin-top:2px;">⚔${t.damage} ◎${t.range} ⏱${t.fireRate}s</div>
        </div>`;
      }
    }
    html += `</div>`;
    return html;
  },

  _selectBase(id){
    this.selectedBaseId = id;
    if (window.AudioFX) AudioFX.play('click');
    this.render();
  },

  /* ============ 中: 芯片槽 ============ */
  _renderChipSlots(){
    let html = `<div style="background:var(--panel);border:1px solid var(--border);border-radius:var(--radius);padding:12px;display:flex;flex-direction:column;">
      <div style="font-size:12px;color:var(--accent);font-weight:bold;margin-bottom:8px;padding-bottom:4px;border-bottom:1px solid var(--border);">⚙ 芯片槽位 (最多 5) <span style="font-size:10px;color:var(--text3);font-weight:normal;">点空槽→选芯片 / 点有芯片→移除 / 先点两个→交换</span></div>
      <div style="display:flex;gap:10px;margin-bottom:12px;">`;

    for (let i = 0; i < 5; i++){
      const chip = this.chipSlots[i];
      const swSel = this._swapFirstIdx === i;
      if (chip){
        html += `<div onclick="Blacksmith._slotClick(${i})" style="flex:1;min-width:0;aspect-ratio:1/1;border:2px solid ${swSel ? 'var(--gold)' : chip.color || 'var(--border2)'};border-radius:8px;background:linear-gradient(135deg, ${chip.color || '#888'}22, transparent);display:flex;flex-direction:column;align-items:center;justify-content:center;cursor:pointer;transition:all .15s;position:relative;" title="点击移除 / 先点其他槽→交换">
          <div style="font-size:22px;color:${chip.color || '#888'}">${chip.icon || '⚙'}</div>
          <div style="font-size:9px;color:${chip.color || '#888'};margin-top:2px;max-width:100%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;padding:0 4px;">${chip.name}</div>
        </div>`;
      } else {
        html += `<div onclick="Blacksmith._slotClick(${i})" style="flex:1;min-width:0;aspect-ratio:1/1;border:2px dashed ${swSel ? 'var(--gold)' : 'var(--border2)'};border-radius:8px;background:rgba(10,14,26,.6);display:flex;flex-direction:column;align-items:center;justify-content:center;cursor:pointer;color:var(--text3);font-size:20px;transition:all .15s;" title="点击选芯片">
          <span style="font-size:20px;">+</span>
          <span style="font-size:9px;margin-top:2px;">槽${i+1}</span>
        </div>`;
      }
    }
    html += `</div><div style="flex:1;overflow-y:auto;font-size:11px;">`;

    const filled = this.chipSlots.filter(Boolean);
    if (filled.length === 0){
      html += `<div style="color:var(--text3);padding:20px;text-align:center;opacity:0.5">从芯片库存选最多 5 枚嵌入</div>`;
    } else {
      for (let i = 0; i < 5; i++){
        const c = this.chipSlots[i];
        if (!c) continue;
        html += `<div style="padding:6px 8px;border-left:3px solid ${c.color || '#888'};background:rgba(10,14,26,.5);margin-bottom:4px;border-radius:0 4px 4px 0;">
          <div style="display:flex;justify-content:space-between;align-items:center;">
            <span style="font-size:13px;color:${c.color || '#888'}">${c.icon || '⚙'} ${c.name}</span>
            <span style="font-size:10px;color:${c.color || '#9aa4bd'};">${c.rarityName || c.rarity || '普通'}</span>
          </div>
          <div style="color:var(--text2);font-size:10px;margin-top:2px;">${c.statCn || c.statField || ''}=${c.value || ''}${c.unit || ''} · 库存剩 ${window.getChipCount(c.libraryId)}</div>
        </div>`;
      }
    }
    html += `</div></div>`;
    return html;
  },

  _slotClick(idx){
    if (this._swapFirstIdx >= 0){
      if (this._swapFirstIdx === idx){ this._swapFirstIdx = -1; }
      else {
        const a = this._swapFirstIdx, b = idx;
        const tmp = this.chipSlots[a]; this.chipSlots[a] = this.chipSlots[b]; this.chipSlots[b] = tmp;
        this._swapFirstIdx = -1;
        if (window.AudioFX) AudioFX.play('click');
      }
      this.render();
      return;
    }
    const chip = this.chipSlots[idx];
    if (chip){
      this._swapFirstIdx = idx;
      this.render();
      setTimeout(() => {
        if (this._swapFirstIdx === idx){
          this.chipSlots[idx] = null;
          this._swapFirstIdx = -1;
          if (window.AudioFX) AudioFX.play('click');
          this.render();
        }
      }, 1500);
    } else {
      this._swapFirstIdx = idx;
      this._pickChip(idx);
    }
  },

  /* ============ 右: 预览 ============ */
  _renderRightPanel(){
    let html = `<div style="background:var(--panel);border:1px solid var(--border);border-radius:var(--radius);padding:12px;display:flex;flex-direction:column;overflow-y:auto;">
      <div style="font-size:12px;color:var(--accent);font-weight:bold;margin-bottom:8px;padding-bottom:4px;border-bottom:1px solid var(--border);">🎯 合成预览</div>`;

    if (this.selectedBaseId == null){
      html += `<div style="color:var(--text3);text-align:center;padding:30px 10px;">
        <div style="font-size:32px;margin-bottom:10px;">👈</div>
        <div style="font-size:12px;">请从左侧选一个基础炮塔</div>
      </div>`;
    } else {
      const TOWERS = window.TOWER_DATA || [];
      const td = TOWERS[this.selectedBaseId];
      const color = td.color || '#888';
      html += `<div style="border:1px solid ${color}40;border-radius:8px;padding:10px;background:linear-gradient(135deg, ${color}22, transparent);">
        <div style="display:flex;justify-content:space-between;">
          <span style="font-size:28px;color:${color}">${td.symbol || '🔫'}</span>
          <span style="font-size:10px;color:${color};padding:2px 6px;border:1px solid ${color};border-radius:4px;">${td.rarity || '普通'}</span>
        </div>
        <div style="font-size:13px;font-weight:bold;color:var(--text);margin-top:6px;">${td.name}</div>
        <div style="font-size:10px;color:var(--text2);margin-top:2px;">${td.class || ''} · ${td.element || ''}</div>
        <div style="font-size:10px;color:var(--text3);margin-top:6px;display:grid;grid-template-columns:1fr 1fr;gap:2px;">
          <span>⚔ ${td.damage}</span><span>◎ ${td.range}</span>
          <span>⏱ ${td.fireRate}s</span><span>💨 ${td.bulletSpeed}</span>
        </div>
      </div>
      <div style="margin-top:10px;font-size:11px;color:var(--text2);"><div>标准炮塔 → 合成模板</div></div>`;

      const filled = this.chipSlots.filter(Boolean);
      if (filled.length > 0){
        html += `<div style="margin-top:10px;padding:8px;background:rgba(10,14,26,.5);border-radius:6px;font-size:11px;">
          <div style="color:var(--accent);font-weight:bold;margin-bottom:4px;">📊 合成后 stats 预估</div>`;
        const bonus = this._estimateStats(td);
        for (const [k, v] of Object.entries(bonus)){
          html += `<div style="display:flex;justify-content:space-between;margin:2px 0;">
            <span style="color:var(--text2)">${k}</span><span style="color:var(--ok)">${v}</span>
          </div>`;
        }
        html += `</div>`;
      }
    }

    // 已合成塔列表
    const crafted = window.saveData.craftedTowers || [];
    if (crafted.length > 0){
      html += `<div style="margin-top:12px;font-size:11px;color:var(--gold);font-weight:bold;padding-top:6px;border-top:1px dashed var(--border);">🔨 已合成炮塔 (${crafted.length})</div>`;
      for (const ct of crafted){
        const TOWERS = window.TOWER_DATA || [];
        const td = TOWERS[ct.baseType];
        html += `<div style="margin-top:4px;padding:4px 6px;background:#2a2008;border-left:3px solid ${td?.color || '#ffd93d'};border-radius:0 4px 4px 0;font-size:10px;">
          <span style="color:${td?.color || '#ffd93d'}">${td?.symbol || '🔫'}</span>
          <b style="color:#ffd93d;">${ct.name}</b>
          <span style="color:var(--text3);margin-left:4px;">· ${td?.name || '?'} · ${ct.chipIds.length}芯片</span>
        </div>`;
      }
    }

    html += `</div>`;
    return html;
  },

  _estimateStats(td){
    const out = {};
    let dmg = td.damage;
    let rate = td.fireRate;
    let range = td.range;
    let crit = Math.round((td.critChance || 0.05) * 100);
    let pierce = td.pierce || 1;
    let chain = td.chain || 0;

    for (const c of this.chipSlots){
      if (!c) continue;
      const v = c.value || 0;
      switch (c.statField){
        case 'damage': dmg = Math.round(dmg * (1 + v / 100)); out['⚔伤害'] = dmg; break;
        case 'rate': rate = Math.round(rate * (1 + v / 100) * 100) / 100; out['⏱射速'] = rate + 's'; break;
        case 'range': range = Math.round(range * (1 + v / 100)); out['◎射程'] = range; break;
        case 'crit': crit = Math.min(100, crit + v); out['✦暴击'] = crit + '%'; break;
        case 'pierce': pierce += v; out['➤穿透'] = pierce; break;
        case 'chain': chain += v; out['⟲链锁'] = chain; break;
      }
    }
    return out;
  },

  _renderCost(){
    const cost = this._calcTotalCost();
    const credits = (window.saveData && saveData.credits) ?? 0;
    const enough = credits >= cost.total;
    return `<div id="bsCostPanel" style="min-width:200px;background:var(--panel);border:1px solid ${enough ? 'var(--border)' : 'var(--danger)'};border-radius:6px;padding:8px 12px;font-size:11px;">
      <div style="font-size:11px;color:var(--text2);margin-bottom:4px;">💎 费用预览</div>
      <div style="display:flex;justify-content:space-between;color:var(--text);"><span>基础合成</span><span>${cost.base}</span></div>
      <div style="display:flex;justify-content:space-between;color:var(--text);"><span>芯片费用 ×${cost.chipCount}</span><span>${cost.chip}</span></div>
      <div style="margin-top:4px;border-top:1px dashed var(--border);padding-top:4px;display:flex;justify-content:space-between;font-weight:bold;font-size:13px;color:${enough ? 'var(--gold)' : 'var(--danger)'};">
        <span>总计</span><span>${cost.total} 💎</span>
      </div>
      ${!enough ? `<div style="color:var(--danger);font-size:10px;margin-top:2px;">差 ${cost.total - credits} 积分</div>` : ''}
    </div>`;
  },

  /* ============ 费用计算 ============ */
  _calcTotalCost(){
    let base = this.BASE_FEE;
    let chipSum = 0;
    let chipCount = 0;
    for (const c of this.chipSlots){
      if (!c) continue;
      const rarity = c.rarityName || c.rarity || '普通';
      chipSum += this.CRAFT_CHIP_FEE[rarity] || 20;
      chipCount++;
    }
    const total = base + chipSum;
    return { base, chip: chipSum, chipCount, total };
  },

  /* ============ 命名校验 ============ */
  _onNameInput(val){
    this.currentName = val || '';
    this._renderCost();
    const errEl = document.getElementById('bsNameErr');
    const err = this._validateName(this.currentName);
    if (errEl) errEl.textContent = err || '';
    if (!err){
      const can = this._canForge();
      const btn = document.getElementById('bsForgeBtn');
      if (btn){ btn.disabled = !can; btn.style.opacity = can ? '1' : '0.4'; btn.style.cursor = can ? 'pointer' : 'not-allowed'; }
    }
  },

  _validateName(name){
    const trimmed = (name || '').trim();
    if (!trimmed) return '请输入名字!';
    if (trimmed.length > 16) return '名字太长(≤16字)';
    const crafted = (window.saveData && saveData.craftedTowers) || [];
    if (crafted.find(c => c.name === trimmed)) return '名字已存在!';
    return '';
  },

  /* ============ 合成许可 ============ */
  _canForge(){
    if (this.selectedBaseId == null) return false;
    if (!this.chipSlots.some(Boolean)) return false;
    if (this._validateName(this.currentName)) return false;
    // 检查每个 chip 库存 count
    const invChips = (window.saveData.inventory && window.saveData.inventory.chips) || {};
    for (const c of this.chipSlots){
      if (!c) continue;
      if ((invChips[c.libraryId] || 0) <= 0) return false;
    }
    const credits = (window.saveData && saveData.credits) ?? 0;
    return credits >= this._calcTotalCost().total;
  },

  /* ============ 芯片选择弹窗 ============ */
  _pickChip(slotIdx){
    const invChips = (window.saveData.inventory && window.saveData.inventory.chips) || {};
    const lib = window.CHIP_LIBRARY || [];
    // 过滤 count>0 且没被当前槽用了的
    const usedIds = new Set();
    for (const c of this.chipSlots) if (c) usedIds.add(c.libraryId);

    const candidates = [];
    for (const id in invChips){
      const count = invChips[id];
      if (count <= 0) continue;
      const chipLibId = parseInt(id);
      if (usedIds.has(chipLibId)) continue;
      const libChip = lib.find(x => x.libraryId === chipLibId);
      if (libChip) candidates.push({ chip: libChip, count });
    }

    if (candidates.length === 0){
      this._showToast('📦 芯片库存为空 —— 去商店买/关卡通关获得!', '#ff5a2a');
      this._swapFirstIdx = -1;
      return;
    }

    let overlay = document.getElementById('bsChipPicker');
    if (!overlay){
      overlay = document.createElement('div');
      overlay.id = 'bsChipPicker';
      overlay.style.cssText = 'position:fixed;inset:0;background:rgba(10,14,22,.95);z-index:9999;display:flex;align-items:center;justify-content:center;';
      overlay.innerHTML = `<div style="width:800px;max-width:95vw;max-height:85vh;background:var(--panel);border:1px solid var(--border2);border-radius:var(--radius);padding:14px;display:flex;flex-direction:column;">
        <div style="display:flex;justify-content:space-between;margin-bottom:10px;">
          <h3 style="color:var(--accent);margin:0;">⚙ 选择芯片 (库存 ${candidates.length})</h3>
          <button class="btn" onclick="document.getElementById('bsChipPicker').remove()">✕ 取消</button>
        </div>
        <div id="bsChipGrid" style="flex:1;overflow-y:auto;display:grid;grid-template-columns:repeat(auto-fill,minmax(130px,1fr));gap:8px;"></div>
      </div>`;
      document.body.appendChild(overlay);
    } else {
      overlay.style.display = 'flex';
    }

    const grid = document.getElementById('bsChipGrid');
    let html = '';
    for (let i = 0; i < candidates.length; i++){
      const { chip, count } = candidates[i];
      const color = chip.color || '#9aa4bd';
      html += `<div onclick="Blacksmith._chipPicked(${slotIdx}, ${chip.libraryId})" style="cursor:pointer;padding:8px;border:1px solid ${color}40;border-left:3px solid ${color};border-radius:6px;">
        <div style="display:flex;justify-content:space-between;font-size:14px;">
          <span style="color:${color}">${chip.icon || '⚙'}</span>
          <span style="font-size:10px;color:${color}">${chip.rarityName || '普通'} · ×${count}</span>
        </div>
        <div style="font-size:12px;font-weight:bold;color:var(--text);margin-top:3px;">${chip.name}</div>
        <div style="font-size:10px;color:var(--text2);">${chip.slot || ''} Lv.${chip.level || 1}</div>
      </div>`;
    }
    grid.innerHTML = html;
  },

  _chipPicked(slotIdx, libraryId){
    const lib = window.CHIP_LIBRARY || [];
    const chip = lib.find(x => x.libraryId === libraryId);
    if (!chip) return;
    this.chipSlots[slotIdx] = chip;
    this._swapFirstIdx = -1;
    document.getElementById('bsChipPicker')?.remove();
    if (window.AudioFX) AudioFX.play('chip');
    this.render();
  },

  /* ============ 合成执行 ============ */
  forge(){
    if (!this._canForge()){
      const err = this._validateName(this.currentName);
      if (err) this._showToast(err, '#ff5a2a');
      else if (this.selectedBaseId == null) this._showToast('请选择一个基础炮塔!', '#ff5a2a');
      else if (!this.chipSlots.some(Boolean)) this._showToast('至少嵌入一枚芯片!', '#ff5a2a');
      else this._showToast('积分不足或芯片库存不足!', '#ff5a2a');
      if (window.AudioFX) AudioFX.play('hurt');
      return;
    }

    const cost = this._calcTotalCost();
    // 扣积分
    saveData.credits -= cost.total;

    // 消耗芯片库存
    const chipIds = [];
    for (const c of this.chipSlots){
      if (!c) continue;
      window.consumeChipFromInventory(c.libraryId);
      chipIds.push(c.libraryId);
    }

    // 构建 stats
    const TOWERS = window.TOWER_DATA || [];
    const td = TOWERS[this.selectedBaseId];
    const bonus = this._computeFinalStats(td, this.chipSlots);

    const name = this.currentName.trim();
    const uid = 'crafted_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6);
    const crafted = {
      uid,
      baseType: this.selectedBaseId,
      name,
      chipIds,
      stats: {
        damage: bonus.damage,
        range: bonus.range,
        fireRate: bonus.fireRate,
        bulletSpeed: td.bulletSpeed,
        critChance: bonus.critChance,
        pierce: bonus.pierce,
        chain: bonus.chain,
        slow: td.slow,
        dot: td.dot,
        splash: td.splash,
        element: td.element,
        color: td.color,
        symbol: td.symbol || '🔫',
        class: td.class,
        rarity: td.rarity
      }
    };

    if (!saveData.craftedTowers) saveData.craftedTowers = [];
    saveData.craftedTowers.push(crafted);
    saveData.totalTowersBuilt = (saveData.totalTowersBuilt || 0) + 1;
    SaveSystem.save(saveData);

    if (window.AudioFX){ AudioFX.play('levelup'); AudioFX.play('chip'); }
    this._showToast('🎉 合成成功: ' + name + ' (-' + cost.total + '💎)', '#6bff6b');

    // 重置
    this.chipSlots = [null, null, null, null, null];
    this.selectedBaseId = null;
    this.currentName = '';
    this._swapFirstIdx = -1;
    this.render();
  },

  _computeFinalStats(td, chips){
    let dmg = td.damage, rate = td.fireRate, range = td.range;
    let crit = td.critChance || 0, pierce = td.pierce || 1, chain = td.chain || 0;
    for (const c of chips){
      if (!c) continue;
      const v = c.value || 0;
      switch (c.statField){
        case 'damage': dmg = Math.round(dmg * (1 + v / 100)); break;
        case 'rate': rate = Math.round(rate * (1 + v / 100) * 100) / 100; break;
        case 'range': range = Math.round(range * (1 + v / 100)); break;
        case 'crit': crit = Math.min(1, crit + v / 100); break;
        case 'pierce': pierce += v; break;
        case 'chain': chain += v; break;
      }
    }
    return { damage: dmg, range, fireRate: rate, critChance: crit, pierce, chain };
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
  }
};
console.log('Blacksmith v2 ready — unlock model + 5 chip slots + credit fee');
