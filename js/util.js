import * as THREE from 'three';

// ---------- deterministic randomness ----------
export const SEED = 7;
export function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
export function hash2(x, z, s = SEED) {
  let h = (Math.imul(x | 0, 374761393) + Math.imul(z | 0, 668265263) + Math.imul(s | 0, 982451653)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}
export function rngFor(x, z, s = 1) { return mulberry32(Math.floor(hash2(x, z, SEED * 31 + s) * 4294967296)); }
export function vnoise(x, z) {
  const xi = Math.floor(x), zi = Math.floor(z), xf = x - xi, zf = z - zi;
  const u = xf * xf * (3 - 2 * xf), v = zf * zf * (3 - 2 * zf);
  const a = hash2(xi, zi), b = hash2(xi + 1, zi), c = hash2(xi, zi + 1), d = hash2(xi + 1, zi + 1);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}
export function fbm(x, z, o = 4) {
  let s = 0, a = 0.5, f = 1;
  for (let i = 0; i < o; i++) { s += a * vnoise(x * f, z * f); f *= 2; a *= 0.5; }
  return s;
}
export const pick = (r, arr) => arr[Math.floor(r() * arr.length)];
export const rand = (r, a, b) => a + (b - a) * r();
export const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
export const smooth = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };

export const IS_MOBILE = matchMedia('(pointer: coarse)').matches;

// ---------- procedural canvas textures ----------
function canvasTex(size, draw, rep = 1, color = true) {
  const c = document.createElement('canvas'); c.width = c.height = size;
  const g = c.getContext('2d'); draw(g, size);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(rep, rep);
  if (color) t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}
function speckle(g, s, n, colors, rmax = 2) {
  const r = mulberry32(n);
  for (let i = 0; i < n; i++) {
    g.fillStyle = colors[i % colors.length];
    g.globalAlpha = 0.15 + r() * 0.5;
    const w = 0.5 + r() * rmax;
    g.fillRect(r() * s, r() * s, w, w);
  }
  g.globalAlpha = 1;
}
const cache = {};
export function tex(name) {
  if (cache[name]) return cache[name];
  let t;
  switch (name) {
    case 'concrete': t = canvasTex(512, (g, s) => {
      g.fillStyle = '#9d9a94'; g.fillRect(0, 0, s, s);
      speckle(g, s, 9000, ['#7d7a75', '#b5b1aa', '#8a857c', '#c9c4bb'], 3);
      const r = mulberry32(3); g.strokeStyle = 'rgba(40,38,35,.55)'; g.lineWidth = 1.5;
      for (let k = 0; k < 6; k++) { g.beginPath(); let x = r() * s, y = r() * s; g.moveTo(x, y);
        for (let j = 0; j < 14; j++) { x += (r() - .5) * 60; y += (r() - .5) * 60; g.lineTo(x, y); } g.stroke(); }
      g.fillStyle = 'rgba(60,58,55,.35)'; g.fillRect(0, 0, s, 3); g.fillRect(0, 0, 3, s);
    }, 1); break;
    case 'asphalt': t = canvasTex(512, (g, s) => {
      g.fillStyle = '#3a3a3d'; g.fillRect(0, 0, s, s);
      speckle(g, s, 16000, ['#222', '#555', '#6b6b6b', '#1a1a1a', '#807a70'], 3);
    }, 1); break;
    case 'dirt': t = canvasTex(512, (g, s) => {
      g.fillStyle = '#4a5a2a'; g.fillRect(0, 0, s, s);
      speckle(g, s, 14000, ['#3a3020', '#5b4a32', '#55702e', '#2f3d1a', '#6d5a3c'], 4);
    }, 1); break;
    case 'water_n': t = canvasTex(256, (g, s) => {
      const img = g.createImageData(s, s);
      for (let y = 0; y < s; y++) for (let x = 0; x < s; x++) {
        const h = (X, Y) => fbm(X / 24, Y / 24, 3) + 0.5 * vnoise(X / 7, Y / 7);
        const dx = h((x + 1) % s, y) - h((x - 1 + s) % s, y), dy = h(x, (y + 1) % s) - h(x, (y - 1 + s) % s);
        const i = (y * s + x) * 4;
        img.data[i] = 128 + dx * 300; img.data[i + 1] = 128 + dy * 300; img.data[i + 2] = 255; img.data[i + 3] = 255;
      }
      g.putImageData(img, 0, 0);
    }, 1, false); break;
    case 'lab_sign': t = canvasTex(256, (g, s) => {
      g.fillStyle = '#05140f'; g.fillRect(0, 0, s, s);
      g.fillStyle = '#5effc8'; g.font = 'bold 120px sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
      g.shadowColor = '#5effc8'; g.shadowBlur = 24; g.fillText('LAB', s / 2, s / 2);
    }, 1); break;
    case 'far_facade': t = canvasTex(256, (g, s) => {
      g.fillStyle = '#5c5f66'; g.fillRect(0, 0, s, s);
      const r = mulberry32(9);
      for (let y = 6; y < s; y += 16) for (let x = 6; x < s; x += 14) {
        g.fillStyle = r() < .15 ? '#e8d9a0' : (r() < .5 ? '#2c3440' : '#3b4655'); g.fillRect(x, y, 8, 10);
      }
    }, 1); break;
    default:
      if (name.startsWith('brick')) {
        const v = +name.slice(5) || 0;
        const base = ['#8e3b2c', '#a0563e', '#6d3a30', '#9b7a5a'][v % 4];
        t = canvasTex(512, (g, s) => {
          g.fillStyle = '#b8b0a2'; g.fillRect(0, 0, s, s);
          const r = mulberry32(11 + v), bh = 16, bw = 46;
          for (let row = 0; row * bh < s; row++) {
            const off = (row % 2) * bw / 2;
            for (let x = -bw; x < s + bw; x += bw) {
              const c = new THREE.Color(base); c.offsetHSL((r() - .5) * .03, (r() - .5) * .1, (r() - .5) * .12);
              g.fillStyle = '#' + c.getHexString(); g.fillRect(x + off + 1.5, row * bh + 1.5, bw - 3, bh - 3);
            }
          }
          speckle(g, s, 4000, ['#3a2a22', '#d8cbb8'], 2);
        }, 1);
      }
  }
  cache[name] = t;
  return t;
}

const mats = {};
export function mat(key, make) { return mats[key] || (mats[key] = make()); }
export const std = (color, o = {}) => mat('s' + color + JSON.stringify(o), () => new THREE.MeshStandardMaterial({ color, roughness: 0.8, ...o }));
