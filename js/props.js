import * as THREE from 'three';
import { rngFor, rand, pick, std, hash2, mat } from './util.js';
import { Z, POND, CHUNK, collected, pickups, groundY } from './world.js';
import { waterMesh } from './water.js';

// ---------- tiny geometry helpers ----------
const G = {};
const geo = (k, f) => { if (!G[k]) { G[k] = f(); G[k].userData.shared = true; } return G[k]; };
function M(g, color, o = {}) {
  const m = new THREE.Mesh(g, typeof color === 'string' ? std(color, o) : color);
  m.castShadow = true; m.receiveShadow = true; return m;
}
const cyl = (r, h, c, s = 14) => M(geo(`c${r}_${h}_${s}`, () => new THREE.CylinderGeometry(r, r, h, s).translate(0, h / 2, 0)), c);
const box = (w, h, d, c, o) => M(geo(`b${w}_${h}_${d}`, () => new THREE.BoxGeometry(w, h, d).translate(0, h / 2, 0)), c, o);
const sph = (r, c, o) => M(geo(`s${r}`, () => new THREE.SphereGeometry(r, 16, 12)), c, o);
const decal = (w, d, c, o = {}) => { const m = new THREE.Mesh(geo(`p${w}_${d}`, () => new THREE.PlaneGeometry(w, d).rotateX(-Math.PI / 2)), std(c, { transparent: true, opacity: o.opacity ?? 0.8, depthWrite: false })); m.position.y = 0.6; m.receiveShadow = true; return m; };

// ---------- prop catalogue ----------
// make(r) -> { obj, top, rad, solid, cover, food } ; on: [[child, chance, maxCount]]
const P = {
  pebble: { make(r) { const s = rand(r, 12, 55); const m = M(geo('peb' + (s | 0) % 5, () => new THREE.DodecahedronGeometry(1, 1)), pick(r, ['#8a857c', '#6f6a62', '#a39d92', '#5c5852'])); m.scale.set(s, s * rand(r, .45, .8), s * rand(r, .8, 1.2)); m.rotation.y = r() * 6; return { obj: m, top: s * .6, rad: s * .85, solid: true }; } },
  acorn: { make(r) { const g = new THREE.Group(); const b = sph(9, '#8a5a2b'); b.scale.set(1, 1.35, 1); b.position.y = 10; const c = sph(10, '#5a4128'); c.scale.set(1, .6, 1); c.position.y = 19; g.add(b, c); g.rotation.z = r() < .5 ? 1.4 : 0; return { obj: g, food: true }; } },
  leaf: { make(r) { const m = M(geo('leaf', () => { const s = new THREE.Shape(); s.moveTo(0, 0); s.quadraticCurveTo(20, 30, 0, 70); s.quadraticCurveTo(-20, 30, 0, 0); return new THREE.ShapeGeometry(s, 8).rotateX(-Math.PI / 2); }), std(pick(r, ['#b5651d', '#d4a017', '#8b3a1a', '#6b8e23']), { side: THREE.DoubleSide })); const s = rand(r, .7, 1.6); m.scale.setScalar(s); m.rotation.y = r() * 6; m.position.y = 1; return { obj: m }; } },
  tented_leaf: { make(r) { const g = new THREE.Group(); const t = box(4, 46, 4, '#5a4128'); t.position.set(0, 0, 0); t.rotation.z = .3; const l = P.leaf.make(r).obj; l.scale.setScalar(2.4); l.position.set(0, 46, -60); l.rotation.x = .25; g.add(t, l); return { obj: g, cover: { r: 70, top: 46 } }; } },
  mushroom: { make(r) { const g = new THREE.Group(); const h = rand(r, 32, 60), cr = rand(r, 30, 55); const s = cyl(5, h, '#efe6d2'); const cc = pick(r, ['#c0392b', '#b5895a', '#e8dcc0']); const c = M(geo('mcap', () => new THREE.SphereGeometry(1, 20, 10, 0, Math.PI * 2, 0, Math.PI / 2)), cc); c.scale.set(cr, cr * .55, cr); c.position.y = h; g.add(s, c); if (cc === '#c0392b') for (let i = 0; i < 6; i++) { const d = sph(4, '#fff'); const a = r() * 6, e = r() * .9; d.position.set(Math.cos(a) * cr * Math.sin(e) * .9, h + cr * .55 * Math.cos(e) * .9, Math.sin(a) * cr * Math.sin(e) * .9); g.add(d); } return { obj: g, solid: true, rad: 6, top: h + cr * .5, cover: { r: cr, top: h } }; } },
  clover: { make(r) { const g = new THREE.Group(); const n = 3 + (r() < .05 ? 1 : 0); for (let k = 0; k < 2 + (r() * 3 | 0); k++) { const h = rand(r, 25, 60); const st = cyl(1.5, h, '#4f7d2a', 5); const ox = rand(r, -30, 30), oz = rand(r, -30, 30); st.position.set(ox, 0, oz); g.add(st); for (let i = 0; i < n; i++) { const l = M(geo('cl', () => new THREE.CircleGeometry(12, 10).rotateX(-Math.PI / 2)), std('#3f8f2f', { side: THREE.DoubleSide })); const a = i / n * Math.PI * 2; l.position.set(ox + Math.cos(a) * 10, h, oz + Math.sin(a) * 10); l.rotation.z = Math.cos(a) * .3; g.add(l); } } return { obj: g }; } },
  dandelion: { make(r) { const g = new THREE.Group(); const h = rand(r, 120, 220); const s = cyl(2.2, h, '#5f8d33', 6); const f = sph(16, r() < .6 ? '#f4c430' : '#f2f2ea', { roughness: 1 }); f.position.y = h; f.scale.y = .7; g.add(s, f); return { obj: g }; } },
  twig: { make(r) { const L = rand(r, 120, 320); const m = M(geo('tw' + (L | 0) % 4, () => new THREE.CylinderGeometry(3, 4.5, 1, 6).rotateZ(Math.PI / 2)), '#5a4128'); m.scale.x = L; m.position.y = 4; m.rotation.y = r() * 6; return { obj: m }; } },
  droplet: { pickup: 'droplet', make() { const m = sph(5, mat('drop', () => new THREE.MeshPhysicalMaterial({ color: '#cfefff', roughness: 0.02, transmission: 0.9, thickness: 4, ior: 1.33, transparent: true }))); m.scale.y = .75; m.position.y = 4; return { obj: m }; } },
  crumb: { pickup: 'crumb', make(r) { const m = box(6, 4, 5, '#d8b07a'); m.rotation.y = r() * 3; return { obj: m, food: true }; } },
  bottle_cap: { make(r) { const g = new THREE.Group(); const c = cyl(15, 6, pick(r, ['#c0392b', '#2e86c1', '#d4ac0d', '#bdc3c7']), 22); c.material = std(c.material.color.getStyle(), { metalness: .7, roughness: .3 }); g.add(c); return { obj: g, solid: true, rad: 15, top: 6 }; } },
  gum: { make(r) { const m = decal(rand(r, 12, 26), rand(r, 12, 26), pick(r, ['#2f2f2f', '#3b3b3b', '#d98ba0']), { opacity: .9 }); return { obj: m }; } },
  wrapper: { make(r) { const m = M(geo('wr', () => { const g = new THREE.PlaneGeometry(90, 50, 6, 4); const p = g.attributes.position; for (let i = 0; i < p.count; i++) p.setZ(i, Math.sin(i * 1.7) * 3); g.rotateX(-Math.PI / 2); return g; }), std(pick(r, ['#c0392b', '#8e44ad', '#f39c12', '#16a085']), { metalness: .5, roughness: .35, side: THREE.DoubleSide })); m.position.y = 2; m.rotation.y = r() * 6; return { obj: m }; } },
  fry: { make(r) { const m = box(7, 7, 70, '#e8b84a'); m.rotation.y = r() * 6; return { obj: m, food: true }; } },
  bench: { make(r) { const g = new THREE.Group(); for (const x of [-650, 650]) for (const z of [-180, 180]) { const l = box(40, 440, 40, '#2c3e2d'); l.position.set(x, 0, z); g.add(l); } for (let i = 0; i < 5; i++) { const s = box(1500, 25, 70, '#7a5230'); s.position.set(0, 440, -170 + i * 85); g.add(s); } return { obj: g, top: 465, cover: { r: 520, top: 440 }, legs: [[-650, -180], [650, -180], [-650, 180], [650, 180]], legR: 25, surface: 600 }; }, on: [['newspaper', .4, 1], ['coffee_cup', .4, 1], ['crumb', .6, 4]] },
  cafe_table: { make() { const g = new THREE.Group(); const p = cyl(30, 740, '#2b2b2b', 12); const t = cyl(350, 20, std('#ddd8cc', { roughness: .4 }), 32); t.position.y = 740; const f = cyl(220, 12, '#2b2b2b', 20); g.add(p, t, f); return { obj: g, top: 760, cover: { r: 340, top: 740 }, legs: [[0, 0]], legR: 32, surface: 280 }; }, on: [['plate', .95, 1], ['coffee_cup', .7, 1], ['newspaper', .3, 1], ['sugar_packet', .5, 2]] },
  plate: { make() { const m = cyl(120, 12, std('#f5f3ee', { roughness: .25 }), 32); return { obj: m, top: 12, surface: 80 }; }, on: [['bagel', .6, 1], ['crumb', .9, 5], ['fork', .5, 1]] },
  bagel: { make() { const m = M(geo('bag', () => new THREE.TorusGeometry(40, 17, 12, 24).rotateX(Math.PI / 2).translate(0, 17, 0)), '#c08a4a'); return { obj: m, food: true }; } },
  fork: { make(r) { const m = box(12, 4, 180, std('#c8c8c8', { metalness: .9, roughness: .2 })); m.rotation.y = r() * 6; return { obj: m }; } },
  sugar_packet: { make(r) { const m = box(40, 4, 60, '#f1e7d0'); m.rotation.y = r() * 6; return { obj: m, food: true }; } },
  coffee_cup: { make(r) { const g = new THREE.Group(); const c = M(geo('cup', () => new THREE.CylinderGeometry(45, 35, 120, 20, 1, true)), std('#f1ece2', { side: THREE.DoubleSide })); c.rotation.z = Math.PI / 2; c.position.y = 42; const sl = M(geo('cupsl', () => new THREE.CylinderGeometry(46, 42, 45, 20, 1, true)), std('#6b4423', { side: THREE.DoubleSide })); sl.rotation.z = Math.PI / 2; sl.position.y = 42; g.add(c, sl); g.rotation.y = r() * 6; return { obj: g, cover: { r: 50, top: 80 } }; } },
  newspaper: { make(r) { const g = new THREE.Group(); const a = box(300, 3, 200, '#d9d6cc'); a.rotation.z = .5; a.position.set(-60, 0, 0); const b = box(300, 3, 200, '#cfcac0'); b.rotation.z = -.5; b.position.set(60, 0, 0); g.add(a, b); g.rotation.y = r() * 6; return { obj: g, cover: { r: 110, top: 70 } }; } },
  pizza_box: { make(r) { const g = new THREE.Group(); const b = box(420, 40, 420, '#c9a46b'); const lid = box(420, 6, 420, '#c19a5f'); lid.position.set(0, 40, -210); lid.rotation.x = -1.9; lid.geometry = lid.geometry.clone().translate(0, 0, 210); g.add(b); g.add(lid); g.rotation.y = r() * 6; return { obj: g, top: 40, solid: true, rad: 200, food: true, surface: 160 }; }, on: [['crust', .9, 2], ['grease', 1, 3]] },
  crust: { make(r) { const m = M(geo('crust', () => new THREE.TorusGeometry(110, 16, 8, 16, 1.4).rotateX(Math.PI / 2).translate(0, 12, 0)), '#c8893b'); m.rotation.y = r() * 6; return { obj: m, food: true }; } },
  grease: { make(r) { const m = decal(rand(r, 40, 90), rand(r, 40, 90), '#8a5a1f', { opacity: .5 }); m.position.y = .8; return { obj: m }; } },
  energy_can: { make(r) { const g = new THREE.Group(); const c = M(geo('can', () => new THREE.CylinderGeometry(33, 33, 122, 24).rotateZ(Math.PI / 2)), std(pick(r, ['#1f8f4e', '#1a1a1a', '#2c6fd6']), { metalness: .85, roughness: .25 })); c.position.y = 33; g.add(c); g.rotation.y = r() * 6; return { obj: g, solid: true, rad: 55, top: 66 }; } },
  textbook: { make(r) { const m = box(280, 32, 210, pick(r, ['#2e4a7d', '#7d2e2e', '#2e7d4a'])); m.rotation.y = r() * 6; return { obj: m, solid: true, rad: 150, top: 32 }; } },
  flower_pot: { make(r) { const g = new THREE.Group(); const p = M(geo('pot', () => new THREE.CylinderGeometry(130, 95, 220, 24).translate(0, 110, 0)), '#b65a32'); g.add(p); return { obj: g, solid: true, rad: 130, top: 220, surface: 90 }; }, on: [['flower', 1, 4]] },
  flower: { make(r) { const g = new THREE.Group(); const h = rand(r, 180, 380); const s = cyl(4, h, '#3f7a2a', 6); g.add(s); const col = pick(r, ['#e84393', '#fd79a8', '#fdcb6e', '#a29bfe', '#ff7675']); for (let i = 0; i < 6; i++) { const p = sph(16, col); p.scale.set(1.4, .35, .8); const a = i / 6 * 6.28; p.position.set(Math.cos(a) * 18, h, Math.sin(a) * 18); p.rotation.y = -a; g.add(p); } const c = sph(9, '#f9e79f'); c.position.y = h + 2; g.add(c); return { obj: g }; } },
  petals: { make(r) { const g = new THREE.Group(); const col = pick(r, ['#e84393', '#fd79a8', '#a29bfe']); for (let i = 0; i < 8; i++) { const p = decal(22, 14, col, { opacity: .95 }); p.position.set(rand(r, -120, 120), .9, rand(r, -120, 120)); p.rotation.y = r() * 6; g.add(p); } return { obj: g }; } },
  watering_can: { make(r) { const g = new THREE.Group(); const b = cyl(85, 170, std('#2e8b57', { metalness: .5, roughness: .4 }), 20); const sp = M(geo('spout', () => new THREE.CylinderGeometry(8, 12, 200, 8).rotateZ(-.9).translate(130, 150, 0)), '#2e8b57'); g.add(b, sp); g.rotation.y = r() * 6; return { obj: g, solid: true, rad: 85, top: 170 }; } },
  puddle: { make(r) { const m = waterMesh(rand(r, 160, 420), r() * 50); m.position.y = 1.5; return { obj: m, water: true }; } },
  ball: { make(r) { const m = sph(32, std(pick(r, ['#c6e33a', '#e74c3c']), { roughness: .9 })); m.position.y = 32; return { obj: m, solid: true, rad: 32, top: 64 }; } },
  water_bowl: { make() { const g = new THREE.Group(); const b = M(geo('bowl', () => new THREE.CylinderGeometry(95, 75, 55, 24, 1, true).translate(0, 27, 0)), std('#b0b6bb', { metalness: .9, roughness: .2, side: THREE.DoubleSide })); const w = waterMesh(80, 3); w.position.y = 40; g.add(b, w); return { obj: g, solid: true, rad: 95, top: 55 }; } },
  mud_prints: { make(r) { const g = new THREE.Group(); for (let i = 0; i < 6; i++) { const p = decal(40, 46, '#4a3520', { opacity: .55 }); p.position.set(i * 90, .8, (i % 2) * 60); g.add(p); } g.rotation.y = r() * 6; return { obj: g }; } },
  toy_car: { make(r) { const g = new THREE.Group(); const c = pick(r, ['#e74c3c', '#3498db', '#f1c40f']); const b = box(75, 22, 36, std(c, { metalness: .6, roughness: .3 })); b.position.y = 8; const t = box(38, 14, 32, c); t.position.set(-5, 30, 0); g.add(b, t); for (const x of [-25, 25]) for (const z of [-19, 19]) { const w = M(geo('wh', () => new THREE.CylinderGeometry(9, 9, 6, 12).rotateX(Math.PI / 2)), '#111'); w.position.set(x, 9, z); g.add(w); } g.rotation.y = r() * 6; return { obj: g, solid: true, rad: 40, top: 44 }; } },
  chalk: { make(r) { const g = new THREE.Group(); const c = pick(r, ['#ff9ff3', '#54a0ff', '#feca57', '#48dbfb']); for (let i = 0; i < 6; i++) { const sq = decal(300, 300, c, { opacity: .35 }); sq.position.set(0, .7, -i * 320); g.add(sq); } g.rotation.y = r() * 6; return { obj: g }; } },
  juice_box: { make(r) { const g = new THREE.Group(); const b = box(40, 100, 62, pick(r, ['#ff9f43', '#ee5253', '#10ac84'])); const s = cyl(2.5, 50, '#fff', 6); s.position.set(10, 100, 15); s.rotation.z = .3; g.add(b, s); g.rotation.y = r() * 6; return { obj: g, solid: true, rad: 40, top: 100, food: true }; } },
  trash_bag: { make(r) { const s = rand(r, 260, 380); const m = M(geo('bag' + (s | 0) % 3, () => { const g = new THREE.SphereGeometry(1, 18, 14); const p = g.attributes.position; for (let i = 0; i < p.count; i++) { const k = 1 + .12 * Math.sin(i * 2.3) ; p.setXYZ(i, p.getX(i) * k, Math.max(p.getY(i), -.6) * k, p.getZ(i) * k); } g.computeVertexNormals(); return g; }), std('#141414', { roughness: .25, metalness: .2 })); m.scale.set(s, s * .8, s); m.position.y = s * .45; return { obj: m, solid: true, rad: s * .9, top: s * 1.2, food: true }; } },
  hard_hat: { make() { const m = M(geo('hat', () => new THREE.SphereGeometry(140, 20, 10, 0, Math.PI * 2, 0, Math.PI / 2)), std('#f6c90e', { roughness: .4 })); const g = new THREE.Group(); m.position.y = 18; g.add(m); for (const a of [0, 2.1, 4.2]) { const p = sph(12, '#555'); p.position.set(Math.cos(a) * 120, 6, Math.sin(a) * 120); g.add(p); } return { obj: g, cover: { r: 130, top: 30 } }; } },
  cone: { make() { const g = new THREE.Group(); const b = box(400, 25, 400, '#222'); const c = M(geo('cone', () => new THREE.ConeGeometry(160, 700, 24).translate(0, 375, 0)), '#ff6b1a'); const s = M(geo('coneS', () => new THREE.CylinderGeometry(82, 105, 90, 24, 1, true).translate(0, 390, 0)), std('#f5f5f5', { side: THREE.DoubleSide })); g.add(b, c, s); return { obj: g, solid: true, rad: 200, top: 25 }; } },
  splatter: { make(r) { const g = new THREE.Group(); for (let i = 0; i < 7; i++) { const d = decal(rand(r, 30, 140), rand(r, 30, 140), pick(r, ['#e74c3c', '#3498db', '#f1c40f', '#9b59b6', '#1abc9c']), { opacity: .85 }); d.position.set(rand(r, -250, 250), .7 + i * .05, rand(r, -250, 250)); g.add(d); } return { obj: g }; } },
  brush: { make(r) { const g = new THREE.Group(); const h = box(16, 16, 230, '#c49a6c'); h.position.y = 0; const f = box(22, 18, 30, pick(r, ['#e74c3c', '#3498db'])); f.position.z = 130; g.add(h, f); g.rotation.y = r() * 6; return { obj: g }; } },
  napkin: { make(r) { const m = box(160, 2, 160, '#fbfbfb'); m.rotation.y = r() * 6; return { obj: m }; } },
  ketchup: { make(r) { const m = box(45, 6, 70, '#c0392b'); m.rotation.y = r() * 6; return { obj: m, food: true }; } },
  hotdog_bit: { make(r) { const g = new THREE.Group(); const b = M(geo('hd', () => new THREE.CapsuleGeometry(22, 60, 6, 12).rotateZ(Math.PI / 2).translate(0, 22, 0)), '#d9a066'); const s = M(geo('hds', () => new THREE.CapsuleGeometry(13, 70, 6, 12).rotateZ(Math.PI / 2).translate(0, 38, 0)), '#a0442a'); g.add(b, s); g.rotation.y = r() * 6; return { obj: g, solid: true, rad: 40, top: 50, food: true }; } },
  water_bottle: { make(r) { const g = new THREE.Group(); const b = M(geo('wb', () => new THREE.CylinderGeometry(35, 35, 200, 20).rotateZ(Math.PI / 2)), mat('pet', () => new THREE.MeshPhysicalMaterial({ color: '#cfe8ff', roughness: .05, transmission: .85, thickness: 3, transparent: true }))); b.position.y = 35; g.add(b); g.rotation.y = r() * 6; return { obj: g, solid: true, rad: 60, top: 70, cover: { r: 40, top: 60 } }; } },
  earbud: { make() { const m = sph(9, '#f5f5f5', { roughness: .2 }); m.position.y = 9; return { obj: m }; } },
  bird_seed: { make(r) { const g = new THREE.Group(); for (let i = 0; i < 30; i++) { const s = sph(3, pick(r, ['#c9a86a', '#2d2d2d', '#e5d3a1'])); s.position.set(rand(r, -150, 150), 2, rand(r, -150, 150)); g.add(s); } return { obj: g, food: true }; } },
  storm_drain: { make() { const g = new THREE.Group(); const f = box(900, 6, 500, std('#2a2a2a', { metalness: .6, roughness: .5 })); g.add(f); for (let i = -4; i <= 4; i++) { const s = box(60, 7, 480, '#111'); s.position.set(i * 95, 1, 0); g.add(s); } return { obj: g }; } },
  wet: { make(r) { const m = decal(rand(r, 900, 1800), rand(r, 600, 1200), '#3c3a37', { opacity: .35 }); return { obj: m }; } },
};

// ---------- resident profiles (who lives here drives what's here) ----------
export const PROFILES = {
  student: { label: "a college student's stoop", items: [['pizza_box', 1, 2], ['energy_can', 1, 3], ['textbook', 0, 2], ['crumb', 2, 6], ['wrapper', 1, 3]] },
  florist: { label: 'a florist', items: [['flower_pot', 2, 5], ['petals', 2, 5], ['watering_can', 0, 1], ['puddle', 1, 2], ['wet', 1, 1]] },
  dog_owner: { label: "a dog owner's place", items: [['ball', 1, 2], ['water_bowl', 1, 1], ['mud_prints', 1, 3], ['twig', 1, 2]] },
  pizza_shop: { label: 'a pizza shop', items: [['cafe_table', 1, 3], ['pizza_box', 1, 2], ['crust', 2, 4], ['crumb', 4, 10], ['napkin', 1, 3]] },
  elderly: { label: "an elderly couple's tidy stoop", items: [['flower_pot', 1, 2], ['bird_seed', 1, 2], ['newspaper', 1, 1]] },
  family: { label: 'a family with little kids', items: [['toy_car', 1, 2], ['chalk', 1, 1], ['juice_box', 1, 2], ['crumb', 1, 4]] },
  construction: { label: 'a construction site', items: [['cone', 1, 3], ['hard_hat', 1, 1], ['coffee_cup', 1, 2], ['pebble', 3, 8]] },
  artist: { label: "an artist's studio", items: [['splatter', 1, 3], ['brush', 1, 3], ['coffee_cup', 0, 1]] },
  vendor: { label: 'a hot dog cart', items: [['hotdog_bit', 1, 2], ['napkin', 1, 3], ['ketchup', 1, 3], ['crumb', 3, 8]] },
  jogger: { label: 'a jogging path', items: [['water_bottle', 1, 1], ['earbud', 0, 1], ['wrapper', 0, 2]] },
  cafe: { label: 'a sidewalk café', items: [['cafe_table', 2, 4], ['coffee_cup', 0, 2], ['crumb', 2, 6]] },
};
const SIDE2 = ['student', 'florist', 'dog_owner', 'pizza_shop', 'elderly', 'family', 'construction', 'artist', 'cafe'];
const SIDE1 = ['jogger', 'dog_owner', 'vendor', 'family', 'artist', 'elderly', 'cafe'];
const AVES = ['Columbus Ave', 'Amsterdam Ave', 'Broadway', 'West End Ave', 'Riverside Dr', 'Central Park W', '8th Ave', '7th Ave', '6th Ave'];
export const SLOT = 7000;
export function profileAt(x, side) {
  const i = Math.floor(x / SLOT + 0.5);
  const list = side === 'side1' ? SIDE1 : SIDE2;
  const name = list[Math.floor(hash2(i, side === 'side1' ? 11 : 22) * list.length)];
  const block = Math.floor(x / 28000);
  const num = 100 + ((i % 40) + 40) % 40 * 4;
  const street = side === 'side1' ? `Central Park S near ${AVES[((block % 9) + 9) % 9]}` : `${num} W 59th St`;
  return { slot: i, name, prof: PROFILES[name], text: `Outside ${PROFILES[name].label}, ${street}` };
}
export const trashDay = (x) => hash2(Math.floor(x / 28000), 77) < 0.35;

// ---------- placement with nested rules ----------
function place(name, parent, lx, ly, lz, wx, wz, r, ch, depth, chunkKey) {
  const def = P[name]; if (!def) return;
  const id = `${chunkKey}:${name}:${Math.round(wx)}:${Math.round(wz)}`;
  if (def.pickup && collected.has(id)) return;
  const d = def.make(r);
  const o = d.obj; o.position.x += lx; o.position.y += ly; o.position.z += lz;
  parent.add(o);
  const wy = (parent.userData.wy || 0) + ly;
  if (depth === 0 || wy < 20) {
    if (d.solid) ch.colliders.push({ x: wx, z: wz, r: d.rad, top: wy + d.top });
    if (d.legs) for (const [ax, az] of d.legs) ch.colliders.push({ x: wx + ax, z: wz + az, r: d.legR, top: wy + d.top, cam: false });
    if (d.cover) ch.cover.push({ x: wx, z: wz, r: d.cover.r, top: wy + d.cover.top });
  }
  if (d.food) ch.food.push({ x: wx, z: wz });
  if (d.water && depth === 0) ch.waters.push({ x: wx, z: wz, r: 300, level: wy + 1.5 });
  if (def.pickup) { pickups.set(id, { id, kind: def.pickup, x: wx, y: wy + 5, z: wz, mesh: o }); ch.pickupIds.push(id); }
  if (def.on && depth < 3) {
    const holder = new THREE.Group(); holder.position.set(lx, ly + d.top, lz); holder.userData.wy = wy + d.top; parent.add(holder);
    for (const [cn, chance, max] of def.on) for (let k = 0; k < max; k++) if (r() < chance) {
      const a = r() * 6.28, rr = Math.sqrt(r()) * (d.surface || 60);
      place(cn, holder, Math.cos(a) * rr, 0, Math.sin(a) * rr, wx + Math.cos(a) * rr, wz + Math.sin(a) * rr, r, ch, depth + 1, chunkKey);
    }
  }
}

function inChunk(x, z, ctx) { return x >= ctx.x0 && x < ctx.x0 + CHUNK && z >= ctx.z0 && z < ctx.z0 + CHUNK; }

export const builders = {
  park(ctx) {
    const { r, ch, x0, z0 } = ctx, key = ctx.cx + ',' + ctx.cz;
    const scatter = (name, n, minPond = 1.05) => {
      for (let i = 0; i < n; i++) {
        const x = x0 + r() * CHUNK, z = z0 + r() * CHUNK;
        if (Math.hypot(x - POND.x, z - POND.z) < POND.r * minPond) continue;
        if (z < Z.PARK_END + 80) continue;
        place(name, ch.group, x, groundY(x, z), z, x, z, r, ch, 0, key);
      }
    };
    scatter('pebble', 26); scatter('clover', 30); scatter('leaf', 40); scatter('acorn', 8);
    scatter('mushroom', 5); scatter('tented_leaf', 6); scatter('twig', 10); scatter('dandelion', 7);
    scatter('droplet', 10); scatter('bottle_cap', 1); scatter('wrapper', 1);
    if (r() < .5) scatter('coffee_cup', 1);
  },
  urban(ctx, b) {
    const { r, ch, x0, z0 } = ctx, key = ctx.cx + ',' + ctx.cz;
    const y0 = b === 'street' ? -150 : 0;
    const generic = (name, n) => { for (let i = 0; i < n; i++) { const x = x0 + r() * CHUNK, z = z0 + r() * CHUNK; place(name, ch.group, x, groundY(x, z), z, x, z, r, ch, 0, key); } };
    if (b === 'street') {
      generic('gum', 6); generic('wrapper', 2); generic('fry', 3); generic('bottle_cap', 2); generic('pebble', 6); generic('leaf', 6);
      if (r() < .5) generic('puddle', 1);
      // storm drains along the curbs
      for (const zc of [Z.SIDE1_END - 350, Z.STREET_END + 350]) if (zc >= z0 && zc < z0 + CHUNK && r() < .5) {
        const x = x0 + 300 + r() * (CHUNK - 600); if (Math.abs(x) > 1200) place('storm_drain', ch.group, x, y0, zc, x, zc, r, ch, 0, key);
      }
      return;
    }
    generic('gum', 10); generic('bottle_cap', 1); generic('leaf', 4); generic('pebble', 4);
    // per-slot residents
    const zFront = b === 'side2' ? Z.SIDE2_END : Z.PARK_END;
    const dir = b === 'side2' ? 1 : -1;
    for (let s = Math.floor(x0 / SLOT) - 1; s <= Math.floor((x0 + CHUNK) / SLOT) + 1; s++) {
      const sx = s * SLOT; if (b === 'side2' && Math.abs(sx) < 10) continue; // alley mouth stays clear-ish
      const info = profileAt(sx, b); const sr = rngFor(s, b === 'side2' ? 2 : 1, 9);
      for (const [name, mn, mx] of info.prof.items) {
        const n = mn + Math.floor(sr() * (mx - mn + 1));
        for (let k = 0; k < n; k++) {
          const x = sx + rand(sr, -SLOT * .42, SLOT * .42);
          const z = zFront + dir * rand(sr, 700, name === 'cafe_table' ? 2400 : 3200);
          const pr = rngFor(Math.round(x), Math.round(z), 3);
          if (inChunk(x, z, ctx)) place(name, ch.group, x, 0, z, x, z, pr, ch, 0, key);
        }
      }
      if (b === 'side2' && trashDay(sx)) for (let k = 0; k < 4; k++) {
        const x = sx + rand(sr, -1500, 1500), z = Z.STREET_END - rand(sr, 300, 900);
        if (inChunk(x, z, ctx)) place('trash_bag', ch.group, x, 0, z, x, z, rngFor(x | 0, z | 0, 4), ch, 0, key);
      }
      if (b === 'side1' && sr() < .5) {
        const x = sx + rand(sr, -2000, 2000), z = Z.PARK_END - 900;
        if (inChunk(x, z, ctx)) place('bench', ch.group, x, 0, z, x, z, rngFor(x | 0, 1, 4), ch, 0, key);
      }
    }
  },
};
