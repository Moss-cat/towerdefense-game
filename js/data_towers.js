/* Tower Data - 100 types generated */
window.TOWER_DATA = (function () {
    var ELEMENTS = [
        { id: 'fire',      name: '火焰', color: '#ff5a2a', glow: '#ff8844', symbol: '🔥', dot: 6,  slow: 0,    chain: 0, critChance: 0.05, critMult: 2.0 },
        { id: 'ice',       name: '冰霜', color: '#4ab8ff', glow: '#7ed5ff', symbol: '❄️', dot: 0,  slow: 0.4,  chain: 0, critChance: 0.05, critMult: 2.0 },
        { id: 'lightning', name: '闪电', color: '#ffd93d', glow: '#ffee88', symbol: '⚡', dot: 0,  slow: 0,    chain: 3, critChance: 0.05, critMult: 2.0 },
        { id: 'poison',    name: '毒素', color: '#6bff6b', glow: '#99ff99', symbol: '☠️', dot: 10, slow: 0,    chain: 0, critChance: 0.05, critMult: 2.0 },
        { id: 'arcane',    name: '奥术', color: '#c060ff', glow: '#d899ff', symbol: '✨', dot: 0,  slow: 0,    chain: 0, critChance: 0.25, critMult: 2.0 }
    ];

    var PROTOS = [
        { id: 'archer', name: '射手', baseDmg: 12, baseRange: 160, baseRate: 0.6,  speed: 520, size: 4, cost: 50,  splash: 0,  pierce: 1, chain: 0 },
        { id: 'cannon', name: '炮台', baseDmg: 45, baseRange: 140, baseRate: 1.6,  speed: 340, size: 9, cost: 120, splash: 50, pierce: 1, chain: 0 },
        { id: 'laser',  name: '激光', baseDmg: 6,  baseRange: 190, baseRate: 0.12, speed: 9999,size: 2, cost: 150, splash: 0,  pierce: 3, chain: 0 },
        { id: 'storm',  name: '风暴', baseDmg: 8,  baseRange: 150, baseRate: 1.1,  speed: 420, size: 5, cost: 100, splash: 70, pierce: 2, chain: 0 }
    ];

    var TIERS = [
        { id: 'standard',  name: '标准', mult: { cost: 1.0, damage: 1.0, range: 1.0, rate: 1.0 } },
        { id: 'longrange', name: '远距', mult: { cost: 1.2, damage: 0.8, range: 1.5, rate: 1.0 } },
        { id: 'rapid',     name: '迅捷', mult: { cost: 1.1, damage: 0.7, range: 0.9, rate: 0.5 } },
        { id: 'heavy',     name: '重型', mult: { cost: 1.3, damage: 1.8, range: 1.0, rate: 1.4 } },
        { id: 'cheap',     name: '廉价', mult: { cost: 0.6, damage: 0.6, range: 0.9, rate: 0.8 } }
    ];

    var DESC_PREFIX = {
        archer: '远程精准单体',
        cannon: '范围爆炸溅射',
        laser: '瞬时穿透射线',
        storm: '多目标范围打击'
    };

    var list = [];
    var id = 0;

    for (var ei = 0; ei < PROTOS.length; ei++) {
        var proto = PROTOS[ei];
        for (var ti = 0; ti < TIERS.length; ti++) {
            var tier = TIERS[ti];
            for (var eli = 0; eli < ELEMENTS.length; eli++) {
                var elem = ELEMENTS[eli];
                var mult = tier.mult;

                list.push({
                    id: id,
                    uid: proto.id + '_' + elem.id + '_' + tier.id,
                    name: elem.name + '·' + tier.name + proto.name,
                    proto: proto.id,
                    element: elem.id,
                    tier: tier.id,
                    cost: Math.round(proto.cost * mult.cost),
                    damage: Math.round(proto.baseDmg * mult.damage * 10) / 10,
                    range: Math.round(proto.baseRange * mult.range),
                    fireRate: Math.round(proto.baseRate * mult.rate * 100) / 100,
                    bulletSpeed: proto.speed,
                    bulletSize: proto.size,
                    splash: proto.splash,
                    pierce: proto.pierce,
                    chain: proto.chain + elem.chain,
                    slow: elem.slow,
                    dot: elem.dot,
                    critChance: elem.critChance,
                    critMult: elem.critMult,
                    color: elem.color,
                    glow: elem.glow,
                    symbol: elem.symbol,
                    desc: elem.name + '元素·' + DESC_PREFIX[proto.id] + '·' + tier.name + '型'
                });
                id++;
            }
        }
    }

    return list;
})();
console.log('TOWERS loaded:', window.TOWER_DATA.length);
