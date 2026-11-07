/* SaveSystem v3 — 双货币 + 解锁+合成模型
   credits   : 持久化积分（商店买塔/芯片、铁匠铺合成）
   GS.gold   : 战斗临时金币（战斗里造塔/升级/出售）
   ownedTowers  : int[]（TOWER_DATA 索引 id），买一次永久解锁，战斗可无限次建造
   craftedTowers: [{ uid, baseType, name, chipIds, stats }]  合成塔，直接进战斗塔栏
   inventory.chips: { [libraryId]: count }  芯片按 id 计数
*/
window.SaveSystem = {
  KEY: 'tdf_save_v3',
  defaultData(){
    return {
      // === 持久化积分（新货币） ===
      credits: 800,

      // === 炮塔：解锁型（TOWER_DATA 的索引 id） ===
      ownedTowers: [0],          // 默认解锁第 0 号塔

      // === 合成塔 ===
      craftedTowers: [],

      // === 芯片库存：{ [libraryId]: count } ===
      inventory: { chips: {} },

      // === 出战：选哪些塔进战斗 (int 数组，混合 base id 和 crafted uid) ===
      loadout: [0],

      // === 图鉴 ===
      discoveredChips: [],

      // === 统计 ===
      bestWave: 0, bestScore: 0, totalKills: 0, totalTowersBuilt: 0,
      totalChipsCollected: 0, bestCombo: 0, playCount: 0,
      unlockedLevel: 1, clearedLevels: [], clearedCount: 0, totalGoldEarned: 0,
      achievementsUnlocked: []
    };
  },
  load(){
    try {
      const raw = JSON.parse(localStorage.getItem(this.KEY));
      const s = Object.assign(this.defaultData(), raw || {});
      // 兼容迁移：inventory.chips 老格式是数组 → 转计数
      if (s.inventory && Array.isArray(s.inventory.chips)) {
        const newChips = {};
        for (const c of s.inventory.chips) {
          const id = c && c.libraryId != null ? c.libraryId : (c && typeof c === 'number' ? c : null);
          if (id != null) newChips[id] = (newChips[id] || 0) + 1;
        }
        s.inventory.chips = newChips;
      } else if (!s.inventory) {
        s.inventory = { chips: {} };
      } else if (!s.inventory.chips) {
        s.inventory.chips = {};
      }
      // ownedTowers 兼容：老格式 [{runtimeId, towerTypeId}] → int[]
      if (Array.isArray(s.ownedTowers) && s.ownedTowers.length > 0 && typeof s.ownedTowers[0] === 'object') {
        const set = new Set();
        for (const ot of s.ownedTowers) {
          if (ot && ot.towerTypeId != null) set.add(ot.towerTypeId);
        }
        s.ownedTowers = Array.from(set);
      }
      // credits 迁移：如果没有但有 gold
      if (s.credits == null && s.gold != null) s.credits = s.gold;
      // craftedTowers 确保数组
      if (!Array.isArray(s.craftedTowers)) s.craftedTowers = [];
      // loadout 迁移：runtimeId → id (base) / uid (crafted)
      if (Array.isArray(s.loadout) && s.loadout.length > 0 && typeof s.loadout[0] === 'string' && s.loadout[0].startsWith('ot_')) {
        // 旧 loadout 存的是 ownedTowers 里的 runtimeId —— 只能重新给空，让用户重新选
        s.loadout = [];
      }
      return s;
    } catch (e) { return this.defaultData(); }
  },
  save(data){
    try { localStorage.setItem(this.KEY, JSON.stringify(data)); } catch (e) {}
  },
  reset(){ localStorage.removeItem(this.KEY); window.saveData = this.defaultData(); },
  export(){ return JSON.stringify(window.saveData); },
  import(str){
    try {
      const d = JSON.parse(str);
      window.saveData = Object.assign(this.defaultData(), d);
      // 重新走一遍 load 兼容逻辑
      window.saveData = this.load.__proto__ === Object.prototype ? this.load() : window.saveData;
      this.save(window.saveData); return true;
    } catch (e) { return false; }
  }
};
window.saveData = window.SaveSystem.load();

/* ============ 辅助 ============ */
window.addChipToInventory = function(libraryId, n){
  if (!window.saveData.inventory) window.saveData.inventory = { chips: {} };
  if (!window.saveData.inventory.chips) window.saveData.inventory.chips = {};
  window.saveData.inventory.chips[libraryId] = (window.saveData.inventory.chips[libraryId] || 0) + (n || 1);
  window.saveData.totalChipsCollected = (window.saveData.totalChipsCollected || 0) + (n || 1);
  if (!window.saveData.discoveredChips) window.saveData.discoveredChips = [];
  if (!window.saveData.discoveredChips.includes(libraryId)) window.saveData.discoveredChips.push(libraryId);
};
window.consumeChipFromInventory = function(libraryId){
  if (!window.saveData.inventory || !window.saveData.inventory.chips) return false;
  const c = window.saveData.inventory.chips;
  if ((c[libraryId] || 0) <= 0) return false;
  c[libraryId]--;
  if (c[libraryId] <= 0) delete c[libraryId];
  return true;
};
window.getChipCount = function(libraryId){
  return window.saveData?.inventory?.chips?.[libraryId] || 0;
};

/* Achievement check functions — conditions reference saveData and GameState */
window.AchievementSystem = {
  checkAll(){
    if (!window.ACHIEVEMENTS) return;
    const unlocked = saveData.achievementsUnlocked || [];
    let newlyUnlocked = 0;
    for (const ach of window.ACHIEVEMENTS) {
      if (unlocked.includes(ach.id)) continue;
      let ok = false;
      switch (ach.category) {
        case 'milestone':
          if (ach.name.includes('波次') && ach.name.match(/\d+/)) {
            const n = parseInt(ach.name.match(/\d+/)[0]);
            ok = saveData.bestWave >= n;
          } else if (ach.name.includes('存活') && ach.name.match(/\d+/)) {
            const n = parseInt(ach.name.match(/\d+/)[0]);
            ok = saveData.bestWave >= n;
          } else if (ach.name.includes('通关')) { ok = saveData.bestWave >= 50; }
          break;
        case 'combat':
          if (ach.name.includes('击杀') && ach.name.match(/\d+/)) {
            const n = parseInt(ach.name.match(/\d+/)[0]);
            ok = saveData.totalKills >= n;
          } else if (ach.name.includes('连击') && ach.name.match(/\d+/)) {
            const n = parseInt(ach.name.match(/\d+/)[0]);
            ok = saveData.bestCombo >= n;
          }
          break;
        case 'build':
          if (ach.name.includes('炮塔') && ach.name.match(/\d+/)) {
            const n = parseInt(ach.name.match(/\d+/)[0]);
            ok = saveData.totalTowersBuilt >= n;
          }
          break;
        case 'collection':
          if (ach.name.includes('芯片') && ach.name.match(/\d+/)) {
            const n = parseInt(ach.name.match(/\d+/)[0]);
            ok = saveData.totalChipsCollected >= n;
          } else if (ach.name.includes('解锁炮塔') && ach.name.match(/\d+/)) {
            const n = parseInt(ach.name.match(/\d+/)[0]);
            ok = (saveData.ownedTowers || []).length >= n;
          }
          break;
        case 'special':
          if (ach.name.includes('得分') && ach.name.match(/\d+/)) {
            const n = parseInt(ach.name.match(/\d+/)[0]);
            ok = saveData.bestScore >= n;
          }
          break;
      }
      if (ok) {
        unlocked.push(ach.id);
        saveAchievement(ach);
        newlyUnlocked++;
      }
    }
    if (newlyUnlocked > 0) {
      saveData.achievementsUnlocked = unlocked;
      SaveSystem.save(saveData);
    }
    return newlyUnlocked;
  }
};
function saveAchievement(ach){
  window.saveData.achievementsUnlocked = window.saveData.achievementsUnlocked || [];
  if (window.saveData.achievementsUnlocked.includes(ach.id)) return;
  window.saveData.achievementsUnlocked.push(ach.id);
  // grant reward
  const amount = ach.rewardAmount || 1;
  if (ach.rewardType === 'gold' || ach.rewardType === 'credits') {
    saveData.credits = (saveData.credits || 0) + amount;
    if (window.AudioFX) AudioFX.play('coin');
  } else if (ach.rewardType && ach.rewardType.startsWith('chip')) {
    const CHIP_LIB = window.CHIP_LIBRARY || [];
    for (let i = 0; i < amount; i++) {
      const pick = CHIP_LIB[Math.floor(Math.random() * CHIP_LIB.length)];
      if (pick) window.addChipToInventory(pick.libraryId);
    }
  }
  showAchToast(ach);
  if (window.AudioFX) AudioFX.play('achievement');
}
function showAchToast(ach){
  const el = document.createElement('div');
  el.className = 'ach-toast';
  el.innerHTML = `<div class="ach-name">🏆 ${ach.icon || '🏆'} ${ach.name}</div><div class="ach-reward">${ach.desc || ''} · 奖励: ${ach.rewardAmount || 1} ${ach.rewardType || ''}</div>`;
  const container = document.getElementById('achToastContainer');
  if (!container) { document.body.appendChild(el); } else { container.appendChild(el); }
  setTimeout(() => { el.style.animation = 'slideOut .6s ease-in forwards'; setTimeout(() => el.remove(), 600); }, 3500);
}
function openAchievementModal(){
  const overlay = document.createElement('div');
  overlay.className = 'browse-overlay';
  const achs = window.ACHIEVEMENTS || [];
  const unlocked = saveData.achievementsUnlocked || [];
  let html = `<h2>🏆 成就列表 (${unlocked.length}/${achs.length})</h2>
    <div class="browse-grid">`;
  for (const a of achs) {
    const done = unlocked.includes(a.id);
    html += `<div class="browse-card" style="${done ? 'border-color:#ffe27a;background:#2a2a14;' : 'opacity:0.5;'}">
      <div class="name" style="${done ? 'color:#ffe27a' : 'color:#7a86a0;'}">${a.icon || '🏆'} ${a.name} ${done ? '✓' : ''}</div>
      <div class="stats">${a.desc || ''}</div>
      <div class="stats" style="color:#c89b3a;">奖励: ${a.rewardAmount || 1} ${a.rewardType || ''}</div>
    </div>`;
  }
  html += `</div><button class="btn danger browse-close" onclick="this.parentElement.remove()">✕ 关闭</button>`;
  overlay.innerHTML = html;
  overlay.onclick = e => { if (e.target === overlay) overlay.remove(); };
  document.body.appendChild(overlay);
}
console.log('SaveSystem v3 ready — credits + unlock model + craftedTowers');
