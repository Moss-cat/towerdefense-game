/* Blacksmith v1 — 铁匠铺 · 自定义塔锻造 */
window.Blacksmith = {
  ready: false,
  selectedTower: null,      // TOWER_DATA entry 或 isForged owned instance
  chipSlots: [null, null, null, null, null],
  currentName: '',
  _swapFirstIdx: -1,        // 点击交换用
  containerEl: null,

  /* ============ 初始化 ============ */
  init(containerEl) {
    if (containerEl) {
      this.containerEl = containerEl;
    } else if (!this.containerEl) {
      // 自动查找容器（shop sibling tab 模式）
      const auto = document.getElementById('blacksmithSection');
      if (auto) this.containerEl = auto;
    }
    this._pickSystemChips();  // 系统芯片可能由 data_chips_extra 后注入，这里补确保
    if (this.containerEl && !this.containerEl.innerHTML) this.render();
    this.ready = true;
  },

  _pickSystemChips() {
    // 确保 economy / template 系统芯片在 CHIP_LIBRARY 中（防御性）
    const lib = window.CHIP_LIBRARY || [];
    if (!lib.find(c => c.statField === 'economy_discount')) {
      lib.unshift({
        libraryId: 'economy_discount', name: '便宜芯片', level: 1, levelLabel: 'I',
        slot: '经济', rarity: '普通', rarityName: '普通', color: '#6bff6b', nestedSlots: 0, energyCost: 1,
        statField: 'economy_discount', statCn: '锻造造价减免', statType: 'economy_discount',
        value: 5, rawValue: 5, valueMode: '百分比', unit: '%', trigger: '锻造时', stackLimit: 5,
        compatibleClasses: [], synergy: '', desc: '锻造时减5%造价（可叠5次=25%上限）',
        icon: '💰', statName: '锻造造价减免', _systemChip: true
      });
    }
    if (!lib.find(c => c.statField === 'make_template')) {
      lib.unshift({
        libraryId: 'make_template', name: '模板化芯片', level: 1, levelLabel: 'I',
        slot: '功能', rarity: '传奇', rarityName: '传奇', color: '#ffd93d', nestedSlots: 1, energyCost: 2,
        statField: 'make_template', statCn: '模板化', statType: 'make_template',
        value: 1, rawValue: 1, valueMode: '数值', unit: '', trigger: '锻造时', stackLimit: 1,
        compatibleClasses: [], synergy: '', desc: '锻造时嵌入此芯片，成品塔可被选为新模板',
        icon: '🔨', statName: '模板化', _systemChip: true
      });
    }
  },

  /* ============ 开关 ============ */
  open() {
    const sec = document.getElementById('blacksmithSection');
    if (sec) sec.classList.remove('hidden');
    this.render();
  },
  close() {
    const sec = document.getElementById('blacksmithSection');
    if (sec) sec.classList.add('hidden');
  },

  /* ============ 渲染入口 ============ */
  render() {
    const el = this.containerEl;
    if (!el) return;
    this._pickSystemChips();

    if (!this._isJsonReady()) {
      el.innerHTML = `
        <div style="display:flex;flex-direction:column;align-items:center;justify-content:center;min-height:400px;color:#ffe27a;gap:16px;">
          <div style="font-size:48px;animation:bsPulse 1.5s infinite;">⏳</div>
          <div style="font-size:18px;">正在加载数据...</div>
          <div style="font-size:13px;opacity:0.6">等 JSON 就绪</div>
        </div>
        <style>@keyframes bsPulse{0%,100%{opacity:0.4}50%{opacity:1}}</style>`;
      return;
    }

    const gold = (window.saveData && saveData.gold) ?? 0;
    const canForge = this._canForge();
    const cost = this._calcTotalCost();

    let html = `
      <div class="bs-header" style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;">
        <div class="bs-title" style="font-size:18px;color:var(--gold);font-weight:bold;text-shadow:0 0 10px rgba(255,226,122,.3);">🔥 铁匠铺 <span style="font-size:11px;opacity:0.5;font-weight:normal;">锻造自定义炮塔</span></div>
        <div style="font-size:16px;color:var(--gold);font-weight:bold;">💰 ${gold}</div>
      </div>
      <div class="bs-body" style="display:grid;grid-template-columns:240px 1fr 260px;gap:10px;min-height:480px;">
        ${this._renderTemplatePool()}
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
          onclick="Blacksmith.forge()" ${!canForge ? 'disabled' : ''}>🔥 锻造!</button>
      </div>`;

    el.innerHTML = html;

    // 绑定名称输入（补一次，因为 innerHTML 替换）
    const ni = document.getElementById('bsNameInput');
    if (ni) {
      ni.value = this.currentName;
      ni.focus();
    }
  },

  _isJsonReady() {
    const t = (window.TOWER_DATA || [])[0];
    return !!(t && (t._jsonLoaded || t.id != null));
  },

  /* ============ 左: 模板池 ============ */
  _renderTemplatePool() {
    // 基础塔: tier===1 或 rarity==='普通'
    const TOWERS = window.TOWER_DATA || [];
    const basicList = TOWERS.filter(t => (t.tier || 1) === 1 || t.rarity === '普通');

    // 已有已锻造且 isTemplate 的塔
    const ownedTemplateList = (window.saveData && saveData.ownedTowers || [])
      .filter(ot => ot.isForged && ot.isTemplate);

    let html = `<div style="background:var(--panel);border:1px solid var(--border);border-radius:var(--radius);padding:10px;overflow-y:auto;max-height:500px;">
      <div style="font-size:12px;color:var(--accent);font-weight:bold;margin-bottom:8px;padding-bottom:4px;border-bottom:1px solid var(--border);">📜 模板塔</div>`;

    if (basicList.length === 0) {
      html += '<div style="opacity:0.4;font-size:11px;">等待基础炮塔数据...</div>';
    } else {
      for (const t of basicList) {
        const sel = this.selectedTower && !this.selectedTower.isForged && this.selectedTower.id === t.id;
        html += this._tplCard(t, sel, false);
      }
    }

    if (ownedTemplateList.length > 0) {
      html += `<div style="font-size:11px;color:var(--gold);margin:12px 0 6px;padding-top:6px;border-top:1px dashed var(--border);">🔗 已锻造·模板链源</div>`;
      for (const ot of ownedTemplateList) {
        const td = TOWERS[ot.towerTypeId];
        const sel = this.selectedTower && this.selectedTower.isForged && this.selectedTower.instanceId === ot.instanceId;
        html += this._tplOwnedCard(ot, td, sel);
      }
    }

    html += `</div>`;
    return html;
  },

  _tplCard(t, selected, isOwned) {
    const color = t.color || '#888';
    return `<div onclick="Blacksmith._selectTemplate(null, ${t.id})" style="cursor:pointer;margin-bottom:6px;padding:8px;border:1px solid ${selected ? 'var(--gold)' : 'var(--border)'};border-radius:6px;background:${selected ? '#2a2414' : 'transparent'};border-left:3px solid ${color};transition:all .15s;"
      onmouseover="this.style.background='rgba(108,168,255,.15)'" onmouseout="this.style.background='${selected ? '#2a2414' : 'transparent'}'">
      <div style="display:flex;justify-content:space-between;align-items:center;">
        <span style="font-size:16px;color:${color}">${t.symbol || '🔫'}</span>
        <span style="font-size:10px;color:${color}">${t.rarity || '普通'}</span>
      </div>
      <div style="font-size:12px;color:var(--text);margin-top:2px;font-weight:bold;">${t.name}</div>
      <div style="font-size:10px;color:var(--text2);">${t.class || ''} · ${t.element || ''}</div>
      <div style="font-size:10px;color:var(--text3);margin-top:2px;">⚔${t.damage} ◎${t.range} ⏱${t.fireRate}s · 💰${t.cost}</div>
    </div>`;
  },

  _tplOwnedCard(ot, td, selected) {
    if (!td) return '';
    const color = td.color || '#888';
    return `<div onclick="Blacksmith._selectTemplate('owned', '${ot.instanceId}')" style="cursor:pointer;margin-bottom:6px;padding:8px;border:1px solid ${selected ? 'var(--gold)' : 'var(--border2)'};border-radius:6px;background:${selected ? '#2a2414' : 'rgba(255,217,61,.06)'};border-left:3px solid ${color};transition:all .15s;">
      <div style="display:flex;justify-content:space-between;align-items:center;">
        <span style="font-size:16px;color:${color}">${td.symbol || '🔫'}</span>
        <span style="font-size:10px;color:var(--gold)">🔨模板</span>
      </div>
      <div style="font-size:12px;color:var(--gold);margin-top:2px;font-weight:bold;">${ot.forgeName || td.name}</div>
      <div style="font-size:10px;color:var(--text2);">Lv.${ot.level} · ${td.class || ''}</div>
    </div>`;
  },

  _selectTemplate(mode, key) {
    if (mode === null) {
      this.selectedTower = (window.TOWER_DATA || [])[key];
    } else if (mode === 'owned') {
      this.selectedTower = (window.saveData.ownedTowers || []).find(ot => ot.instanceId === key);
    }
    if (this.selectedTower && window.AudioFX) AudioFX.play('click');
    this._renderTemplatePool();
    this._renderRightPanel();
  },

  /* ============ 中: 芯片槽 ============ */
  _renderChipSlots() {
    let html = `<div style="background:var(--panel);border:1px solid var(--border);border-radius:var(--radius);padding:12px;display:flex;flex-direction:column;">
      <div style="font-size:12px;color:var(--accent);font-weight:bold;margin-bottom:8px;padding-bottom:4px;border-bottom:1px solid var(--border);">⚙ 芯片槽位 (5) <span style="font-size:10px;color:var(--text3);font-weight:normal;">点击空槽→选芯片 / 点击有芯片→移除 / 先点两个槽→交换</span></div>
      <div style="display:flex;gap:10px;margin-bottom:12px;">`;

    for (let i = 0; i < 5; i++) {
      const chip = this.chipSlots[i];
      const swSel = this._swapFirstIdx === i;
      if (chip) {
        html += `<div onclick="Blacksmith._slotClick(${i})" style="flex:1;min-width:0;aspect-ratio:1/1;border:2px solid ${swSel ? 'var(--gold)' : chip.color || 'var(--border2)'};border-radius:8px;background:linear-gradient(135deg, ${chip.color || '#888'}22, transparent);display:flex;flex-direction:column;align-items:center;justify-content:center;cursor:pointer;transition:all .15s;position:relative;"
          title="点击移除 / 先点其他槽→交换">
          <div style="font-size:22px;color:${chip.color || '#888'}">${chip.icon || '⚙'}</div>
          <div style="font-size:9px;color:${chip.color || '#888'};margin-top:2px;max-width:100%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;padding:0 4px;">${chip.name}</div>
          ${this._isSystemChip(chip) ? `<div style="position:absolute;top:2px;right:4px;font-size:10px;">${chip.statField === 'economy_discount' ? '💰' : '🔨'}</div>` : ''}
        </div>`;
      } else {
        html += `<div onclick="Blacksmith._slotClick(${i})" style="flex:1;min-width:0;aspect-ratio:1/1;border:2px dashed ${swSel ? 'var(--gold)' : 'var(--border2)'};border-radius:8px;background:rgba(10,14,26,.6);display:flex;flex-direction:column;align-items:center;justify-content:center;cursor:pointer;color:var(--text3);font-size:20px;transition:all .15s;"
          title="点击添加芯片">
          <span style="font-size:20px;">+</span>
          <span style="font-size:9px;margin-top:2px;">槽${i+1}</span>
        </div>`;
      }
    }
    html += `</div>`;

    // 已放置芯片列表（详细信息）
    html += `<div style="flex:1;overflow-y:auto;font-size:11px;">`;
    const filled = this.chipSlots.filter(Boolean);
    if (filled.length === 0) {
      html += `<div style="color:var(--text3);padding:20px;text-align:center;opacity:0.5">从芯片库存选择最多 5 枚芯片嵌入槽位</div>`;
    } else {
      for (let i = 0; i < 5; i++) {
        const c = this.chipSlots[i];
        if (!c) continue;
        const isEcon = c.statField === 'economy_discount';
        const isTpl = c.statField === 'make_template';
        const tag = isEcon ? '💰 便宜芯片(-5%)' : isTpl ? '🔨 模板化' : (c.rarityName || '普通');
        html += `<div style="padding:6px 8px;border-left:3px solid ${c.color || '#888'};background:rgba(10,14,26,.5);margin-bottom:4px;border-radius:0 4px 4px 0;">
          <div style="display:flex;justify-content:space-between;align-items:center;">
            <span style="font-size:13px;color:${c.color || '#888'}">${c.icon || '⚙'} ${c.name}</span>
            <span style="font-size:10px;color:${isEcon ? '#6bff6b' : isTpl ? '#ffd93d' : c.color || '#9aa4bd'};">${tag}</span>
          </div>
          <div style="color:var(--text2);font-size:10px;margin-top:2px;">${c.statCn || c.statField || ''}=${c.value || ''}${c.unit || ''} · ${c.desc || ''}</div>
        </div>`;
      }
    }
    html += `</div></div>`;
    return html;
  },

  _slotClick(idx) {
    // 交换模式
    if (this._swapFirstIdx >= 0) {
      if (this._swapFirstIdx === idx) {
        this._swapFirstIdx = -1;
      } else {
        const a = this._swapFirstIdx;
        const b = idx;
        const tmp = this.chipSlots[a];
        this.chipSlots[a] = this.chipSlots[b];
        this.chipSlots[b] = tmp;
        this._swapFirstIdx = -1;
        if (window.AudioFX) AudioFX.play('click');
      }
      this.render();
      return;
    }

    const chip = this.chipSlots[idx];
    if (chip) {
      // 点击有芯片槽 → 进入交换模式（第二次点击才移除）
      this._swapFirstIdx = idx;
      this.render();
      setTimeout(() => {
        // 1.5s 内没点其他槽 → 视为移除
        if (this._swapFirstIdx === idx) {
          this.chipSlots[idx] = null;
          this._swapFirstIdx = -1;
          if (window.AudioFX) AudioFX.play('click');
          this.render();
        }
      }, 1500);
    } else {
      this._swapFirstIdx = idx;  // 选槽
      this._pickChip(idx);
    }
  },

  /* ============ 右: 预览 ============ */
  _renderRightPanel() {
    let html = `<div style="background:var(--panel);border:1px solid var(--border);border-radius:var(--radius);padding:12px;display:flex;flex-direction:column;overflow-y:auto;">
      <div style="font-size:12px;color:var(--accent);font-weight:bold;margin-bottom:8px;padding-bottom:4px;border-bottom:1px solid var(--border);">🎯 锻造预览</div>`;

    if (!this.selectedTower) {
      html += `<div style="color:var(--text3);text-align:center;padding:30px 10px;">
        <div style="font-size:32px;margin-bottom:10px;">👈</div>
        <div style="font-size:12px;">请从左侧选择一个模板塔</div>
      </div>`;
    } else {
      const TOWERS = window.TOWER_DATA || [];
      const td = this.selectedTower.isForged
        ? TOWERS[this.selectedTower.towerTypeId]
        : this.selectedTower;
      const color = td.color || '#888';
      html += `<div style="border:1px solid ${color}40;border-radius:8px;padding:10px;background:linear-gradient(135deg, ${color}22, transparent);">
        <div style="display:flex;justify-content:space-between;">
          <span style="font-size:28px;color:${color}">${td.symbol || '🔫'}</span>
          <span style="font-size:10px;color:${color};padding:2px 6px;border:1px solid ${color};border-radius:4px;">${td.rarity || '普通'}</span>
        </div>
        <div style="font-size:13px;font-weight:bold;color:var(--text);margin-top:6px;">
          ${this.selectedTower.isForged ? (this.selectedTower.forgeName || td.name + ' (锻造)') : td.name}
        </div>
        <div style="font-size:10px;color:var(--text2);margin-top:2px;">${td.class || ''} · ${td.element || ''} ${this.selectedTower.isForged ? '· Lv.' + this.selectedTower.level : ''}</div>
        <div style="font-size:10px;color:var(--text3);margin-top:6px;display:grid;grid-template-columns:1fr 1fr;gap:2px;">
          <span>⚔ ${td.damage}${this.selectedTower.isForged ? ' +' + ((this.selectedTower.level - 1) * 0.2 | 0) + '%' : ''}</span>
          <span>◎ ${td.range}</span>
          <span>⏱ ${td.fireRate}s</span>
          <span>💨 ${td.bulletSpeed}</span>
        </div>
      </div>
      <div style="margin-top:10px;font-size:11px;color:var(--text2);">
        ${this.selectedTower.isForged
          ? `<div>🔗 作为模板源 → 可锻造链嵌套</div>
             ${this.selectedTower.isTemplate ? '<div style="color:var(--gold)">✨ 本身已是模板塔</div>' : ''}`
          : `<div>标准炮塔 → 基础锻造模板</div>`}
      </div>`;

      // 槽位加成预览
      const filled = this.chipSlots.filter(Boolean);
      if (filled.length > 0) {
        html += `<div style="margin-top:10px;padding:8px;background:rgba(10,14,26,.5);border-radius:6px;font-size:11px;">
          <div style="color:var(--accent);font-weight:bold;margin-bottom:4px;">📊 槽位加成预估</div>`;
        const bonus = this._estimateStats(td);
        for (const [k, v] of Object.entries(bonus)) {
          html += `<div style="display:flex;justify-content:space-between;margin:2px 0;">
            <span style="color:var(--text2)">${k}</span><span style="color:var(--ok)">${v}</span>
          </div>`;
        }
        html += `</div>`;
      }
    }
    html += `</div>`;
    return html;
  },

  _estimateStats(td) {
    const out = {};
    let dmg = td.damage;
    let rate = td.fireRate;
    let range = td.range;
    let crit = Math.round((td.critChance || 0.05) * 100);
    let dot = td.dot || 0;
    let slow = Math.round((td.slow || 0) * 100);
    let pierce = td.pierce || 1;
    let chain = td.chain || 0;

    for (const c of this.chipSlots) {
      if (!c) continue;
      const v = c.value || 0;
      switch (c.statField) {
        case 'damage': case 'crit':
          dmg = Math.round(dmg * (1 + v / 100)); out['⚔伤害'] = dmg; break;
        case 'rate':
          rate = Math.round(rate * (1 + v / 100) * 100) / 100; out['⏱射速'] = rate + 's'; break;
        case 'range':
          range = Math.round(range * (1 + v / 100)); out['◎射程'] = range; break;
        case 'crit':
          crit = Math.min(100, crit + v); out['✦暴击'] = crit + '%'; break;
        case 'pierce':
          pierce += v; out['➤穿透'] = pierce; break;
        case 'chain':
          chain += v; out['⟲链锁'] = chain; break;
        case 'dot':
          dot += v; out['☠DOT'] = dot + '/s'; break;
        case 'slow':
          slow = Math.min(80, slow + v); out['❄减速'] = slow + '%'; break;
      }
    }
    return out;
  },

  _renderCost() {
    const cost = this._calcTotalCost();
    const gold = (window.saveData && saveData.gold) ?? 0;
    const enough = gold >= cost.total;
    return `<div id="bsCostPanel" style="min-width:200px;background:var(--panel);border:1px solid ${enough ? 'var(--border)' : 'var(--danger)'};border-radius:6px;padding:8px 12px;font-size:11px;">
      <div style="font-size:11px;color:var(--text2);margin-bottom:4px;">💰 费用预览</div>
      <div style="display:flex;justify-content:space-between;color:var(--text);"><span>基础锻造 (×2.0)</span><span>${cost.base}</span></div>
      <div style="display:flex;justify-content:space-between;color:var(--text);"><span>芯片费用 (×0.5)</span><span>${cost.chip}</span></div>
      ${cost.econCount > 0 ? `<div style="display:flex;justify-content:space-between;color:#6bff6b;"><span>💰便宜芯片 (×${cost.econCount})</span><span>-${Math.round(cost.econCount * 5)}%</span></div>` : ''}
      ${cost.tplCount > 0 ? `<div style="display:flex;justify-content:space-between;color:#ffd93d;"><span>🔨模板芯片 (×${cost.tplCount})</span><span>-${Math.round(cost.tplCount * 10)}%</span></div>` : ''}
      <div style="margin-top:4px;border-top:1px dashed var(--border);padding-top:4px;display:flex;justify-content:space-between;font-weight:bold;font-size:13px;color:${enough ? 'var(--gold)' : 'var(--danger)'};">
        <span>总计</span><span>${cost.total} 💰</span>
      </div>
      ${!enough ? `<div style="color:var(--danger);font-size:10px;margin-top:2px;">差 ${cost.total - gold} 金币</div>` : ''}
    </div>`;
  },

  /* ============ 费用计算 ============ */
  _RARITY_MULT: { '普通': 12, '稀有': 22, '史诗': 38, '传奇': 60, '神话': 100 },

  _calcTotalCost() {
    const tower = this.selectedTower;
    let base = 50;
    if (tower) {
      if (tower.isForged) {
        // 已锻造塔当模板 → 用模板源塔 cost
        const TOWERS = window.TOWER_DATA || [];
        const td = TOWERS[tower.towerTypeId];
        base = (td?.cost || 100) * 2.0;
      } else {
        base = (tower.cost || 50) * 2.0;
      }
    }
    let chipSum = 0;
    let econCount = 0, tplCount = 0;
    for (const c of this.chipSlots) {
      if (!c) continue;
      const mult = this._RARITY_MULT[c.rarityName || c.rarity || '普通'] || 12;
      chipSum += (c.value || 10) * mult;
      if (c.statField === 'economy_discount') econCount++;
      if (c.statField === 'make_template') tplCount++;
    }
    const chipCost = Math.round(chipSum * 0.5);
    const economyDiscount = Math.min(0.25, 0.05 * econCount);
    const templateDiscount = Math.min(0.30, 0.10 * tplCount);
    const total = Math.round((base + chipCost) * (1 - economyDiscount - templateDiscount));
    return {
      base: Math.round(base), chip: chipCost,
      econCount, tplCount,
      economyDiscount, templateDiscount,
      total: Math.max(1, total)
    };
  },

  /* ============ 命名校验 ============ */
  _onNameInput(val) {
    this.currentName = val || '';
    this._renderCost();
    const errEl = document.getElementById('bsNameErr');
    const err = this._validateName(this.currentName);
    if (errEl) errEl.textContent = err || '';
    if (!err) {
      // 没其他副作用 —— 但重算按钮状态
      const can = this._canForge();
      const btn = document.getElementById('bsForgeBtn');
      if (btn) { btn.disabled = !can; btn.style.opacity = can ? '1' : '0.4'; btn.style.cursor = can ? 'pointer' : 'not-allowed'; }
    }
  },

  _validateName(name) {
    const trimmed = (name || '').trim();
    if (!trimmed) return '请输入名字!';
    if (trimmed.length > 16) return '名字太长(≤16字)';
    // 重复检查
    const owned = (window.saveData && saveData.ownedTowers || []);
    const dup = owned.find(ot => ot.forgeName && ot.forgeName === trimmed);
    if (dup) return '名字已存在!';
    return '';
  },

  _isSystemChip(c) {
    return c && (c.statField === 'economy_discount' || c.statField === 'make_template');
  },

  /* ============ 锻造许可 ============ */
  _canForge() {
    if (!this.selectedTower) return false;
    const hasChip = this.chipSlots.some(Boolean);
    if (!hasChip) return false;
    if (this._validateName(this.currentName)) return false;
    const gold = (window.saveData && saveData.gold) ?? 0;
    return gold >= this._calcTotalCost().total;
  },

  /* ============ 芯片选择弹窗 ============ */
  _pickChip(slotIdx) {
    // 取 chipInventory（已拥有）
    const inv = (window.saveData && saveData.chipInventory || []);
    if (inv.length === 0) {
      this._showToast('📦 芯片库存为空 —— 去商店先买几片!', '#ff5a2a');
      this._swapFirstIdx = -1;
      return;
    }

    // 过滤掉已占用
    const usedRuntimeIds = new Set();
    for (const c of this.chipSlots) if (c && c.runtimeId) usedRuntimeIds.add(c.runtimeId);

    // 弹窗
    let overlay = document.getElementById('bsChipPicker');
    if (!overlay) {
      overlay = document.createElement('div');
      overlay.id = 'bsChipPicker';
      overlay.style.cssText = 'position:fixed;inset:0;background:rgba(10,14,22,.95);z-index:9999;display:flex;align-items:center;justify-content:center;';
      overlay.innerHTML = `<div style="width:800px;max-width:95vw;max-height:85vh;background:var(--panel);border:1px solid var(--border2);border-radius:var(--radius);padding:14px;display:flex;flex-direction:column;">
        <div style="display:flex;justify-content:space-between;margin-bottom:10px;">
          <h3 style="color:var(--accent);margin:0;">⚙ 选择芯片 (库存 ${inv.length})</h3>
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
    for (let i = 0; i < inv.length; i++) {
      const c = inv[i];
      const used = usedRuntimeIds.has(c.runtimeId);
      const color = c.color || '#9aa4bd';
      const isEcon = c.statField === 'economy_discount';
      const isTpl = c.statField === 'make_template';
      html += `<div onclick="Blacksmith._chipPicked(${slotIdx}, ${i})" style="cursor:${used ? 'not-allowed' : 'pointer'};opacity:${used ? 0.3 : 1};padding:8px;border:1px solid ${color}40;border-left:3px solid ${color};border-radius:6px;background:${isTpl ? '#2a2008' : 'transparent'};"
        title="${used ? '已在槽位内' : ''}">
        <div style="display:flex;justify-content:space-between;font-size:14px;">
          <span style="color:${color}">${c.icon || '⚙'}</span>
          <span style="font-size:10px;color:${color}">${c.rarityName || '普通'}</span>
        </div>
        <div style="font-size:12px;font-weight:bold;color:var(--text);margin-top:3px;">${c.name}</div>
        <div style="font-size:10px;color:var(--text2);">${c.slot || ''} Lv.${c.level || 1}</div>
        ${isEcon ? '<div style="font-size:10px;color:#6bff6b;margin-top:2px;">💰 便宜芯片</div>' : ''}
        ${isTpl ? '<div style="font-size:10px;color:#ffd93d;margin-top:2px;">🔨 模板化</div>' : ''}
      </div>`;
    }
    grid.innerHTML = html;
  },

  _chipPicked(slotIdx, invIdx) {
    const inv = (window.saveData && saveData.chipInventory || []);
    const chip = inv[invIdx];
    if (!chip) return;
    // 深拷贝（含嵌套）
    const clone = JSON.parse(JSON.stringify(chip));
    // 给新拷贝一个临时 runtimeId 用于库存扣除（用原 runtimeId 找到库存条目）
    clone._inventoryRuntimeId = chip.runtimeId;
    this.chipSlots[slotIdx] = clone;
    this._swapFirstIdx = -1;
    document.getElementById('bsChipPicker')?.remove();
    if (window.AudioFX) AudioFX.play('chip');
    this.render();
  },

  /* ============ 锻造执行 ============ */
  forge() {
    if (!this._canForge()) {
      const err = this._validateName(this.currentName);
      if (err) this._showToast(err, '#ff5a2a');
      else if (!this.selectedTower) this._showToast('请选择一个模板塔!', '#ff5a2a');
      else if (!this.chipSlots.some(Boolean)) this._showToast('至少嵌入一枚芯片!', '#ff5a2a');
      else this._showToast('金币不足!', '#ff5a2a');
      if (window.AudioFX) AudioFX.play('hurt');
      return;
    }

    const cost = this._calcTotalCost();
    // 扣费
    saveData.gold -= cost.total;

    // 芯片消耗：从库存中移除（按 runtimeId）
    for (const c of this.chipSlots) {
      if (!c) continue;
      const rid = c._inventoryRuntimeId || c.runtimeId;
      if (!saveData.chipInventory) saveData.chipInventory = [];
      const idx = saveData.chipInventory.findIndex(ic => ic.runtimeId === rid);
      if (idx >= 0) {
        // 连同嵌套子芯片一起从库存清除（此处库存只有扁平条目，递归移除）
        this._removeChipFromInventoryRecursive(saveData.chipInventory[idx]);
        saveData.chipInventory.splice(idx, 1);
      }
    }

    // 判断是否有模板化芯片
    const hasTemplateChip = this.chipSlots.some(c => c && c.statField === 'make_template');

    // 构建实例
    const name = this.currentName.trim();
    const instance = {
      instanceId: 'bt_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6),
      towerTypeId: this.selectedTower.isForged ? this.selectedTower.towerTypeId : this.selectedTower.id,
      forgeName: name,
      level: 1,
      isForged: true,
      isTemplate: hasTemplateChip,  // 仅当嵌入了模板化芯片才成为模板（源模板状态不继承）
      chips: this.chipSlots.map(c => c ? JSON.parse(JSON.stringify({ ...c, _inventoryRuntimeId: undefined })) : null),
      forgeTime: Date.now(),
      costPaid: cost.total,
      sourceTemplateId: this.selectedTower.isForged ? this.selectedTower.instanceId : null
    };

    if (!saveData.ownedTowers) saveData.ownedTowers = [];
    saveData.ownedTowers.push(instance);

    // 解锁源塔（若模板是基础塔）
    if (!this.selectedTower.isForged) {
      const id = this.selectedTower.id;
      if (!saveData.unlockedTowers) saveData.unlockedTowers = [];
      if (!saveData.unlockedTowers.includes(id)) saveData.unlockedTowers.push(id);
    }

    saveData.totalTowersBuilt = (saveData.totalTowersBuilt || 0) + 1;
    saveData.totalGoldSpent = (saveData.totalGoldSpent || 0) + cost.total;

    // 保存
    if (window.SaveSystem) SaveSystem.save(saveData);

    // 音效 & Toast
    if (window.AudioFX) { AudioFX.play('levelup'); AudioFX.play('chip'); }
    let toast = `🎉 锻造成功! ${name} 加入你的阵容 (-${cost.total}💰)`;
    if (instance.isTemplate) toast += ` 🔨【模板塔】可作为锻造链源`;
    this._showToast(toast, '#6bff6b');

    // 重置
    this.chipSlots = [null, null, null, null, null];
    this.selectedTower = null;
    this.currentName = '';
    this._swapFirstIdx = -1;
    this.render();
  },

  _removeChipFromInventoryRecursive(chip) {
    // 若 chipInventory 中嵌套子芯片（chip.children），先收集 runtimeId 再移除
    if (!chip) return;
    if (!saveData.chipInventory) return;
    const kids = chip.children || chip.chips || [];
    for (const k of kids) {
      const rid = k.runtimeId;
      if (rid) {
        const idx = saveData.chipInventory.findIndex(ic => ic.runtimeId === rid);
        if (idx >= 0) {
          this._removeChipFromInventoryRecursive(saveData.chipInventory[idx]);
          saveData.chipInventory.splice(idx, 1);
        }
      }
    }
  },

  /* ============ Toast ============ */
  _showToast(text, color) {
    const t = document.createElement('div');
    t.className = 'ach-toast';
    t.innerHTML = `<div class="ach-name" style="color:${color}">${text}</div>`;
    const c = document.getElementById('achToastContainer');
    if (c) c.appendChild(t);
    else { document.body.appendChild(t); t.style.cssText = 'position:fixed;top:80px;right:20px;z-index:500;'; }
    setTimeout(() => { t.style.animation = 'slideOut .5s forwards'; setTimeout(() => t.remove(), 500); }, 2500);
  }
};
console.log('Blacksmith v1 ready — forge page, 5 chip slots, template/economy chips');
