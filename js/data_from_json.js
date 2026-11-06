/* data_from_json.js — 加载 json/ 下的结构化数据，转换为游戏使用的 window.* 数据
   作为主数据源，覆盖 data_*.js 的程序化生成 */
(function(){
'use strict';

const BASE = 'json';

function loadJSON(path){
  return new Promise(resolve=>{
    fetch(path).then(r=>r.text()).then(t=>{
      try{ resolve(JSON.parse(t)); } catch(e){ resolve(null); }
    }).catch(()=>{
      const xhr = new XMLHttpRequest();
      xhr.open('GET', path, true);
      xhr.onload = ()=>{ try{ resolve(JSON.parse(xhr.responseText)); } catch(e){ resolve(null); } };
      xhr.onerror = ()=> resolve(null);
      xhr.send();
    });
  });
}

const TILE_PX = 40;
function rangeToPx(g){ return Math.round(g * TILE_PX); }
function speedToPxPerSec(g){ return Math.round(g * TILE_PX); }
function radiusToPx(g){ return Math.round(g * TILE_PX * 0.5); }

/* ============ 完整映射表 ============ */
const ELEMENT_COLORS = {
  '动能':'#aabbcc','火':'#ff5a2a','火2':'#ff5a2a','冰':'#4ab8ff','雷':'#ffd93d','酸':'#6bff6b',
  '光':'#ffee99','暗':'#c060ff','虚空':'#aa44ff','圣':'#ffee99','风':'#aabbdd','水':'#4a7080',
  '机械':'#888899','物理':'#aabbcc','自然':'#66cc66','毒':'#6bff6b'
};
const ELEMENT_SYMBOLS = {
  '动能':'⚙','火':'🔥','火2':'🔥','冰':'❄','雷':'⚡','酸':'☠','光':'✦','暗':'🌙','虚空':'🌀','圣':'✨','风':'💨','水':'💧','机械':'🤖','物理':'⚔','自然':'🌿','毒':'☠'
};
const RARITY_COLORS = {
  '普通':'#9aa4bd','稀有':'#6bff6b','史诗':'#c060ff','传奇':'#ffd93d','神话':'#ff5a2a'
};
const RARITY_SLOTS = { '普通':0, '稀有':1, '史诗':2, '传奇':3, '神话':3 };
const PROTO_BY_CLASS = {
  '单体速射':'archer','减速控制':'archer','范围灼烧':'cannon','连锁闪电':'archer','近战反伤':'cannon',
  '隐身狙击':'archer','穿透射线':'laser','概率暴击':'archer','破甲毒雾':'cannon','真实伤害':'laser',
  '蓄力落雷':'cannon','吞噬拉扯':'archer','防空导弹':'archer','扇形喷射':'cannon','击退水炮':'archer',
  '机械哨兵':'archer','多目标无人机':'archer','分裂光束':'laser','高伤慢速':'cannon','传染DOT':'cannon'
};
const CLASS_COLOR = {
  '单体速射':'#6ca8ff','减速控制':'#4ab8ff','范围灼烧':'#ff5a2a','连锁闪电':'#ffd93d','近战反伤':'#aabbcc',
  '隐身狙击':'#7a86a0','穿透射线':'#c060ff','概率暴击':'#ffe27a','破甲毒雾':'#6bff6b','真实伤害':'#ff5a2a',
  '蓄力落雷':'#ffd93d','吞噬拉扯':'#aa44ff','防空导弹':'#ffd93d','扇形喷射':'#ff5a2a','击退水炮':'#4a7080',
  '机械哨兵':'#888899','多目标无人机':'#aabbcc','分裂光束':'#c060ff','高伤慢速':'#ffe27a','传染DOT':'#6bff6b'
};

/* ============ 炮塔转换 ============ */
function convertTowers(rawList){
  const list = [];
  for(let i=0;i<rawList.length;i++){
    const r = rawList[i];
    const st = r.stats || {};
    const element = r.element || '动能';
    const cls = r.class || '单体速射';
    const rarity = r.rarity || '普通';

    // 元素派生效果
    let slow = 0, dot = 0, chain = 0, pierce = 1;
    if(['冰'].includes(element)) slow = 0.4;
    if(['酸','毒','火2'].includes(element)) dot = 6;
    if(['雷','火'].includes(element) || cls==='连锁闪电') chain = 3;
    if(cls==='穿透射线' || cls==='分裂光束') pierce = 4;
    if(cls==='破甲毒雾') dot = 10;

    list.push({
      id: i, uid: 't_'+i,
      name: r.name, name_hook: r.name_hook || '',
      series: r.series || '', model: r.model || '',
      class: cls, element: element, mechanic: r.mechanic || '',
      rarity: rarity, tier: r.tier || 1,
      cost: r.cost || 100,
      upgradeCost: r.upgrade_cost || Math.round((r.cost||100)*0.8),
      maxLevel: r.max_level || 5,
      color: ELEMENT_COLORS[element] || CLASS_COLOR[cls] || '#888899',
      glow: RARITY_COLORS[rarity] || '#888899',
      symbol: ELEMENT_SYMBOLS[element] || '🔫',
      proto: PROTO_BY_CLASS[cls] || 'archer',
      trait: rarity==='神话'?'heavy':rarity==='传奇'?'rapid':rarity==='史诗'?'standard':rarity==='稀有'?'cheap':'standard',
      elementName: element, rarityName: rarity,
      // stats
      damage: st.damage || 10,
      range: rangeToPx(st.range || 3),
      fireRate: Math.round((1/(st.fire_rate||1))*100)/100,  // fire_rate 是发/秒 → 转成冷却秒
      // 注：fire_rate=1.21 发/秒 → 每发 0.826 秒 → 显示 0.83
      splash: radiusToPx(st.splash_radius || 0),
      bulletSpeed: speedToPxPerSec(st.projectile_speed || 20),
      bulletSize: st.splash_radius>2 ? 6 : 4,
      critChance: st.crit_rate || 0.05,
      critMult: 2.0,
      pierce, chain, slow, dot,
      targeting: r.targeting || '最前',
      attackTags: r.attack_tags || [],
      skillName: (r.skill||{}).name || '',
      skillDesc: (r.skill||{}).description || '',
      skillCd: (r.skill||{}).cooldown || 0,
      desc: r.description || '',
      rarityCostMult: {普通:1,稀有:1.3,史诗:1.7,传奇:2.2,神话:3}[rarity] || 1
    });
  }
  return list;
}

/* ============ 敌人转换 ============ */
function convertEnemies(rawList, isElite){
  const list = [];
  const sizeMap = { '微型':7,'小型':10,'中型':14,'大型':18,'巨型':22,'超巨型':28 };
  const colorByTrait = {
    '快速':'#ffaa44','重甲':'#8a9ab5','隐身':'#b888ff','治疗':'#6bff6b','自爆':'#ff5a2a','分裂':'#66ccff','飞行':'#aabbdd','魔抗':'#cc66ff','护甲':'#888899','幻影':'#b888ff'
  };
  const shapeByRank = { '杂兵':'circle','精英':'diamond','首领':'square' };
  const shapeByTrait = { '分裂':'diamond','飞行':'triangle','自爆':'circle','隐身':'circle','重甲':'square' };
  for(let i=0;i<rawList.length;i++){
    const r = rawList[i];
    const st = r.stats || {};
    const rank = r.rank || (isElite?'精英':'杂兵');
    const trait = r.trait || '';
    const shape = shapeByTrait[trait] || shapeByRank[rank] || 'circle';
    const color = colorByTrait[trait] || (rank==='首领'?'#ff5a2a':rank==='精英'?'#c060ff':'#e85050');
    const sizeLabel = st.size || '中型';
    list.push({
      id: i, uid: (isElite?'e_elite_':'e_')+i,
      name: r.name, name_hook: r.name_hook || '',
      series: r.series || '', variant: r.variant || '',
      rank: rank, movement: r.movement || '地面', trait: trait,
      mechanic: r.mechanic || '',
      abilities: r.abilities || [], weakness: r.weakness || '',
      desc: r.description || '',
      recommendedWave: r.recommended_wave || null,
      // 游戏运行时字段
      baseHp: st.hp || 60,
      speed: speedToPxPerSec(st.speed || 1.5),
      armor: (st.armor||0)/100,
      magicResist: (st.magic_resist||0)/100,
      shield: st.shield || 0,
      gold: st.bounty || 10,
      leakDamage: st.leak_damage || 1,
      size: sizeMap[sizeLabel] || 14,
      shape: shape, color: color,
      isBoss: rank==='首领' || rank==='魔王',
      isElite: isElite || rank==='精英',
      regen: (trait==='治疗' || trait==='再生') ? 4 : 0,
      phantom: trait==='隐身' || trait==='幻影',
      eliteSpecial: r.mechanic ? { name:r.mechanic, desc:(r.abilities||[])[0]?.description||'' } : null
    });
  }
  return list;
}

/* ============ 芯片转换 ============ */
function convertChips(rawList){
  const statFieldMap = {
    // 直接 stat 名 → game statField
    'damage':'damage','armor_pen':'damage','magic_damage':'damage','physical_damage':'damage',
    'crit_rate':'crit','crit_damage':'crit','critical':'crit',
    'fire_rate':'rate','attack_speed':'rate','speed':'rate','reload_speed':'rate',
    'range':'range','attack_range':'range','cast_range':'range',
    'splash_radius':'splash','aoe_radius':'splash','splash':'splash',
    'pierce':'pierce','armor_penetration':'pierce',
    'chain':'chain','chain_count':'chain','chain_targets':'chain',
    'slow':'slow','slow_amount':'slow','slow_percent':'slow',
    'dot':'dot','burn_damage':'dot','poison_damage':'dot','bleed':'dot','damage_over_time':'dot',
    'bounty':'gold','gold_bonus':'gold','bonus_gold':'gold',
    'shield':'shield','max_shield':'shield','shield_amount':'shield',
    'heal':'heal','regen':'heal','health_regen':'heal',
    'reflect':'damage','lifesteal':'heal','absorb':'shield'
  };
  const slotMultiplier = { '攻击':1.2, '防御':1.1, '元素':1.15, '控制':1.05, '经济':1.3, '功能':1.0 };
  const list = [];
  for(let i=0;i<rawList.length;i++){
    const r = rawList[i];
    const eff = r.effect || {};
    const statName = eff.stat || 'damage';
    const statField = statFieldMap[statName] || 'damage';
    const rarity = r.rarity || '普通';
    const multiplier = slotMultiplier[r.slot] || 1.0;
    let value = eff.value || 1;
    if(eff.mode === '百分比' || (eff.unit||'').includes('%')) value = value * 100;
    // 归一化 value 使各 chip level 递增
    const levelNum = parseInt(r.level) || 1;
    const normalizedValue = Math.round(value * multiplier);

    list.push({
      libraryId: i,
      name: r.name, name_hook: r.name_hook || '',
      series: r.series || '',
      level: levelNum, levelLabel: r.level_label || ('ⅠⅡⅢⅣⅤ'[levelNum-1]||String(levelNum)),
      slot: r.slot || '攻击',
      rarity: rarity, rarityName: rarity,
      color: RARITY_COLORS[rarity] || '#9aa4bd',
      nestedSlots: RARITY_SLOTS[rarity] || 0,
      energyCost: r.energy_cost || 1,
      statField: statField,
      statCn: eff.stat_cn || statName,
      statType: statName,
      value: normalizedValue,
      rawValue: value,
      valueMode: eff.mode || '数值',
      unit: eff.unit || '',
      trigger: eff.trigger || '攻击时',
      stackLimit: r.stack_limit || 1,
      compatibleClasses: r.compatible_classes || [],
      synergy: r.synergy || '',
      desc: r.description || '',
      // UI 字段
      icon: ({'damage':'⚔','crit':'✦','rate':'⚡','range':'◎','splash':'💥','pierce':'➤','chain':'⟲','slow':'❄','dot':'☠','gold':'💰','shield':'🛡','heal':'💚'})[statField] || '⚙',
      statName: eff.stat_cn || statField
    });
  }
  return list;
}

/* ============ 加载 ============ */
async function loadAll(){
  console.log('📂 从 json/ 加载完整游戏数据...');
  const [towersRaw, enemiesRaw, elitesRaw, chipsRaw] = await Promise.all([
    loadJSON(BASE+'/塔防炮塔.json'),
    loadJSON(BASE+'/塔防敌人.json'),
    loadJSON(BASE+'/塔防精英怪.json'),
    loadJSON(BASE+'/塔防芯片.json')
  ]);

  let loadedAny = false;

  if(towersRaw?.length > 0){
    window.TOWER_DATA = convertTowers(towersRaw);
    window.TOWER_DATA.forEach(t => t._jsonLoaded = true);
    console.log('  ✅ 炮塔:', towersRaw.length, '→ window.TOWER_DATA (_jsonLoaded 标记)'); loadedAny = true;
  }
  if(enemiesRaw?.length > 0){
    window.ENEMY_DATA = convertEnemies(enemiesRaw, false);
    window.ENEMY_DATA.forEach(e => e._jsonLoaded = true);
    console.log('  ✅ 敌人:', enemiesRaw.length, '→ window.ENEMY_DATA'); loadedAny = true;
  }
  if(elitesRaw?.length > 0){
    window.ELITE_DATA = convertEnemies(elitesRaw, true);
    window.ELITE_DATA.forEach(e => e._jsonLoaded = true);
    console.log('  ✅ 精英:', elitesRaw.length, '→ window.ELITE_DATA'); loadedAny = true;
  }
  if(chipsRaw?.length > 0){
    window.CHIP_LIBRARY = convertChips(chipsRaw);
    window.CHIP_LIBRARY.forEach(c => c._jsonLoaded = true);
    console.log('  ✅ 芯片:', chipsRaw.length, '→ window.CHIP_LIBRARY'); loadedAny = true;
  }

  if(loadedAny){
    console.log('✅ JSON 数据加载成功（覆盖程序化数据）');
    // === 重新注入系统芯片 ===
    if(typeof window._injectSystemChips === 'function'){
      window._injectSystemChips();
      console.log('  ✅ 系统芯片已重新注入');
    }
    // 触发 Shop 完成加载 + 重渲染（含加权 roll）
    setTimeout(()=>{
      try{ if(window.Shop?.notifyDataReady) Shop.notifyDataReady(); else Shop?.render?.(); }catch(e){}
      try{ if(window.ChipSystem?.initMenu) window.ChipSystem.initMenu(); }catch(e){}
      try{ if(window.Blacksmith?.init) window.Blacksmith.init(); }catch(e){}
    }, 50);
  } else {
    console.warn('⚠️ JSON 加载失败，使用程序化生成的数据');
    // JSON 失败也要注入系统芯片
    if(typeof window._injectSystemChips === 'function'){
      window._injectSystemChips();
    }
  }
}

if(document.readyState === 'loading'){
  document.addEventListener('DOMContentLoaded', loadAll, {once:true});
} else {
  loadAll();
}
// 兜底：window.load 时若 TOWER_DATA 还是程序化名字，再跑一次
window.addEventListener('load', ()=>{
  const t = window.TOWER_DATA;
  if(t && t.length>0){
    const firstHasCustom = t[0].hasOwnProperty('name_hook') || t[0].skillName;
    if(!firstHasCustom){
      console.log('data_from_json 兜底触发');
      loadAll();
    }
  }
});

window.loadJSONData = loadAll;
window.convertTowers = convertTowers;
window.convertEnemies = convertEnemies;
window.convertChips = convertChips;
window.TILE_PX = TILE_PX;

})();
