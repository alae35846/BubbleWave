/**
 * BubbleWave — petits graphiques Canvas, sans dépendance externe.
 */

const THEMES = {
  light: {
    background: "#ffffff",
    grid: "rgba(15, 42, 70, 0.09)",
    axis: "rgba(15, 42, 70, 0.22)",
    text: "#49637d",
    strongText: "#0b2545",
    band: "rgba(35, 199, 232, 0.08)",
    bandBorder: "rgba(35, 199, 232, 0.28)",
    marker: "#0b2545",
    tooltipBg: "#0b2545",
    tooltipText: "#f4fbff",
  },
  dark: {
    background: "#0b1b2e",
    grid: "rgba(180, 230, 255, 0.10)",
    axis: "rgba(180, 230, 255, 0.22)",
    text: "#9cb8cf",
    strongText: "#e9f8ff",
    band: "rgba(35, 199, 232, 0.12)",
    bandBorder: "rgba(35, 199, 232, 0.32)",
    marker: "#dff9ff",
    tooltipBg: "#e9f8ff",
    tooltipText: "#0b1b2e",
  },
};

export const SERIES_COLORS = {
  R: { light: "#e96355", dark: "#ff8b7d" },
  T: { light: "#0e9f91", dark: "#3ee0cd" },
  A: { light: "#d78b24", dark: "#f5bd58" },
  field: { light: "#168fbe", dark: "#63dcff" },
};

function clamp(v, min, max) {
  return Math.min(max, Math.max(min, v));
}

function niceTicks(min, max, count = 5) {
  if (!Number.isFinite(min) || !Number.isFinite(max) || min === max) {
    return [min];
  }
  const span = max - min;
  const rough = span / Math.max(1, count - 1);
  const power = 10 ** Math.floor(Math.log10(rough));
  const candidates = [1, 2, 2.5, 5, 10];
  let step = power;
  for (const c of candidates) {
    if (power * c >= rough) {
      step = power * c;
      break;
    }
  }
  const start = Math.ceil(min / step) * step;
  const ticks = [];
  for (let v = start; v <= max + step * 1e-9; v += step) {
    ticks.push(Number(v.toFixed(10)));
  }
  return ticks;
}

function roundedRect(ctx, x, y, w, h, r) {
  const radius = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.arcTo(x + w, y, x + w, y + h, radius);
  ctx.arcTo(x + w, y + h, x, y + h, radius);
  ctx.arcTo(x, y + h, x, y, radius);
  ctx.arcTo(x, y, x + w, y, radius);
  ctx.closePath();
}

export class CanvasChart {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d");
    this.themeName = "light";
    this.rows = [];
    this.series = [];
    this.options = {};
    this.hover = null;
    this.pointer = null;
    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(canvas.parentElement || canvas);
    this.canvas.addEventListener("pointermove", (event) => this.onPointerMove(event));
    this.canvas.addEventListener("pointerleave", () => {
      this.pointer = null;
      this.draw();
    });
    this.resize();
  }

  setTheme(themeName) {
    this.themeName = themeName === "dark" ? "dark" : "light";
    this.draw();
  }

  setData({ rows, series, ...options }) {
    this.rows = rows || [];
    this.series = series || [];
    this.options = options || {};
    this.draw();
  }

  resize() {
    const parent = this.canvas.parentElement || this.canvas;
    const width = Math.max(280, parent.clientWidth || 600);
    const height = Math.max(220, parent.clientHeight || 340);
    const dpr = Math.min(2.5, window.devicePixelRatio || 1);
    this.canvas.width = Math.round(width * dpr);
    this.canvas.height = Math.round(height * dpr);
    this.canvas.style.width = `${width}px`;
    this.canvas.style.height = `${height}px`;
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.width = width;
    this.height = height;
    this.draw();
  }

  onPointerMove(event) {
    const rect = this.canvas.getBoundingClientRect();
    this.pointer = {
      x: event.clientX - rect.left,
      y: event.clientY - rect.top,
    };
    this.draw();
  }

  getPlot() {
    const left = this.width < 520 ? 42 : 54;
    return {
      x: left,
      y: 18,
      w: this.width - left - 18,
      h: this.height - 18 - 42,
    };
  }

  draw() {
    if (!this.ctx || !this.width) return;
    const theme = THEMES[this.themeName];
    const ctx = this.ctx;
    const plot = this.getPlot();
    const { rows, series, options } = this;
    ctx.clearRect(0, 0, this.width, this.height);
    ctx.fillStyle = theme.background;
    ctx.fillRect(0, 0, this.width, this.height);

    const xMin = options.xMin ?? 0;
    const xMax = options.xMax ?? 1;
    const yMin = options.yMin ?? 0;
    const yMax = options.yMax ?? 1;
    const xScale = (v) => plot.x + ((v - xMin) / (xMax - xMin || 1)) * plot.w;
    const yScale = (v) =>
      plot.y + plot.h - ((clamp(v, yMin, yMax) - yMin) / (yMax - yMin || 1)) * plot.h;

    // Bandes (par exemple : région du mur dans le profil de champ).
    for (const band of options.bands || []) {
      const x0 = clamp(xScale(band.x0), plot.x, plot.x + plot.w);
      const x1 = clamp(xScale(band.x1), plot.x, plot.x + plot.w);
      ctx.fillStyle = band.color || theme.band;
      ctx.fillRect(x0, plot.y, Math.max(1, x1 - x0), plot.h);
      if (band.label) {
        ctx.fillStyle = theme.text;
        ctx.font = "600 10px ui-sans-serif, system-ui, sans-serif";
        ctx.textAlign = "center";
        ctx.textBaseline = "top";
        ctx.fillText(band.label, (x0 + x1) / 2, plot.y + 6);
      }
    }

    const xTicks = options.xTicks || niceTicks(xMin, xMax, 6);
    const yTicks = options.yTicks || niceTicks(yMin, yMax, 6);

    // Grille.
    ctx.save();
    ctx.strokeStyle = theme.grid;
    ctx.lineWidth = 1;
    ctx.setLineDash([3, 5]);
    for (const tick of yTicks) {
      const y = yScale(tick);
      ctx.beginPath();
      ctx.moveTo(plot.x, y);
      ctx.lineTo(plot.x + plot.w, y);
      ctx.stroke();
    }
    for (const tick of xTicks) {
      const x = xScale(tick);
      ctx.beginPath();
      ctx.moveTo(x, plot.y);
      ctx.lineTo(x, plot.y + plot.h);
      ctx.stroke();
    }
    ctx.restore();

    // Axes.
    ctx.strokeStyle = theme.axis;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(plot.x, plot.y);
    ctx.lineTo(plot.x, plot.y + plot.h);
    ctx.lineTo(plot.x + plot.w, plot.y + plot.h);
    ctx.stroke();

    // Étiquettes.
    ctx.fillStyle = theme.text;
    ctx.font = "500 10.5px ui-sans-serif, system-ui, sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "top";
    for (const tick of xTicks) {
      ctx.fillText(options.xTickFormatter ? options.xTickFormatter(tick) : String(tick), xScale(tick), plot.y + plot.h + 9);
    }
    ctx.textAlign = "right";
    ctx.textBaseline = "middle";
    for (const tick of yTicks) {
      ctx.fillText(options.yTickFormatter ? options.yTickFormatter(tick) : String(tick), plot.x - 8, yScale(tick));
    }

    if (options.xLabel) {
      ctx.textAlign = "center";
      ctx.textBaseline = "bottom";
      ctx.font = "600 10px ui-sans-serif, system-ui, sans-serif";
      ctx.fillStyle = theme.text;
      ctx.fillText(options.xLabel, plot.x + plot.w / 2, this.height - 7);
    }
    if (options.yLabel) {
      ctx.save();
      ctx.translate(11, plot.y + plot.h / 2);
      ctx.rotate(-Math.PI / 2);
      ctx.textAlign = "center";
      ctx.textBaseline = "top";
      ctx.font = "600 10px ui-sans-serif, system-ui, sans-serif";
      ctx.fillStyle = theme.text;
      ctx.fillText(options.yLabel, 0, 0);
      ctx.restore();
    }

    // Courbes.
    for (const s of series) {
      if (!s.visible && s.visible !== undefined) continue;
      const color = s.color?.[this.themeName] || s.color || SERIES_COLORS[s.key]?.[this.themeName] || "#168fbe";
      ctx.save();
      ctx.strokeStyle = color;
      ctx.lineWidth = s.width || 2.2;
      ctx.lineJoin = "round";
      ctx.lineCap = "round";
      ctx.setLineDash(s.dash || []);
      if (s.fill) {
        const gradient = ctx.createLinearGradient(0, plot.y, 0, plot.y + plot.h);
        gradient.addColorStop(0, `${color}33`);
        gradient.addColorStop(1, `${color}00`);
        ctx.beginPath();
        let started = false;
        for (const row of rows) {
          const x = xScale(row.x);
          const y = yScale(row[s.key]);
          if (!started) {
            ctx.moveTo(x, plot.y + plot.h);
            ctx.lineTo(x, y);
            started = true;
          } else {
            ctx.lineTo(x, y);
          }
        }
        if (started) {
          ctx.lineTo(xScale(rows[rows.length - 1].x), plot.y + plot.h);
          ctx.closePath();
          ctx.fillStyle = gradient;
          ctx.fill();
        }
      }
      ctx.beginPath();
      rows.forEach((row, index) => {
        const x = xScale(row.x);
        const y = yScale(row[s.key]);
        if (index === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      });
      ctx.stroke();
      ctx.restore();
    }

    // Repère vertical de la valeur courante.
    if (options.marker && Number.isFinite(options.marker.x)) {
      const x = xScale(options.marker.x);
      ctx.save();
      ctx.strokeStyle = theme.marker;
      ctx.globalAlpha = 0.45;
      ctx.setLineDash([4, 5]);
      ctx.beginPath();
      ctx.moveTo(x, plot.y);
      ctx.lineTo(x, plot.y + plot.h);
      ctx.stroke();
      ctx.globalAlpha = 1;
      for (const s of series) {
        if (s.visible === false) continue;
        const value = options.marker.values?.[s.key];
        if (!Number.isFinite(value)) continue;
        const color = s.color?.[this.themeName] || s.color || SERIES_COLORS[s.key]?.[this.themeName] || "#168fbe";
        ctx.fillStyle = theme.background;
        ctx.strokeStyle = color;
        ctx.lineWidth = 2.2;
        ctx.beginPath();
        ctx.arc(x, yScale(value), 4.2, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
      }
      ctx.restore();
    }

    // Infobulle au survol.
    if (this.pointer && rows.length) {
      const px = this.pointer.x;
      const py = this.pointer.y;
      if (px >= plot.x && px <= plot.x + plot.w && py >= plot.y && py <= plot.y + plot.h) {
        const ratio = (px - plot.x) / plot.w;
        const target = xMin + ratio * (xMax - xMin);
        let nearest = rows[0];
        for (const row of rows) {
          if (Math.abs(row.x - target) < Math.abs(nearest.x - target)) nearest = row;
        }
        this.hover = nearest;
        const x = xScale(nearest.x);
        ctx.save();
        ctx.strokeStyle = theme.axis;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(x, plot.y);
        ctx.lineTo(x, plot.y + plot.h);
        ctx.stroke();
        for (const s of series) {
          if (s.visible === false) continue;
          const value = nearest[s.key];
          if (!Number.isFinite(value)) continue;
          const color = s.color?.[this.themeName] || s.color || SERIES_COLORS[s.key]?.[this.themeName] || "#168fbe";
          ctx.fillStyle = color;
          ctx.beginPath();
          ctx.arc(x, yScale(value), 3, 0, Math.PI * 2);
          ctx.fill();
        }
        const lines = [
          options.tooltipTitle ? options.tooltipTitle(nearest) : String(nearest.x),
          ...series
            .filter((s) => s.visible !== false && Number.isFinite(nearest[s.key]))
            .map((s) => `${s.label || s.key} : ${options.tooltipValue ? options.tooltipValue(nearest[s.key], s) : nearest[s.key]}`),
        ];
        ctx.font = "600 10.5px ui-sans-serif, system-ui, sans-serif";
        const textWidth = Math.max(...lines.map((line) => ctx.measureText(line).width));
        const boxW = Math.min(190, textWidth + 20);
        const boxH = lines.length * 15 + 14;
        let boxX = x + 12;
        if (boxX + boxW > plot.x + plot.w) boxX = x - boxW - 12;
        let boxY = py - boxH / 2;
        boxY = clamp(boxY, plot.y + 4, plot.y + plot.h - boxH - 4);
        ctx.fillStyle = theme.tooltipBg;
        roundedRect(ctx, boxX, boxY, boxW, boxH, 8);
        ctx.fill();
        ctx.fillStyle = theme.tooltipText;
        ctx.textAlign = "left";
        ctx.textBaseline = "top";
        lines.forEach((line, index) => {
          ctx.font = index === 0 ? "700 10.5px ui-sans-serif, system-ui, sans-serif" : "500 10.5px ui-sans-serif, system-ui, sans-serif";
          ctx.fillText(line, boxX + 10, boxY + 7 + index * 15);
        });
        ctx.restore();
      } else {
        this.hover = null;
      }
    }
  }
}

/**
 * Petite jauge circulaire pour le coefficient de réflexion.
 */
export function drawGauge(canvas, value, { label = "R", color = "#e96355", theme = "light" } = {}) {
  const ctx = canvas.getContext("2d");
  const parent = canvas.parentElement || canvas;
  const size = Math.max(120, Math.min(parent.clientWidth || 160, parent.clientHeight || 160));
  const dpr = Math.min(2.5, window.devicePixelRatio || 1);
  canvas.width = size * dpr;
  canvas.height = size * dpr;
  canvas.style.width = `${size}px`;
  canvas.style.height = `${size}px`;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, size, size);
  const center = size / 2;
  const radius = size * 0.38;
  const start = Math.PI * 0.75;
  const end = Math.PI * 2.25;
  const v = clamp(value, 0, 1);
  ctx.lineWidth = size * 0.075;
  ctx.lineCap = "round";
  ctx.strokeStyle = theme === "dark" ? "rgba(180,230,255,.12)" : "rgba(15,42,70,.09)";
  ctx.beginPath();
  ctx.arc(center, center, radius, start, end);
  ctx.stroke();
  ctx.strokeStyle = color;
  ctx.beginPath();
  ctx.arc(center, center, radius, start, start + (end - start) * v);
  ctx.stroke();
  ctx.fillStyle = theme === "dark" ? "#e9f8ff" : "#0b2545";
  ctx.font = `700 ${Math.round(size * 0.17)}px ui-sans-serif, system-ui, sans-serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(`${(v * 100).toFixed(1)}%`, center, center - 2);
  ctx.fillStyle = theme === "dark" ? "#9cb8cf" : "#49637d";
  ctx.font = `600 ${Math.round(size * 0.075)}px ui-sans-serif, system-ui, sans-serif`;
  ctx.fillText(label, center, center + size * 0.14);
}
