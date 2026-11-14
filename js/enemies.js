import * as THREE from 'three';
import { std, rand, clamp } from './util.js';
import { groundY, floorAt, resolve, cover, food, biome, Z } from './world.js';

// ---------- ants ----------
function antMesh(scale = 1, color = '#2a1a12') {
  const g = new THREE.Group(), m = std(color, { roughness: .35, metalness: .1 });
  const seg = (r, x, sy = 1) => { const s = new THREE.Mesh(new THREE.SphereGeometry(r, 12, 10), m); s.scale.set(1, sy, 1.25); s.position.set(0, 2.2, x); s.castShadow = true; g.add(s); return s; };
  seg(1.3, 2.6, .9); seg(.9, 0, .8); seg(1.9, -3.2, .85);
  const legs = [];
  for (let i = 0; i < 3; i++) for (const sd of [-1, 1]) {
    const l = new THREE.Mesh(new THREE.CylinderGeometry(.15, .12, 4.2, 4), m);
    l.geometry.translate(0, -2.1, 0); l.position.set(sd * .6, 2.4, (i - 1) * 1.1); l.rotation.z = sd * 1.0; l.userData = { sd, i };
    g.add(l); legs.push(l);
  }
  for (const sd of [-1, 1]) { const a = new THREE.Mesh(new THREE.CylinderGeometry(.08, .08, 3, 4), m); a.position.set(sd * .5, 3.6, 4.4); a.rotation.x = .9; a.rotation.z = sd * .4; g.add(a); }
  g.scale.setScalar(scale); g.userData.legs = legs;
  return g;
}
function spiderMesh() {
  const g = new THREE.Group(), m = std('#1b1b1b', { roughness: .5 });
  const b = new THREE.Mesh(new THREE.SphereGeometry(9, 16, 12), m); b.scale.set(1, .8, 1.3); b.position.set(0, 12, -8); b.castShadow = true;
  const h = new THREE.Mesh(new THREE.SphereGeometry(6, 14, 10), m); h.position.set(0, 10, 4); h.castShadow = true;
  g.add(b, h);
  for (let i = 0; i < 6; i++) { const e = new THREE.Mesh(new THREE.SphereGeometry(.9, 8, 6), new THREE.MeshBasicMaterial({ color: '#ff3030' })); e.position.set((i % 3 - 1) * 2, 12 + Math.floor(i / 3) * 1.6, 9.5); g.add(e); }
  const legs = [];
  for (let i = 0; i < 4; i++) for (const sd of [-1, 1]) {
    const l = new THREE.Group(); const up = new THREE.Mesh(new THREE.CylinderGeometry(.6, .5, 14, 5), m); up.geometry.translate(0, 7, 0); up.rotation.z = -sd * 1.1;
    const lo = new THREE.Mesh(new THREE.CylinderGeometry(.5, .3, 16, 5), m); lo.geometry.translate(0, -8, 0); lo.position.set(-sd * 12.5, 6.3, 0); lo.rotation.z = sd * .35;
    l.add(up, lo); l.position.set(sd * 4, 10, 4 - i * 3.5); l.rotation.y = (i - 1.5) * .35 * sd; l.userData = { sd, i }; g.add(l); legs.push(l);
  }
  g.userData.legs = legs; return g;
}

export class Enemies {
  constructor(scene, hud) {
    this.scene = scene; this.hud = hud; this.ants = []; this.spawnT = 0;
    // crow
    this.crow = this.makeCrow(); scene.add(this.crow);
    this.crowState = 'away'; this.crowT = 22; this.shadow = this.makeShadow(1, '#000'); scene.add(this.shadow); this.shadow.visible = false;
    this.lockP = new THREE.Vector3();
    // sneaker
    this.shoe = this.makeShoe(); scene.add(this.shoe); this.shoe.visible = false;
    this.stompState = 'idle'; this.stompT = 8; this.stompP = new THREE.Vector3(); this.warn = this.makeShadow(1, '#ff2a2a'); scene.add(this.warn); this.warn.visible = false;
    // spider boss guarding the alley
    this.spider = { mesh: spiderMesh(), pos: new THREE.Vector3(0, 0, -29000), hp: 12, alive: true, t: 0, lunge: 0, home: new THREE.Vector3(0, 0, -29000) };
    scene.add(this.spider.mesh);
  }
  makeShadow(r, c) { const m = new THREE.Mesh(new THREE.CircleGeometry(1, 40).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: c, transparent: true, opacity: .4, depthWrite: false })); m.renderOrder = 3; return m; }
  makeCrow() {
    const g = new THREE.Group(), m = std('#0d0d12', { roughness: .45, metalness: .25 });
    const body = new THREE.Mesh(new THREE.SphereGeometry(80, 16, 12), m); body.scale.set(1, .9, 2.3); g.add(body);
    const head = new THREE.Mesh(new THREE.SphereGeometry(55, 14, 10), m); head.position.set(0, 40, 190); g.add(head);
    const beak = new THREE.Mesh(new THREE.ConeGeometry(18, 90, 8), std('#222')); beak.rotation.x = Math.PI / 2; beak.position.set(0, 35, 270); g.add(beak);
    const tail = new THREE.Mesh(new THREE.BoxGeometry(120, 10, 200), m); tail.position.set(0, 10, -250); g.add(tail);
    const wing = () => { const w = new THREE.Mesh(new THREE.BoxGeometry(450, 8, 160), m); w.geometry.translate(225, 0, 0); return w; };
    this.wl = wing(); this.wr = wing(); this.wr.rotation.y = Math.PI; this.wl.position.y = this.wr.position.y = 30; g.add(this.wl, this.wr);
    g.traverse(o => o.castShadow = true); g.visible = false; return g;
  }
  makeShoe() {
    const g = new THREE.Group();
    const sole = new THREE.Mesh(new THREE.BoxGeometry(110, 30, 300), std('#f0f0f0')); sole.position.y = 15;
    const up = new THREE.Mesh(new THREE.CapsuleGeometry(48, 170, 6, 14), std('#b22222', { roughness: .7 })); up.rotation.x = Math.PI / 2; up.position.set(0, 70, -10); up.scale.set(1, 1, 1);
    const ankle = new THREE.Mesh(new THREE.CylinderGeometry(50, 55, 400, 14), std('#2c3e50')); ankle.position.set(0, 300, -70);
    const swoosh = new THREE.Mesh(new THREE.BoxGeometry(2, 18, 120), std('#fff')); swoosh.position.set(50, 60, 0);
    g.add(sole, up, ankle, swoosh); g.traverse(o => o.castShadow = true); return g;
  }
  underCover(p) { for (const c of cover) if (p.y < c.top && Math.hypot(p.x - c.x, p.z - c.z) < c.r) return true; return false; }
  foodNear(p) { let n = 0; for (const f of food) if (Math.abs(f.x - p.x) < 1500 && Math.abs(f.z - p.z) < 1500) n++; return n; }

  update(dt, t, player, warn) {
    const p = player.pos, b = biome(p.z, p.x);
    // ---- ants: density rises near food
    const fn = this.foodNear(p);
    const want = b === 'alley' ? 3 : Math.min(14, 2 + Math.floor(fn * .6) + (b === 'park' ? 2 : 0));
    this.spawnT -= dt;
    if (this.spawnT <= 0 && this.ants.length < want) {
      this.spawnT = 2.5; const a = Math.random() * 6.28, d = rand(Math.random, 250, 600);
      const x = p.x + Math.cos(a) * d, z = p.z + Math.sin(a) * d;
      if (biome(z, x) !== 'building') {
        const big = Math.random() < .15; const mesh = antMesh(big ? 1.4 : 1, big ? '#5a1a0e' : '#2a1a12'); this.scene.add(mesh);
        this.ants.push({ mesh, pos: new THREE.Vector3(x, groundY(x, z), z), hp: big ? 5 : 3, dir: Math.random() * 6, bite: 0, hitT: 0, wander: 0, big });
      }
    }
    for (let i = this.ants.length - 1; i >= 0; i--) {
      const a = this.ants[i], dx = p.x - a.pos.x, dz = p.z - a.pos.z, d = Math.hypot(dx, dz);
      if (d > 1800 || a.hp <= 0) { if (a.hp <= 0 && a.dead === undefined) { a.dead = 1; } if (a.dead !== undefined) { a.dead -= dt; a.mesh.rotation.z += dt * 6; a.mesh.scale.multiplyScalar(1 - dt * 1.5); if (a.dead > 0) continue; } this.scene.remove(a.mesh); this.ants.splice(i, 1); continue; }
      let sp = 0;
      if (d < 260 && player.hp > 0) { a.dir = Math.atan2(dx, dz); sp = a.big ? 92 : 80; }
      else { a.wander -= dt; if (a.wander < 0) { a.wander = rand(Math.random, .5, 2); a.dir += rand(Math.random, -1.2, 1.2); } sp = 40; }
      if (d < 9 + (a.big ? 3 : 0)) { sp = 0; a.bite -= dt; if (a.bite <= 0) { a.bite = .9; player.damage(a.big ? 12 : 7); this.hud.flash(); } }
      const ox = a.pos.x, oz = a.pos.z;
      a.pos.x += Math.sin(a.dir) * sp * dt; a.pos.z += Math.cos(a.dir) * sp * dt;
      a.pos.y = 999; resolve(a.pos, 3, ox, oz); a.pos.y = floorAt(a.pos.x, a.pos.z, 60);
      if (biome(a.pos.z, a.pos.x) === 'building') { a.pos.x = ox; a.pos.z = oz; a.dir += 2; }
      a.mesh.position.copy(a.pos); a.mesh.rotation.y = a.dir;
      if (a.hitT > 0) { a.hitT -= dt; a.mesh.position.y += 2; }
      for (const l of a.mesh.userData.legs) l.rotation.x = Math.sin(t * sp * .25 + l.userData.i * 2 + (l.userData.sd > 0 ? Math.PI : 0)) * .5;
    }
    // ---- spider boss
    const s = this.spider;
    if (s.alive) {
      const dx = p.x - s.pos.x, dz = p.z - s.pos.z, d = Math.hypot(dx, dz);
      let dir = Math.atan2(dx, dz), sp = 0;
      if (d < 900) { sp = 60; s.t -= dt; if (s.t <= 0 && d < 120) { s.t = 2.2; s.lunge = .4; } if (b === 'alley' && d < 900) warn('A SPIDER guards the lab, hit it or run past!'); }
      else { const hx = s.home.x - s.pos.x, hz = s.home.z - s.pos.z; if (Math.hypot(hx, hz) > 50) { dir = Math.atan2(hx, hz); sp = 40; } }
      if (s.lunge > 0) { s.lunge -= dt; sp = 260; if (d < 20) { player.damage(20); this.hud.flash(); s.lunge = 0; } }
      else if (d < 22) sp = 0;
      s.pos.x += Math.sin(dir) * sp * dt; s.pos.z += Math.cos(dir) * sp * dt; s.pos.y = groundY(s.pos.x, s.pos.z);
      s.mesh.position.copy(s.pos); s.mesh.rotation.y = dir;
      for (const l of s.mesh.userData.legs) l.rotation.x = Math.sin(t * 10 + l.userData.i * 1.6 + (l.userData.sd > 0 ? Math.PI : 0)) * .3 * Math.min(1, sp / 40);
      if (s.hitT > 0) { s.hitT -= dt; s.mesh.position.y += 3; }
    }
    // ---- crow dive (hide under cover!)
    this.crowT -= dt;
    const crow = this.crow;
    if (this.crowState === 'away' && this.crowT <= 0 && b !== 'alley') { this.crowState = 'circle'; this.crowT = 5; crow.visible = true; }
    if (this.crowState === 'circle') {
      const a = t * .6; crow.position.set(p.x + Math.cos(a) * 2500, 3500, p.z + Math.sin(a) * 2500); crow.rotation.set(0, -a, .4);
      warn('A CROW is circling overhead…');
      if (this.crowT <= 0) { this.crowState = 'mark'; this.crowT = 2.6; this.shadow.visible = true; this.lockP.copy(p); }
    } else if (this.crowState === 'mark') {
      this.lockP.lerp(p, Math.min(1, dt * 2.2));
      const k = 1 - this.crowT / 2.6; this.shadow.scale.setScalar(60 + k * 120); this.shadow.material.opacity = .25 + k * .35;
      this.shadow.position.set(this.lockP.x, floorAt(this.lockP.x, this.lockP.z, 9999) + 1, this.lockP.z);
      crow.position.lerp(new THREE.Vector3(this.lockP.x, 1800, this.lockP.z + 1500), dt * 2); crow.lookAt(this.lockP);
      warn('CROW DIVING! Get under cover or sprint out of the shadow!');
      if (this.crowT <= 0) { this.crowState = 'dive'; this.crowT = .7; }
    } else if (this.crowState === 'dive') {
      const k = 1 - this.crowT / .7; crow.position.lerp(new THREE.Vector3(this.lockP.x, this.lockP.y + 60, this.lockP.z), k);
      if (this.crowT <= 0) {
        const hit = Math.hypot(p.x - this.lockP.x, p.z - this.lockP.z) < 170 && !this.underCover(p);
        if (hit) { player.damage(45); player.vel.y = 140; this.hud.flash(); this.hud.toast('The crow got you!'); } else this.hud.toast(this.underCover(p) ? 'Safe under cover!' : 'Dodged the crow!');
        this.crowState = 'leave'; this.crowT = 3; this.shadow.visible = false;
      }
    } else if (this.crowState === 'leave') {
      crow.position.y += dt * 1500; crow.position.z -= dt * 1500;
      if (this.crowT <= 0) { this.crowState = 'away'; this.crowT = rand(Math.random, 28, 45); crow.visible = false; }
    }
    if (crow.visible) { const f = Math.sin(t * (this.crowState === 'dive' ? 4 : 9)) * .6; this.wl.rotation.z = f; this.wr.rotation.z = -f; }
    // ---- sneaker stomp (sidewalks + street)
    const city = b === 'side1' || b === 'street' || b === 'side2';
    this.stompT -= dt;
    if (this.stompState === 'idle' && this.stompT <= 0 && city) {
      this.stompState = 'warn'; this.stompT = 1.7;
      this.stompP.set(p.x + player.vel.x * 1.0, 0, p.z + player.vel.z * 1.0); this.stompP.y = groundY(this.stompP.x, this.stompP.z);
      this.warn.visible = true; this.warn.position.set(this.stompP.x, this.stompP.y + 1.2, this.stompP.z); this.warn.scale.set(70, 1, 170);
      this.shoeYaw = Math.random() * 6; this.warn.rotation.y = this.shoeYaw;
    } else if (this.stompState === 'warn') {
      warn('STOMP INCOMING! Get out of the red!');
      this.warn.material.opacity = .25 + .25 * Math.sin(t * 20);
      if (this.stompT <= 0) { this.stompState = 'drop'; this.stompT = .18; this.shoe.visible = true; }
    } else if (this.stompState === 'drop') {
      const k = clamp(1 - this.stompT / .18, 0, 1);
      this.shoe.position.set(this.stompP.x, this.stompP.y + (1 - k) * 2500, this.stompP.z); this.shoe.rotation.y = this.shoeYaw;
      if (this.stompT <= 0) {
        const lx = p.x - this.stompP.x, lz = p.z - this.stompP.z, c = Math.cos(-this.shoeYaw), sn = Math.sin(-this.shoeYaw);
        const rx = lx * c + lz * sn, rz = -lx * sn + lz * c;
        if ((rx / 62) ** 2 + (rz / 160) ** 2 < 1 && p.y < this.stompP.y + 60) { player.damage(60); this.hud.flash(); this.hud.toast('SQUISHED!'); }
        for (const a of this.ants) if (Math.hypot(a.pos.x - this.stompP.x, a.pos.z - this.stompP.z) < 120) a.hp = 0;
        this.hud.shake(.5); this.stompState = 'hold'; this.stompT = .9; this.warn.visible = false;
      }
    } else if (this.stompState === 'hold') {
      if (this.stompT <= 0) { this.stompState = 'lift'; this.stompT = .6; }
    } else if (this.stompState === 'lift') {
      this.shoe.position.y += dt * 4000;
      if (this.stompT <= 0) { this.shoe.visible = false; this.stompState = 'idle'; this.stompT = rand(Math.random, 6, 11); }
    }
  }
  // player melee
  hit(player) {
    const dmg = player.hasSpear ? 2 : 1, reach = player.hasSpear ? 30 : 16, f = player.root.rotation.y;
    let any = false;
    const tryHit = (o, pos, extra = 0) => {
      const dx = pos.x - player.pos.x, dz = pos.z - player.pos.z, d = Math.hypot(dx, dz);
      if (d > reach + extra) return;
      let da = Math.atan2(dx, dz) - f; da = Math.atan2(Math.sin(da), Math.cos(da));
      if (Math.abs(da) > 1.3 && d > 6) return;
      o.hp -= dmg; o.hitT = .15; any = true;
      pos.x += dx / (d || 1) * 18; pos.z += dz / (d || 1) * 18;
    };
    for (const a of this.ants) if (a.hp > 0) tryHit(a, a.pos);
    if (this.spider.alive) { tryHit(this.spider, this.spider.pos, 14); if (this.spider.hp <= 0) { this.spider.alive = false; this.scene.remove(this.spider.mesh); this.hud.toast('Spider defeated!'); } }
    return any;
  }
  reset() { for (const a of this.ants) this.scene.remove(a.mesh); this.ants = []; this.crowState = 'away'; this.crowT = 20; this.crow.visible = false; this.shadow.visible = false; this.stompState = 'idle'; this.stompT = 8; this.shoe.visible = false; this.warn.visible = false; }
}
