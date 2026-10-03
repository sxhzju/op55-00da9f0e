// Compositor: paper -> background doodles -> washes -> ink -> glow -> grain.
// renderFrame(n) is a pure function of the frame number, so frames can be
// rendered in any order or in parallel.
import { W, H, FPS, C, clamp, rng, makeTextures, canvas } from './engine.js';
import { DURATION, camera, drawScene, drawBG, motionSpeed } from './scene.js';

export const FRAMES = Math.round(DURATION * FPS);
const SHUTTER = 0.5; // 180 degrees

const tex = makeTextures();
const out = document.getElementById('out');
out.width = W; out.height = H;
const octx = out.getContext('2d', { willReadFrequently: true });
const frame = canvas(W, H);
const fctx = frame.getContext('2d', { willReadFrequently: true });
const layers = {};
for (const k of ['wash', 'ink', 'glow', 'bg']) {
  const c = canvas(W, H);
  layers[k] = { c, ctx: c.getContext('2d') };
}
const pats = {
  paper: fctx.createPattern(tex.paper, 'repeat'),
  tooth: layers.ink.ctx.createPattern(tex.tooth, 'repeat'),
  blotch: layers.wash.ctx.createPattern(tex.blotch, 'repeat'),
};
const vignette = (() => {
  const c = canvas(W, H);
  const ctx = c.getContext('2d');
  const g = ctx.createRadialGradient(W / 2, H / 2, H * 0.35, W / 2, H / 2, H * 1.05);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(1, 'rgba(196,184,166,1)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);
  return c;
})();

function camMatrix(cam, parallax = 1) {
  const z = 1 + (cam.z - 1) * parallax;
  const cs = Math.cos(cam.r) * z, sn = Math.sin(cam.r) * z;
  const x = cam.x * parallax, y = cam.y * parallax;
  return new DOMMatrix([cs, sn, -sn, cs, W / 2 - (cs * x - sn * y), H / 2 - (sn * x + cs * y)]);
}

function renderSub(t, n) {
  const cam = camera(t);
  const m = camMatrix(cam);
  const mbg = camMatrix(cam, 0.85);
  // paper (texture is fixed to the sheet, so it moves with the camera)
  fctx.setTransform(1, 0, 0, 1, 0, 0);
  fctx.globalCompositeOperation = 'source-over';
  fctx.globalAlpha = 1;
  fctx.fillStyle = C.paper;
  fctx.fillRect(0, 0, W, H);
  pats.paper.setTransform(m.scale(1.5));
  fctx.fillStyle = pats.paper;
  fctx.fillRect(0, 0, W, H);

  for (const k in layers) {
    const { ctx } = layers[k];
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = 1;
    ctx.clearRect(0, 0, W, H);
    ctx.setTransform(k === 'bg' ? mbg : m);
  }
  // background doodles on the slower layer
  const inv = mbg.inverse();
  const corners = [[0, 0], [W, 0], [0, H], [W, H]].map(([x, y]) => inv.transformPoint(new DOMPoint(x, y)));
  const view = { x0: Math.min(...corners.map((p) => p.x)), x1: Math.max(...corners.map((p) => p.x)), y0: Math.min(...corners.map((p) => p.y)), y1: Math.max(...corners.map((p) => p.y)) };
  drawBG(layers.bg.ctx, view, Math.floor(n / 2));

  drawScene({ wash: layers.wash.ctx, ink: layers.ink.ctx, glow: layers.glow.ctx }, t, n);

  // crayon tooth eats into ink and washes, locked to the paper
  for (const [k, p, a] of [['ink', pats.tooth, 0.5], ['wash', pats.blotch, 0.3], ['bg', pats.tooth, 0.5]]) {
    const { ctx } = layers[k];
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalCompositeOperation = 'destination-out';
    ctx.globalAlpha = a;
    p.setTransform((k === 'bg' ? mbg : m).scale(k === 'wash' ? 2.2 : 1));
    ctx.fillStyle = p;
    ctx.fillRect(0, 0, W, H);
  }
  fctx.setTransform(1, 0, 0, 1, 0, 0);
  fctx.globalAlpha = 1;
  fctx.globalCompositeOperation = 'multiply';
  fctx.drawImage(layers.bg.c, 0, 0);
  fctx.drawImage(layers.wash.c, 0, 0);
  fctx.drawImage(layers.ink.c, 0, 0);
  fctx.globalCompositeOperation = 'screen';
  fctx.drawImage(layers.glow.c, 0, 0);
  fctx.globalCompositeOperation = 'multiply';
  fctx.drawImage(vignette, 0, 0);
  fctx.globalCompositeOperation = 'source-over';
}

let acc = null;
export function renderFrame(n) {
  const t = n / FPS;
  const speed = motionSpeed(t);
  const K = clamp(Math.ceil((speed * SHUTTER) / 4), 1, 32);
  if (K === 1) {
    renderSub(t, n);
    octx.drawImage(frame, 0, 0);
  } else {
    if (!acc) acc = new Float32Array(W * H * 4);
    acc.fill(0);
    for (let k = 0; k < K; k++) {
      const ts = t + ((k + 0.5) / K - 0.5) * (SHUTTER / FPS);
      renderSub(ts, n);
      const d = fctx.getImageData(0, 0, W, H).data;
      for (let i = 0; i < d.length; i++) acc[i] += d[i];
    }
    const img = octx.createImageData(W, H);
    const inv = 1 / K;
    for (let i = 0; i < acc.length; i++) img.data[i] = acc[i] * inv;
    octx.putImageData(img, 0, 0);
  }
  // film grain, new every frame
  const r = rng(n * 7919 + 1);
  octx.globalCompositeOperation = 'overlay';
  octx.globalAlpha = 0.08;
  const g = tex.grains[n % tex.grains.length];
  const ox = Math.floor(r() * 256), oy = Math.floor(r() * 256);
  octx.fillStyle = octx.createPattern(g, 'repeat');
  octx.setTransform(1, 0, 0, 1, -ox, -oy);
  octx.fillRect(ox, oy, W, H);
  octx.setTransform(1, 0, 0, 1, 0, 0);
  octx.globalAlpha = 1;
  octx.globalCompositeOperation = 'source-over';
  return K;
}

window.FRAMES = FRAMES;
window.renderFrame = (n) => renderFrame(n);
window.frameDataURL = (n) => {
  const K = renderFrame(n);
  return { K, url: out.toDataURL('image/png') };
};
window.ready = true;
