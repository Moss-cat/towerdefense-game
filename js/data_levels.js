/* data_levels.js — 500 关卡程序化生成
   每关: 唯一路径 + 独特地形主题 + 敌人阵容 + 波数 */
(function(){
'use strict';

const W = 1100, H = 720;

/* ============ 15 种地形主题 ============ */
const THEMES = [
  {id:'grass',    name:'翠绿草原', bg1:'#1a3a1a', bg2:'#0a1a0a', pathColor:'#8a6b3a', pathBorder:'#5a4520', dashColor:'#ffd93d'},
  {id:'desert',   name:'黄沙荒漠', bg1:'#4a3a1a', bg2:'#1a1208', pathColor:'#c0944a', pathBorder:'#806030', dashColor:'#ffea88'},
  {id:'ice',      name:'冰封雪域', bg1:'#1a3040', bg2:'#0a1520', pathColor:'#4a7080', pathBorder:'#2a4050', dashColor:'#88ddff'},
  {id:'lava',     name:'熔岩地狱', bg1:'#4a1a0a', bg2:'#1a0804', pathColor:'#aa3a20', pathBorder:'#601a10', dashColor:'#ff8844'},
  {id:'night',    name:'夜幕森林', bg1:'#101028', bg2:'#040410', pathColor:'#303850', pathBorder:'#181c28', dashColor:'#6ca8ff'},
  {id:'cave',     name:'幽深洞穴', bg1:'#1a1510', bg2:'#080604', pathColor:'#403528', pathBorder:'#201810', dashColor:'#ffe27a'},
  {id:'forest',   name:'迷雾林海', bg1:'#0a2018', bg2:'#020806', pathColor:'#2a5040', pathBorder:'#142820', dashColor:'#aaffcc'},
  {id:'cyber',    name:'赛博都市', bg1:'#101020', bg2:'#040408', pathColor:'#4040a0', pathBorder:'#202050', dashColor:'#ff66ff'},
  {id:'swamp',    name:'腐化沼泽', bg1:'#1a2810', bg2:'#061004', pathColor:'#406028', pathBorder:'#203010', dashColor:'#88ff44'},
  {id:'crystal',  name:'水晶矿脉', bg1:'#1a1030', bg2:'#080410', pathColor:'#6030a0', pathBorder:'#301850', dashColor:'#cc88ff'},
  {id:'underwater',name:'深海遗迹', bg1:'#0a2030', bg2:'#020810', pathColor:'#206080', pathBorder:'#103040', dashColor:'#88ccff'},
  {id:'space',    name:'异星战场', bg1:'#080818', bg2:'#020208', pathColor:'#808040', pathBorder:'#404020', dashColor:'#ffff66'},
  {id:'volcano',  name:'活火山口', bg1:'#2a0808', bg2:'#080202', pathColor:'#aa2828', pathBorder:'#601010', dashColor:'#ff4444'},
  {id:'garden',   name:'空中花园', bg1:'#183020', bg2:'#061008', pathColor:'#60a040', pathBorder:'#305020', dashColor:'#ffffaa'},
  {id:'void',     name:'虚空裂隙', bg1:'#100020', bg2:'#040008', pathColor:'#a020a0', pathBorder:'#501050', dashColor:'#ff66ff'}
];

/* ============ 10 种路径生成算法 ============ */
// 所有算法从 (0, entryY) 到 (W, exitY) 生成 waypoint 数组
const PATH_ALGOS = {
  zigzag(seed){
    const r = seeded(seed);
    const pts = [{x:0,y:H*0.5}];
    const n = 4 + Math.floor(r()*3);
    const xStep = W/(n+1);
    let up = r()<0.5;
    for(let i=1;i<=n;i++){
      pts.push({x: i*xStep, y: up?H*0.25:H*0.75});
      up=!up;
    }
    pts.push({x:W,y:H*0.5});
    return smooth(pts, 3);
  },
  snake(seed){
    const r = seeded(seed);
    const pts = [{x:0,y:H*0.3}];
    const loops = 2 + Math.floor(r()*2);
    let dir = 1; // 1=right, -1=left
    let y = H*0.3;
    for(let i=0;i<loops;i++){
      pts.push({x: W*0.3*dir, y});
      y = H*0.3 + (i+1)*(H*0.35/loops) + r()*30;
      pts.push({x: W*0.3*dir, y});
      dir = -dir;
    }
    pts.push({x:W,y:H*0.7});
    return smooth(pts, 2);
  },
  sCurve(seed){
    const r = seeded(seed);
    const pts = [{x:0,y:H*0.5}];
    const n = 3 + Math.floor(r()*3);
    for(let i=1;i<=n;i++){
      const t = i/(n+1);
      const offset = Math.sin(t*Math.PI*2)*H*0.2 + (r()-0.5)*40;
      pts.push({x: t*W, y: H*0.5 + offset});
    }
    pts.push({x:W,y:H*0.5});
    return smooth(pts, 4);
  },
  spiral(seed){
    const r = seeded(seed);
    const pts = [{x:0,y:H*0.5}];
    // 先走到中间做螺旋，再出去
    let cx = W*0.5, cy = H*0.5;
    const arms = 3 + Math.floor(r()*2);
    const segs = arms*4;
    for(let i=0;i<segs;i++){
      const ang = i/segs * Math.PI*2 * arms;
      const rad = Math.max(20, 120 - i*3);
      pts.push({x: cx + Math.cos(ang)*rad, y: cy + Math.sin(ang)*rad});
    }
    pts.push({x:W,y:H*0.5});
    return smooth(pts, 2);
  },
  wave(seed){
    const r = seeded(seed);
    const pts = [{x:0,y:H*0.5}];
    const peaks = 4 + Math.floor(r()*4);
    for(let i=1;i<=peaks;i++){
      const t = i/(peaks+1);
      const y = H*0.5 + Math.sin(t*Math.PI)*H*0.3*(r()*0.6+0.4);
      pts.push({x:t*W, y});
    }
    pts.push({x:W,y:H*0.5});
    return smooth(pts, 3);
  },
  stair(seed){
    const r = seeded(seed);
    const pts = [{x:0,y:H*0.5}];
    const steps = 5 + Math.floor(r()*4);
    for(let i=1;i<=steps;i++){
      const y = H*0.2 + i*(H*0.6/(steps)) + (r()-0.5)*30;
      pts.push({x: i*W/(steps+1), y});
      pts.push({x: i*W/(steps+1) + W/(steps+1)*0.3, y});
    }
    pts.push({x:W,y:H*0.5});
    return smooth(pts, 2);
  },
  figure8(seed){
    const r = seeded(seed);
    const pts = [{x:0,y:H*0.5}];
    const cx=W*0.5, cy=H*0.5;
    for(let i=0;i<40;i++){
      const t = i/40 * Math.PI*2;
      const x = cx + Math.sin(t)*Math.cos(t)*160;
      const y = cy + Math.sin(t)*120;
      pts.push({x,y});
    }
    pts.push({x:W,y:H*0.5});
    return smooth(pts, 3);
  },
  labyrinth(seed){
    const r = seeded(seed);
    const pts = [{x:0,y:H*0.5}];
    const cells = 5;
    const cellW = W/(cells+1);
    let x = 0, y = H*0.5;
    pts.push({x:x,y:y});
    for(let i=1;i<=cells;i++){
      x = i*cellW;
      if(r()<0.5){ y = H*0.2 + r()*H*0.15; } else { y = H*0.7 - r()*H*0.15; }
      pts.push({x:x,y:y});
      if(i<cells){
        y = r()<0.5 ? H*0.5 - r()*H*0.1 : H*0.5 + r()*H*0.1;
        pts.push({x:x,y:y});
      }
    }
    pts.push({x:W,y:H*0.5});
    return smooth(pts, 2);
  },
  canyon(seed){
    const r = seeded(seed);
    const pts = [{x:0,y:H*0.5}];
    const n = 6 + Math.floor(r()*4);
    for(let i=1;i<=n;i++){
      const t = i/(n+1);
      const canyonWidth = 100 + r()*120;
      pts.push({x:t*W, y: H*0.5 + (r()<0.5?1:-1)*canyonWidth*(0.3+r()*0.7)});
    }
    pts.push({x:W,y:H*0.5});
    return smooth(pts, 2);
  },
  cross(seed){
    const r = seeded(seed);
    const pts = [{x:0,y:H*0.5}];
    pts.push({x:W*0.25, y:H*0.5});
    pts.push({x:W*0.25, y:H*0.2 + r()*H*0.15});
    pts.push({x:W*0.5, y:H*0.2 + r()*H*0.15});
    pts.push({x:W*0.5, y:H*0.8 - r()*H*0.15});
    pts.push({x:W*0.75, y:H*0.8 - r()*H*0.15});
    pts.push({x:W*0.75, y:H*0.5});
    pts.push({x:W, y:H*0.5});
    return smooth(pts, 1);
  }
};

/* ============ 辅助 ============ */
function seeded(seed){ let s = seed||1; return ()=>{ s = (s*9301+49297)%233280; return s/233280; }; }
function smooth(pts, times){
  for(let t=0;t<times;t++){
    const out = [pts[0]];
    for(let i=1;i<pts.length-1;i++){
      out.push({x:(pts[i-1].x+pts[i].x+pts[i+1].x)/3, y:(pts[i-1].y+pts[i].y+pts[i+1].y)/3});
    }
    out.push(pts[pts.length-1]);
    pts = out;
  }
  // clamp within bounds
  for(const p of pts){
    p.x = clamp(p.x, 30, W-30);
    p.y = clamp(p.y, 60, H-60);
  }
  return pts;
}
function clamp(v,a,b){ return Math.max(a,Math.min(b,v)); }
function hashLevel(n){ let h = n*73856093 ^ 12345; return Math.abs(h); }

/* ============ 关卡生成 ============ */
const LEVEL_COUNT = 500;
const ALGO_KEYS = Object.keys(PATH_ALGOS);

function buildLevel(n){
  const seed = hashLevel(n);
  const r = seeded(seed);
  // 关卡号决定难度
  const diffTier = Math.floor((n-1)/50); // 0..9
  // 选择路径算法 — 按关卡变化
  const algoIdx = Math.floor((n-1)/50) % ALGO_KEYS.length;
  // 后期关卡用更复杂的
  const algoKey = ALGO_KEYS[(algoIdx + Math.floor(r()*2)) % ALGO_KEYS.length];
  const path = PATH_ALGOS[algoKey](seed);
  // 主题 — 每50关换主题
  const theme = THEMES[diffTier % THEMES.length];
  // 波数
  const waveCount = 3 + Math.floor((n-1)/25) + (n%10===0?2:0);
  // Boss 波
  const bossWave = waveCount; // 最后一波是 Boss
  // HP 缩放
  const hpScale = 1 + (n-1)*0.12;
  // Gold reward per wave
  const goldPerWave = 80 + n*2;
  // Enemies pool - by wave count, sample ENEMIES progressive
  // Save points of interest (decorations)
  const decorations = [];
  const decoCount = 8 + Math.floor(r()*8);
  for(let i=0;i<decoCount;i++){
    decorations.push({
      x: r()*W, y: r()*H,
      type: Math.floor(r()*5),
      size: 6 + r()*14,
      rot: r()*Math.PI*2,
      color: r()<0.3?'#66ff99':r()<0.6?'#cc66ff':'#ffaa44'
    });
  }
  // 路径宽度（某些关卡更窄更难）
  const pathWidth = n%7===0 ? 28 : n%5===0 ? 48 : 40;
  // 总预算 = 起始金币 + 每波奖励×波数
  return {
    level: n, seed, theme, algoKey, path,
    waveCount, bossWave, hpScale, goldPerWave, pathWidth,
    decorations,
    difficulty: diffTier+1,
    maxCarryTowers: 3 + Math.min(5, Math.floor((n-1)/100)),
    name: theme.name + ' · ' + ['入门','初级','进阶','中级','高级','精英','大师','传奇','神话','无尽'][diffTier] + ' #' + n
  };
}

// 生成所有 500 关
const LEVELS = [];
for(let n=1;n<=LEVEL_COUNT;n++) LEVELS.push(buildLevel(n));

/* ============ 发布到 window ============ */
window.LEVELS = LEVELS;
window.LEVEL_COUNT = LEVEL_COUNT;
window.THEMES = THEMES;
window.PATH_ALGORITHMS = PATH_ALGOS;
window.getLevel = function(n){ return LEVELS[n-1] || null; };
window.getCurrentLevelTheme = function(lvl){ return THEMES.find(t=>t.id===lvl.theme) || THEMES[0]; };

// 路径点检查 (global helper used by core)
window.isPointOnLevelPath = function(px,py,path,width){
  width = width || 40;
  for(let i=0;i<path.length-1;i++){
    const a=path[i],b=path[i+1];
    const dx=b.x-a.x,dy=b.y-a.y,l2=dx*dx+dy*dy;
    if(l2===0) continue;
    const t = clamp(((px-a.x)*dx+(py-a.y)*dy)/l2,0,1);
    const cx=a.x+dx*t, cy=a.y+dy*t;
    if(Math.hypot(px-cx,py-cy) < width*0.9) return true;
  }
  return false;
};

console.log('LEVELS generated:', LEVELS.length);

})();
