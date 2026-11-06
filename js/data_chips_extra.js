// data_chips_extra.js — Add 2 system chips not from user JSON
// 幂等注入：每次调用 _injectSystemChips() 都会去重再注入
(function(){
'use strict';

const economyChip = {
  libraryId: 'economy_discount',
  name: '便宜芯片',
  name_hook: '', series: '锻造补助',
  level: 1, levelLabel: 'I',
  slot: '经济', rarity: '普通', rarityName: '普通',
  color: '#6bff6b', nestedSlots: 0, energyCost: 1,
  statField: 'economy_discount', statCn: '锻造造价减免',
  statType: 'economy_discount',
  value: 5, rawValue: 5, valueMode: '百分比', unit: '%',
  trigger: '锻造时', stackLimit: 5,
  compatibleClasses: [], synergy: '',
  desc: '在铁匠铺锻造时，每装备一片此芯片减5%造价（可叠5次=25%上限）',
  icon: '💰', statName: '锻造造价减免',
  _systemChip: true
};

const templateChip = {
  libraryId: 'make_template',
  name: '模板化芯片',
  name_hook: '', series: '锻造核心',
  level: 1, levelLabel: 'I',
  slot: '功能', rarity: '传奇', rarityName: '传奇',
  color: '#ffd93d', nestedSlots: 1, energyCost: 2,
  statField: 'make_template', statCn: '模板化',
  statType: 'make_template',
  value: 1, rawValue: 1, valueMode: '数值', unit: '',
  trigger: '锻造时', stackLimit: 1,
  compatibleClasses: [], synergy: '',
  desc: '锻造时嵌入此芯片，成品塔可被铁匠铺选为新模板（无限嵌套锻造链）',
  icon: '🔨', statName: '模板化',
  _systemChip: true
};

const _SYSTEM_CHIPS = [economyChip, templateChip];

/**
 * 幂等注入：去重后 unshift 到 CHIP_LIBRARY 前端
 * 既支持 JSON 覆盖前也支持覆盖后调用
 */
function inject(){
  const lib = window.CHIP_LIBRARY;
  if(!Array.isArray(lib)){
    console.warn('CHIP_LIBRARY 不存在，延迟注入');
    return false;
  }
  // 先去掉已有的系统芯片（用 libraryId 匹配）
  const sysIds = new Set(_SYSTEM_CHIPS.map(c=>c.libraryId));
  for(let i=lib.length-1;i>=0;i--){
    if(lib[i].libraryId && sysIds.has(lib[i].libraryId)){
      lib.splice(i,1);
    }
  }
  // 再按顺序 unshift
  for(let i=_SYSTEM_CHIPS.length-1;i>=0;i--){
    lib.unshift(_SYSTEM_CHIPS[i]);
  }
  return true;
}

// 挂到 window，data_from_json.js 覆盖完 JSON 后会调用
window._injectSystemChips = inject;

// 同步立即注入（如果此时 CHIP_LIBRARY 还是程序化数据，先注入）
inject();
console.log('data_chips_extra: 注入 2 系统芯片 → window._injectSystemChips 已就绪');

})();
