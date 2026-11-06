/* Chip Data - 120 variants */

// 12 stat modifier types
window.CHIP_TYPES = [
  { id: 'dmg',   name: '伤害强化', icon: '⚔',  stat: 'damage',  levels: [1.1, 1.25, 1.45, 1.7,  2.0]  },
  { id: 'range', name: '射程扩展', icon: '◎',  stat: 'range',   levels: [1.1, 1.2,  1.35, 1.5,  1.75] },
  { id: 'rate',  name: '攻速提升', icon: '⚡',  stat: 'rate',    levels: [0.9, 0.8,  0.65, 0.5,  0.35] },
  { id: 'crit',  name: '暴击几率', icon: '✦',  stat: 'crit',    levels: [0.05, 0.1, 0.15, 0.22, 0.3]  },
  { id: 'splash',name: '溅射增强', icon: '💥', stat: 'splash',  levels: [1.2, 1.5,  1.8,  2.2,  2.8]  },
  { id: 'pierce',name: '穿透强化', icon: '➤',  stat: 'pierce',  levels: [1,   2,    3,    4,    5]    },
  { id: 'chain', name: '链锁扩展', icon: '⟲',  stat: 'chain',   levels: [1,   2,    3,    4,    5]    },
  { id: 'slow',  name: '减速加成', icon: '❄',  stat: 'slow',    levels: [0.1, 0.2,  0.3,  0.45, 0.6]  },
  { id: 'dot',   name: '灼烧强化', icon: '☠',  stat: 'dot',     levels: [3,   6,    10,   15,   22]   },
  { id: 'gold',  name: '金币加成', icon: '💰', stat: 'gold',    levels: [1.1, 1.2,  1.35, 1.5,  1.8]  },
  { id: 'shield',name: '护盾芯片', icon: '🛡', stat: 'shield',  levels: [50,  100,  200,  400,  800]  },
  { id: 'heal',  name: '再生芯片', icon: '💚', stat: 'heal',    levels: [2,   4,    7,    11,   16]   }
];

// 4 rarities
window.CHIP_RARITIES = [
  { id: 'common',    name: '普通', color: '#9aa4bd', slots: 0, weight: 55 },
  { id: 'rare',      name: '稀有', color: '#6bff6b', slots: 1, weight: 28 },
  { id: 'epic',      name: '史诗', color: '#c060ff', slots: 2, weight: 12 },
  { id: 'legendary', name: '传说', color: '#ffd93d', slots: 3, weight: 5  }
];

/**
 * 根据等级返回对应稀有度池（一个 level 对应若干相邻稀有度）
 * level 0 → [common, rare]
 * level 1 → [common, rare]
 * level 2 → [rare,   epic]
 * level 3 → [epic,   legendary]
 * level 4 → [epic,   legendary]
 * 每个 level 生成池内所有稀有度条目 → 12 types × 5 levels × 2 rarities = 120
 */
function raritiesForLevel(level) {
  var all = window.CHIP_RARITIES;
  if (level <= 1) return [all[0], all[1]];          // common + rare
  if (level === 2) return [all[1], all[2]];         // rare + epic
  return [all[2], all[3]];                           // epic + legendary (lv 3,4)
}

// 120 flat variants library
window.CHIP_LIBRARY = [];

(function generateLibrary() {
  var library = window.CHIP_LIBRARY;
  var types   = window.CHIP_TYPES;
  var nextId  = 0;

  for (var t = 0; t < types.length; t++) {
    var statType = types[t];
    for (var lv = 0; lv < statType.levels.length; lv++) {
      var rarities = raritiesForLevel(lv);
      for (var r = 0; r < rarities.length; r++) {
        var rarity = rarities[r];
        library.push({
          libraryId:    nextId++,
          statType:     statType.id,
          statName:     statType.name,
          icon:         statType.icon,
          statField:    statType.stat,
          value:        statType.levels[lv],
          level:        lv,
          rarity:       rarity.id,
          rarityName:   rarity.name,
          color:        rarity.color,
          nestedSlots:  rarity.slots
        });
      }
    }
  }
})();

/**
 * 权重随机选取稀有度
 */
function pickRarity() {
  var rarities = window.CHIP_RARITIES;
  var total    = 0;
  for (var i = 0; i < rarities.length; i++) total += rarities[i].weight;
  var r = Math.random() * total;
  var acc = 0;
  for (var i = 0; i < rarities.length; i++) {
    acc += rarities[i].weight;
    if (r < acc) return rarities[i];
  }
  return rarities[0]; // fallback
}

/**
 * 工厂函数：随机滚出一个芯片实例（带运行时唯一 id）
 * 流程：先按权重随机稀有度，再在该稀有度对应的所有库条目里随机选一个
 * 返回的实例带独立 runtimeId，可嵌套/挂载到武器上
 */
function rollChip() {
  var rarity = pickRarity();
  var library = window.CHIP_LIBRARY;
  var pool = [];
  for (var i = 0; i < library.length; i++) {
    if (library[i].rarity === rarity.id) pool.push(library[i]);
  }
  if (pool.length === 0) pool = library; // 兜底

  var picked = pool[Math.floor(Math.random() * pool.length)];

  // 深拷贝一份，附加运行时字段
  var instance = {};
  for (var k in picked) {
    if (picked.hasOwnProperty(k)) instance[k] = picked[k];
  }
  instance.runtimeId = 'chip_' + Date.now() + '_' + Math.floor(Math.random() * 1e6);
  instance.createdAt = Date.now();
  instance.equipped  = false;

  return instance;
}

window.rollChip = rollChip;

console.log('CHIPS loaded:', window.CHIP_LIBRARY.length);
