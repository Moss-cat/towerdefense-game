/* SaveSystem + AchievementSystem */
window.SaveSystem = {
  KEY: 'tdf_save_v2',
  defaultData(){
    return {
      // 持久化金币（主菜单花的）
      gold: 500,
      // 已购买的塔 { runtimeId, towerTypeId, level, chips }
      ownedTowers: [],
      // 出战配置：runtimeId 数组，最多 5 个
      loadout: [],
      // 原字段
      bestWave:0, bestScore:0, totalKills:0, totalTowersBuilt:0,
      totalChipsCollected:0, bestCombo:0, playCount:0,
      unlockedLevel:1, clearedLevels:[], clearedCount:0, totalGoldEarned:0,
      unlockedTowers:[0], unlockedEnemies:[], unlockedElites:[],
      achievementsUnlocked:[], chipInventory:[]
    };
  },
  load(){
    try{
      const s = JSON.parse(localStorage.getItem(this.KEY));
      return Object.assign(this.defaultData(), s||{});
    }catch(e){ return this.defaultData(); }
  },
  save(data){
    try{ localStorage.setItem(this.KEY, JSON.stringify(data)); }catch(e){}
  },
  reset(){ localStorage.removeItem(this.KEY); window.saveData = this.defaultData(); },
  export(){ return JSON.stringify(window.saveData); },
  import(str){
    try{ const d=JSON.parse(str); window.saveData = Object.assign(this.defaultData(),d); this.save(window.saveData); return true; }
    catch(e){ return false; }
  }
};
window.saveData = window.SaveSystem.load();

/* Achievement check functions — conditions reference saveData and GameState */
window.AchievementSystem = {
  checkAll(){
    if(!window.ACHIEVEMENTS) return;
    const unlocked = saveData.achievementsUnlocked || [];
    let newlyUnlocked = 0;
    for(const ach of window.ACHIEVEMENTS){
      if(unlocked.includes(ach.id)) continue;
      let ok = false;
      switch(ach.category){
        case 'milestone':
          if(ach.name.includes('波次') && ach.name.match(/\d+/)){
            const n = parseInt(ach.name.match(/\d+/)[0]);
            ok = saveData.bestWave >= n;
          }else if(ach.name.includes('存活') && ach.name.match(/\d+/)){
            const n = parseInt(ach.name.match(/\d+/)[0]);
            ok = saveData.bestWave >= n;
          }else if(ach.name.includes('通关')){ ok = saveData.bestWave >= 50; }
          break;
        case 'combat':
          if(ach.name.includes('击杀') && ach.name.match(/\d+/)){
            const n = parseInt(ach.name.match(/\d+/)[0]);
            ok = saveData.totalKills >= n;
          }else if(ach.name.includes('连击') && ach.name.match(/\d+/)){
            const n = parseInt(ach.name.match(/\d+/)[0]);
            ok = saveData.bestCombo >= n;
          }
          break;
        case 'build':
          if(ach.name.includes('炮塔') && ach.name.match(/\d+/)){
            const n = parseInt(ach.name.match(/\d+/)[0]);
            ok = saveData.totalTowersBuilt >= n;
          }
          break;
        case 'collection':
          if(ach.name.includes('芯片') && ach.name.match(/\d+/)){
            const n = parseInt(ach.name.match(/\d+/)[0]);
            ok = saveData.totalChipsCollected >= n;
          }else if(ach.name.includes('解锁炮塔') && ach.name.match(/\d+/)){
            const n = parseInt(ach.name.match(/\d+/)[0]);
            ok = (saveData.unlockedTowers||[]).length >= n;
          }else if(ach.name.includes('解锁敌人') && ach.name.match(/\d+/)){
            const n = parseInt(ach.name.match(/\d+/)[0]);
            ok = (saveData.unlockedEnemies||[]).length >= n;
          }
          break;
        case 'special':
          if(ach.name.includes('得分') && ach.name.match(/\d+/)){
            const n = parseInt(ach.name.match(/\d+/)[0]);
            ok = saveData.bestScore >= n;
          }
          break;
      }
      if(ok){
        unlocked.push(ach.id);
        saveAchievement(ach);
        newlyUnlocked++;
      }
    }
    if(newlyUnlocked>0){
      saveData.achievementsUnlocked = unlocked;
      SaveSystem.save(saveData);
    }
    return newlyUnlocked;
  }
};
function saveAchievement(ach){
  window.saveData.achievementsUnlocked = window.saveData.achievementsUnlocked||[];
  if(window.saveData.achievementsUnlocked.includes(ach.id)) return;
  window.saveData.achievementsUnlocked.push(ach.id);
  // grant reward
  const amount = ach.rewardAmount || 1;
  if(ach.rewardType==='gold'){ saveData.bestScore += amount; AudioFX.play('coin'); }
  else if(ach.rewardType && ach.rewardType.startsWith('chip')){
    for(let i=0;i<amount;i++){
      if(typeof window.rollChip==='function') saveData.chipInventory.push(window.rollChip());
    }
  }
  showAchToast(ach);
  AudioFX.play('achievement');
}
function showAchToast(ach){
  const el = document.createElement('div');
  el.className='ach-toast';
  el.innerHTML = `<div class="ach-name">🏆 ${ach.icon||'🏆'} ${ach.name}</div><div class="ach-reward">${ach.desc||''} · 奖励: ${ach.rewardAmount||1} ${ach.rewardType||''}</div>`;
  const container = document.getElementById('achToastContainer');
  if(!container){ document.body.appendChild(el); } else { container.appendChild(el); }
  setTimeout(()=>{ el.style.animation='slideOut .6s ease-in forwards'; setTimeout(()=>el.remove(),600); }, 3500);
}
function openAchievementModal(){
  const overlay = document.createElement('div');
  overlay.className='browse-overlay';
  const achs = window.ACHIEVEMENTS||[];
  const unlocked = saveData.achievementsUnlocked||[];
  let html = `<h2>🏆 成就列表 (${unlocked.length}/${achs.length})</h2>
    <div class="browse-grid">`;
  for(const a of achs){
    const done = unlocked.includes(a.id);
    html += `<div class="browse-card" style="${done?'border-color:#ffe27a;background:#2a2a14;':'opacity:0.5;'}">
      <div class="name" style="${done?'color:#ffe27a':'color:#7a86a0;'}">${a.icon||'🏆'} ${a.name} ${done?'✓':''}</div>
      <div class="stats">${a.desc||''}</div>
      <div class="stats" style="color:#c89b3a;">奖励: ${a.rewardAmount||1} ${a.rewardType||''}</div>
    </div>`;
  }
  html += `</div><button class="btn danger browse-close" onclick="this.parentElement.remove()">✕ 关闭</button>`;
  overlay.innerHTML = html;
  overlay.onclick = e=>{ if(e.target===overlay) overlay.remove(); };
  document.body.appendChild(overlay);
}
console.log('SaveSystem + AchievementSystem ready');
