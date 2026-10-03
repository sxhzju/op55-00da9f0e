// The film: one continuous camera move over one sheet of paper.
// World layout: present (top) -> past (bottom left, sepia) -> peak (right).
// Every composition is designed at a camera "station" in screen pixels and
// converted to world coordinates, so the layout reads like a storyboard.
import {
  C, FPS, TAU, clamp, lerp, tw, ease, bezier, hash1, snoise, rng,
  T, S, R, M, ap, mul, pen, wash, writeGlyph, layoutRun, glyph, setPenScale,
  arcPts, loopPts, rrectPts, spline, resample, pointAt,
} from './engine.js';

export const DURATION = 8.5;

// ---------------------------------------------------------------- stations
const ST = {
  s1: { x: 0, y: 0, z: 1 }, // line 1: words + Xin
  s2: { x: 1140, y: 10, z: 1 }, // line 2: Xin + guard
  s3: { x: -1600, y: 1500, z: 1 }, // line 3: the card (the past)
  s4: { x: -500, y: 1700, z: 1 }, // line 4: cable + past Xin
  s5: { x: 1112, y: 1626, z: 0.85 }, // line 5: the peak
};
const at = (st, sx, sy) => [st.x + (sx - 960) / st.z, st.y + (sy - 540) / st.z];
const atP = (st, pts) => pts.map(([x, y]) => at(st, x, y));

// ---------------------------------------------------------------- camera
const B = {
  drift: bezier(0.32, 0.0, 0.62, 1.0),
  pan: bezier(0.55, -0.12, 0.18, 1.0), // a touch of anticipation, then glide
  swish: bezier(0.5, -0.06, 0.22, 1.0),
  push: bezier(0.2, 0.05, 0.35, 1.0),
  settle: bezier(0.12, 0.55, 0.32, 1.0),
  ride: bezier(0.3, 0.0, 0.16, 1.0),
  cam5: bezier(0.42, 0.0, 0.14, 1.0),
};
// Whip with a faint overshoot on arrival.
const whipOver = (u) => {
  if (u < 0.36) return 0.42 * Math.pow(u / 0.36, 3);
  const v = (u - 0.36) / 0.64;
  return 0.42 + 0.58 * (1 - Math.exp(-5.2 * v) * Math.cos(4.4 * v));
};
const K = (t, st, dx, dy, dz, r, e) => ({ t, x: st.x + dx, y: st.y + dy, z: st.z * dz, r, e });
const KEYS = [
  K(0.0, ST.s1, -300, -150, 1.2, -0.012),
  K(0.92, ST.s1, -30, -8, 0.99, 0.0, bezier(0.25, 0.6, 0.3, 1.0)),
  K(1.42, ST.s1, 25, 4, 1.03, 0.004, B.drift),
  K(2.08, ST.s2, -15, 0, 1.0, -0.012, B.swish),
  K(2.66, ST.s2, 20, -4, 1.035, -0.004, B.push),
  K(2.74, ST.s2, 38, -12, 1.04, -0.002, ease.outQuad), // anticipation before the whip
  K(3.16, ST.s3, -25, -8, 0.99, 0.016, whipOver),
  K(4.4, ST.s3, 18, 8, 1.035, 0.004, B.push),
  K(5.02, ST.s4, -30, 0, 0.985, -0.008, B.pan),
  K(6.12, ST.s4, 45, 18, 1.04, 0.003, B.push),
  K(6.94, ST.s5, -18, 8, 0.985, -0.014, B.ride),
  K(8.5, ST.s5, 12, 4, 1.02, -0.005, B.settle),
];

export function camera(t) {
  let k = KEYS.length - 1;
  for (let i = 1; i < KEYS.length; i++) if (t < KEYS[i].t) { k = i; break; }
  const a = KEYS[k - 1], b = KEYS[k];
  const u = b.e(tw(t, a.t, b.t));
  const c = { x: lerp(a.x, b.x, u), y: lerp(a.y, b.y, u), z: lerp(a.z, b.z, u), r: lerp(a.r, b.r, u) };
  // pull back a little in the middle of each whip
  c.z *= 1 - 0.07 * Math.sin(Math.PI * tw(t, 2.74, 3.16)) - 0.05 * Math.sin(Math.PI * tw(t, 6.1, 6.98));
  // hand-held breathing
  c.x += 7 * snoise(t * 0.45 + 3.1);
  c.y += 5 * snoise(t * 0.38 + 8.4);
  c.r += 0.0025 * snoise(t * 0.3 + 1.7);
  // impacts
  for (const [t0, amp] of [[2.16, 7], [7.24, 11]]) {
    const d = t - t0;
    if (d > 0 && d < 0.45) {
      const k2 = amp * Math.exp(-9 * d);
      c.x += k2 * Math.sin(d * 70);
      c.y += k2 * Math.cos(d * 83);
    }
  }
  return c;
}

// --------------------------------------------------------------- text
function run(text, [x, bottom], size, color, t0, stagger, dur, opt = {}) {
  const { items, end } = layoutRun(text, x, bottom, size);
  let i = 0;
  for (const it of items) {
    it.color = (opt.colors && opt.colors[it.ch]) || color;
    it.t0 = t0 + i * stagger;
    it.dur = dur * (glyph(it.ch).s.length > 8 ? 1.12 : 1);
    it.seed = hash1(x + i * 7.7 + size) * 100;
    it.weight = opt.weight;
    it.pop = opt.pop;
    if (it.ch !== ' ') i++;
  }
  return { items, end, bottom };
}
const z5 = ST.s5.z;

// Line 1 — words written above Xin, second row sits on the green line.
const L1a = run('英伟达', at(ST.s1, 120, 380), 290, C.ink, -0.06, 0.13, 0.32, { pop: 0.08 });
const L1b = run('这次有点', at(ST.s1, 120, 700), 150, C.ink, 0.46, 0.085, 0.2);
const L1c = run('意思', [L1b.end + 4, L1b.bottom], 235, C.ink, 0.78, 0.12, 0.26, { pop: 0.1 });
const L1d = run('了，', [L1c.end + 4, L1b.bottom], 150, C.ink, 1.02, 0.08, 0.16);
const ROW2 = [...L1b.items, ...L1c.items, ...L1d.items];
// Line 2 — above Xin and the guard.
const L2a = run('给 AI 配了个', at(ST.s2, 150, 400), 130, C.ink, 1.68, 0.065, 0.19, { colors: { A: C.green, I: C.green } });
const L2b = run('保安。', [L2a.end + 30, L2a.bottom + 20], 360, C.coral, 2.02, 0.17, 0.3, { pop: 0.12 });
// Line 3 — the past, sepia ink.
const L3a = run('过去英伟达卖', at(ST.s3, 110, 235), 125, C.sepia, 3.0, 0.075, 0.2);
const L3b = run('显卡，', at(ST.s3, 105, 640), 350, C.green, 3.5, 0.17, 0.3, { pop: 0.1 });
// Line 5 — the peak.
const L5a = run('提高', at(ST.s5, 110, 280), 185 / z5, C.ink, 6.28, 0.1, 0.22);
const L5b = run('整个计算的', [L5a.end + 10, L5a.bottom], 135 / z5, C.ink, 6.48, 0.075, 0.2);
const L5c = run('效率', at(ST.s5, 105, 760), 410 / z5, C.green, 6.86, 0.16, 0.3, { weight: 0.082 });
const L5d = run('。', [L5c.end, L5c.bottom], 410 / z5, C.green, 7.3, 0, 0.14);

// ------------------------------------------------------------ places
const XIN_S = 1.45;
const XIN_NOW = (() => { const [x, y] = at(ST.s1, 1690, 1010); return { x, y }; })();
const GUARD = (() => { const [x, y] = at(ST.s2, 1340, 1000); return { x, y }; })();
const CARD_S = 1.35;
const CARD = (() => { const [x, y] = at(ST.s3, 1420, 790); return { x, y }; })();
const CLOCK = (() => { const [x, y] = at(ST.s3, 1615, 275); return { x, y, r: 150 }; })();
const XIN_PAST = (() => { const [x, y] = at(ST.s4, 1600, 960); return { x, y }; })();

// ------------------------------------------------------------ the green line
// Line 1: enters bottom-left, is the baseline for row 2, lassos, plugs into Xin's back.
const LINE1 = resample(spline(atP(ST.s1, [
  [-260, 770], [0, 738], [120, 724], [600, 716], [1000, 724], [1380, 716], [1490, 692],
  [1565, 612], [1580, 500], [1520, 405], [1425, 392], [1388, 480], [1440, 585], [1505, 700],
  [1540, 800], [1560, 852],
]), 14), 3);
const LINE1_LEN = LINE1[LINE1.length - 1][2];
// x position along the baseline where the line's tail is at reel-in progress p0
const tailX = (p0) => pointAt(LINE1, p0 * LINE1_LEN).x;

// Cable from the gold fingers to past-Xin, then Xin's efficiency curve.
const CABLE_CP = atP(ST.s4, [
  [367, 784], [378, 868], [470, 912], [700, 926], [950, 898], [1200, 918], [1400, 930], [1505, 952], [1560, 960],
]);
const RISE_CP = atP(ST.s5, [
  [134, 960], [300, 948], [420, 966], [560, 926], [680, 946], [800, 896], [900, 916], [1010, 822],
  [1080, 848], [1170, 700], [1232, 734], [1330, 596], [1392, 624], [1510, 505],
]);
const CABLE = resample(spline(CABLE_CP, 14), 3);
const CABLE_LEN = CABLE[CABLE.length - 1][2];
const PATH = resample(spline([...CABLE_CP.slice(0, -1), ...RISE_CP], 14), 3);
const PATH_LEN = PATH[PATH.length - 1][2];
const nearestS = (res, x, y) => {
  let best = 0, bd = 1e18;
  for (const p of res) { const d = (p[0] - x) ** 2 + (p[1] - y) ** 2; if (d < bd) { bd = d; best = p[2]; } }
  return best;
};
const RISE_START = nearestS(PATH, XIN_PAST.x, XIN_PAST.y);

// Crayon hatching under the rise (an area chart drawn by hand).
const HATCH = (() => {
  const out = [];
  const pts = PATH.filter((p) => p[2] >= RISE_START);
  const base = at(ST.s5, 0, 1012)[1];
  const x0 = pts[0][0] + 40, x1 = pts[pts.length - 1][0] - 20;
  let j = 0;
  for (let x = x0; x <= x1; x += 30) {
    let best = pts[0];
    for (const p of pts) if (Math.abs(p[0] - x) < Math.abs(best[0] - x)) best = p;
    out.push({ x, top: best[1] + 22, bot: base, seed: 500 + j++ });
  }
  return out;
})();

// Line 4: rides the cable; "AI" is a label over Xin.
const L4 = (() => {
  const items = [];
  const spec = [
    ['主要是为了', 122, C.sepia, 4.56, 0.072, 0.19],
    ['帮助', 170, C.sepia, 4.98, 0.12, 0.24],
  ];
  const [sx, sy] = at(ST.s4, 468, 922);
  let s = nearestS(CABLE, sx, sy);
  for (const [text, size, color, t0, st, dur] of spec) {
    let i = 0;
    for (const ch of text) {
      const adv = glyph(ch).adv * size;
      const p = pointAt(CABLE, s + adv / 2);
      const ang = clamp(p.ang, -0.22, 0.22);
      const m = M(T(p.x, p.y), R(ang), T(-adv / 2, -size - 12));
      items.push({ ch, size, color, t0: t0 + i * st, dur, m, seed: s, cx: p.x, cy: p.y - size / 2 });
      i++;
      s += adv;
    }
    s += 10;
  }
  const ai = run('AI', at(ST.s4, 1488, 520), 236, C.green, 5.3, 0.1, 0.2, { pop: 0.12 });
  for (const it of ai.items) {
    it.m = T(it.x, it.y);
    it.cx = it.x + 60; it.cy = it.y + 118;
    items.push(it);
  }
  return items;
})();

// The beam spot travels from the guard's feet to where fan 1 will be.
const SPOT0 = (() => { const [x, y] = at(ST.s2, 950, 985); return { x, y }; })();
const FAN1 = { x: CARD.x - 170 * CARD_S, y: CARD.y };
// Straight route on the same ease as the camera, a hair ahead of it, so it stays in frame.
function spotAt(u) {
  return { x: lerp(SPOT0.x, FAN1.x, u), y: lerp(SPOT0.y, FAN1.y, u) };
}
const spotU = (t) => clamp(whipOver(tw(t, 2.71, 3.13)), 0, 1.02);

// ------------------------------------------------------------- characters
// Xin: the little AI chip. Origin at the feet. Poses run on twos (tq).
function drawXin(L, o) {
  const { boil } = o;
  const age = o.age ?? 99;
  const vis = (a, b) => clamp((age - a) / (b - a));
  const base = M(T(o.x, o.y), R(o.rot || 0), S((o.s || 1) * (o.sx || 1), (o.s || 1) * (o.sy || 1)));
  const m = base;
  const ink = o.ink || C.ink;
  const w = 6;
  const sd = o.seed || 1;
  // body
  const body = rrectPts(-92, -232, 92, -62, 36);
  const fillA = vis(0.25, 0.55);
  if (fillA > 0) wash(L.wash, body, { m, color: C.greenWash, alpha: 0.92 * fillA, seed: sd, boil: Math.floor(boil / 2), off: [7, 6] });
  pen(L.ink, body, { m, w, color: ink, p1: ease.outCubic(vis(0, 0.3)), seed: sd, boil });
  // pins on top + antenna ball
  const pinP = vis(0.22, 0.38);
  const bob = o.bob || 0;
  [-46, 0, 46].forEach((x, i) => {
    const top = i === 1 ? -270 - bob : -254;
    pen(L.ink, [[x, -232], [x + (i === 1 ? bob * 0.3 : 0), top]], { m, w: 5.5, color: ink, p1: pinP, seed: sd + i, boil });
  });
  if (pinP >= 1) {
    const ball = loopPts(bob * 0.3, -280 - bob, 10, 10, sd, 0.1);
    wash(L.wash, ball, { m, color: C.coralWash, alpha: 0.95, seed: sd + 9, boil, off: [2, 2] });
    pen(L.ink, ball, { m, w: 4.5, color: ink, seed: sd + 9, boil });
  }
  // side pins
  [-200, -164].forEach((y, i) => {
    pen(L.ink, [[-92, y], [-110, y]], { m, w: 5, color: ink, p1: pinP, seed: sd + 20 + i, boil });
    pen(L.ink, [[92, y], [110, y]], { m, w: 5, color: ink, p1: pinP, seed: sd + 30 + i, boil });
  });
  // face
  const faceP = vis(0.32, 0.45);
  if (faceP > 0) {
    const lx = (o.look?.[0] || 0) * 9, ly = (o.look?.[1] || 0) * 6;
    const blink = o.blink ?? 1;
    const mood = o.mood || 'calm';
    [-34, 34].forEach((ex, i) => {
      const cx = ex + lx, cy = -160 + ly;
      if (mood === 'happy') {
        pen(L.ink, arcPts(cx, cy + 6, 13, 11, Math.PI * 1.1, Math.PI * 1.9, 12), { m, w: 6, color: ink, seed: sd + 40 + i, boil });
        return;
      }
      const ry = 16 * blink * (mood === 'tired' ? 0.55 : 1) * faceP;
      if (ry < 2.5) {
        pen(L.ink, [[cx - 12, cy], [cx + 12, cy]], { m, w: 5, color: ink, seed: sd + 40 + i, boil });
      } else {
        L.ink.fillStyle = ink;
        L.ink.beginPath();
        const c = ap(m, [cx, cy + (mood === 'tired' ? 5 : 0)]);
        const sx = Math.hypot(m[0], m[1]), sy = Math.hypot(m[2], m[3]);
        L.ink.ellipse(c[0] + snoise(boil * 1.3 + i) * 0.8, c[1], 11 * sx, ry * sy, Math.atan2(m[1], m[0]), 0, TAU);
        L.ink.fill();
        L.ink.fillStyle = C.white;
        L.ink.beginPath();
        const h = ap(m, [cx + 3.5, cy - ry * 0.35]);
        L.ink.arc(h[0], h[1], 3.6 * sx, 0, TAU);
        L.ink.fill();
      }
      if (mood === 'tired') pen(L.ink, [[cx - 15, cy - 4], [cx + 15, cy - 4]], { m, w: 5, color: ink, seed: sd + 44 + i, boil });
      if (mood === 'fierce') {
        const dir = i ? -1 : 1;
        pen(L.ink, [[cx - 15 * dir, cy - 30], [cx + 13 * dir, cy - 21]], { m, w: 6, color: ink, seed: sd + 46 + i, boil });
      }
    });
    // mouth
    const mouth = o.mouth || 'smile';
    if (mouth === 'smile') pen(L.ink, arcPts(lx * 0.7, -122 + ly, 15, 9, 0.15 * Math.PI, 0.85 * Math.PI, 10), { m, w: 5, color: ink, p1: faceP, seed: sd + 50, boil });
    else if (mouth === 'o') pen(L.ink, loopPts(lx * 0.7, -116 + ly, 7, 9, sd, 0.1), { m, w: 4.5, color: ink, seed: sd + 50, boil });
    else if (mouth === 'flat') pen(L.ink, [[-10 + lx, -116], [10 + lx, -114]], { m, w: 5, color: ink, seed: sd + 50, boil });
    else if (mouth === 'grin') {
      const g = arcPts(lx * 0.7, -126 + ly, 22, 16, 0.05 * Math.PI, 0.95 * Math.PI, 12);
      wash(L.wash, g, { m, color: C.coralWash, alpha: 0.9, seed: sd + 52, boil, off: [0, 0], rim: false });
      pen(L.ink, [...g, g[0]], { m, w: 5, color: ink, seed: sd + 50, boil });
    }
    // cheeks
    [-60, 60].forEach((x, i) => wash(L.wash, loopPts(x + lx * 0.4, -124, 11, 7, sd + i, 0), { m, color: C.coralWash, alpha: 0.55 * faceP, seed: sd + 60 + i, boil, off: [0, 0], rim: false }));
    if (o.sweat) {
      const sw = spline([[78, -214], [70, -196], [74, -186], [84, -190], [86, -202], [78, -214]], 5);
      wash(L.wash, sw, { m, color: '#BFD9EE', alpha: 0.9 * o.sweat, seed: sd + 70, boil, off: [0, 0] });
      pen(L.ink, sw, { m, w: 3.5, color: ink, alpha: o.sweat, seed: sd + 70, boil });
    }
  }
  // arms: angle 0 = straight down, positive = forward/up
  const armP = vis(0.42, 0.55);
  // a = 0 hangs down, PI/2 points sideways, PI points up; negative swings across.
  [[-1, o.armL ?? 0.3], [1, o.armR ?? 0.3]].forEach(([side, a], i) => {
    const sh = [92 * side, -124];
    const len = 60;
    const hx = sh[0] + side * Math.sin(a) * len;
    const hy = sh[1] + Math.cos(a) * len;
    const dx = hx - sh[0], dy = hy - sh[1];
    const bend = 9 * side;
    const mid = [(sh[0] + hx) / 2 - (dy / len) * bend, (sh[1] + hy) / 2 + (dx / len) * bend];
    pen(L.ink, spline([sh, mid, [hx, hy]], 6), { m, w: 5.5, color: ink, p1: armP, seed: sd + 80 + i, boil });
    if (armP >= 1) pen(L.ink, loopPts(hx, hy, 7, 7, sd + i, 0.1), { m, w: 4.5, color: ink, seed: sd + 84 + i, boil });
  });
  // the green line coiled up as a cable tail with a plug
  if (o.tailP > 0) {
    const curl = spline([[-90, -98], [-124, -86], [-148, -54], [-140, -24], [-114, -22], [-110, -46], [-130, -56], [-162, -36], [-180, -8]], 8);
    pen(L.ink, curl, { m, w: 8, color: C.green, p1: o.tailP, seed: sd + 120, boil });
    if (o.tailP >= 1) {
      const pm = mul(m, M(T(-184, -2), R(0.9)));
      wash(L.wash, rrectPts(-12, -9, 12, 9, 4, 0), { m: pm, color: C.greenWash, alpha: 1, seed: sd + 121, boil, off: [1, 1] });
      pen(L.ink, rrectPts(-12, -9, 12, 9, 4, 0), { m: pm, w: 4, color: C.green, seed: sd + 121, boil });
      pen(L.ink, [[-5, 9], [-5, 22]], { m: pm, w: 4, color: C.ink, seed: sd + 122, boil });
      pen(L.ink, [[5, 9], [5, 22]], { m: pm, w: 4, color: C.ink, seed: sd + 123, boil });
    }
  }
  // legs
  const legP = vis(0.48, 0.6);
  const ph = o.legs || 0;
  [-1, 1].forEach((side, i) => {
    const kick = Math.sin(ph + i * Math.PI) * 18;
    const fx = side * 36 + kick, fy = Math.min(0, Math.cos(ph + i * Math.PI) * 12) * (ph ? 1 : 0);
    pen(L.ink, [[side * 34, -62], [side * 35 + kick * 0.5, -32], [fx, fy - 4]], { m, w: 5.5, color: ink, p1: legP, seed: sd + 90 + i, boil });
    if (legP >= 1) pen(L.ink, arcPts(fx + 9, fy - 2, 17, 7, Math.PI, TAU + 0.4, 14), { m, w: 5, color: ink, seed: sd + 94 + i, boil });
  });
  return base;
}

// The guard. Origin at feet, faces left.
function drawGuard(L, o) {
  const { boil } = o;
  const m = M(T(o.x, o.y), S(o.s * (o.sx || 1), o.s * (o.sy || 1)));
  const ink = C.ink;
  const age = o.age;
  const vis = (a, b) => clamp((age - a) / (b - a));
  const sd = 300;
  // body: open at the top where the cap sits
  const body = arcPts(0, -150, 100, 136, -Math.PI * 0.2, Math.PI * 1.2, 60);
  const bodyFill = loopPts(0, -150, 100, 136, sd, 0);
  wash(L.wash, bodyFill, { m, color: '#C8CBD6', alpha: 0.85 * vis(0.15, 0.4), seed: sd, boil, off: [6, 5] });
  pen(L.ink, body, { m, w: 6, color: ink, p1: ease.outCubic(vis(0, 0.24)), seed: sd, boil });
  // belt + badge
  pen(L.ink, arcPts(0, -150, 98, 96, 0.3 * Math.PI, 0.7 * Math.PI, 16), { m, w: 5, color: ink, p1: vis(0.2, 0.32), seed: sd + 2, boil });
  const star = [];
  for (let i = 0; i <= 10; i++) { const a = -Math.PI / 2 + (i * TAU) / 10; const r = i % 2 ? 11 : 25; star.push([-22 + Math.cos(a) * r, -95 + Math.sin(a) * r]); }
  wash(L.wash, star, { m, color: C.ochreWash, alpha: vis(0.3, 0.45), seed: sd + 3, boil, off: [3, 3] });
  pen(L.ink, star, { m, w: 4.5, color: C.coral, p1: vis(0.26, 0.4), seed: sd + 3, boil });
  // face (looking left)
  const fp = vis(0.24, 0.36);
  if (fp > 0) {
    const look = o.look || 0;
    [-56, -14].forEach((x, i) => {
      L.ink.fillStyle = ink;
      const c = ap(m, [x + look * 6, -205]);
      L.ink.beginPath();
      L.ink.ellipse(c[0], c[1], 7.5 * o.s, 9 * o.s * (o.blink ?? 1), 0, 0, TAU);
      L.ink.fill();
      pen(L.ink, [[x - 13 + look * 6, -226 - (i ? 0 : 3)], [x + 12 + look * 6, -222 + (i ? -3 : 2)]], { m, w: 5.5, color: ink, seed: sd + 10 + i, boil });
    });
    const mus = spline([[-70, -165], [-55, -176], [-36, -166], [-17, -177], [0, -166]], 6);
    pen(L.ink, mus, { m, w: 8, color: ink, p1: fp, seed: sd + 12, boil });
    pen(L.ink, arcPts(-36, -184, 9, 8, -0.4 * Math.PI, 0.6 * Math.PI, 8), { m, w: 4.5, color: ink, seed: sd + 13, boil });
  }
  // legs
  [-36, 30].forEach((x, i) => {
    pen(L.ink, [[x, -20], [x, 0]], { m, w: 6, color: ink, p1: vis(0.3, 0.4), seed: sd + 20 + i, boil });
    pen(L.ink, arcPts(x - 10, -2, 22, 8, Math.PI, TAU + 0.3, 12), { m, w: 5, color: ink, p1: vis(0.34, 0.44), seed: sd + 22 + i, boil });
  });
  // back arm on hip
  pen(L.ink, spline([[96, -120], [122, -92], [92, -66]], 6), { m, w: 5.5, color: ink, p1: vis(0.32, 0.44), seed: sd + 30, boil });
  // front arm + flashlight
  const aim = o.aim ?? 0; // 0 = resting down, 1 = pointing at the floor ahead
  const sh = [-92, -118];
  const hand = [lerp(-104, -150, aim), lerp(-58, -120, aim)];
  const elbow = [lerp(-112, -128, aim), lerp(-88, -108, aim)];
  pen(L.ink, spline([sh, elbow, hand], 6), { m, w: 5.5, color: ink, p1: vis(0.3, 0.42), seed: sd + 31, boil });
  if (vis(0.36, 0.5) > 0) {
    const fa = lerp(Math.PI * 0.5, Math.PI * 0.83, aim); // flashlight direction
    const fm = mul(m, M(T(hand[0], hand[1]), R(fa)));
    const tube = rrectPts(-14, -11, 38, 11, 5, 0);
    const head = [[38, -11], [60, -18], [60, 18], [38, 11]];
    wash(L.wash, tube, { m: fm, color: '#8E919C', alpha: 0.9, seed: sd + 32, boil, off: [2, 2] });
    pen(L.ink, tube, { m: fm, w: 4.5, color: ink, seed: sd + 32, boil, p1: vis(0.36, 0.5) });
    pen(L.ink, head, { m: fm, w: 4.5, color: ink, seed: sd + 33, boil, p1: vis(0.4, 0.52) });
    pen(L.ink, loopPts(0, 0, 9, 9, sd, 0.1), { m: mul(m, T(hand[0], hand[1])), w: 4.5, color: ink, seed: sd + 34, boil });
    o.lens = ap(fm, [60, 0]);
    o.lensAng = Math.atan2(fm[1], fm[0]);
  }
  // cap (drops in separately)
  const cy = o.capY || 0;
  const cm = mul(m, M(T(0, -262 + cy), S(o.capSx || 1, o.capSy || 1)));
  if (o.capVis) {
    const dome = [...arcPts(0, 0, 80, 66, Math.PI, TAU, 24), [80, 0], [-80, 0]];
    const visor = spline([[-76, 0], [-118, 2], [-146, 12], [-112, 16], [-60, 10]], 6);
    wash(L.wash, dome, { m: cm, color: C.coral, alpha: 0.95, seed: sd + 40, boil, off: [4, 3] });
    wash(L.wash, visor, { m: cm, color: C.coral, alpha: 0.95, seed: sd + 41, boil, off: [3, 2] });
    pen(L.ink, dome, { m: cm, w: 6, color: ink, seed: sd + 40, boil });
    pen(L.ink, visor, { m: cm, w: 5.5, color: ink, seed: sd + 41, boil });
    const cs = [];
    for (let i = 0; i <= 10; i++) { const a = -Math.PI / 2 + (i * TAU) / 10; const r = i % 2 ? 6 : 14; cs.push([-10 + Math.cos(a) * r, -32 + Math.sin(a) * r]); }
    wash(L.wash, cs, { m: cm, color: C.ochre, alpha: 1, seed: sd + 42, boil, off: [1, 1] });
    pen(L.ink, cs, { m: cm, w: 3.5, color: ink, seed: sd + 42, boil });
  }
  return m;
}

// The graphics card, drawn in sepia ink. Local origin at its centre.
function drawCard(L, t, tq, boil) {
  const m = M(T(CARD.x, CARD.y), S(CARD_S));
  const ink = C.sepia;
  const sd = 600;
  const P = (a, b) => ease.outCubic(tw(t, a, b));
  // shroud
  const shroud = rrectPts(-340, -125, 340, 125, 24);
  wash(L.wash, shroud, { m, color: '#A99C8A', alpha: 0.6 * P(3.42, 3.8), seed: sd, boil, off: [8, 7], amp: 4 });
  pen(L.ink, shroud, { m, w: 6.5, color: ink, p1: P(3.24, 3.6), seed: sd, boil });
  // bracket + ports
  pen(L.ink, rrectPts(-384, -162, -350, 168, 6, 0), { m, w: 5.5, color: ink, p1: P(3.48, 3.66), seed: sd + 1, boil });
  [[-120, -76], [-52, -8], [16, 60]].forEach(([y0, y1], i) => pen(L.ink, rrectPts(-376, y0, -358, y1, 4, 0), { m, w: 4, color: ink, p1: P(3.56 + i * 0.03, 3.66 + i * 0.03), seed: sd + 2 + i, boil }));
  // power plug on top
  pen(L.ink, rrectPts(200, -150, 290, -125, 5, 0), { m, w: 5, color: ink, p1: P(3.62, 3.74), seed: sd + 6, boil });
  // gold fingers
  const fp = P(3.56, 3.76);
  wash(L.wash, rrectPts(-140, 126, 210, 152, 3, 0), { m, color: C.ochreWash, alpha: fp, seed: sd + 7, boil, off: [2, 2] });
  for (let i = 0; i < 14; i++) {
    const x = -132 + i * 25;
    pen(L.ink, [[x, 128], [x, 150]], { m, w: 4.5, color: ink, p1: clamp(fp * 1.6 - i * 0.04), seed: sd + 10 + i, boil });
  }
  // fans
  const spin = fanAngle(tq);
  [[-170, 3.06, 3.3], [170, 3.34, 3.58]].forEach(([fx, a, b], k) => {
    const fm = M(m, T(fx, 0));
    const ring = loopPts(0, 0, 100, 100, sd + k, 0.08);
    wash(L.wash, loopPts(0, 0, 98, 98, sd + k, 0), { m: fm, color: C.greenWash, alpha: 0.75 * P(b - 0.1, b + 0.25), seed: sd + 20 + k, boil, off: [5, 5] });
    pen(L.ink, ring, { m: fm, w: 6, color: C.green, p1: P(a, b), seed: sd + 20 + k, boil });
    pen(L.ink, loopPts(0, 0, 25, 25, sd + 5 + k, 0.1), { m: fm, w: 5, color: ink, p1: P(b - 0.05, b + 0.08), seed: sd + 22 + k, boil });
    for (let j = 0; j < 7; j++) {
      const a0 = spin * (k ? -1 : 1) + (j * TAU) / 7;
      const blade = [];
      for (let u = 0; u <= 1.001; u += 0.125) blade.push([Math.cos(a0 + u * 0.95) * lerp(30, 90, u), Math.sin(a0 + u * 0.95) * lerp(30, 90, u)]);
      pen(L.ink, blade, { m: fm, w: 4.5, color: ink, p1: P(b - 0.06 + j * 0.02, b + 0.08 + j * 0.02), seed: sd + 30 + j + k * 7, boil });
    }
    // motion arcs once the fans are really spinning
    const sp = fanSpeed(tq);
    if (sp > 9) {
      for (let j = 0; j < 2; j++) {
        const a0 = spin * 1.3 * (k ? -1 : 1) + j * Math.PI;
        pen(L.ink, arcPts(0, 0, 112, 112, a0, a0 + 0.9, 12), { m: fm, w: 3.5, color: ink, alpha: 0.55, seed: sd + 50 + j, boil });
      }
    }
  });
}
function fanSpeed(t) { return 2 + 10 * ease.outCubic(tw(t, 3.3, 4.2)) + 16 * ease.inQuad(tw(t, 4.95, 6.1)); }
function fanAngle(t) {
  // integral of fanSpeed, sampled coarsely (deterministic)
  let a = 0;
  const dt = 1 / 60;
  for (let x = 3.0; x < t; x += dt) a += fanSpeed(x) * dt;
  return a;
}

// Hand-drawn 4-point twinkle.
function sparkle(L, x, y, r, rot, color, sd, boil) {
  const m = M(T(x, y), R(rot));
  pen(L.ink, [[0, -r], [0, r]], { m, w: 5, color, seed: sd, boil });
  pen(L.ink, [[-r, 0], [r, 0]], { m, w: 5, color, seed: sd + 1, boil });
}

// ------------------------------------------------------------- background doodles
// Faint pencil marks on a slower layer (parallax 0.85) to give the paper depth.
export const BG = (() => {
  const r = rng(9001);
  const items = [];
  for (let i = 0; i < 170; i++) {
    const x = -3200 + r() * 6200, y = -900 + r() * 3600;
    const kind = Math.floor(r() * 5);
    items.push({ x, y, kind, s: 0.6 + r() * 0.9, rot: r() * TAU, seed: i * 3.3 });
  }
  return items;
})();
export function drawBG(ctx, view, boil) {
  for (const it of BG) {
    if (it.x < view.x0 - 80 || it.x > view.x1 + 80 || it.y < view.y0 - 80 || it.y > view.y1 + 80) continue;
    const m = M(T(it.x, it.y), R(it.rot), S(it.s));
    const o = { m, w: 2.6, color: '#9A958C', alpha: 0.5, seed: it.seed, boil: Math.floor(boil / 2), amp: 0.8 };
    if (it.kind === 0) { pen(ctx, [[-10, 0], [10, 0]], o); pen(ctx, [[0, -10], [0, 10]], { ...o, seed: it.seed + 1 }); }
    else if (it.kind === 1) pen(ctx, loopPts(0, 0, 9, 9, it.seed, 0.2), o);
    else if (it.kind === 2) pen(ctx, spline([[-24, 4], [-8, -6], [8, 6], [24, -4]], 5), o);
    else if (it.kind === 3) { for (let k = 0; k < 3; k++) pen(ctx, [[-12 + k * 9, 10], [-4 + k * 9, -10]], { ...o, seed: it.seed + k }); }
    else pen(ctx, [[-30, 0], [30, 2]], { ...o, alpha: 0.35 });
  }
}


// ------------------------------------------------------------- helpers
function writeItems(L, t, items, boilT, mOverride) {
  for (const it of items) {
    if (it.ch === ' ') continue;
    const p = tw(t, it.t0, it.t0 + it.dur);
    if (p <= 0) continue;
    let m = mOverride ? mOverride(it) : it.m || T(it.x, it.y);
    if (!m) continue;
    if (it.pop) {
      const k = 1 + it.pop * (1 - ease.spring(tw(t, it.t0 + it.dur * 0.6, it.t0 + it.dur + 0.5), 5, 14));
      const adv = glyph(it.ch).adv * it.size;
      m = mul(m, M(T(adv / 2, it.size / 2), S(k), T(-adv / 2, -it.size / 2)));
    }
    writeGlyph(L.ink, it.ch, m, it.size, 1 - Math.pow(1 - p, 1.5), { color: it.color, boil: boilT, seed: it.seed, weight: it.weight, alpha: it.alpha });
  }
}

// A sepia clock whose hands spin backwards: the past.
function drawClock(L, t, tq, boil) {
  const P = (a, b) => ease.outCubic(tw(t, a, b));
  const { x, y, r } = CLOCK;
  const m = T(x, y);
  const ink = C.sepia;
  if (t < 2.98) return;
  wash(L.wash, loopPts(0, 0, r * 0.98, r * 0.98, 8, 0), { m, color: '#E9D6B0', alpha: 0.85 * P(3.1, 3.4), seed: 801, boil, off: [6, 5], amp: 4 });
  pen(L.ink, loopPts(0, 0, r, r, 8, 0.1), { m, w: 6.5, color: ink, p1: P(2.98, 3.22), seed: 801, boil });
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * TAU;
    const r0 = i % 3 ? 0.8 : 0.72;
    pen(L.ink, [[Math.cos(a) * r * r0, Math.sin(a) * r * r0], [Math.cos(a) * r * 0.9, Math.sin(a) * r * 0.9]], { m, w: i % 3 ? 4 : 6, color: ink, p1: P(3.1 + i * 0.012, 3.2 + i * 0.012), seed: 810 + i, boil });
  }
  // backwards spin, decelerating, then a slow tick
  const back = 2.6 * ease.outCubic(tw(tq, 3.0, 3.95)) + 0.05 * Math.max(0, tq - 3.95);
  const hm = -Math.PI / 2 - back * TAU;
  const hh = -Math.PI / 2 + 0.9 - (back / 12) * TAU;
  const hp = P(3.16, 3.3);
  pen(L.ink, [[0, 0], [Math.cos(hm) * r * 0.74, Math.sin(hm) * r * 0.74]], { m, w: 6, color: ink, p1: hp, seed: 830, boil });
  pen(L.ink, [[0, 0], [Math.cos(hh) * r * 0.48, Math.sin(hh) * r * 0.48]], { m, w: 8, color: ink, p1: hp, seed: 831, boil });
  pen(L.ink, loopPts(0, 0, 9, 9, 3, 0.1), { m, w: 5, color: ink, p1: hp, seed: 832, boil });
  // rewind arrow around the rim
  const ap0 = P(3.2, 3.45);
  if (ap0 > 0) {
    const arc = arcPts(0, 0, r * 1.22, r * 1.22, -0.15 * Math.PI, -0.85 * Math.PI, 24);
    pen(L.ink, arc, { m, w: 5, color: C.green, p1: ap0, seed: 840, boil });
    if (ap0 >= 1) {
      const e = arc[arc.length - 1];
      pen(L.ink, [[e[0] + 8, e[1] - 30], e, [e[0] + 32, e[1] + 6]], { m, w: 5, color: C.green, seed: 841, boil });
    }
  }
}

// ------------------------------------------------------------- the frame
export function drawScene(L, t, frame) {
  const boil = Math.floor(frame / 2);
  const boilT = Math.floor(frame / 3);
  const tq = (Math.floor(frame / 2) * 2) / FPS; // character poses on twos

  // ---- world washes: the past is older paper
  {
    const [cx, cy] = at(ST.s3, 1100, 700);
    const g = L.wash.createRadialGradient(cx, cy, 200, cx, cy, 2000);
    g.addColorStop(0, 'rgba(214,178,120,0.36)');
    g.addColorStop(0.6, 'rgba(214,178,120,0.2)');
    g.addColorStop(1, 'rgba(214,178,120,0)');
    L.wash.fillStyle = g;
    L.wash.fillRect(cx - 2100, cy - 2100, 4200, 4200);
  }
  // green bloom behind 效率
  {
    const u = ease.outCubic(tw(t, 7.0, 8.5));
    if (u > 0) {
      const [bx, by] = at(ST.s5, 560, 590);
      const r = 90 + 560 * u;
      wash(L.wash, loopPts(bx, by, r * 1.3, r * 0.72, 5, 0), { color: C.greenWash, alpha: 0.4 * Math.min(1, u * 3), seed: 77, boil: Math.floor(boil / 3), amp: 30, off: [0, 0], rimW: 12 });
      const u2 = ease.outCubic(tw(t, 7.12, 8.5));
      const r2 = 60 + 420 * u2;
      wash(L.wash, loopPts(bx - 120, by + 30, r2 * 1.15, r2 * 0.66, 6, 0), { color: '#8FCC6C', alpha: 0.3 * Math.min(1, u2 * 3), seed: 78, boil: Math.floor(boil / 3), amp: 24, off: [0, 0] });
      const r3 = 40 + 260 * ease.outCubic(tw(t, 7.25, 8.5));
      wash(L.wash, loopPts(bx + 260, by - 60, r3, r3 * 0.8, 9, 0), { color: C.greenWash, alpha: 0.3, seed: 79, boil: Math.floor(boil / 3), amp: 20, off: [0, 0] });
    }
  }

  // ================= LINE 1 =================
  // the green line: creeps in, waits under the words, rushes to Xin; later it is reeled in
  const head = t < 0.36 ? lerp(0.16, 0.3, ease.outCubic(t / 0.36)) : t < 0.86 ? lerp(0.3, 0.44, (t - 0.36) / 0.5) : lerp(0.44, 1, ease.outQuart(tw(t, 0.86, 1.2)));
  const reel = ease.inQuad(tw(t, 1.3, 1.58));
  if (t < 3.3) pen(L.ink, LINE1, { w: 9, color: C.green, p0: reel, p1: head, seed: 11, boil, amp: 1.6, tin: 1 });
  const tail = reel > 0 ? tailX(reel) : -1e9;
  writeItems(L, t, L1a.items, boilT);
  // row 2 sits on the line; once the line slides out from under a word, it drops
  for (const it of ROW2) {
    const adv = glyph(it.ch).adv * it.size;
    const tDrop = t >= 1.3 && tail > it.x + adv * 0.5 ? findDrop(it.x + adv * 0.5) : null;
    if (tDrop === null) { writeItems(L, t, [it], boilT); continue; }
    const d = Math.max(0, t - tDrop);
    if (d > 0.6) continue;
    const r = hash1(it.seed + 3);
    const fy = 0.5 * 8000 * d * d - 260 * d;
    const fx = (r - 0.3) * 160 * d;
    const rot = (r - 0.5) * 3 * d;
    const cx = it.x + adv / 2, cy = it.y + it.size / 2;
    writeItems(L, t, [it], boilT, () => M(T(cx + fx, cy + fy), R(rot), T(-cx, -cy), T(it.x, it.y)));
  }
  // wiggle under 意思, it leaves with the line
  if (t < 1.95) {
    const wig = [];
    for (let x = L1c.items[0].x; x <= L1c.end; x += 6) wig.push([x, L1b.bottom + 40 + Math.sin((x - L1c.items[0].x) * 0.06) * 8]);
    pen(L.ink, wig, { w: 6, color: C.green, p0: clamp((tail - L1c.items[0].x) / (L1c.end - L1c.items[0].x)), p1: ease.outCubic(tw(t, 1.04, 1.28)), seed: 12, boil });
  }

  // ================= Xin, present (lines 1-2) =================
  if (t > 0.9 && t < 3.3) {
    const age = tq - 0.92;
    const pop = ease.spring(tw(tq, 0.92, 1.4), 6, 15);
    const surprise = tw(tq, 1.8, 1.86) * (1 - tw(tq, 2.1, 2.3));
    const tug = Math.sin(Math.PI * tw(tq, 1.36, 1.76));
    const look = tq < 1.3 ? [0, 0] : tq < 1.78 ? [-1, -0.4] : [1, 0];
    const blink = [1.36, 2.42].some((b) => tq >= b && tq < b + 0.1) ? 0.1 : 1;
    const breath = Math.sin(tq * 5.2) * 0.018;
    const hop = surprise * 40;
    setPenScale(1.25);
    drawXin(L, {
      x: XIN_NOW.x, y: XIN_NOW.y - hop, s: XIN_S, age, boil, seed: 21, rot: -0.12 * tug,
      sx: (0.86 + 0.14 * pop) * (1 - breath) * (1 + surprise * -0.06), sy: (0.86 + 0.14 * pop) * (1 + breath) * (1 + surprise * 0.1),
      look, blink, mood: tq > 2.2 ? 'happy' : 'calm', mouth: surprise > 0.3 ? 'o' : tug > 0.3 ? 'flat' : 'smile',
      armL: surprise > 0.3 ? 2.3 : tug > 0.2 ? 1.3 : 0.35 + 0.1 * Math.sin(tq * 4), armR: surprise > 0.3 ? 2.3 : tq > 2.25 ? 2.6 : 0.3,
      bob: 6 * Math.sin(tq * 9) * Math.exp(-2 * Math.max(0, tq - 1.3)) + 10 * surprise,
      tailP: ease.outCubic(tw(t, 1.5, 1.74)),
    });
    setPenScale(1);
  }

  // ================= LINE 2: guard =================
  writeItems(L, t, L2a.items, boilT);
  writeItems(L, t, L2b.items, boilT);
  let lens = null;
  if (t > 1.68 && t < 3.3) {
    const age = tq - 1.72;
    const pop = ease.spring(tw(tq, 1.72, 2.18), 5.5, 15);
    const land = tw(tq, 2.14, 2.42);
    const squash = land > 0 && land < 1 ? Math.sin(land * Math.PI) * Math.exp(-3 * land) * 0.16 : 0;
    const capDrop = tw(tq, 2.0, 2.14);
    const aim = ease.outBack(tw(tq, 2.44, 2.62), 2.2);
    const g = {
      x: GUARD.x, y: GUARD.y, s: XIN_S * (0.2 + 0.8 * pop), age, boil,
      sx: 1 + squash * 0.8, sy: 1 - squash,
      capVis: tq > 2.0, capY: -260 * (1 - ease.inQuad(capDrop)) + (land > 0 ? -18 * Math.sin(land * Math.PI * 2) * Math.exp(-4 * land) : 0),
      capSx: 1 + squash * 1.2, capSy: 1 - squash * 1.4,
      aim, look: tq > 2.3 ? -1 : 0, blink: tq > 2.3 && tq < 2.36 ? 0.15 : 1,
    };
    setPenScale(1.25);
    drawGuard(L, g);
    setPenScale(1);
    lens = g.lens ? { p: g.lens, a: g.lensAng } : null;
  }
  // beam + travelling spot
  if (t > 2.56 && t < 3.6) {
    const on = t < 2.6 ? 0 : t < 2.63 ? 1 : t < 2.65 ? 0.25 : 1;
    const u = spotU(t);
    const sp = spotAt(u);
    const a0 = spotAt(spotU(t - 1 / 60)), a1 = spotAt(spotU(t + 1 / 60));
    const vel = [(a1.x - a0.x) * 30, (a1.y - a0.y) * 30];
    const speed = Math.hypot(vel[0], vel[1]);
    const shrink = ease.outCubic(tw(t, 3.06, 3.24));
    const grow = ease.outBack(tw(t, 2.6, 2.72), 2);
    const rx = lerp(150, 100 * CARD_S, shrink) * grow, ry = lerp(92, 100 * CARD_S, shrink) * grow;
    const st = 1 + Math.min(2.4, speed / 2400);
    const ang = Math.atan2(vel[1], vel[0]);
    const fade = 1 - tw(t, 3.2, 3.4);
    const sm = M(T(sp.x, sp.y), R(speed > 50 ? ang : 0), S(speed > 50 ? st : 1, speed > 50 ? 1 / Math.sqrt(st) : 1));
    // dashed crayon route left behind on the paper
    if (u > 0.02) {
      const trailA = 1 - tw(t, 3.15, 3.55);
      const n = 34;
      for (let i = 0; i < n; i++) {
        const ua = (i / n) * 1.0, ub = ua + 0.55 / n;
        if (ua > u - 0.04) break;
        const p0 = spotAt(ua), p1 = spotAt(Math.min(ub, u));
        pen(L.ink, [[p0.x, p0.y], [p1.x, p1.y]], { w: 7, color: C.ochre, alpha: 0.9 * trailA, seed: 900 + i, boil });
      }
    }
    if (on > 0 && fade > 0) {
      wash(L.wash, loopPts(0, 0, rx, ry, 41, 0), { m: sm, color: C.ochreWash, alpha: 0.95 * on * fade, seed: 41, boil, amp: 5, off: [0, 0] });
      wash(L.wash, loopPts(0, 0, rx * 0.62, ry * 0.62, 43, 0), { m: sm, color: C.ochre, alpha: 0.55 * on * fade, seed: 43, boil, amp: 4, off: [0, 0], rim: false });
      for (let i = -3; i <= 3; i++) {
        pen(L.ink, [[-rx * 0.55 + i * 18, ry * 0.5], [-rx * 0.15 + i * 18, -ry * 0.55]], { m: sm, w: 3.5, color: C.ochre, alpha: 0.85 * on * fade, seed: 42 + i, boil });
      }
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * TAU + 0.2;
        const r0 = 1.15, r1 = 1.42 + 0.08 * Math.sin(boil + i);
        pen(L.ink, [[Math.cos(a) * rx * r0, Math.sin(a) * ry * r0], [Math.cos(a) * rx * r1, Math.sin(a) * ry * r1]], { m: sm, w: 5, color: C.ochre, alpha: on * fade * (1 - shrink), seed: 50 + i, boil });
      }
    }
    if (lens && on > 0) {
      const coneA = 1 - tw(t, 2.74, 2.84);
      if (coneA > 0) {
        const dx = sp.x - lens.p[0], dy = sp.y - lens.p[1];
        const d = Math.hypot(dx, dy), nx = -dy / d, ny = dx / d;
        const a = [lens.p[0] + nx * 18, lens.p[1] + ny * 18], b = [lens.p[0] - nx * 18, lens.p[1] - ny * 18];
        const c = [sp.x - nx * ry * 1.1, sp.y - ny * ry * 1.1], e = [sp.x + nx * ry * 1.1, sp.y + ny * ry * 1.1];
        wash(L.wash, [a, e, c, b], { color: C.ochreWash, alpha: 0.65 * coneA * on, seed: 60, boil, off: [0, 0], amp: 2, rim: false });
        pen(L.ink, [a, e], { w: 4, color: C.ochre, alpha: coneA, seed: 61, boil });
        pen(L.ink, [b, c], { w: 4, color: C.ochre, alpha: coneA, seed: 62, boil });
      }
    }
  }

  // ================= LINE 3: the card =================
  writeItems(L, t, L3a.items, boilT);
  writeItems(L, t, L3b.items, boilT);
  drawClock(L, t, tq, boil);
  if (t > 3.0) { setPenScale(1.15); drawCard(L, t, tq, boil); setPenScale(1); }
  {
    // annotation arrow from 显卡 to the card
    const p = ease.outCubic(tw(t, 3.92, 4.14));
    if (p > 0) {
      const arr = spline(atP(ST.s3, [[985, 335], [1110, 290], [1215, 390], [1200, 585]]), 10);
      pen(L.ink, arr, { w: 6, color: C.sepia, p1: p, seed: 71, boil });
      const [ex, ey] = arr[arr.length - 1];
      pen(L.ink, [[ex - 30, ey - 34], [ex, ey + 4], [ex + 26, ey - 36]], { w: 6, color: C.sepia, p1: tw(t, 4.1, 4.2), seed: 72, boil });
    }
  }
  // price tag hanging from the comma of 显卡，
  if (t > 3.86) {
    const cm = L3b.items[2];
    const piv = [cm.x + 0.1 * cm.size, cm.y + 0.99 * cm.size];
    const d = tq - 3.86;
    const drop = ease.outBack(tw(tq, 3.86, 4.04), 2.4);
    const sw = 0.5 * Math.exp(-2.2 * d) * Math.cos(8 * d + 0.4) + 0.06 * Math.sin(tq * 3.1) + 0.1 * Math.sin(tq * 13) * tw(tq, 4.95, 5.3) * (1 - tw(tq, 5.6, 6));
    const m = M(T(piv[0], piv[1]), R(sw), S(1.25 * drop));
    const tag = [[-20, 60], [20, 60], [44, 84], [44, 178], [-44, 178], [-44, 84], [-20, 60]];
    pen(L.ink, [[0, 0], [3, 30], [0, 70]], { m, w: 3.5, color: C.sepia, seed: 81, boil });
    wash(L.wash, tag, { m, color: C.ochreWash, alpha: 0.95, seed: 82, boil, off: [4, 4] });
    pen(L.ink, tag, { m, w: 5, color: C.sepia, seed: 82, boil });
    pen(L.ink, loopPts(0, 78, 6, 6, 3, 0.1), { m, w: 3.5, color: C.sepia, seed: 83, boil });
    writeGlyph(L.ink, '$', mul(m, T(-22, 96)), 72, ease.outCubic(tw(t, 3.98, 4.16)), { color: C.sepia, boil: boilT, seed: 84, weight: 0.1 });
  }

  // ================= LINE 4: cable + past Xin =================
  const launch = tw(t, 6.12, 6.9);
  const xinS = lerp(RISE_START, PATH_LEN, B.ride(launch));
  {
    const draw = ease.outCubic(tw(t, 4.34, 4.98));
    if (draw > 0) {
      if (t < 6.12) pen(L.ink, CABLE, { w: 11, color: C.green, p1: draw, seed: 91, boil, amp: 1.8, tin: 1 });
      else pen(L.ink, PATH, { w: 11, color: C.green, p1: xinS / PATH_LEN, seed: 91, boil, amp: 1.8, tin: 1 });
    }
    for (const t0 of [5.0, 5.3, 5.6]) {
      const u = tw(t, t0, t0 + 0.38);
      if (u <= 0 || u >= 1) continue;
      const p = pointAt(CABLE, ease.inQuad(u) * CABLE_LEN);
      const g = L.glow.createRadialGradient(p.x, p.y, 0, p.x, p.y, 60);
      g.addColorStop(0, 'rgba(190,255,150,0.95)');
      g.addColorStop(0.4, 'rgba(120,220,90,0.5)');
      g.addColorStop(1, 'rgba(120,220,90,0)');
      L.glow.fillStyle = g;
      L.glow.fillRect(p.x - 64, p.y - 64, 128, 128);
      wash(L.wash, loopPts(p.x, p.y, 17, 17, t0, 0), { color: C.greenWash, alpha: 1, seed: t0 * 9, boil, off: [0, 0] });
      pen(L.ink, loopPts(p.x, p.y, 17, 17, t0, 0.15), { w: 5, color: C.green, seed: t0 * 9, boil });
    }
  }
  for (const it of L4) {
    const d = Math.hypot(it.cx - XIN_PAST.x, it.cy - XIN_PAST.y);
    const tb = 6.1 + d * 0.00018;
    const b = tw(t, tb, tb + 0.42);
    if (b >= 1) continue;
    it.alpha = 1 - ease.inQuad(b);
    const r = hash1(it.seed);
    const bx = -(260 + 260 * r) * ease.outCubic(b), by = (40 - 220 * hash1(it.seed + 1)) * ease.outCubic(b);
    const rot = (r - 0.5) * 2.4 * b;
    const mm = b > 0 ? M(T(it.cx + bx, it.cy + by), R(rot), S(1 - 0.35 * b), T(-it.cx, -it.cy), it.m) : it.m;
    writeItems(L, t, [it], boilT, () => mm);
  }

  if (t > 6.12) {
    const xNow = pointAt(PATH, xinS).x;
    for (const h of HATCH) {
      if (h.x > xNow - 30) break;
      const p = ease.outCubic(clamp((xNow - 30 - h.x) / 160));
      pen(L.ink, [[h.x, h.top], [h.x - 46, h.bot]], { w: 4.5, color: C.green, alpha: 0.5, p1: p, seed: h.seed, boil, amp: 1.2 });
    }
  }
  // ================= Xin, past -> peak (lines 4-5) =================
  if (t > 4.76) {
    const age = tq - 4.78;
    const pulses = [5.38, 5.68, 5.98].reduce((acc, a) => acc + (tq > a ? Math.exp(-14 * (tq - a)) * Math.sin((tq - a) * 30) : 0), 0);
    const crouch = ease.outCubic(tw(tq, 5.74, 6.1));
    const ride = launch > 0 && launch < 1;
    const land = tw(tq, 6.88, 7.22);
    const landSq = land > 0 && land < 1 ? Math.exp(-5 * land) * Math.cos(land * 15) * 0.22 : 0;
    let x = XIN_PAST.x, y = XIN_PAST.y, rot = 0, vx = 0, vy = 0;
    if (t >= 6.12) {
      const p = pointAt(PATH, xinS);
      const p2 = pointAt(PATH, lerp(RISE_START, PATH_LEN, B.ride(tw(t - 1 / 30, 6.12, 6.9))));
      x = p.x; y = p.y;
      vx = (p.x - p2.x) * 30; vy = (p.y - p2.y) * 30;
      rot = ride ? clamp(Math.atan2(vy, vx) * 0.55 + 0.25, -0.1, 0.6) * (1 - tw(t, 6.7, 6.9)) : 0;
    }
    const speed = Math.hypot(vx, vy);
    const stretch = Math.min(0.5, speed / 5000);
    let sx = 1, sy = 1;
    // a little victory hop in the end hold
    let hopSq = 0;
    if (tq > 7.9 && tq < 8.34) {
      const h = tq - 7.9;
      if (h < 0.08) hopSq = 0.1 * Math.sin(((h / 0.08) * Math.PI) / 2);
      else if (h < 0.28) { const u = (h - 0.08) / 0.2; y -= 28 * Math.sin(u * Math.PI); hopSq = -0.08 * Math.sin(u * Math.PI); }
      else hopSq = 0.08 * Math.sin(((h - 0.28) / 0.06) * Math.PI);
    }
    sx *= 1 + hopSq * 0.8; sy *= 1 - hopSq;
    sy *= 1 - 0.22 * crouch * (1 - tw(tq, 6.1, 6.16)) + stretch * 0.8 - landSq + pulses * 0.05;
    sx *= 1 + 0.18 * crouch * (1 - tw(tq, 6.1, 6.16)) - stretch * 0.4 + landSq * 0.9 - pulses * 0.04;
    if (age < 0.5) { const pop = ease.spring(tw(tq, 4.78, 5.2), 6, 15); sx *= 0.85 + 0.15 * pop; sy *= 0.85 + 0.15 * pop; }
    const tired = tq < 5.4;
    const peak = tq > 6.9;
    const cheer = ease.outBack(tw(tq, 7.02, 7.26), 2.5);
    const o = {
      x, y, rot, sx, sy, s: XIN_S * lerp(1, 1.14, B.ride(launch)), age, boil, seed: 31,
      mood: peak ? 'happy' : tired ? 'tired' : crouch > 0.2 || ride ? 'fierce' : 'calm',
      mouth: peak ? 'grin' : tired ? 'flat' : ride ? 'grin' : 'smile',
      look: tired ? [0.2, 0.5] : [1, -0.2],
      blink: tq > 7.7 && tq < 7.78 ? 0.1 : 1,
      sweat: tired ? 1 - tw(tq, 5.3, 5.45) : 0,
      armL: ride ? 1.45 : peak ? lerp(0.4, 2.7, cheer) : tired ? 0.1 : 0.4 - crouch * 0.6,
      armR: ride ? 2.3 : peak ? lerp(0.4, 2.6, cheer) : tired ? 0.1 : 0.4 - crouch * 0.5,
      bob: ride ? -10 : 8 * Math.sin(tq * 8) * (peak ? 1 : 0.3) + pulses * 14,
      legs: ride ? tq * 30 : 0,
    };
    setPenScale(1.25);
    if (ride && speed > 900) {
      for (let k = 3; k >= 1; k--) {
        const ps = pointAt(PATH, xinS - k * Math.min(90, speed * 0.02));
        drawXinGhost(L, { ...o, x: ps.x, y: ps.y, alpha: (0.18 * (4 - k)) / 3 });
      }
    }
    drawXin(L, o);
    if (ride && speed > 600) {
      const ang = Math.atan2(vy, vx);
      for (let i = 0; i < 6; i++) {
        const off = (i - 2.5) * 46 + snoise(boil * 0.7 + i) * 12;
        const len = 120 + 160 * hash1(boil * 13 + i);
        const back = 190 + 80 * hash1(boil * 7 + i);
        const cx = x - Math.cos(ang) * back - Math.sin(ang) * off, cy = y - 190 - Math.sin(ang) * back + Math.cos(ang) * off;
        pen(L.ink, [[cx, cy], [cx - Math.cos(ang) * len, cy - Math.sin(ang) * len]], { w: 5, color: C.ink, alpha: 0.85, seed: 100 + i + boil, boil });
      }
    }
    for (const a of [5.38, 5.68, 5.98]) {
      const u = tw(t, a, a + 0.3);
      if (u <= 0 || u >= 1) continue;
      const rr = (150 + 110 * ease.outCubic(u));
      pen(L.ink, loopPts(x, y - 220, rr, rr, a * 3, 0.1), { w: 7 * (1 - u), color: C.green, alpha: 1 - u, seed: a * 7, boil });
    }
    if (tq > 7.12) {
      [[-210, -430, 34, 0], [200, -480, 44, 0.12], [290, -250, 26, 0.22], [-270, -200, 24, 0.3], [50, -560, 28, 0.18]].forEach(([dx, dy, r, d0], i) => {
        const a = ease.outBack(tw(tq, 7.12 + d0, 7.32 + d0), 3);
        if (a <= 0) return;
        const tw2 = 0.75 + 0.25 * Math.sin(tq * 9 + i * 2);
        sparkle(L, x + dx * 1.1, y + dy * 1.1, r * a * tw2, 0.2 * Math.sin(tq * 2 + i), i % 2 ? C.ochre : C.green, 200 + i, boil);
      });
    }
    setPenScale(1);
  }

  // ================= LINE 5 =================
  writeItems(L, t, L5a.items, boilT);
  writeItems(L, t, L5b.items, boilT);
  {
    for (const it of L5c.items) {
      const u = tw(t, it.t0, it.t0 + 0.22);
      const k = 1 + 0.5 * (1 - ease.outExpo(u)) - 0.06 * Math.sin(tw(t, it.t0 + 0.2, it.t0 + 0.6) * Math.PI) * (u >= 1 ? 1 : 0);
      const adv = glyph(it.ch).adv * it.size;
      const m = M(T(it.x + adv / 2, it.y + it.size / 2), S(k), T(-adv / 2, -it.size / 2));
      writeItems(L, t, [it], boilT, () => mul(m, I0));
    }
    const it = L5d.items[0];
    const u = tw(t, 7.3, 7.62);
    if (u > 0) {
      const k = 1 + 0.7 * (1 - ease.spring(u, 6, 16));
      const cx = it.x + it.size * 0.22, cy = it.y + it.size * 0.82;
      const m = M(T(cx, cy), S(k), T(-cx, -cy), T(it.x, it.y));
      writeItems(L, t, [it], boilT, () => m);
    }
    const sw = ease.outCubic(tw(t, 7.34, 7.62));
    if (sw > 0) {
      const x0 = L5c.items[0].x, x1 = L5c.end, yb = L5c.bottom + 30;
      pen(L.ink, spline([[x0 + 10, yb], [lerp(x0, x1, 0.4), yb + 20], [x1 - 20, yb - 2], [x1 + 40, yb - 20]], 10), { w: 13, color: C.green, p1: sw, seed: 300, boil });
    }
  }
}
const I0 = [1, 0, 0, 1, 0, 0];

// When does the reeled-in line's tail pass x? (inverse of tailX over the reel window)
const DROP_CACHE = new Map();
function findDrop(x) {
  const key = Math.round(x);
  if (DROP_CACHE.has(key)) return DROP_CACHE.get(key);
  let res = null;
  for (let t = 1.3; t <= 1.6; t += 1 / 240) {
    const reel = ease.inQuad(tw(t, 1.3, 1.58));
    if (reel > 0 && tailX(reel) > x) { res = t; break; }
  }
  DROP_CACHE.set(key, res);
  return res;
}

function drawXinGhost(L, o) {
  // a light-weight smear copy: body silhouette only
  const m = M(T(o.x, o.y), R(o.rot || 0), S(o.sx || 1, o.sy || 1));
  wash(L.wash, rrectPts(-92, -232, 92, -62, 36), { m, color: C.greenWash, alpha: o.alpha * 2.2, seed: 5, boil: o.boil, off: [0, 0], rim: false });
  pen(L.ink, rrectPts(-92, -232, 92, -62, 36), { m, w: 4, color: C.ink, alpha: o.alpha, seed: 5, boil: o.boil });
}

// Speed of anything fast on screen (px/frame), used to pick motion-blur samples.
export function motionSpeed(t) {
  const a = camera(t - 0.5 / FPS), b = camera(t + 0.5 / FPS);
  let v = Math.hypot(b.x - a.x, b.y - a.y) * b.z + Math.abs(b.z - a.z) * 1100 + Math.abs(b.r - a.r) * 1100;
  if (t > 6.1 && t < 6.95) v = Math.max(v, 60);
  if (t > 2.68 && t < 3.15) v = Math.max(v, 40);
  return v;
}

export const TEXT_RUNS = { L1a, L1b, L1c, L1d, L2a, L2b, L3a, L3b, L4, L5a, L5b, L5c, L5d };
