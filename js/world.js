import * as THREE from 'three';
import { rngFor, fbm, smooth, rand, tex, std, IS_MOBILE } from './util.js';

// Units: 1 unit = 1 mm. The player is 10 units (1 cm) tall.
export const Z = { PARK_END: -8000, SIDE1_END: -12000, STREET_END: -22000, SIDE2_END: -26000, LAB: -32000 };
export const ALLEY_HALF = 1500;
export const CURB = 150;
export const POND = { x: 900, z: -3600, r: 1500, level: -6 };
export const LAB_DOOR = new THREE.Vector3(0, 0, Z.LAB);
export const CHUNK = 2000;

export function biome(z, x = 0) {
  if (z > Z.PARK_END) return 'park';
  if (z > Z.SIDE1_END) return 'side1';
  if (z > Z.STREET_END) return 'street';
  if (z > Z.SIDE2_END) return 'side2';
  if (Math.abs(x) < ALLEY_HALF) return 'alley';
  return 'building';
}

function parkHeight(x, z) {
  let h = (fbm(x / 1800, z / 1800, 4) - 0.5) * 90;
  h *= smooth(Z.PARK_END + 50, Z.PARK_END + 1200, z);
  const d = Math.hypot(x - POND.x, z - POND.z);
  if (d < POND.r * 1.25) {
    const t = d / POND.r;
    const dip = t < 1 ? -60 * (1 - t * t) - 8 : 0;
    h = h * smooth(0.85, 1.25, t) + dip;
  }
  return h;
}

export function groundY(x, z) {
  const b = biome(z, x);
  if (b === 'park') return parkHeight(x, z);
  if (b === 'street') {
    let y = -CURB;
    if (Math.abs(x) < 900) { // curb ramps (a curb cut) at x≈0
      const d1 = Z.SIDE1_END - z, d2 = z - Z.STREET_END;
      if (d1 < 1400) y = -CURB * (d1 / 1400);
      if (d2 < 1400) y = -CURB * (d2 / 1400);
    }
    return y;
  }
  return 0;
}

// ---------------- colliders (spatial hash) ----------------
const CELL = 500;
const grid = new Map();
const key = (i, j) => i * 100003 + j;
export function addCollider(c) {
  let x0, x1, z0, z1;
  if (c.r !== undefined) { x0 = c.x - c.r; x1 = c.x + c.r; z0 = c.z - c.r; z1 = c.z + c.r; }
  else { x0 = c.minX; x1 = c.maxX; z0 = c.minZ; z1 = c.maxZ; }
  c.cells = [];
  for (let i = Math.floor(x0 / CELL); i <= Math.floor(x1 / CELL); i++)
    for (let j = Math.floor(z0 / CELL); j <= Math.floor(z1 / CELL); j++) {
      const k = key(i, j); let a = grid.get(k); if (!a) grid.set(k, a = []); a.push(c); c.cells.push(k);
    }
  return c;
}
export function removeCollider(c) {
  for (const k of c.cells) { const a = grid.get(k); if (!a) continue; const i = a.indexOf(c); if (i >= 0) a.splice(i, 1); if (!a.length) grid.delete(k); }
}
export function collidersNear(x, z) { return grid.get(key(Math.floor(x / CELL), Math.floor(z / CELL))) || []; }

const STEP = 4;
function inside(c, x, z, pad) {
  if (c.r !== undefined) { const dx = x - c.x, dz = z - c.z; return dx * dx + dz * dz < (c.r + pad) ** 2; }
  return x > c.minX - pad && x < c.maxX + pad && z > c.minZ - pad && z < c.maxZ + pad;
}
// Floor height under a point for something currently at height y
export function floorAt(x, z, y) {
  let f = groundY(x, z);
  for (const c of collidersNear(x, z)) if (c.top <= y + STEP + 0.01 && c.top > f && inside(c, x, z, 0)) f = c.top;
  return f;
}
// Push a position out of solid colliders and walls of terrain
export function resolve(pos, rad, prevX, prevZ) {
  for (let it = 0; it < 2; it++) for (const c of collidersNear(pos.x, pos.z)) {
    if (pos.y >= c.top - STEP || (c.bottom !== undefined && pos.y + 10 < c.bottom)) continue;
    if (!inside(c, pos.x, pos.z, rad)) continue;
    if (c.r !== undefined) {
      const dx = pos.x - c.x, dz = pos.z - c.z, d = Math.hypot(dx, dz) || 1;
      pos.x = c.x + dx / d * (c.r + rad); pos.z = c.z + dz / d * (c.r + rad);
    } else {
      const l = pos.x - (c.minX - rad), r = (c.maxX + rad) - pos.x, b = pos.z - (c.minZ - rad), t = (c.maxZ + rad) - pos.z;
      const m = Math.min(l, r, b, t);
      if (m === l) pos.x = c.minX - rad; else if (m === r) pos.x = c.maxX + rad; else if (m === b) pos.z = c.minZ - rad; else pos.z = c.maxZ + rad;
    }
  }
  // curbs / terrain steps: can't walk up a ledge taller than STEP+jump
  const gy = groundY(pos.x, pos.z);
  if (gy > pos.y + 6) { pos.x = prevX; pos.z = prevZ; }
}
// Segment test for the camera (returns fraction 0..1 of first hit)
export function rayFrac(a, b) {
  let best = 1;
  const steps = 12;
  for (let s = 1; s <= steps; s++) {
    const t = s / steps;
    const x = a.x + (b.x - a.x) * t, y = a.y + (b.y - a.y) * t, z = a.z + (b.z - a.z) * t;
    if (y < groundY(x, z) + 2) { best = Math.min(best, (s - 1) / steps); break; }
    let hit = false;
    for (const c of collidersNear(x, z)) if (c.cam !== false && y < c.top && (c.bottom === undefined || y > c.bottom) && inside(c, x, z, 2)) { hit = true; break; }
    if (hit) { best = Math.min(best, (s - 1) / steps); break; }
  }
  return best;
}

// ---------------- registries used by gameplay ----------------
export const cover = new Set();    // {x,z,r,top}
export const food = new Set();     // {x,z}
export const pickups = new Map();  // id -> {id,x,y,z,kind,mesh}
export const collected = new Set();
export const waters = new Set();   // {x,z,r,level,deep}

// ---------------- static base layers ----------------
export function buildBase(scene) {
  const W = 400000;
  const strip = (z0, z1, y, t, rep) => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(W, z0 - z1), new THREE.MeshStandardMaterial({ map: t.clone(), roughness: 0.95 }));
    m.material.map.repeat.set(W / rep, (z0 - z1) / rep); m.material.map.needsUpdate = true;
    m.rotation.x = -Math.PI / 2; m.position.set(0, y, (z0 + z1) / 2); m.receiveShadow = true; scene.add(m); return m;
  };
  strip(60000, Z.PARK_END, -48, tex('dirt'), 1200);
  strip(Z.PARK_END, Z.SIDE1_END, 0, tex('concrete'), 1500);
  strip(Z.SIDE1_END, Z.STREET_END, -CURB, tex('asphalt'), 900);
  strip(Z.STREET_END, Z.SIDE2_END, 0, tex('concrete'), 1500);
  strip(Z.SIDE2_END, -60000, 0, tex('asphalt'), 900);
  // curb faces with a curb cut in the middle
  const curbMat = std('#b9b5ad');
  for (const zc of [Z.SIDE1_END, Z.STREET_END]) {
    for (const side of [-1, 1]) {
      const m = new THREE.Mesh(new THREE.BoxGeometry(W / 2 - 900, CURB, 160), curbMat);
      m.position.set(side * (900 + (W / 2 - 900) / 2), -CURB / 2, zc + (zc === Z.SIDE1_END ? -80 : 80));
      m.receiveShadow = true; scene.add(m);
    }
  }
  // street paint: crosswalk bars
  const paint = std('#e9e6dc', { roughness: 0.6 });
  for (let i = -6; i <= 6; i++) {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(500, 8000), paint);
    m.rotation.x = -Math.PI / 2; m.position.set(i * 1000, -CURB + 1, (Z.SIDE1_END + Z.STREET_END) / 2); scene.add(m);
  }
}

// ---------------- streamed park chunks ----------------
const grassGeo = (() => {
  const g = new THREE.PlaneGeometry(1, 1, 1, 4); g.translate(0, 0.5, 0);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) { const y = p.getY(i); p.setX(i, p.getX(i) * (1 - y * 0.92)); p.setZ(i, y * y * 0.25); }
  g.computeVertexNormals(); return g;
})();
export const grassUniforms = { uTime: { value: 0 }, uCam: { value: new THREE.Vector3() }, uFade: { value: 5200 } };
const grassMat = (() => {
  const m = new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.6, side: THREE.DoubleSide });
  m.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, grassUniforms);
    sh.vertexShader = 'uniform float uTime; uniform vec3 uCam; uniform float uFade;\n' + sh.vertexShader.replace('#include <begin_vertex>', `
      vec3 transformed = vec3(position);
      vec4 wp = modelMatrix * instanceMatrix * vec4(0.,0.,0.,1.);
      float fade = smoothstep(uFade, uFade*0.7, distance(wp.xz, uCam.xz));
      transformed *= fade;
      float bend = position.y*position.y;
      transformed.x += sin(uTime*1.7 + wp.x*0.004 + wp.z*0.003)*0.22*bend + sin(uTime*3.1+wp.z*0.02)*0.05*bend;
      transformed.z += cos(uTime*1.3 + wp.z*0.004)*0.15*bend;`);
  };
  return m;
})();
const GRASS_N = IS_MOBILE ? 2200 : 5200;

const chunks = new Map();
const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _s = new THREE.Vector3(), _p = new THREE.Vector3(), _e = new THREE.Euler();

function makeTerrain(cx, cz) {
  const seg = 28;
  const g = new THREE.PlaneGeometry(CHUNK, CHUNK, seg, seg); g.rotateX(-Math.PI / 2);
  const p = g.attributes.position, col = [];
  const x0 = cx * CHUNK + CHUNK / 2, z0 = cz * CHUNK + CHUNK / 2;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i) + x0, z = p.getZ(i) + z0;
    p.setY(i, parkHeight(x, z));
    const d = Math.hypot(x - POND.x, z - POND.z) / POND.r;
    const mud = smooth(1.15, 0.9, d), n = fbm(x / 300, z / 300, 2);
    const c = new THREE.Color().setHSL(0.22 - mud * 0.12 + n * 0.03, 0.45 - mud * 0.2, 0.18 + n * 0.08 - mud * 0.04);
    col.push(c.r, c.g, c.b);
  }
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.computeVertexNormals();
  const m = new THREE.Mesh(g, new THREE.MeshStandardMaterial({ map: tex('dirt'), vertexColors: true, roughness: 0.95 }));
  m.material.map = tex('dirt').clone(); m.material.map.repeat.set(3, 3); m.material.map.needsUpdate = true;
  m.position.set(x0, 0, z0); m.receiveShadow = true;
  return m;
}

export function streamChunks(scene, pos, builders) {
  const R = IS_MOBILE ? 2 : 3;
  const pcx = Math.floor(pos.x / CHUNK), pcz = Math.floor(pos.z / CHUNK);
  const want = new Set();
  for (let i = -R; i <= R; i++) for (let j = -R; j <= R; j++) {
    const cx = pcx + i, cz = pcz + j, zmid = cz * CHUNK + CHUNK / 2;
    if (zmid < Z.SIDE2_END - CHUNK * 4) continue;
    const k = cx + ',' + cz; want.add(k);
    if (!chunks.has(k)) chunks.set(k, buildChunk(scene, cx, cz, builders));
  }
  for (const [k, c] of chunks) if (!want.has(k)) { disposeChunk(scene, c); chunks.delete(k); }
}

function buildChunk(scene, cx, cz, builders) {
  const ch = { group: new THREE.Group(), colliders: [], cover: [], food: [], waters: [], pickupIds: [] };
  const x0 = cx * CHUNK, z0 = cz * CHUNK, zmid = z0 + CHUNK / 2, b = biome(zmid);
  const r = rngFor(cx, cz, 5);
  const ctx = { ch, r, x0, z0, cx, cz };
  if (b === 'park') {
    ch.group.add(makeTerrain(cx, cz));
    // instanced grass
    const inst = new THREE.InstancedMesh(grassGeo, grassMat, GRASS_N);
    const color = new THREE.Color(); let n = 0;
    for (let i = 0; i < GRASS_N * 1.3 && n < GRASS_N; i++) {
      const x = x0 + r() * CHUNK, z = z0 + r() * CHUNK;
      const d = Math.hypot(x - POND.x, z - POND.z) / POND.r;
      if (d < 1.02) continue;
      const patch = fbm(x / 500, z / 500, 2);
      if (r() > patch * 1.6) continue;
      const h = rand(r, 40, 150) * (0.6 + patch);
      _e.set(rand(r, -0.25, 0.25), r() * Math.PI * 2, rand(r, -0.25, 0.25)); _q.setFromEuler(_e);
      _s.set(rand(r, 3, 6), h, 1); _p.set(x, parkHeight(x, z) - 1, z);
      _m.compose(_p, _q, _s); inst.setMatrixAt(n, _m);
      color.setHSL(0.2 + r() * 0.08, 0.5 + r() * 0.2, 0.2 + r() * 0.15 + (d < 1.3 ? 0.05 : 0));
      inst.setColorAt(n, color); n++;
    }
    inst.count = n; inst.castShadow = !IS_MOBILE; inst.receiveShadow = true; inst.frustumCulled = false;
    ch.group.add(inst);
    builders.park(ctx);
  } else if (b === 'side1' || b === 'side2' || b === 'street') {
    builders.urban(ctx, b);
  }
  scene.add(ch.group);
  for (const c of ch.colliders) addCollider(c);
  ch.cover.forEach(c => cover.add(c)); ch.food.forEach(f => food.add(f)); ch.waters.forEach(w => waters.add(w));
  return ch;
}
function disposeChunk(scene, ch) {
  scene.remove(ch.group);
  ch.group.traverse(o => { if (o.isMesh && o.geometry && !o.geometry.userData.shared) o.geometry.dispose(); });
  ch.colliders.forEach(removeCollider);
  ch.cover.forEach(c => cover.delete(c)); ch.food.forEach(f => food.delete(f)); ch.waters.forEach(w => waters.delete(w));
  ch.pickupIds.forEach(id => { const p = pickups.get(id); if (p) pickups.delete(id); });
}
grassGeo.userData.shared = true;
