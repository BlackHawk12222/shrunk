import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { rngFor, rand, pick, tex, std, mat, hash2, mulberry32 } from './util.js';
import { Z, ALLEY_HALF, addCollider, removeCollider } from './world.js';
import { SLOT, profileAt } from './props.js';
import { waterMesh } from './water.js';

const FLOOR = 3000;
// World-space UVs so one shared material tiles correctly on any size of box
function worldUV(g, scale) {
  g.computeBoundingBox();
  const p = g.attributes.position, n = g.attributes.normal, uv = g.attributes.uv;
  for (let i = 0; i < p.count; i++) {
    const ax = Math.abs(n.getX(i)), ay = Math.abs(n.getY(i));
    if (ay > .5) uv.setXY(i, p.getX(i) / scale, p.getZ(i) / scale);
    else if (ax > .5) uv.setXY(i, p.getZ(i) / scale, p.getY(i) / scale);
    else uv.setXY(i, p.getX(i) / scale, p.getY(i) / scale);
  }
  return g;
}
const brickMat = (v) => mat('brick' + v, () => new THREE.MeshStandardMaterial({ map: tex('brick' + v), roughness: .92 }));
const farMat = mat('farFacade', () => new THREE.MeshStandardMaterial({ map: tex('far_facade'), roughness: .8 }));
const M = {
  frame: () => std('#e9e4da', { roughness: .6 }),
  glass: () => mat('glass', () => new THREE.MeshStandardMaterial({ color: '#2a3442', roughness: .08, metalness: .9, envMapIntensity: 1 })),
  litglass: () => mat('lit', () => new THREE.MeshStandardMaterial({ color: '#3a3020', emissive: '#f3d58a', emissiveIntensity: .6, roughness: .2 })),
  iron: () => std('#1d1f22', { metalness: .6, roughness: .5 }),
  ac: () => std('#c9c9c4', { metalness: .4, roughness: .5 }),
  stone: () => std('#b9b1a2', { roughness: .9 }),
  door: () => std('#3b2416', { roughness: .5 }),
  cornice: () => std('#d8d0c0', { roughness: .7 }),
};

class Parts { // geometry batcher: merges per material
  constructor() { this.m = new Map(); }
  add(matFn, g, x, y, z, ry = 0) {
    const gg = g.clone(); if (ry) gg.rotateY(ry); gg.translate(x, y, z);
    const k = matFn; if (!this.m.has(k)) this.m.set(k, []); this.m.get(k).push(gg.toNonIndexed ? (gg.index ? gg.toNonIndexed() : gg) : gg);
  }
  build(group) {
    for (const [fn, list] of this.m) {
      const merged = mergeGeometries(list.map(g => { g.deleteAttribute('uv') ; return g; }));
      const mesh = new THREE.Mesh(merged, fn()); mesh.castShadow = true; mesh.receiveShadow = true; group.add(mesh);
      list.forEach(g => g.dispose());
    }
  }
}
const B = (w, h, d) => new THREE.BoxGeometry(w, h, d).translate(0, h / 2, 0);
const unit = { win: B(1000, 1600, 60), glass: B(860, 1460, 20), sill: B(1160, 70, 220), ac: B(660, 420, 520), plat: B(1, 60, 1100), rail: B(1, 40, 30), bar: B(25, 900, 25), step: B(1, 180, 300), cor: B(1, 260, 340) };

function slotSpec(i) {
  const r = rngFor(i, 0, 21);
  const tower = r() < .12;
  const floors = tower ? 18 + Math.floor(r() * 30) : 4 + Math.floor(r() * 7);
  return { r, w: SLOT - (r() < .3 ? rand(r, 100, 400) : 0), h: floors * FLOOR + rand(r, 600, 1500), floors, brick: Math.floor(r() * 4), fireEscape: r() < .55, stoop: r() < .7, d: 14000, tower };
}

function buildBody(group, cx, w, h, d, z0, near, brick) {
  const g = worldUV(new THREE.BoxGeometry(w, h, d).translate(cx, h / 2, z0 - d / 2), near ? 1400 : 9000);
  const m = new THREE.Mesh(g, near ? brickMat(brick) : farMat); m.castShadow = near; m.receiveShadow = true; group.add(m);
}

function buildDetails(group, cx, spec, info) {
  const { w, floors, r } = spec; const P = new Parts(); const zf = Z.SIDE2_END;
  const cols = Math.max(2, Math.floor(w / 2100));
  const shop = ['pizza_shop', 'florist', 'cafe', 'artist'].includes(info.name);
  const fePos = cx - w / 2 + w * .5;
  for (let f = 0; f < Math.min(floors, 14); f++) for (let c = 0; c < cols; c++) {
    const x = cx - w / 2 + (c + .5) * w / cols, y = f * FLOOR + 700;
    if (f === 0 && (shop || (spec.stoop && Math.abs(x - cx) < w / cols / 2 + 10))) continue;
    P.add(M.frame, unit.win, x, y, zf + 20);
    P.add(r() < .12 ? M.litglass : M.glass, unit.glass, x, y + 70, zf + 52);
    P.add(M.stone, unit.sill, x, y - 70, zf + 100);
    if (r() < .18 && f > 0) P.add(M.ac, unit.ac, x, y - 10, zf + 270);
  }
  if (spec.fireEscape && floors > 3) {
    const fw = Math.min(w * .6, 4200);
    for (let f = 1; f < Math.min(floors, 14); f++) {
      const y = f * FLOOR + 500;
      const plat = unit.plat.clone().scale(fw, 1, 1); P.add(M.iron, plat, fePos, y, zf + 550);
      const rail = unit.rail.clone().scale(fw, 1, 1); P.add(M.iron, rail, fePos, y + 900, zf + 1090);
      for (let k = 0; k <= 8; k++) P.add(M.iron, unit.bar, fePos - fw / 2 + k * fw / 8, y, zf + 1090);
      // diagonal stair
      const st = new THREE.BoxGeometry(fw * .55, 50, 500).translate(0, 25, 0).rotateZ(f % 2 ? .52 : -.52);
      P.add(M.iron, st, fePos + (f % 2 ? -1 : 1) * fw * .1, y - 1400, zf + 800);
    }
  }
  // cornice
  P.add(M.cornice, unit.cor.clone().scale(w, 1, 1), cx, spec.h - 260, zf + 170);
  P.add(M.cornice, unit.cor.clone().scale(w, .5, .7), cx, Math.min(spec.h, FLOOR) - 300, zf + 120);
  const cols2 = [];
  if (shop) {
    // shop front: big glass + awning (awning is cover)
    P.add(M.frame, B(w * .8, 2500, 80), cx, 0, zf + 40);
    P.add(M.glass, B(w * .76, 2300, 30), cx, 100, zf + 90);
    const aw = new THREE.Mesh(new THREE.BoxGeometry(w * .82, 60, 1600).rotateX(-.25), std(pick(r, ['#b03a2e', '#1e8449', '#1f4e79', '#7d3c98'])));
    aw.position.set(cx, 2750, zf + 800); aw.castShadow = true; group.add(aw);
    cols2.push({ cover: { x: cx, z: zf + 800, r: 900, top: 2600 } });
  } else if (spec.stoop) {
    for (let s = 0; s < 5; s++) P.add(M.stone, unit.step.clone().scale(1900, 1, 1), cx, s * 180, zf + 300 * (5 - s) - 150);
    P.add(M.door, B(1100, 2200, 80), cx, 900, zf + 40);
    cols2.push({ col: { minX: cx - 950, maxX: cx + 950, minZ: zf, maxZ: zf + 1500, top: 900 } });
  }
  P.build(group);
  return cols2;
}

// ---------------- streamed building row ----------------
const slots = new Map();
export function streamBuildings(scene, pos, cover) {
  const near = 16000, far = 90000;
  const ci = Math.round(pos.x / SLOT), n = Math.ceil(far / SLOT);
  const want = new Set();
  for (let i = ci - n; i <= ci + n; i++) {
    if (i === 0) continue;
    const dx = Math.abs(i * SLOT - pos.x), dz = Math.max(0, Math.abs(pos.z - Z.SIDE2_END) - 2000);
    const lod = Math.hypot(dx, dz) < near ? 'near' : 'far';
    want.add(i);
    const cur = slots.get(i);
    if (cur && cur.lod === lod) continue;
    if (cur) disposeSlot(scene, cur, cover);
    slots.set(i, buildSlot(scene, i, lod, cover));
  }
  for (const [i, s] of slots) if (!want.has(i)) { disposeSlot(scene, s, cover); slots.delete(i); }
}
function buildSlot(scene, i, lod, cover) {
  const spec = slotSpec(i), cx = i * SLOT, group = new THREE.Group(), colliders = [], covers = [];
  buildBody(group, cx, spec.w, spec.h, spec.d, Z.SIDE2_END, lod === 'near', spec.brick);
  colliders.push({ minX: cx - spec.w / 2, maxX: cx + spec.w / 2, minZ: Z.SIDE2_END - spec.d, maxZ: Z.SIDE2_END, top: spec.h });
  if (lod === 'near') for (const e of buildDetails(group, cx, spec, profileAt(cx, 'side2'))) {
    if (e.col) colliders.push(e.col); if (e.cover) covers.push(e.cover);
  }
  scene.add(group); colliders.forEach(addCollider); covers.forEach(c => cover.add(c));
  return { lod, group, colliders, covers };
}
function disposeSlot(scene, s, cover) {
  scene.remove(s.group); s.group.traverse(o => o.isMesh && o.geometry.dispose());
  s.colliders.forEach(removeCollider); s.covers.forEach(c => cover.delete(c));
}

// ---------------- the alley and the lab (static) ----------------
export function buildAlleyAndLab(scene, cover, waters) {
  const g = new THREE.Group();
  const side = (sx) => {
    const w = SLOT / 2 - ALLEY_HALF, cx = sx * (ALLEY_HALF + w / 2), h = 26000, d = 20000;
    buildBody(g, cx, w, h, d, Z.SIDE2_END, true, 2);
    addCollider({ minX: cx - w / 2, maxX: cx + w / 2, minZ: Z.SIDE2_END - d, maxZ: Z.SIDE2_END, top: h });
    // drain pipe + side windows on the alley walls
    const pipe = new THREE.Mesh(new THREE.CylinderGeometry(60, 60, h, 10), M.iron()); pipe.position.set(sx * (ALLEY_HALF + 70), h / 2, Z.SIDE2_END - 2500); g.add(pipe);
  };
  side(-1); side(1);
  // lab building
  const labW = SLOT, labH = 30000, labD = 20000;
  const lab = new THREE.Mesh(worldUV(new THREE.BoxGeometry(labW, labH, labD).translate(0, labH / 2, Z.LAB - labD / 2), 1600), std('#7f8c8d', { roughness: .7 }));
  lab.receiveShadow = true; g.add(lab);
  addCollider({ minX: -labW / 2, maxX: labW / 2, minZ: Z.LAB - labD, maxZ: Z.LAB, top: labH });
  const door = new THREE.Mesh(B(1000, 2100, 60), std('#5d6d7e', { metalness: .6, roughness: .35 })); door.position.set(0, 15, Z.LAB + 30); g.add(door);
  const gap = new THREE.Mesh(new THREE.PlaneGeometry(1000, 15), new THREE.MeshBasicMaterial({ color: '#9fffe0' })); gap.position.set(0, 7.5, Z.LAB + 2); g.add(gap);
  const sign = new THREE.Mesh(new THREE.PlaneGeometry(1400, 1400), new THREE.MeshBasicMaterial({ map: tex('lab_sign'), toneMapped: false })); sign.position.set(0, 3300, Z.LAB + 70); g.add(sign);
  const light = new THREE.PointLight('#5effc8', 3, 9000, 1.2); light.position.set(0, 2600, Z.LAB + 900); g.add(light);
  const glow = new THREE.PointLight('#5effc8', 2, 1200, 1.5); glow.position.set(0, 20, Z.LAB + 60); g.add(glow);
  // alley clutter
  const dump = new THREE.Mesh(B(1900, 1300, 1100), std('#245a3b', { metalness: .5, roughness: .5 })); dump.position.set(-700, 0, -28200); dump.castShadow = true; g.add(dump);
  addCollider({ minX: -1650, maxX: 250, minZ: -28750, maxZ: -27650, top: 1300 });
  const r = mulberry32(42);
  for (let i = 0; i < 6; i++) {
    const s = rand(r, 260, 400), b = new THREE.Mesh(new THREE.SphereGeometry(s, 16, 12), std('#141414', { roughness: .25 }));
    const x = rand(r, 500, 1300) * (i % 2 ? 1 : -1), z = rand(r, -30500, -26800);
    b.scale.y = .8; b.position.set(x, s * .45, z); b.castShadow = true; g.add(b);
    addCollider({ x, z, r: s * .9, top: s * 1.2 });
  }
  const pud = waterMesh(700, 9); pud.position.set(300, 1.5, -29600); g.add(pud);
  waters.add({ x: 300, z: -29600, r: 650, level: 1.5 });
  scene.add(g);
}

// ---------------- distant skyline ----------------
export function buildSkyline(scene) {
  const r = mulberry32(5150), geos = [];
  const add = (x, z, w, d, h) => geos.push(worldUV(new THREE.BoxGeometry(w, h, d).translate(x, h / 2, z), 9000));
  for (let i = 0; i < 140; i++) {
    const a = r() * Math.PI * 2, dist = rand(r, 70000, 220000);
    const x = Math.cos(a) * dist, z = Math.sin(a) * dist - 20000;
    if (z > -40000 && Math.abs(x) < 60000) continue; // keep the near park/street open
    const w = rand(r, 12000, 40000), h = rand(r, 60000, r() < .15 ? 420000 : 220000);
    add(x, z, w, rand(r, 12000, 40000), h);
    if (r() < .3) add(x, z, w * .5, w * .5, h * 1.25); // setback crown
  }
  const m = new THREE.Mesh(mergeGeometries(geos), farMat); scene.add(m);
}
