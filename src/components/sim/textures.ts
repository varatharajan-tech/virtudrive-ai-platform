import * as THREE from "three";

/** Cached procedural textures — created once, reused across scene rebuilds. */
let _asphalt: THREE.CanvasTexture | null = null;
let _asphaltNormal: THREE.CanvasTexture | null = null;
let _grass: THREE.CanvasTexture | null = null;

function makeCanvas(size: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const c = document.createElement("canvas");
  c.width = c.height = size;
  return [c, c.getContext("2d")!];
}

export function asphaltTexture(): THREE.CanvasTexture {
  if (_asphalt) return _asphalt;
  const [c, ctx] = makeCanvas(512);
  ctx.fillStyle = "#22262d";
  ctx.fillRect(0, 0, 512, 512);
  // aggregate grain
  const img = ctx.getImageData(0, 0, 512, 512);
  const d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    const n = (Math.random() - 0.5) * 40;
    d[i] = Math.max(0, Math.min(255, d[i] + n));
    d[i + 1] = Math.max(0, Math.min(255, d[i + 1] + n));
    d[i + 2] = Math.max(0, Math.min(255, d[i + 2] + n));
  }
  ctx.putImageData(img, 0, 0);
  // coarse pebbles
  for (let i = 0; i < 900; i++) {
    const x = Math.random() * 512;
    const y = Math.random() * 512;
    const r = 0.5 + Math.random() * 1.6;
    const g = 30 + Math.floor(Math.random() * 45);
    ctx.fillStyle = `rgb(${g},${g + 2},${g + 4})`;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 8;
  t.colorSpace = THREE.SRGBColorSpace;
  _asphalt = t;
  return t;
}

export function asphaltNormalTexture(): THREE.CanvasTexture {
  if (_asphaltNormal) return _asphaltNormal;
  const [c, ctx] = makeCanvas(256);
  const img = ctx.createImageData(256, 256);
  const d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    const n = Math.random();
    d[i] = 120 + n * 15;
    d[i + 1] = 120 + n * 15;
    d[i + 2] = 255;
    d[i + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  _asphaltNormal = t;
  return t;
}

export function grassTexture(): THREE.CanvasTexture {
  if (_grass) return _grass;
  const [c, ctx] = makeCanvas(512);
  // base
  const grad = ctx.createLinearGradient(0, 0, 0, 512);
  grad.addColorStop(0, "#3f6a34");
  grad.addColorStop(1, "#345a2c");
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 512, 512);
  // blade specks
  for (let i = 0; i < 4000; i++) {
    const x = Math.random() * 512;
    const y = Math.random() * 512;
    const v = 40 + Math.random() * 60;
    ctx.fillStyle = `rgba(${Math.floor(v * 0.6)}, ${Math.floor(v + 30)}, ${Math.floor(v * 0.55)}, 0.6)`;
    ctx.fillRect(x, y, 1, 2 + Math.random() * 2);
  }
  // darker patches
  for (let i = 0; i < 30; i++) {
    const x = Math.random() * 512;
    const y = Math.random() * 512;
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

/** Frame-rate independent smoothing. rate ~ ln(2)/half-life. */
export function damp(current: number, target: number, rate: number, dt: number): number {
  return current + (target - current) * (1 - Math.exp(-rate * dt));
}
