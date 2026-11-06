/* Enemy Data - 100 base + 12 elite */
window.ENEMY_DATA = [];
window.ELITE_DATA = [];
(function generate(){

    // ---------- PART A: 100 BASE ENEMIES ----------

    // Proto definitions
    var PROTOS = [
        { key:'grunt',  cn:'步兵', shape:'circle',   baseHp:60,  baseSpeed:55, gold:8,  size:14, baseColor:'#88cc44' },
        { key:'runner', cn:'奔袭', shape:'triangle', baseHp:30,  baseSpeed:100,gold:10, size:12, baseColor:'#44aaff' },
        { key:'tank',   cn:'重装', shape:'square',   baseHp:280, baseSpeed:28, gold:25, size:22, baseColor:'#aa7744' },
        { key:'swarm',  cn:'蜂群', shape:'diamond',  baseHp:22,  baseSpeed:70, gold:4,  size:10, baseColor:'#ffcc00' }
    ];

    // Tier definitions
    var TIERS = [
        { key:'s',   cn:'微小', mult:0.55, hpMult:0.5,  spdMult:1.25, sizeMult:0.7, isBoss:false },
        { key:'m',   cn:'标准', mult:1.0,  hpMult:1.0,  spdMult:1.0,  sizeMult:1.0, isBoss:false },
        { key:'l',   cn:'大型', mult:1.8,  hpMult:1.7,  spdMult:0.8,  sizeMult:1.3, isBoss:false },
        { key:'xl',  cn:'巨型', mult:3.0,  hpMult:2.8,  spdMult:0.65, sizeMult:1.6, isBoss:false },
        { key:'boss',cn:'魔王', mult:7.0,  hpMult:6.5,  spdMult:0.5,  sizeMult:2.2, isBoss:true  }
    ];

    // Subtype definitions
    var SUBTYPES = [
        { key:'normal',  cn:'常规', spdMod:1.0, hpMod:1.0,  armor:0,    regen:0,  phantom:false, color:null },
        { key:'fast',    cn:'急速', spdMod:1.7, hpMod:1.0,  armor:0,    regen:0,  phantom:false, color:'#ffaa44' },
        { key:'armored', cn:'装甲', spdMod:0.7, hpMod:1.5,  armor:0.35, regen:0,  phantom:false, color:'#8a9ab5' },
        { key:'regen',   cn:'再生', spdMod:0.9, hpMod:1.0,  armor:0,    regen:4,  phantom:false, color:'#6bff6b' },
        { key:'phantom', cn:'幻影', spdMod:1.1, hpMod:1.0,  armor:0,    regen:0,  phantom:true,  color:'#b888ff' }
    ];

    var idCounter = 0;
    for (var p = 0; p < PROTOS.length; p++) {
        var proto = PROTOS[p];
        for (var t = 0; t < TIERS.length; t++) {
            var tier = TIERS[t];
            for (var s = 0; s < SUBTYPES.length; s++) {
                var subtype = SUBTYPES[s];

                var hp = Math.round(proto.baseHp * tier.hpMult * subtype.hpMod);
                var speed = Math.round(proto.baseSpeed * tier.spdMult * subtype.spdMod);
                var size = Math.round(proto.size * tier.sizeMult * 10) / 10;
                var gold = Math.round(proto.gold * tier.mult);
                var color = subtype.color || proto.baseColor;
                var uid = proto.key + '_' + tier.key + '_' + subtype.key;
                var name = tier.cn + subtype.cn + proto.cn;

                window.ENEMY_DATA.push({
                    id: idCounter,
                    uid: uid,
                    name: name,
                    proto: proto.key,
                    tier: tier.key,
                    subtype: subtype.key,
                    baseHp: hp,
                    speed: speed,
                    gold: gold,
                    size: size,
                    shape: proto.shape,
                    color: color,
                    isBoss: tier.isBoss,
                    armor: subtype.armor,
                    regen: subtype.regen,
                    phantom: subtype.phantom
                });
                idCounter++;
            }
        }
    }


    // ---------- PART B: 12 ELITE ENEMIES ----------

    var elites = [
        {
            uid: 'elite_ironclad',
            name: '钢铁壁垒',
            hp: 1200, speed: 30, gold: 200, size: 28,
            shape: 'square', color: '#aabbcc',
            armor: 0.6, regen: 0,
            description: '重装甲精英，减免60%伤害，移动极慢但坚不可摧。',
            special: { armorPlate: true }
        },
        {
            uid: 'elite_frost_wolf',
            name: '冰霜狂狼',
            hp: 450, speed: 130, gold: 150, size: 16,
            shape: 'triangle', color: '#88ddff',
            armor: 0, regen: 0,
            description: '攻击时减速玩家/附近敌人30%，高速敏捷。',
            special: { slowPlayerOnHit: 0.3 }
        },
        {
            uid: 'elite_berserker',
            name: '狂暴者',
            hp: 800, speed: 70, gold: 180, size: 18,
            shape: 'circle', color: '#ff5555',
            armor: 0.1, regen: 0,
            description: '狂暴精英，对周围塔楼造成范围伤害。',
            special: { rage: true }
        },
        {
            uid: 'elite_shadow_stalker',
            name: '暗影潜行者',
            hp: 300, speed: 150, gold: 160, size: 14,
            shape: 'circle', color: '#9944ff',
            armor: 0, regen: 0,
            description: '100%幻影穿透，速度极快，难以锁定。',
            special: { phantom: true }
        },
        {
            uid: 'elite_poison_spore',
            name: '剧毒孢子',
            hp: 500, speed: 50, gold: 140, size: 20,
            shape: 'diamond', color: '#44ff88',
            armor: 0, regen: 0,
            description: '散发剧毒光环，对范围内敌人持续造成20点/秒伤害。',
            special: { dot: 20, dotRadius: 80 }
        },
        {
            uid: 'elite_thunder_beast',
            name: '雷霆巨兽',
            hp: 1000, speed: 65, gold: 220, size: 26,
            shape: 'square', color: '#ffff44',
            armor: 0.2, regen: 0,
            description: '周身环绕闪电光环，攻击可链式传导至邻近敌人。',
            special: { chainAura: true }
        },
        {
            uid: 'elite_summoner',
            name: '召唤者',
            hp: 600, speed: 45, gold: 190, size: 18,
            shape: 'circle', color: '#ff88ff',
            armor: 0, regen: 0,
            description: '每5秒召唤小兵协助作战，优先清除召唤源。',
            special: { summonInterval: 5000, summonCount: 2 }
        },
        {
            uid: 'elite_reaper',
            name: '死神收割者',
            hp: 900, speed: 90, gold: 210, size: 20,
            shape: 'triangle', color: '#333333',
            armor: 0.15, regen: 0,
            description: '收割低血量敌人，附近友军生命低于20%时直接处决并回复自身。',
            special: { executeThreshold: 0.2, executeRange: 100 }
        },
        {
            uid: 'elite_bloodthirster',
            name: '嗜血者',
            hp: 700, speed: 80, gold: 170, size: 18,
            shape: 'circle', color: '#dd2222',
            armor: 0.05, regen: 0,
            description: '每击杀一个敌人回复自身10%最大生命值，越战越勇。',
            special: { healOnKill: 0.1 }
        },
        {
            uid: 'elite_arcane_weaver',
            name: '奥术织者',
            hp: 550, speed: 55, gold: 165, size: 17,
            shape: 'circle', color: '#cc66ff',
            armor: 0, regen: 0,
            description: '持有可吸收500点伤害的魔法护盾，破盾后本体脆弱。',
            special: { shield: 500 }
        },
        {
            uid: 'elite_titan',
            name: '泰坦',
            hp: 5000, speed: 20, gold: 500, size: 40,
            shape: 'square', color: '#ff9900',
            armor: 0.4, regen: 2,
            description: '巨型泰坦，5000血，40%护甲，缓慢但毁灭一切。',
            special: { massive: true }
        },
        {
            uid: 'elite_void_lord',
            name: '虚空领主',
            hp: 10000, speed: 35, gold: 1000, size: 48,
            shape: 'voidspecial', color: '#000000',
            armor: 0.5, regen: 5,
            description: '最终BOSS，虚空领主，汇聚所有精英之力，拥有护盾、召唤、收割、嗜血、链式闪电。',
            special: {
                isBoss: true,
                shield: 2000,
                summonInterval: 4000, summonCount: 3,
                executeThreshold: 0.15, executeRange: 150,
                healOnKill: 0.05,
                chainAura: true,
                dot: 30, dotRadius: 120,
                glow: '#cc00ff'
            }
        }
    ];

    for (var i = 0; i < elites.length; i++) {
        var e = elites[i];
        window.ELITE_DATA.push({
            id: i,
            uid: e.uid,
            name: e.name,
            hp: e.hp,
            speed: e.speed,
            gold: e.gold,
            size: e.size,
            shape: e.shape,
            color: e.color,
            isElite: true,
            isBoss: !!(e.special && e.special.isBoss),
            armor: e.armor,
            regen: e.regen,
            description: e.description,
            special: e.special
        });
    }

})();
console.log('ENEMIES loaded:', window.ENEMY_DATA.length, '+ elite:', window.ELITE_DATA.length);
