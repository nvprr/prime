/* ============================================================
   PRIME LIFE MAXING — charts.js
   Dependency-free canvas charts (dotted line + thin connector, bars).
   Heights are fixed constants — never read back from the canvas —
   so a chart can not "grow" on each redraw.
   ============================================================ */
(function () {
  'use strict';
  const Prime = window.Prime, D = Prime.D;
  const DEFAULT_HEIGHT = 86;

  function cssVar(name, fallback) {
    const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
    return v || fallback;
  }
  const accent = () => cssVar('--accent', '#c6f432');
  const muted = () => cssVar('--text-3', 'rgba(255,255,255,0.4)');
  const track = () => cssVar('--surface-3', 'rgba(255,255,255,0.08)');

  function hexToRgba(hex, alpha) {
    const h = hex.replace('#', '');
    if (h.length !== 3 && h.length !== 6) return hex;
    const n = parseInt(h.length === 3 ? h.split('').map(c => c + c).join('') : h, 16);
    return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${alpha})`;
  }

  function setup(canvas, height) {
    const dpr = window.devicePixelRatio || 1;
    const w = Math.max(120, Math.floor(canvas.parentElement.clientWidth || 0));
    canvas.style.width = w + 'px';
    canvas.style.height = height + 'px';
    canvas.width = Math.floor(w * dpr);
    canvas.height = Math.floor(height * dpr);
    const ctx = canvas.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    return { ctx, w, h: height };
  }

  function roundRect(ctx, x, y, w, h, r) {
    r = Math.min(r, w / 2, h / 2);
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  function labels(ctx, w, h, padX, padBottom, lab) {
    if (!lab || !lab.length) return;
    ctx.fillStyle = muted();
    ctx.font = '10px -apple-system, system-ui, sans-serif';
    ctx.textBaseline = 'top';
    ctx.textAlign = 'left';
    ctx.fillText(lab[0], padX, h - padBottom + 4);
    ctx.textAlign = 'right';
    ctx.fillText(lab[lab.length - 1], w - padX, h - padBottom + 4);
  }

  /** points: [{y:number|null}] ; opts: {min,max,labels,height,refLine,color} */
  function drawLine(canvas, emptyEl, points, opts) {
    opts = opts || {};
    const valid = points.filter(p => p.y !== null && p.y !== undefined);
    if (valid.length === 0) {
      canvas.hidden = true; if (emptyEl) emptyEl.hidden = false; return false;
    }
    canvas.hidden = false; if (emptyEl) emptyEl.hidden = true;
    const height = opts.height || DEFAULT_HEIGHT;
    const { ctx, w, h } = setup(canvas, height);
    ctx.clearRect(0, 0, w, h);
    const padTop = 8, padBottom = 16, padX = 6;
    const values = valid.map(p => p.y);
    let min = opts.min !== undefined ? opts.min : Math.min(...values);
    let max = opts.max !== undefined ? opts.max : Math.max(...values);
    if (opts.refLine !== undefined && opts.max === undefined) max = Math.max(max, opts.refLine);
    if (min === max) { min -= 1; max += 1; }
    const rangeY = max - min;
    const plotW = w - padX * 2, plotH = h - padTop - padBottom;
    const stepX = points.length > 1 ? plotW / (points.length - 1) : 0;
    const coords = points.map((p, i) => {
      if (p.y === null || p.y === undefined) return null;
      return { x: points.length > 1 ? padX + stepX * i : w / 2, y: padTop + plotH - ((p.y - min) / rangeY) * plotH };
    });
    const col = opts.color || accent();

    if (opts.refLine !== undefined) {
      const ry = padTop + plotH - ((opts.refLine - min) / rangeY) * plotH;
      ctx.setLineDash([3, 4]); ctx.strokeStyle = muted(); ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(padX, ry); ctx.lineTo(w - padX, ry); ctx.stroke(); ctx.setLineDash([]);
    }

    ctx.beginPath();
    let started = false;
    coords.forEach(c => {
      if (!c) { started = false; return; }
      if (!started) { ctx.moveTo(c.x, c.y); started = true; } else ctx.lineTo(c.x, c.y);
    });
    ctx.strokeStyle = hexToRgba(col, 0.5); ctx.lineWidth = 1.5; ctx.lineJoin = 'round'; ctx.lineCap = 'round';
    ctx.stroke();

    const r = points.length > 45 ? 1.6 : points.length > 20 ? 2 : 2.8;
    coords.forEach(c => { if (!c) return; ctx.beginPath(); ctx.arc(c.x, c.y, r, 0, Math.PI * 2); ctx.fillStyle = col; ctx.fill(); });
    labels(ctx, w, h, padX, padBottom, opts.labels);
    return true;
  }

  /**
   * points: [{y:number} | {ys:[a,b]}] ; opts: {labels,height,colors:[...],highlightLast}
   * Single-series bars are tinted with the accent; zero values show a faint stub.
   */
  function drawBars(canvas, emptyEl, points, opts) {
    opts = opts || {};
    const has = points.some(p => (p.ys ? p.ys.some(v => v) : p.y));
    if (!has) { canvas.hidden = true; if (emptyEl) emptyEl.hidden = false; return false; }
    canvas.hidden = false; if (emptyEl) emptyEl.hidden = true;
    const height = opts.height || DEFAULT_HEIGHT;
    const { ctx, w, h } = setup(canvas, height);
    ctx.clearRect(0, 0, w, h);
    const padTop = 8, padBottom = 16, padX = 8;
    const series = points.some(p => p.ys) ? Math.max(...points.map(p => (p.ys ? p.ys.length : 1))) : 1;
    const flat = points.map(p => (p.ys ? p.ys : [p.y || 0]));
    const max = Math.max(1, ...flat.map(a => Math.max(...a)));
    const plotW = w - padX * 2, plotH = h - padTop - padBottom;
    const slot = plotW / points.length;
    const gap = Math.min(8, slot * 0.3);
    const groupW = Math.max(4, slot - gap);
    const barW = Math.max(3, groupW / series - (series > 1 ? 2 : 0));
    const colors = opts.colors || [accent()];
    flat.forEach((vals, i) => {
      vals.forEach((val, s) => {
        const bh = (val / max) * plotH;
        const x = padX + i * slot + (slot - groupW) / 2 + s * (barW + (series > 1 ? 2 : 0));
        const y = padTop + plotH - bh;
        ctx.fillStyle = val > 0 ? (colors[s] || colors[0]) : track();
        roundRect(ctx, x, y, barW, Math.max(bh, 2), 4);
        ctx.fill();
      });
    });
    labels(ctx, w, h, padX, padBottom, opts.labels);
    return true;
  }

  /** Create canvas + empty state inside `container` and draw. Container must be in the DOM. */
  function mount(container, kind, points, opts) {
    opts = opts || {};
    const ui = Prime.ui;
    const canvas = ui.h('canvas', { role: 'img', 'aria-label': opts.label || 'Wykres', height: String(opts.height || DEFAULT_HEIGHT) });
    const empty = ui.h('div.empty-state.small', { hidden: true }, ui.h('p', { text: opts.emptyText || 'Brak danych.' }));
    const wrap = ui.h('div.chart-canvas-wrap', null, canvas);
    container.appendChild(wrap);
    container.appendChild(empty);
    const draw = () => (kind === 'bar' ? drawBars : drawLine)(canvas, empty, points, opts);
    draw();
    return { canvas, redraw: draw };
  }

  function weeklyLabels(weeks) {
    if (weeks.length < 2) return [];
    return [D.shortLabel(weeks[0][0]), D.shortLabel(weeks[weeks.length - 1][weeks[weeks.length - 1].length - 1])];
  }

  Prime.charts = { drawLine, drawBars, mount, hexToRgba, weeklyLabels, DEFAULT_HEIGHT };
})();
