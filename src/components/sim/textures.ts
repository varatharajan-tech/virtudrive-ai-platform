import * as THREE from "three";

/** Cached procedural textures — created once, reused across scene rebuilds. */
let _asphalt: THREE.CanvasTexture | null = null;
let _asphaltNormal: THREE.CanvasTexture | null = null;
let _asphaltRough: THREE.CanvasTexture | null = null;
let _asphaltAO: THREE.CanvasTexture | null = null;
let _grass: THREE.CanvasTexture | null = null;
let _terrainBlend: THREE.CanvasTexture | null = null;
let _bark: THREE.CanvasTexture | null = null;

function makeCanvas(size: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const c = document.createElement("canvas");
  c.width = c.height = size;
  return [c, c.getContext("2d")!];
}

/** Deterministic hash noise 0..1 */
export function hash2(x: number, y: number): number {
  const s = Math.sin(x * 127.1 + y * 311.7) * 43758.5453;
  return s - Math.floor(s);
}

/** Cheap value-noise via bilinear interp of hash grid. */
export function vnoise(x: number, y: number): number {
  const xi = Math.floor(x), yi = Math.floor(y);
  const xf = x - xi, yf = y - yi;
  const a = hash2(xi, yi);
  const b = hash2(xi + 1, yi);
  const c = hash2(xi, yi + 1);
  const d = hash2(xi + 1, yi + 1);
  const u = xf * xf * (3 - 2 * xf);
  const v = yf * yf * (3 - 2 * yf);
  return a * (1 - u) * (1 - v) + b * u * (1 - v) + c * (1 - u) * v + d * u * v;
}

/** Fractal brownian motion (fbm) — good for terrain. */
export function fbm(x: number, y: number, oct = 4): number {
  let s = 0, amp = 0.5, f = 1;
  for (let i = 0; i < oct; i++) {
    s += amp * vnoise(x * f, y * f);
    f *= 2;
    amp *= 0.5;
  }
  return s;
}

export function asphaltTexture(): THREE.CanvasTexture {
  if (_asphalt) return _asphalt;
  const [c, ctx] = makeCanvas(1024);
  ctx.fillStyle = "#22262d";
  ctx.fillRect(0, 0, 1024, 1024);
  const img = ctx.getImageData(0, 0, 1024, 1024);
  const d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    const n = (Math.random() - 0.5) * 38;
    d[i] = Math.max(0, Math.min(255, d[i] + n));
    d[i + 1] = Math.max(0, Math.min(255, d[i + 1] + n));
    d[i + 2] = Math.max(0, Math.min(255, d[i + 2] + n));
  }
  ctx.putImageData(img, 0, 0);
  // coarse pebbles
  for (let i = 0; i < 2400; i++) {
    const x = Math.random() * 1024;
    const y = Math.random() * 1024;
    const r = 0.5 + Math.random() * 1.8;
    const g = 30 + Math.floor(Math.random() * 50);
    ctx.fillStyle = `rgb(${g},${g + 2},${g + 4})`;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }
  // cracks
  ctx.strokeStyle = "rgba(15,17,20,0.55)";
  ctx.lineWidth = 0.8;
  for (let k = 0; k < 14; k++) {
    ctx.beginPath();
    let x = Math.random() * 1024, y = Math.random() * 1024;
    ctx.moveTo(x, y);
    const segs = 6 + Math.floor(Math.random() * 8);
    for (let s = 0; s < segs; s++) {
      x += (Math.random() - 0.5) * 40;
      y += (Math.random() - 0.5) * 40;
      ctx.lineTo(x, y);
    }
    ctx.stroke();
  }
  // patch repairs
  for (let k = 0; k < 6; k++) {
    const x = Math.random() * 1024, y = Math.random() * 1024;
    const w = 60 + Math.random() * 120, h = 40 + Math.random() * 80;
    ctx.fillStyle = `rgba(${20 + Math.random() * 12},${22 + Math.random() * 10},${25 + Math.random() * 12},0.6)`;
    ctx.fillRect(x, y, w, h);
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 16;
  t.colorSpace = THREE.SRGBColorSpace;
  _asphalt = t;
  return t;
}

export function asphaltNormalTexture(): THREE.CanvasTexture {
  if (_asphaltNormal) return _asphaltNormal;
  const [c, ctx] = makeCanvas(512);
  const img = ctx.createImageData(512, 512);
  const d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    const n = Math.random();
    d[i] = 118 + n * 20;
    d[i + 1] = 118 + n * 20;
    d[i + 2] = 255;
    d[i + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 8;
  _asphaltNormal = t;
  return t;
}

export function grassTexture(): THREE.CanvasTexture {
  if (_grass) return _grass;
  const [c, ctx] = makeCanvas(512);
  const grad = ctx.createLinearGradient(0, 0, 0, 512);
  grad.addColorStop(0, "#3f6a34");
  grad.addColorStop(1, "#345a2c");
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 512, 512);
  for (let i = 0; i < 6000; i++) {
    const x = Math.random() * 512, y = Math.random() * 512;
    const v = 40 + Math.random() * 60;
    ctx.fillStyle = `rgba(${Math.floor(v * 0.6)}, ${Math.floor(v + 30)}, ${Math.floor(v * 0.55)}, 0.6)`;
    ctx.fillRect(x, y, 1, 2 + Math.random() * 2);
  }
  for (let i = 0; i < 40; i++) {
    const x = Math.random() * 512, y = Math.random() * 512;
    const r = 20 + Math.random() * 40;
    const rg = ctx.createRadialGradient(x, y, 0, x, y, r);
    rg.addColorStop(0, "rgba(30,50,25,0.35)");
    rg.addColorStop(1, "rgba(30,50,25,0)");
    ctx.fillStyle = rg;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 8;
  t.colorSpace = THREE.SRGBColorSpace;
  _grass = t;
  return t;
}

/**
 * Terrain blend: large-scale procedural mix of grass / dry grass / dirt / rock / gravel
 * so tiling isn't obvious. Applied as a diffuse map to the terrain plane.
 */
export function terrainBlendTexture(): THREE.CanvasTexture {
  if (_terrainBlend) return _terrainBlend;
  const S = 1024;
  const [c, ctx] = makeCanvas(S);
  const img = ctx.createImageData(S, S);
  const d = img.data;
  const palette = {
    grass: [72, 108, 58],
    dryGrass: [138, 138, 78],
    dirt: [96, 74, 52],
    rock: [116, 112, 104],
    gravel: [140, 132, 118],
  };
  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      const nx = x / S * 4, ny = y / S * 4;
      const n = fbm(nx, ny, 5);
      const m = fbm(nx * 2.3 + 11, ny * 2.3 + 7, 4);
      const g = fbm(nx * 6 + 3, ny * 6 + 5, 3);
      let r: number, gc: number, b: number;
      if (n < 0.42) [r, gc, b] = palette.dirt;
      else if (n < 0.55) [r, gc, b] = palette.dryGrass;
      else if (n < 0.78) [r, gc, b] = palette.grass;
      else if (m > 0.55) [r, gc, b] = palette.rock;
      else [r, gc, b] = palette.gravel;
      // per-pixel jitter
      const j = (g - 0.5) * 30;
      const i = (y * S + x) * 4;
      d[i] = Math.max(0, Math.min(255, r + j));
      d[i + 1] = Math.max(0, Math.min(255, gc + j));
      d[i + 2] = Math.max(0, Math.min(255, b + j));
      d[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 16;
  t.colorSpace = THREE.SRGBColorSpace;
  _terrainBlend = t;
  return t;
}

export function barkTexture(): THREE.CanvasTexture {
  if (_bark) return _bark;
  const [c, ctx] = makeCanvas(128);
  ctx.fillStyle = "#4a2f1c";
  ctx.fillRect(0, 0, 128, 128);
  ctx.strokeStyle = "rgba(20,10,5,0.6)";
  ctx.lineWidth = 1;
  for (let i = 0; i < 40; i++) {
    ctx.beginPath();
    const x = Math.random() * 128;
    ctx.moveTo(x, 0);
    ctx.bezierCurveTo(
      x + (Math.random() - 0.5) * 10, 40,
      x + (Math.random() - 0.5) * 10, 90,
      x + (Math.random() - 0.5) * 10, 128,
    );
    ctx.stroke();
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  _bark = t;
  return t;
}

/** Frame-rate independent smoothing. rate ~ ln(2)/half-life. */
export function damp(current: number, target: number, rate: number, dt: number): number {
  return current + (target - current) * (1 - Math.exp(-rate * dt));
}
