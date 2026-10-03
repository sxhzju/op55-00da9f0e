// Drawing toolkit: easing, noise, hand-drawn strokes, washes, glyph writing, textures.
// Everything is a pure function of its inputs so any frame can be rendered alone.
import GLYPHS from './glyphs.js';

export const W = 1920;
export const H = 1080;
export const FPS = 30;

export const C = {
  paper: '#F3EDE1',
  ink: '#2A2A33',
  sepia: '#5B4430',
  green: '#46A83A',
  greenWash: '#A9D98C',
  coral: '#EE6440',
  coralWash: '#F7A88A',
  ochre: '#F0B940',
  ochreWash: '#F8D980',
  grey: '#B4B6BE',
  white: '#FFFDF7',
};

// ---------- math ----------
export const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
export const lerp = (a, b, u) => a + (b - a) * u;
export const tw = (t, t0, t1) => clamp((t - t0) / (t1 - t0));
export const TAU = Math.PI * 2;

export const ease = {
  outExpo: (u) => (u >= 1 ? 1 : 1 - Math.pow(2, -10 * u)),
  inExpo: (u) => (u <= 0 ? 0 : Math.pow(2, 10 * (u - 1))),
  outCubic: (u) => 1 - Math.pow(1 - u, 3),
  inCubic: (u) => u * u * u,
  outQuart: (u) => 1 - Math.pow(1 - u, 4),
  inQuad: (u) => u * u,
  outQuad: (u) => 1 - (1 - u) * (1 - u),
  outBack: (u, s = 1.9) => 1 + (s + 1) * Math.pow(u - 1, 3) + s * Math.pow(u - 1, 2),
  inBack: (u, s = 1.7) => (s + 1) * u * u * u - s * u * u,
  // Snappy start, decaying wobble around 1 (damped spring released with velocity).
  spring: (u, d = 6, f = 13) => (u >= 1 ? 1 : 1 - Math.exp(-d * u) * Math.cos(f * u)),
  // Expo-shaped acceleration then decel: a whip, not a symmetric ease-in-out.
  whip: (u) => (u < 0.38 ? 0.5 * Math.pow(u / 0.38, 3) : 0.5 + 0.5 * (1 - Math.pow(2, -9 * ((u - 0.38) / 0.62)))),
};

// CSS-style cubic-bezier for hand-tuned curves.
export function bezier(x1, y1, x2, y2) {
  const cx = 3 * x1, bx = 3 * (x2 - x1) - cx, ax = 1 - cx - bx;
  const cy = 3 * y1, by = 3 * (y2 - y1) - cy, ay = 1 - cy - by;
  const sx = (s) => ((ax * s + bx) * s + cx) * s;
  const sy = (s) => ((ay * s + by) * s + cy) * s;
  const dx = (s) => (3 * ax * s + 2 * bx) * s + cx;
  return (u) => {
    if (u <= 0) return 0;
    if (u >= 1) return 1;
    let s = u;
    for (let i = 0; i < 8; i++) {
      const e = sx(s) - u;
      const d = dx(s);
      if (Math.abs(e) < 1e-6 || Math.abs(d) < 1e-6) break;
      s -= e / d;
    }
    return sy(clamp(s));
  };
}

export function hash1(n) {
  const s = Math.sin(n * 127.1 + 311.7) * 43758.5453123;
  return s - Math.floor(s);
}
export function vnoise(x) {
  const i = Math.floor(x), f = x - i;
  const u = f * f * (3 - 2 * f);
  return lerp(hash1(i), hash1(i + 1), u);
}
// Smooth signed noise in [-1, 1].
export const snoise = (x) => vnoise(x) * 2 - 1;

export function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ---------- affine matrices [a b c d e f] ----------
export const I = [1, 0, 0, 1, 0, 0];
export const mul = (m, n) => [
  m[0] * n[0] + m[2] * n[1], m[1] * n[0] + m[3] * n[1],
  m[0] * n[2] + m[2] * n[3], m[1] * n[2] + m[3] * n[3],
  m[0] * n[4] + m[2] * n[5] + m[4], m[1] * n[4] + m[3] * n[5] + m[5],
];
export const T = (x, y) => [1, 0, 0, 1, x, y];
export const S = (sx, sy = sx) => [sx, 0, 0, sy, 0, 0];
export const R = (r) => [Math.cos(r), Math.sin(r), -Math.sin(r), Math.cos(r), 0, 0];
export const M = (...ms) => ms.reduce(mul, I);
export const ap = (m, p) => [m[0] * p[0] + m[2] * p[1] + m[4], m[1] * p[0] + m[3] * p[1] + m[5]];

// ---------- shape generators (local coordinates) ----------
export function arcPts(cx, cy, rx, ry, a0, a1, n = 48) {
  const pts = [];
  for (let i = 0; i <= n; i++) {
    const a = lerp(a0, a1, i / n);
    pts.push([cx + Math.cos(a) * rx, cy + Math.sin(a) * ry]);
  }
  return pts;
}
// A hand-drawn loop: does not close cleanly, overshoots a little past the start.
export function loopPts(cx, cy, rx, ry, seed = 1, over = 0.12, start = -2.2) {
  const n = 72, pts = [];
  for (let i = 0; i <= n; i++) {
    const u = i / n;
    const a = start + u * TAU * (1 + over);
    const k = 1 + 0.035 * Math.sin(u * 5 + seed) + 0.05 * (u - 0.5) * (hash1(seed) > 0.5 ? 1 : -1);
    pts.push([cx + Math.cos(a) * rx * k, cy + Math.sin(a) * ry * k]);
  }
  return pts;
}
export function rrectPts(x0, y0, x1, y1, r, over = 0.06) {
  const pts = [];
  const seg = (a, b) => { for (let i = 0; i <= 8; i++) pts.push([lerp(a[0], b[0], i / 8), lerp(a[1], b[1], i / 8)]); };
  const corner = (cx, cy, a0) => { for (let i = 1; i <= 8; i++) { const a = a0 + (i / 8) * (Math.PI / 2); pts.push([cx + Math.cos(a) * r, cy + Math.sin(a) * r]); } };
  seg([x0 + r, y0], [x1 - r, y0]); corner(x1 - r, y0 + r, -Math.PI / 2);
  seg([x1, y0 + r], [x1, y1 - r]); corner(x1 - r, y1 - r, 0);
  seg([x1 - r, y1], [x0 + r, y1]); corner(x0 + r, y1 - r, Math.PI / 2);
  seg([x0, y1 - r], [x0, y0 + r]); corner(x0 + r, y0 + r, Math.PI);
  // overshoot along the top edge
  const ox = (x1 - x0) * over;
  pts.push([x0 + r + ox, y0 - 2]);
  return pts;
}
// Catmull-Rom through control points.
export function spline(cp, per = 12) {
  const out = [];
  for (let i = 0; i < cp.length - 1; i++) {
    const p0 = cp[Math.max(0, i - 1)], p1 = cp[i], p2 = cp[i + 1], p3 = cp[Math.min(cp.length - 1, i + 2)];
    for (let j = 0; j < per; j++) {
      const t = j / per, t2 = t * t, t3 = t2 * t;
      out.push([0, 1].map((k) => 0.5 * (2 * p1[k] + (-p0[k] + p2[k]) * t + (2 * p0[k] - 5 * p1[k] + 4 * p2[k] - p3[k]) * t2 + (-p0[k] + 3 * p1[k] - 3 * p2[k] + p3[k]) * t3)));
    }
  }
  out.push(cp[cp.length - 1]);
  return out;
}

// Resample a polyline every `step` units: [[x, y, s], ...]
export function resample(pts, step) {
  const out = [[pts[0][0], pts[0][1], 0]];
  let s = 0, next = step;
  for (let i = 1; i < pts.length; i++) {
    const ax = pts[i - 1][0], ay = pts[i - 1][1];
    const bx = pts[i][0], by = pts[i][1];
    const len = Math.hypot(bx - ax, by - ay);
    if (len < 1e-9) continue;
    while (next <= s + len) {
      const u = (next - s) / len;
      out.push([lerp(ax, bx, u), lerp(ay, by, u), next]);
      next += step;
    }
    s += len;
  }
  const last = pts[pts.length - 1];
  if (s - out[out.length - 1][2] > 0.01) out.push([last[0], last[1], s]);
  return out;
}
export function polyLength(pts) {
  let s = 0;
  for (let i = 1; i < pts.length; i++) s += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
  return s;
}
// Point + tangent angle at arc length s along a resampled path.
export function pointAt(res, s) {
  const total = res[res.length - 1][2];
  s = clamp(s, 0, total);
  let lo = 0, hi = res.length - 1;
  while (hi - lo > 1) { const mid = (lo + hi) >> 1; if (res[mid][2] < s) lo = mid; else hi = mid; }
  const a = res[lo], b = res[hi];
  const u = b[2] - a[2] > 0 ? (s - a[2]) / (b[2] - a[2]) : 0;
  return { x: lerp(a[0], b[0], u), y: lerp(a[1], b[1], u), ang: Math.atan2(b[1] - a[1], b[0] - a[0]) };
}

// ---------- the pen ----------
// Characters drawn larger use proportionally heavier lines.
let penScale = 1;
export const setPenScale = (k) => { penScale = k; };
// Draws a hand-inked stroke as a filled variable-width polygon.
// pts are local; o.m maps them to world. Width and wobble are in world units.
export function pen(ctx, pts, o = {}) {
  const m = o.m || I;
  const wpts = m === I ? pts : pts.map((p) => ap(m, p));
  const res = resample(wpts, o.step || 3.5);
  const total = res[res.length - 1][2];
  if (total < 0.5) return;
  const p0 = clamp(o.p0 ?? 0), p1 = clamp(o.p1 ?? 1);
  const s0 = p0 * total, s1 = p1 * total;
  if (s1 - s0 < 0.3) return;
  const w = (o.w ?? 5) * penScale;
  const amp = o.amp ?? 1.3;
  const fq = o.freq ?? 0.022;
  const sd = (o.seed ?? 1) * 17.31 + (o.boil ?? 0) * 9.173;
  const gx = (hash1(sd + 1.3) - 0.5) * amp * 1.2;
  const gy = (hash1(sd + 2.7) - 0.5) * amp * 1.2;
  const tin = o.tin ?? Math.max(6, w * 2.5);
  const tout = o.tout ?? Math.max(8, w * 3.5);
  const floor = o.floor ?? 0.25;
  const L = [], Rr = [];
  const n = res.length;
  const emit = (x, y, nx, ny, s, i) => {
    const j = amp * snoise(s * fq + sd);
    const px = x + nx * j + gx, py = y + ny * j + gy;
    let k = 1;
    k *= floor + (1 - floor) * Math.sqrt(clamp(s / tin));
    const end = p1 < 1 ? Math.max(clamp((total - s) / tout), 0.85) : clamp((total - s) / tout);
    k *= floor + (1 - floor) * Math.sqrt(end);
    k *= 0.86 + 0.28 * vnoise(s * 0.035 + sd * 0.3);
    const hw = (w * k) / 2;
    L.push([px + nx * hw, py + ny * hw]);
    Rr.push([px - nx * hw, py - ny * hw]);
    return hw;
  };
  const normal = (i) => {
    const a = res[Math.max(0, i - 1)], b = res[Math.min(n - 1, i + 1)];
    const dx = b[0] - a[0], dy = b[1] - a[1];
    const l = Math.hypot(dx, dy) || 1;
    return [-dy / l, dx / l];
  };
  let first = -1, hw0 = 0, hw1 = 0, start = null, endp = null;
  for (let i = 0; i < n; i++) {
    const s = res[i][2];
    if (s < s0) continue;
    if (s > s1) {
      const a = res[i - 1], b = res[i];
      const u = (s1 - a[2]) / (b[2] - a[2] || 1);
      const [nx, ny] = normal(i);
      hw1 = emit(lerp(a[0], b[0], u), lerp(a[1], b[1], u), nx, ny, s1, i);
      endp = L.length - 1;
      break;
    }
    if (first < 0) {
      first = i;
      if (s > s0 && i > 0) {
        const a = res[i - 1];
        const u = (s0 - a[2]) / (s - a[2] || 1);
        const [nx, ny] = normal(i);
        hw0 = emit(lerp(a[0], res[i][0], u), lerp(a[1], res[i][1], u), nx, ny, s0, i);
      }
    }
    const [nx, ny] = normal(i);
    const hw = emit(res[i][0], res[i][1], nx, ny, s, i);
    if (L.length === 1) hw0 = hw;
    hw1 = hw;
  }
  if (L.length < 2) return;
  ctx.globalAlpha = o.alpha ?? 1;
  ctx.fillStyle = o.color || C.ink;
  ctx.beginPath();
  ctx.moveTo(L[0][0], L[0][1]);
  for (let i = 1; i < L.length; i++) ctx.lineTo(L[i][0], L[i][1]);
  for (let i = Rr.length - 1; i >= 0; i--) ctx.lineTo(Rr[i][0], Rr[i][1]);
  ctx.closePath();
  ctx.fill();
  if (o.cap !== false) {
    const c0 = [(L[0][0] + Rr[0][0]) / 2, (L[0][1] + Rr[0][1]) / 2];
    const ce = [(L[L.length - 1][0] + Rr[Rr.length - 1][0]) / 2, (L[L.length - 1][1] + Rr[Rr.length - 1][1]) / 2];
    ctx.beginPath();
    ctx.arc(c0[0], c0[1], Math.max(0.3, hw0), 0, TAU);
    ctx.arc(ce[0], ce[1], Math.max(0.3, hw1), 0, TAU);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
}

// Watercolour / marker fill: wobbly outline, slight misregistration, darker rim.
export function wash(ctx, pts, o = {}) {
  const m = o.m || I;
  const sd = (o.seed ?? 1) * 5.13 + (o.boil ?? 0) * 3.31;
  const amp = o.amp ?? 3;
  const off = o.off || [5, 4];
  const res = resample(m === I ? pts : pts.map((p) => ap(m, p)), 6);
  ctx.globalAlpha = o.alpha ?? 0.9;
  ctx.fillStyle = o.color || C.greenWash;
  ctx.beginPath();
  res.forEach(([x, y, s], i) => {
    const j = amp * snoise(s * 0.012 + sd);
    const k = amp * snoise(s * 0.012 + sd + 40);
    const px = x + j + off[0], py = y + k + off[1];
    if (i) ctx.lineTo(px, py); else ctx.moveTo(px, py);
  });
  ctx.closePath();
  ctx.fill();
  if (o.rim !== false) {
    ctx.globalAlpha = (o.alpha ?? 0.9) * 0.35;
    ctx.strokeStyle = o.rimColor || o.color || C.greenWash;
    ctx.lineWidth = o.rimW ?? 3;
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
}

// ---------- glyphs ----------
// Latin letters and punctuation, as pen strokes in a unit box (y down).
const LATIN = {
  A: { adv: 0.66, s: [[[0.06, 0.9], [0.2, 0.52], [0.34, 0.14]], [[0.34, 0.14], [0.47, 0.52], [0.6, 0.9]], [[0.16, 0.62], [0.36, 0.6], [0.52, 0.62]]] },
  I: { adv: 0.34, s: [[[0.14, 0.14], [0.15, 0.52], [0.14, 0.9]]] },
  '，': { adv: 0.46, wk: 1.1, s: [[[0.16, 0.74], [0.21, 0.82], [0.18, 0.92], [0.09, 1.0]]] },
  '。': { adv: 0.55, wk: 0.62, s: [loopPts(0.22, 0.82, 0.11, 0.11, 3, 0.15, -2.4)] },
  ' ': { adv: 0.28, s: [] },
  $: { adv: 0.6, s: [spline([[0.48, 0.24], [0.3, 0.2], [0.16, 0.34], [0.3, 0.5], [0.44, 0.6], [0.44, 0.78], [0.26, 0.84], [0.1, 0.76]], 8), [[0.3, 0.06], [0.3, 0.98]]] },
};
const HAN_ADV = 0.96;

export function glyph(ch) {
  if (GLYPHS[ch]) return { adv: HAN_ADV, s: GLYPHS[ch] };
  if (LATIN[ch]) return LATIN[ch];
  throw new Error(`no glyph for ${ch}`);
}

// Lay out a run of text. Returns [{ch, x, y, size}] with x,y the top-left of each box.
export function layoutRun(text, x, bottom, size, extra = {}) {
  const out = [];
  let cx = x;
  for (const ch of text) {
    const g = glyph(ch);
    out.push({ ch, x: cx, y: bottom - size, size, ...extra });
    cx += g.adv * size;
  }
  return { items: out, end: cx };
}

// Writes one character in stroke order. p in [0,1] covers every stroke.
export function writeGlyph(ctx, ch, m, size, p, o = {}) {
  if (p <= 0) return;
  const g = glyph(ch);
  const lens = g.s.map((st) => polyLength(st));
  const gap = 0.12;
  const total = lens.reduce((a, b) => a + b, 0) + gap * Math.max(0, g.s.length - 1);
  let d = p * total;
  const w = size * (o.weight ?? 0.078) * (g.wk ?? 1);
  const mm = mul(m, S(size));
  for (let i = 0; i < g.s.length; i++) {
    if (d <= 0) break;
    const q = clamp(d / lens[i]);
    pen(ctx, g.s[i], {
      m: mm, p1: q, w, color: o.color, seed: (o.seed ?? 1) + i * 3.1, boil: o.boil,
      amp: o.amp ?? size * 0.007, freq: 0.03, tin: w * 0.8, tout: w * 1.4, floor: 0.55, step: 3,
      alpha: o.alpha,
    });
    d -= lens[i] + gap;
  }
}

// ---------- textures ----------
function periodicNoise(size, cells, seed) {
  const r = rng(seed);
  const g = [];
  for (let i = 0; i < cells * cells; i++) g.push(r());
  const at = (x, y) => g[((y % cells) + cells) % cells * cells + (((x % cells) + cells) % cells)];
  const out = new Float32Array(size * size);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const fx = (x / size) * cells, fy = (y / size) * cells;
      const ix = Math.floor(fx), iy = Math.floor(fy);
      let ux = fx - ix, uy = fy - iy;
      ux = ux * ux * (3 - 2 * ux); uy = uy * uy * (3 - 2 * uy);
      out[y * size + x] = lerp(lerp(at(ix, iy), at(ix + 1, iy), ux), lerp(at(ix, iy + 1), at(ix + 1, iy + 1), ux), uy);
    }
  }
  return out;
}
function canvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  return c;
}

export function makeTextures() {
  // Paper: low-frequency mottling + fine tooth + a few fibres.
  const P = 512;
  const paper = canvas(P, P);
  {
    const ctx = paper.getContext('2d');
    const n1 = periodicNoise(P, 6, 11), n2 = periodicNoise(P, 24, 12), n3 = periodicNoise(P, 128, 13), n4 = periodicNoise(P, 256, 14);
    const img = ctx.createImageData(P, P);
    const base = [0xf3, 0xed, 0xe1];
    for (let i = 0; i < P * P; i++) {
      const v = 0.5 * n1[i] + 0.3 * n2[i] + 0.12 * n3[i] + 0.08 * n4[i];
      const k = 0.955 + 0.075 * v;
      img.data[i * 4] = base[0] * k;
      img.data[i * 4 + 1] = base[1] * k;
      img.data[i * 4 + 2] = base[2] * (k - 0.006);
      img.data[i * 4 + 3] = 255;
    }
    ctx.putImageData(img, 0, 0);
    const r = rng(77);
    ctx.lineCap = 'round';
    for (let i = 0; i < 70; i++) {
      const x = r() * P, y = r() * P, a = r() * TAU, l = 6 + r() * 22;
      ctx.strokeStyle = r() > 0.5 ? 'rgba(120,100,70,0.06)' : 'rgba(255,255,255,0.18)';
      ctx.lineWidth = 0.6 + r() * 0.8;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.quadraticCurveTo(x + Math.cos(a + 0.6) * l * 0.5, y + Math.sin(a + 0.6) * l * 0.5, x + Math.cos(a) * l, y + Math.sin(a) * l);
      ctx.stroke();
    }
  }
  // Tooth: speckled alpha mask that eats into ink like crayon on rough paper.
  const tooth = canvas(P, P);
  {
    const ctx = tooth.getContext('2d');
    const n = periodicNoise(P, 170, 21), m = periodicNoise(P, 40, 22);
    const img = ctx.createImageData(P, P);
    for (let i = 0; i < P * P; i++) {
      const v = n[i] * 0.75 + m[i] * 0.25;
      const a = clamp((v - 0.52) * 3.2);
      img.data[i * 4 + 3] = a * 255;
    }
    ctx.putImageData(img, 0, 0);
  }
  // Blotch: big soft variation for watercolour granulation.
  const blotch = canvas(P, P);
  {
    const ctx = blotch.getContext('2d');
    const n = periodicNoise(P, 10, 31), m = periodicNoise(P, 60, 32);
    const img = ctx.createImageData(P, P);
    for (let i = 0; i < P * P; i++) {
      const v = n[i] * 0.6 + m[i] * 0.4;
      img.data[i * 4 + 3] = clamp((v - 0.35) * 1.4) * 255;
    }
    ctx.putImageData(img, 0, 0);
  }
  // Film grain tiles (screen space, change every frame).
  const grains = [];
  for (let k = 0; k < 4; k++) {
    const G = 256;
    const c = canvas(G, G);
    const ctx = c.getContext('2d');
    const img = ctx.createImageData(G, G);
    const r = rng(500 + k);
    for (let i = 0; i < G * G; i++) {
      const v = 128 + (r() + r() + r() - 1.5) * 90;
      img.data[i * 4] = img.data[i * 4 + 1] = img.data[i * 4 + 2] = v;
      img.data[i * 4 + 3] = 255;
    }
    ctx.putImageData(img, 0, 0);
    grains.push(c);
  }
  return { paper, tooth, blotch, grains };
}

export { canvas };
