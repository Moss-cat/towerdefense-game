/* ================================================================
   level_page.js — 关卡选择 + 世界地图 公共模块
   共享给 levels.html 和 map.html
   依赖: js/data_levels.js (window.LEVELS / window.THEMES)
         js/save.js       (window.saveData)
   ================================================================ */
(function () {
  'use strict';

  /* ============ 主题元数据扩展（emoji + 主题色 + 关卡范围） ============ */
  const THEME_META = [
    { key: 'grass',      emoji: '🌿', color: '#4caf50', glow: 'rgba(76,175,80,0.35)',    name: '翠绿草原', levelRange: [1, 50] },
    { key: 'desert',     emoji: '🏜️', color: '#c0944a', glow: 'rgba(192,148,74,0.35)',   name: '黄沙荒漠', levelRange: [51, 100] },
    { key: 'ice',        emoji: '❄️', color: '#6ab8d8', glow: 'rgba(106,184,216,0.35)',  name: '冰封雪域', levelRange: [101, 150] },
    { key: 'lava',       emoji: '🔥', color: '#e85a30', glow: 'rgba(232,90,48,0.4)',     name: '熔岩地狱', levelRange: [151, 200] },
    { key: 'night',      emoji: '🌙', color: '#7080c0', glow: 'rgba(112,128,192,0.35)',  name: '夜幕森林', levelRange: [201, 250] },
    { key: 'cave',       emoji: '🕳️', color: '#8a7a5a', glow: 'rgba(138,122,90,0.35)',   name: '幽深洞穴', levelRange: [251, 300] },
    { key: 'forest',     emoji: '🌲', color: '#3a8a6a', glow: 'rgba(58,138,106,0.35)',   name: '迷雾林海', levelRange: [301, 350] },
    { key: 'cyber',      emoji: '🏙️', color: '#a070e0', glow: 'rgba(160,112,224,0.4)',   name: '赛博都市', levelRange: [351, 400] },
    { key: 'swamp',      emoji: '💧', color: '#6a9a3a', glow: 'rgba(106,154,58,0.35)',   name: '腐化沼泽', levelRange: [401, 450] },
    { key: 'crystal',    emoji: '💎', color: '#cc88ff', glow: 'rgba(204,136,255,0.4)',   name: '水晶矿脉', levelRange: [451, 500] },
    { key: 'underwater', emoji: '🐙', color: '#3a8ab0', glow: 'rgba(58,138,176,0.35)',   name: '深海遗迹', levelRange: [501, 550] },
    { key: 'space',      emoji: '🚀', color: '#c0c060', glow: 'rgba(192,192,96,0.35)',   name: '异星战场', levelRange: [551, 600] },
    { key: 'volcano',    emoji: '🌋', color: '#d04040', glow: 'rgba(208,64,64,0.4)',     name: '活火山口', levelRange: [601, 650] },
    { key: 'garden',     emoji: '🌸', color: '#80c060', glow: 'rgba(128,192,96,0.35)',   name: '空中花园', levelRange: [651, 700] },
    { key: 'void',       emoji: '🌀', color: '#b040b0', glow: 'rgba(176,64,176,0.4)',    name: '虚空裂隙', levelRange: [701, 750] }
  ];

  /* 实际使用的主题元数据（根据真实关卡数量裁剪） */
  const LEVEL_COUNT = 500;
  const ACTUAL_THEMES = THEME_META.filter(t => t.levelRange[0] <= LEVEL_COUNT);

  /* ============ 工具函数 ============ */

  /** 根据关卡号（1-based）返回主题元数据 */
  function themeOf(levelIdx) {
    for (const t of ACTUAL_THEMES) {
      if (levelIdx >= t.levelRange[0] && levelIdx <= t.levelRange[1]) return t;
    }
    return ACTUAL_THEMES[0];
  }

  /** 将 window.LEVELS 按主题分组 */
  function groupByTheme(levels) {
    const groups = ACTUAL_THEMES.map(t => ({ theme: t, levels: [] }));
    for (let i = 0; i < levels.length; i++) {
      const n = i + 1;
      const meta = themeOf(n);
      const g = groups.find(gr => gr.theme.key === meta.key);
      if (g) g.levels.push({ ...levels[i], _num: n });
    }
    // 过滤空组（关卡数不足的主题）
    return groups.filter(g => g.levels.length > 0);
  }

  /** 启动关卡：写 sessionStorage + 跳转 index.html */
  function startLevel(n) {
    sessionStorage.setItem('tdf_pendingLevel', String(n));
    location.href = 'index.html';
  }

  /** 等待依赖加载 */
  function waitDeps(cb) {
    const check = () => {
      if (window.LEVELS && window.saveData) cb();
      else setTimeout(check, 50);
    };
    check();
  }

  /* ============ levels.html 渲染 ============ */

  function renderLevelsPage() {
    waitDeps(() => {
      const LEVELS = window.LEVELS;
      const UL = window.saveData.unlockedLevel || 1;
      const CL = window.saveData.clearedLevels || [];
      const groups = groupByTheme(LEVELS);

      // 顶栏信息
      const highestBadge = document.getElementById('highestBadge');
      if (highestBadge) highestBadge.textContent = `🗝 已解锁至 ${UL}`;

      const container = document.getElementById('themeSections');
      if (!container) return;

      let html = '';
      for (const g of groups) {
        const t = g.theme;
        const [lo, hi] = t.levelRange;
        const actualLo = g.levels[0]._num;
        const actualHi = g.levels[g.levels.length - 1]._num;
        html += `<section class="theme-section" data-theme="${t.key}">
          <h2 class="theme-header" style="--theme-color:${t.color};--theme-glow:${t.glow}">
            <span class="theme-emoji">${t.emoji}</span>
            <span class="theme-name">${t.name}</span>
            <span class="theme-range">· 第 ${actualLo}-${actualHi} 关</span>
          </h2>
          <div class="level-grid">`;

        for (const lv of g.levels) {
          const n = lv._num;
          const locked = n > UL;
          const cleared = CL.includes(n);
          const isCurrent = n === UL && !cleared;
          const waveCount = lv.waveCount || 0;
          const maxTowers = lv.maxCarryTowers || 3;
          html += `<button class="lv-card ${locked?'locked':''} ${cleared?'cleared':''} ${isCurrent?'current':''}"
            data-level="${n}"
            ${locked?'disabled':''}
            style="--card-border:${t.color}">
            <span class="lv-num">${String(n).padStart(2,'0')}</span>
            ${cleared?'<span class="lv-badge lv-badge-cleared">✓</span>':''}
            ${locked?'<span class="lv-badge lv-badge-locked">❌</span>':''}
            <span class="lv-wave">${waveCount}波</span>
            <span class="lv-tower">带${maxTowers}塔</span>
          </button>`;
        }
        html += '</div></section>';
      }
      container.innerHTML = html;

      // 绑定点击
      container.querySelectorAll('.lv-card').forEach(card => {
        card.addEventListener('click', () => {
          const n = parseInt(card.dataset.level);
          if (!isNaN(n)) startLevel(n);
        });
      });

      // 滚动到当前关卡
      const current = container.querySelector('.lv-card.current');
      if (current) current.scrollIntoView({ behavior: 'smooth', block: 'center' });
    });
  }

  /* ============ map.html 渲染 ============ */

  function renderMapPage() {
    waitDeps(() => {
      const LEVELS = window.LEVELS;
      const UL = window.saveData.unlockedLevel || 1;
      const CL = window.saveData.clearedLevels || [];
      const canvas = document.getElementById('mapCanvas');
      if (!canvas) return;

      const W = 1200, H = 760;
      canvas.width = W; canvas.height = H;
      const ctx = canvas.getContext('2d');

      // 构建主题分区布局（蜂窝式排列）
      const groups = groupByTheme(LEVELS);
      const cols = 3, rows = Math.ceil(groups.length / cols);
      const regionW = W / cols, regionH = H / rows;
      const centers = [];

      for (let i = 0; i < groups.length; i++) {
        const col = i % cols, row = Math.floor(i / cols);
        const cx = regionW * (col + 0.5);
        const cy = regionH * (row + 0.5);
        centers.push({ cx, cy, r: Math.min(regionW, regionH) * 0.42 });
      }

      // 绘制区域背景
      ctx.fillStyle = 'rgba(10,14,26,0.95)';
      ctx.fillRect(0, 0, W, H);

      // 星空背景
      for (let i = 0; i < 80; i++) {
        const sx = (i * 137) % W;
        const sy = (i * 97) % H;
        ctx.fillStyle = `rgba(200,220,255,${0.15 + (i%5)*0.05})`;
        ctx.beginPath();
        ctx.arc(sx, sy, 1 + (i%3), 0, Math.PI*2);
        ctx.fill();
      }

      // 绘制区域色块（圆角矩形）
      for (let i = 0; i < groups.length; i++) {
        const g = groups[i];
        const c = centers[i];
        const col = i % cols, row = Math.floor(i / cols);
        const x = col * regionW + 20;
        const y = row * regionH + 20;
        const w = regionW - 40, h = regionH - 40;
        const grad = ctx.createRadialGradient(c.cx, c.cy, 10, c.cx, c.cy, c.r);
        grad.addColorStop(0, g.theme.glow);
        grad.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.roundRect(x, y, w, h, 24);
        ctx.fill();

        // 主题标签
        ctx.fillStyle = g.theme.color;
        ctx.font = 'bold 18px "Segoe UI", Consolas, monospace';
        ctx.textAlign = 'left';
        ctx.fillText(`${g.theme.emoji} ${g.theme.name}`, x + 14, y + 28);
        ctx.font = '12px "Segoe UI", Consolas, monospace';
        ctx.fillStyle = '#7a86a0';
        const firstN = g.levels[0]._num, lastN = g.levels[g.levels.length-1]._num;
        ctx.fillText(`${firstN}–${lastN} 关 · ${g.levels.length} 关`, x + 14, y + 46);
      }

      // 计算节点位置（每关在其区域内均匀分布）
      const nodePositions = new Map(); // levelNum -> {x, y}
      for (let i = 0; i < groups.length; i++) {
        const g = groups[i];
        const c = centers[i];
        const nLevels = g.levels.length;
        // 环形布局，从内到外
        for (let j = 0; j < nLevels; j++) {
          const lv = g.levels[j];
          const idxInGroup = j;
          // 螺旋分布
          const rings = Math.ceil(Math.sqrt(nLevels));
          const ring = Math.floor(idxInGroup / rings);
          const posInRing = idxInGroup % rings;
          const ringRadius = c.r * (0.15 + ring * 0.22);
          const angleStep = (Math.PI * 2) / Math.max(rings, 1);
          const baseAngle = (idxInGroup / nLevels) * Math.PI * 2;
          const angle = baseAngle + posInRing * 0.15;
          const nx = c.cx + Math.cos(angle) * ringRadius * 0.8;
          const ny = c.cy + Math.sin(angle) * ringRadius * 0.7;
          nodePositions.set(lv._num, { x: nx, y: ny });
        }
      }

      // 绘制连接线（同主题内，关卡顺序相连）
      ctx.strokeStyle = 'rgba(255,255,255,0.08)';
      ctx.lineWidth = 1.5;
      for (let i = 0; i < groups.length; i++) {
        const g = groups[i];
        ctx.strokeStyle = g.theme.color + '55';
        ctx.beginPath();
        let started = false;
        for (const lv of g.levels) {
          const p = nodePositions.get(lv._num);
          if (!p) continue;
          if (!started) { ctx.moveTo(p.x, p.y); started = true; }
          else ctx.lineTo(p.x, p.y);
        }
        ctx.stroke();
      }

      // 绘制节点
      const allNodes = []; // 供点击/悬停检测
      const tNow = Date.now() / 1000;
      for (let n = 1; n <= LEVEL_COUNT; n++) {
        const p = nodePositions.get(n);
        if (!p) continue;
        const locked = n > UL;
        const cleared = CL.includes(n);
        const isCurrent = n === UL && !cleared;
        const level = LEVELS[n - 1];
        const theme = themeOf(n);
        const r = 5 + Math.min(10, n * 0.02);

        // 当前关卡：脉冲光
        if (isCurrent) {
          const pulse = 0.5 + 0.5 * Math.sin(tNow * 3);
          ctx.beginPath();
          ctx.arc(p.x, p.y, r + 6 + pulse * 4, 0, Math.PI * 2);
          ctx.fillStyle = `rgba(255,226,122,${0.12 + pulse * 0.12})`;
          ctx.fill();
        }

        // 节点主体
        ctx.beginPath();
        ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
        if (locked) {
          ctx.fillStyle = '#3a3a4a';
          ctx.setLineDash([3, 2]);
          ctx.strokeStyle = '#555';
          ctx.lineWidth = 1.5;
        } else if (cleared) {
          ctx.fillStyle = theme.color;
          ctx.setLineDash([]);
          ctx.strokeStyle = '#ffe27a';
          ctx.lineWidth = 2;
        } else {
          ctx.fillStyle = theme.color;
          ctx.setLineDash([]);
          ctx.strokeStyle = '#fff';
          ctx.lineWidth = 1;
        }
        ctx.fill();
        if (locked || cleared) ctx.stroke();

        // 当前关卡：金色边框
        if (isCurrent) {
          ctx.setLineDash([]);
          ctx.strokeStyle = '#ffe27a';
          ctx.lineWidth = 2.5;
          ctx.beginPath();
          ctx.arc(p.x, p.y, r + 2, 0, Math.PI * 2);
          ctx.stroke();
        }

        allNodes.push({ n, x: p.x, y: p.y, r, level, theme, locked, cleared, isCurrent });
      }

      // 更新统计侧边栏
      const unlockedCount = Math.min(UL, LEVEL_COUNT);
      const clearedCount = CL.length;
      const pctUnlock = Math.round(unlockedCount / LEVEL_COUNT * 100);
      const pctClear = Math.round(clearedCount / LEVEL_COUNT * 100);
      const elUnlock = document.getElementById('statUnlock');
      const elClear = document.getElementById('statClear');
      const barUnlock = document.getElementById('barUnlock');
      const barClear = document.getElementById('barClear');
      if (elUnlock) elUnlock.textContent = `已解锁: ${unlockedCount}/${LEVEL_COUNT} (${pctUnlock}%)`;
      if (elClear) elClear.textContent = `已通关: ${clearedCount}/${LEVEL_COUNT} (${pctClear}%)`;
      if (barUnlock) barUnlock.style.width = pctUnlock + '%';
      if (barClear) barClear.style.width = pctClear + '%';

      // 绑定鼠标事件（悬停 tooltip + 点击）
      let tooltip = document.getElementById('mapTooltip');
      if (!tooltip) {
        tooltip = document.createElement('div');
        tooltip.id = 'mapTooltip';
        tooltip.className = 'map-tooltip';
        document.body.appendChild(tooltip);
      }

      canvas.addEventListener('mousemove', (e) => {
        const rect = canvas.getBoundingClientRect();
        const scaleX = canvas.width / rect.width;
        const scaleY = canvas.height / rect.height;
        const mx = (e.clientX - rect.left) * scaleX;
        const my = (e.clientY - rect.top) * scaleY;
        let hit = null;
        for (const nd of allNodes) {
          const dx = mx - nd.x, dy = my - nd.y;
          if (dx*dx + dy*dy <= (nd.r + 4) * (nd.r + 4)) { hit = nd; break; }
        }
        if (hit && !hit.locked) {
          tooltip.style.display = 'block';
          tooltip.style.left = (e.clientX + 14) + 'px';
          tooltip.style.top = (e.clientY + 14) + 'px';
          tooltip.innerHTML = `<b>${hit.theme.emoji} 第 ${hit.n} 关</b><br>${hit.theme.name}<br>${hit.level.waveCount||0}波 · 难度${hit.level.difficulty||1} · 带${hit.level.maxCarryTowers||3}塔${hit.cleared?'<br><span style="color:#ffe27a">✓ 已通关</span>':''}`;
          canvas.style.cursor = 'pointer';
        } else {
          tooltip.style.display = 'none';
          canvas.style.cursor = 'default';
        }
      });

      canvas.addEventListener('mouseleave', () => {
        tooltip.style.display = 'none';
        canvas.style.cursor = 'default';
      });

      canvas.addEventListener('click', (e) => {
        const rect = canvas.getBoundingClientRect();
        const scaleX = canvas.width / rect.width;
        const scaleY = canvas.height / rect.height;
        const mx = (e.clientX - rect.left) * scaleX;
        const my = (e.clientY - rect.top) * scaleY;
        for (const nd of allNodes) {
          const dx = mx - nd.x, dy = my - nd.y;
          if (dx*dx + dy*dy <= (nd.r + 4) * (nd.r + 4)) {
            if (!nd.locked) startLevel(nd.n);
            return;
          }
        }
      });

      // 动画重绘（让脉冲动起来）
      if (!window._mapAnimRunning) {
        window._mapAnimRunning = true;
        function animLoop() {
          // 只重绘脉冲高亮节点 —— 简化起见，直接重绘整图
          // 为避免重复，只在 canvas 还在 DOM 时继续
          if (!document.body.contains(canvas)) { window._mapAnimRunning = false; return; }
          const t2 = Date.now() / 1000;
          // 轻量重绘：只擦除并重绘脉冲（这里跳过以保持性能）
          requestAnimationFrame(animLoop);
        }
        requestAnimationFrame(animLoop);
      }
    });
  }

  /* ============ 暴露 API ============ */

  window.LevelPage = {
    THEMES: ACTUAL_THEMES,
    ALL_THEMES: THEME_META,
    themeOf,
    groupByTheme,
    startLevel,
    renderLevelsPage,
    renderMapPage
  };

  // 全局便捷
  window.startLevel = startLevel;

})();
