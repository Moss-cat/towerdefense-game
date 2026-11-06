/* inject_names.js — 运行时把 json/ 下的中文名字注入到程序化数据里
   如果某个 JSON 加载失败（file:// 协议跨域），会优雅 fallback 到程序化名字 */
(function(){
'use strict';

const JSON_BASE = 'json'; // 相对 index.html

function loadJSONSafe(path){
  return new Promise(resolve=>{
    fetch(path).then(r=>r.text()).then(t=>{
      try{ resolve(JSON.parse(t)); } catch(e){ resolve(null); }
    }).catch(e=>{
      // file:// 协议下 fetch 会失败，尝试用 XHR 兜底
      const xhr = new XMLHttpRequest();
      xhr.open('GET', path, true);
      xhr.onload = ()=>{ try{ resolve(JSON.parse(xhr.responseText)); } catch(e){ resolve(null); } };
      xhr.onerror = ()=> resolve(null);
      xhr.send();
    });
  });
}

async function inject(){
  console.log('🎭 开始注入中文名字...');

  // 加载 4 份 JSON
  const [towerNames, enemyNames, eliteNames, chipNames] = await Promise.all([
    loadJSONSafe(JSON_BASE+'/塔防炮塔.json'),
    loadJSONSafe(JSON_BASE+'/塔防敌人.json'),
    loadJSONSafe(JSON_BASE+'/塔防精英怪.json'),
    loadJSONSafe(JSON_BASE+'/塔防芯片.json')
  ]);

  // 炮塔名字注入
  const TOWERS = window.TOWER_DATA;
  if(TOWERS && towerNames && Array.isArray(towerNames)){
    const names = towerNames.filter(n=>typeof n==='string' && n.trim());
    for(let i=0;i<TOWERS.length && i<names.length;i++){
      TOWERS[i].name = names[i];
      TOWERS[i].hasCustomName = true;
    }
    console.log('  炮塔: 注入 ' + Math.min(TOWERS.length, names.length) + ' 个名字');
  } else {
    console.log('  炮塔: 使用程序化生成的名字');
  }

  // 敌人名字注入
  const ENEMIES = window.ENEMY_DATA;
  if(ENEMIES && enemyNames && Array.isArray(enemyNames)){
    const names = enemyNames.filter(n=>typeof n==='string' && n.trim());
    for(let i=0;i<ENEMIES.length && i<names.length;i++){
      ENEMIES[i].name = names[i];
      ENEMIES[i].hasCustomName = true;
    }
    console.log('  敌人: 注入 ' + Math.min(ENEMIES.length, names.length) + ' 个名字');
  } else {
    console.log('  敌人: 使用程序化生成的名字');
  }

  // 精英怪名字注入
  const ELITES = window.ELITE_DATA;
  if(ELITES && eliteNames && Array.isArray(eliteNames)){
    const names = eliteNames.filter(n=>typeof n==='string' && n.trim());
    for(let i=0;i<ELITES.length && i<names.length;i++){
      ELITES[i].name = names[i];
      ELITES[i].hasCustomName = true;
    }
    console.log('  精英: 注入 ' + Math.min(ELITES.length, names.length) + ' 个名字');
  } else {
    console.log('  精英: 使用程序化生成的名字');
  }

  // 芯片名字注入
  const CHIPS = window.CHIP_LIBRARY;
  if(CHIPS && chipNames && Array.isArray(chipNames)){
    const names = chipNames.filter(n=>typeof n==='string' && n.trim());
    for(let i=0;i<CHIPS.length && i<names.length;i++){
      CHIPS[i].customName = names[i];
      CHIPS[i].hasCustomName = true;
    }
    console.log('  芯片: 注入 ' + Math.min(CHIPS.length, names.length) + ' 个名字');
  } else {
    console.log('  芯片: 使用程序化生成的名字');
  }

  console.log('✅ 名字注入完成');
}

// DOM ready 后执行 — 在 data_*.js 和 main.js 之间
if(document.readyState === 'loading'){
  document.addEventListener('DOMContentLoaded', inject);
} else {
  inject();
}

// 暴露给外部
window.injectNames = inject;

})();
