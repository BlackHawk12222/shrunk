import * as THREE from 'three';
import { std, clamp, IS_MOBILE } from './util.js';
import { floorAt, resolve, rayFrac, waters, groundY } from './world.js';
import { addRipple } from './water.js';

function part(g, c, x, y, z, o = {}) { const m = new THREE.Mesh(g, std(c, o)); m.position.set(x, y, z); m.castShadow = true; return m; }

export class Player {
  constructor(scene) {
    this.root = new THREE.Group(); scene.add(this.root);
    const body = new THREE.Group(); this.body = body; this.root.add(body);
    // lab coat torso + skirt
    body.add(part(new THREE.CylinderGeometry(1.6, 2.3, 4.2, 12), '#f4f6f7', 0, 5.4, 0));
    body.add(part(new THREE.CylinderGeometry(1.3, 1.6, 1.6, 12), '#5b7fa3', 0, 7.6, 0));
    const head = new THREE.Group(); head.position.y = 9.1; body.add(head); this.head = head;
    head.add(part(new THREE.SphereGeometry(1.25, 16, 12), '#f1c9a5', 0, 0, 0));
    head.add(part(new THREE.SphereGeometry(1.3, 16, 8, 0, Math.PI * 2, 0, 1.2), '#4a3020', 0, .15, -.1));
    const gog = new THREE.TorusGeometry(.42, .14, 6, 14);
    head.add(part(gog, '#2b2b2b', -.48, .15, 1.05, { metalness: .6 }), part(gog, '#2b2b2b', .48, .15, 1.05, { metalness: .6 }));
    const lens = new THREE.CircleGeometry(.36, 12);
    head.add(part(lens, '#6fd3ff', -.48, .15, 1.1, { metalness: .9, roughness: .05, emissive: '#1b6f8f', emissiveIntensity: .4 }), part(lens, '#6fd3ff', .48, .15, 1.1, { metalness: .9, roughness: .05, emissive: '#1b6f8f', emissiveIntensity: .4 }));
    head.add(part(new THREE.TorusGeometry(1.25, .1, 4, 20, Math.PI), '#2b2b2b', 0, .15, 0));
    const limb = (len, r, c) => { const g = new THREE.Group(); const m = part(new THREE.CapsuleGeometry(r, len, 4, 8), c, 0, -len / 2 - r, 0); g.add(m); return g; };
    this.legL = limb(2.6, .45, '#33363b'); this.legL.position.set(-.7, 3.6, 0);
    this.legR = limb(2.6, .45, '#33363b'); this.legR.position.set(.7, 3.6, 0);
    this.armL = limb(2.6, .38, '#f4f6f7'); this.armL.position.set(-1.9, 7.3, 0);
    this.armR = limb(2.6, .38, '#f4f6f7'); this.armR.position.set(1.9, 7.3, 0);
    body.add(this.legL, this.legR, this.armL, this.armR);
    // spear (hidden until found)
    this.spear = new THREE.Group();
    const shaft = part(new THREE.CylinderGeometry(.18, .25, 26, 6), '#d9b77e', 0, 0, 0); shaft.rotation.x = Math.PI / 2; shaft.position.z = 6;
    const tip = part(new THREE.ConeGeometry(.35, 3, 6), '#bfa070', 0, 0, 20.5); tip.rotation.x = Math.PI / 2;
    this.spear.add(shaft, tip); this.spear.position.set(0, -3.2, 0); this.spear.visible = false; this.armR.add(this.spear);

    this.pos = new THREE.Vector3(0, 0, -200); this.vel = new THREE.Vector3(); this.yaw = Math.PI; this.facing = Math.PI;
    this.hp = 100; this.stamina = 100; this.air = 100; this.grounded = true; this.swim = false;
    this.attackT = 0; this.hasSpear = false; this.walkPhase = 0; this.hurtT = 0; this.wasInWater = false;
  }
  respawn(p) { this.pos.copy(p); this.pos.y = groundY(p.x, p.z) + 1; this.vel.set(0, 0, 0); this.hp = 100; this.stamina = 100; this.air = 100; }
  waterAt() { for (const w of waters) { const d = Math.hypot(this.pos.x - w.x, this.pos.z - w.z); if (d < w.r) return w; } return null; }

  update(dt, input, camYaw) {
    // movement intent relative to camera
    const f = input.moveY, s = input.moveX, mag = Math.min(1, Math.hypot(f, s));
    const sprint = (input.sprint || mag > .95 && IS_MOBILE && input.joyFull) && this.stamina > 2 && mag > .1;
    const w = this.waterAt(), ground = floorAt(this.pos.x, this.pos.z, this.pos.y);
    const depth = w ? (w.level - groundY(this.pos.x, this.pos.z)) : 0;
    this.swim = !!w && depth > 8 && this.pos.y < w.level + 1;
    let speed = this.swim ? 34 : sprint ? 125 : 68;
    if (w && !this.swim && this.pos.y < w.level + 2) speed *= .6;
    const fx = -Math.sin(camYaw), fz = -Math.cos(camYaw), rx = Math.cos(camYaw), rz = -Math.sin(camYaw);
    const dx = (fx * f + rx * s), dz = (fz * f + rz * s);
    const target = new THREE.Vector3(dx, 0, dz).multiplyScalar(speed * (mag > 0 ? 1 / Math.max(mag, 1e-3) * mag : 0));
    const accel = this.grounded || this.swim ? 12 : 3;
    this.vel.x += (target.x - this.vel.x) * Math.min(1, accel * dt);
    this.vel.z += (target.z - this.vel.z) * Math.min(1, accel * dt);
    if (mag > .1) this.facing = Math.atan2(dx, dz);
    if (sprint && mag > .1) this.stamina = Math.max(0, this.stamina - 22 * dt); else this.stamina = Math.min(100, this.stamina + (this.swim ? 4 : 14) * dt);

    if (this.swim) {
      const surf = w.level - 6;
      this.vel.y += (surf - this.pos.y) * 6 * dt - this.vel.y * 3 * dt;
      if (input.jump) this.vel.y = 30;
      this.air = Math.max(0, this.air - (this.pos.y < w.level - 7 ? 20 : 6) * dt);
      if (this.air <= 0) this.damage(15 * dt, true);
    } else {
      this.air = Math.min(100, this.air + 30 * dt);
      this.vel.y -= 320 * dt;
      if (input.jump && this.grounded) { this.vel.y = 118; this.grounded = false; }
    }
    const px = this.pos.x, pz = this.pos.z;
    this.pos.addScaledVector(this.vel, dt);
    resolve(this.pos, 2.4, px, pz);
    const fl = floorAt(this.pos.x, this.pos.z, this.pos.y);
    if (this.pos.y <= fl) { if (this.vel.y < -260) this.damage((-this.vel.y - 260) * .15); this.pos.y = fl; this.vel.y = Math.max(0, this.vel.y); this.grounded = true; }
    else this.grounded = this.pos.y - fl < .5;
    void ground;
    // splash ripples
    const inW = !!w && this.pos.y < w.level + 2;
    if (inW && (!this.wasInWater || (Math.hypot(this.vel.x, this.vel.z) > 15 && Math.random() < dt * 4))) addRipple(this.pos.x, this.pos.z, this.wasInWater ? .5 : 1.2);
    this.wasInWater = inW;

    // animation
    const hs = Math.hypot(this.vel.x, this.vel.z);
    this.walkPhase += dt * hs * .16;
    const sw = Math.sin(this.walkPhase) * Math.min(1, hs / 60) * (this.swim ? .4 : .9);
    this.legL.rotation.x = sw; this.legR.rotation.x = -sw;
    this.armL.rotation.x = -sw * .8; this.armR.rotation.x = sw * .8;
    if (!this.grounded && !this.swim) { this.legL.rotation.x = -.6; this.legR.rotation.x = .3; this.armL.rotation.z = -.6; }
    else this.armL.rotation.z = 0;
    if (this.attackT > 0) { this.attackT -= dt; const k = 1 - this.attackT / .35; this.armR.rotation.x = -2.6 + Math.sin(k * Math.PI) * 2.6 - (1 - k) * .2; }
    this.body.position.y = Math.abs(Math.sin(this.walkPhase)) * Math.min(1, hs / 60) * .5 + (this.swim ? -4 : 0);
    this.body.rotation.x = this.swim ? .9 : Math.min(.25, hs / 500);
    let dy = this.facing - this.root.rotation.y; dy = Math.atan2(Math.sin(dy), Math.cos(dy));
    this.root.rotation.y += dy * Math.min(1, dt * 12);
    this.root.position.copy(this.pos);
    if (this.hurtT > 0) { this.hurtT -= dt; this.root.visible = Math.floor(this.hurtT * 20) % 2 === 0; } else this.root.visible = true;
  }
  attack() { if (this.attackT > 0) return false; this.attackT = .35; return true; }
  damage(n, silent) { if (!silent && this.hurtT > 0) return; this.hp = Math.max(0, this.hp - n); if (!silent) this.hurtT = .6; }
}

export class ThirdPersonCam {
  constructor(camera) { this.cam = camera; this.yaw = Math.PI; this.pitch = -.18; this.dist = 42; this.cur = new THREE.Vector3(); this.first = true; }
  update(dt, p) {
    this.pitch = clamp(this.pitch, -1.2, .5);
    const target = new THREE.Vector3(p.pos.x, p.pos.y + 9, p.pos.z);
    const off = new THREE.Vector3(Math.sin(this.yaw) * Math.cos(this.pitch), -Math.sin(this.pitch), Math.cos(this.yaw) * Math.cos(this.pitch)).multiplyScalar(this.dist);
    const shoulder = new THREE.Vector3(Math.cos(this.yaw), 0, -Math.sin(this.yaw)).multiplyScalar(5);
    const want = target.clone().add(off).add(shoulder);
    const fr = rayFrac(target, want);
    want.lerpVectors(target, want, Math.max(.12, fr));
    const gy = groundY(want.x, want.z) + 3; if (want.y < gy) want.y = gy;
    if (this.first) { this.cur.copy(want); this.first = false; }
    this.cur.lerp(want, 1 - Math.exp(-dt * 14));
    this.cam.position.copy(this.cur);
    this.cam.lookAt(target.x + shoulder.x * .6, target.y + 1, target.z + shoulder.z * .6);
  }
}

export class Input {
  constructor(dom, cam) {
    this.keys = {}; this.moveX = 0; this.moveY = 0; this.sprint = false; this.jump = false; this.attack = false; this.joyFull = false; this.cam = cam;
    this.onPause = () => {};
    addEventListener('keydown', e => { this.keys[e.code] = true; if (e.code === 'Space') { this.jump = true; e.preventDefault(); } if (e.code === 'Escape' || e.code === 'KeyP') this.onPause(); if (e.code === 'KeyF') this.attack = true; });
    addEventListener('keyup', e => { this.keys[e.code] = false; });
    dom.addEventListener('mousedown', e => { if (IS_MOBILE) return; if (document.pointerLockElement !== dom) dom.requestPointerLock?.(); else if (e.button === 0) this.attack = true; });
    addEventListener('mousemove', e => { if (document.pointerLockElement === dom) { cam.yaw -= e.movementX * .0025; cam.pitch -= e.movementY * .0022; } });
    // touch
    const joy = document.getElementById('joy'), knob = document.getElementById('knob');
    let joyId = null, lookId = null, jx = 0, jy = 0, lx = 0, ly = 0;
    dom.addEventListener('touchstart', e => {
      for (const t of e.changedTouches) {
        if (t.clientX < innerWidth * .45 && joyId === null) { joyId = t.identifier; jx = t.clientX; jy = t.clientY; joy.style.display = 'block'; joy.style.left = (jx - 60) + 'px'; joy.style.top = (jy - 60) + 'px'; knob.style.transform = 'translate(0,0)'; }
        else if (lookId === null) { lookId = t.identifier; lx = t.clientX; ly = t.clientY; }
      }
      e.preventDefault();
    }, { passive: false });
    dom.addEventListener('touchmove', e => {
      for (const t of e.changedTouches) {
        if (t.identifier === joyId) { let dx = t.clientX - jx, dy = t.clientY - jy; const d = Math.hypot(dx, dy), m = 55; if (d > m) { dx *= m / d; dy *= m / d; } this.moveX = dx / m; this.moveY = -dy / m; this.joyFull = d > m * .95; knob.style.transform = `translate(${dx}px,${dy}px)`; }
        if (t.identifier === lookId) { cam.yaw -= (t.clientX - lx) * .006; cam.pitch -= (t.clientY - ly) * .005; lx = t.clientX; ly = t.clientY; }
      }
      e.preventDefault();
    }, { passive: false });
    const end = e => { for (const t of e.changedTouches) { if (t.identifier === joyId) { joyId = null; this.moveX = this.moveY = 0; this.joyFull = false; joy.style.display = 'none'; } if (t.identifier === lookId) lookId = null; } };
    dom.addEventListener('touchend', end); dom.addEventListener('touchcancel', end);
    const btn = (id, f) => { const b = document.getElementById(id); b.addEventListener('touchstart', e => { f(); e.preventDefault(); e.stopPropagation(); }, { passive: false }); b.addEventListener('click', f); };
    btn('bJump', () => this.jump = true); btn('bAtk', () => this.attack = true);
    btn('bRun', () => { this.sprintToggle = !this.sprintToggle; document.getElementById('bRun').classList.toggle('on', this.sprintToggle); });
    btn('bPause', () => this.onPause());
  }
  poll() {
    if (!IS_MOBILE || Object.values(this.keys).some(Boolean)) {
      const k = this.keys;
      const y = (k.KeyW || k.ArrowUp ? 1 : 0) - (k.KeyS || k.ArrowDown ? 1 : 0), x = (k.KeyD || k.ArrowRight ? 1 : 0) - (k.KeyA || k.ArrowLeft ? 1 : 0);
      if (x || y || !IS_MOBILE) { this.moveX = x; this.moveY = y; }
      const n = Math.hypot(this.moveX, this.moveY); if (n > 1) { this.moveX /= n; this.moveY /= n; }
      this.sprint = !!(k.ShiftLeft || k.ShiftRight);
    }
    if (this.sprintToggle) this.sprint = true;
  }
  consume() { this.jump = false; this.attack = false; }
}
