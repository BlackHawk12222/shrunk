import * as THREE from 'three';
import { IS_MOBILE, std } from './util.js';
import { buildBase, streamChunks, grassUniforms, POND, Z, LAB_DOOR, waters, pickups, collected, biome, groundY } from './world.js';
import { builders, profileAt } from './props.js';
import { streamBuildings, buildAlleyAndLab, buildSkyline } from './buildings.js';
import { waterMesh, updateWater } from './water.js';
import { Player, ThirdPersonCam, Input } from './player.js';
import { Enemies } from './enemies.js';
import { cover } from './world.js';

const $ = (id) => document.getElementById(id);
const canvas = $('c');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: !IS_MOBILE, logarithmicDepthBuffer: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(devicePixelRatio, IS_MOBILE ? 1.25 : 1.5));
renderer.setSize(innerWidth, innerHeight);
renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.05;

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(62, innerWidth / innerHeight, 0.5, 700000);
addEventListener('resize', () => { renderer.setSize(innerWidth, innerHeight); camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix(); });

// ---------- sky (painted equirect) + light ----------
const sunDir = new THREE.Vector3(-0.45, 0.62, -0.64).normalize(); // late-afternoon sun over the city, ahead of you
(function sky() {
  const c = document.createElement('canvas'); c.width = 2048; c.height = 1024; const g = c.getContext('2d');
  const grd = g.createLinearGradient(0, 0, 0, 1024);
  grd.addColorStop(0, '#2f6fc0'); grd.addColorStop(0.32, '#7fb0e6'); grd.addColorStop(0.49, '#e6eef2'); grd.addColorStop(0.5, '#d9e3e8'); grd.addColorStop(1, '#8c9aa3');
  g.fillStyle = grd; g.fillRect(0, 0, 2048, 1024);
  const u = (Math.atan2(sunDir.x, -sunDir.z) / (2 * Math.PI) + 0.5) * 2048, v = (0.5 - Math.asin(sunDir.y) / Math.PI) * 1024;
  const sg = g.createRadialGradient(u, v, 0, u, v, 260); sg.addColorStop(0, 'rgba(255,250,230,1)'); sg.addColorStop(0.06, 'rgba(255,240,200,.9)'); sg.addColorStop(0.3, 'rgba(255,220,160,.25)'); sg.addColorStop(1, 'rgba(255,220,160,0)');
  g.fillStyle = sg; g.fillRect(0, 0, 2048, 1024);
  for (let i = 0; i < 26; i++) { const x = Math.random() * 2048, y = 140 + Math.random() * 300, w = 120 + Math.random() * 280; const cg = g.createRadialGradient(x, y, 0, x, y, w); cg.addColorStop(0, 'rgba(255,255,255,.55)'); cg.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = cg; g.beginPath(); g.ellipse(x, y, w, w * .3, 0, 0, 7); g.fill(); }
  const t = new THREE.CanvasTexture(c); t.mapping = THREE.EquirectangularReflectionMapping; t.colorSpace = THREE.SRGBColorSpace;
  scene.background = t;
  const pm = new THREE.PMREMGenerator(renderer); scene.environment = pm.fromEquirectangular(t).texture; scene.environmentIntensity = 0.6;
})();
scene.fog = new THREE.Fog('#d6e2ea', 3000, 320000);
scene.add(new THREE.HemisphereLight('#cfe3ff', '#4a5a3a', 0.9));
const sun = new THREE.DirectionalLight('#fff1d6', 3.2);
sun.castShadow = true; sun.shadow.mapSize.set(IS_MOBILE ? 1024 : 2048, IS_MOBILE ? 1024 : 2048);
const S = 420; Object.assign(sun.shadow.camera, { left: -S, right: S, top: S, bottom: -S, near: 10, far: 9000 });
sun.shadow.bias = -0.0004; sun.shadow.normalBias = 0.6;
scene.add(sun, sun.target);

// ---------- world ----------
const _t0 = performance.now(); const _lg = (m) => console.log('[t]', m, Math.round(performance.now() - _t0));
buildBase(scene); _lg('base'); buildSkyline(scene); _lg('sky'); buildAlleyAndLab(scene, cover, waters); _lg('lab');
const pond = waterMesh(POND.r * 1.08, 2); pond.position.set(POND.x, POND.level, POND.z); scene.add(pond);
waters.add({ x: POND.x, z: POND.z, r: POND.r * 1.05, level: POND.level });
// dust motes drifting in the sunbeams
const motes = (() => {
  const n = IS_MOBILE ? 250 : 600, p = new Float32Array(n * 3);
  for (let i = 0; i < n * 3; i++) p[i] = (Math.random() - .5) * 500;
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(p, 3));
  const m = new THREE.Points(g, new THREE.PointsMaterial({ color: '#fff6dd', size: 0.9, transparent: true, opacity: .7, depthWrite: false }));
  m.frustumCulled = false; scene.add(m); return m;
})();
// toothpick spear pickup near the start
const spearMesh = new THREE.Mesh(new THREE.CylinderGeometry(.6, .9, 30, 6), std('#d9b77e')); spearMesh.rotation.z = Math.PI / 2; spearMesh.castShadow = true;
const spearPos = new THREE.Vector3(30, 0, -650); spearPos.y = groundY(spearPos.x, spearPos.z) + 3; spearMesh.position.copy(spearPos); scene.add(spearMesh);
const spearGlow = new THREE.PointLight('#ffe8a0', 1.5, 80); spearGlow.position.copy(spearPos).add(new THREE.Vector3(0, 10, 0)); scene.add(spearGlow);

// ---------- HUD ----------
let shakeAmt = 0, warnText = '', toastT = 0;
const hud = {
  flash() { $('flash').style.opacity = .55; setTimeout(() => $('flash').style.opacity = 0, 120); },
  toast(t) { $('toast').textContent = t; $('toast').style.opacity = 1; toastT = 2.2; },
  shake(a) { shakeAmt = Math.max(shakeAmt, a); },
};
const warn = (t) => { warnText = t; };

const player = new Player(scene);
const cam = new ThirdPersonCam(camera); cam.yaw = 0;
const input = new Input(canvas, cam);
const enemies = new Enemies(scene, hud);

const CPS = [
  { z: 0, x: 0, name: 'Central Park lawn' }, { z: -8300, x: 0, name: 'Central Park S sidewalk' },
  { z: -12700, x: 0, name: 'W 59th St (street)' }, { z: -22400, x: 0, name: 'North sidewalk' }, { z: -26400, x: 0, name: 'The alley' },
];
let cp = 0, state = 'title', time = 0, runTime = 0, lastFlavor = '', flavorT = 0, streamT = 0;

function setScreen(id) { for (const s of ['title', 'pause', 'dead', 'win']) $(s).style.display = s === id ? 'flex' : 'none'; $('hud').style.display = id ? 'none' : 'block'; $('touch').style.display = !id && IS_MOBILE ? 'block' : 'none'; }
function start() {
  player.respawn(new THREE.Vector3(0, 0, -200)); cam.yaw = 0; cam.pitch = -.18; cam.first = true; cp = 0; runTime = 0; enemies.reset();
  stream(true); setScreen(null); state = 'play';
}
function respawn() { const c = CPS[cp]; player.respawn(new THREE.Vector3(c.x, 0, c.z - 200)); cam.first = true; enemies.reset(); stream(true); setScreen(null); state = 'play'; }
$('playBtn').onclick = start; $('againBtn').onclick = start; $('respawnBtn').onclick = respawn; $('resumeBtn').onclick = () => { setScreen(null); state = 'play'; };
input.onPause = () => { if (state === 'play') { state = 'pause'; setScreen('pause'); document.exitPointerLock?.(); } else if (state === 'pause') { setScreen(null); state = 'play'; } };

function stream(force) { streamChunks(scene, player.pos, builders); streamBuildings(scene, player.pos, cover); }

function flavorFor(p) {
  const b = biome(p.z, p.x);
  if (b === 'park') return Math.hypot(p.x - POND.x, p.z - POND.z) < POND.r * 1.6 ? 'Central Park, by the pond' : 'Central Park, the lawn (to you, a jungle)';
  if (b === 'street') return 'Crossing W 59th St (watch out for feet!)';
  if (b === 'alley') return 'A narrow alley. The lab door is just ahead…';
  return profileAt(p.x, b).text;
}

const clock = new THREE.Clock();
function frame() {
  requestAnimationFrame(frame);
  const dt = Math.min(clock.getDelta(), 0.05); time += dt;
  grassUniforms.uTime.value = time; updateWater(time, sunDir);
  if (state === 'play') {
    runTime += dt; warnText = '';
    input.poll();
    player.update(dt, input, cam.yaw);
    if (input.attack && player.attack()) enemies.hit(player);
    enemies.update(dt, time, player, warn);
    input.consume();
    streamT -= dt; if (streamT <= 0) { streamT = .3; stream(); }
    // pickups
    for (const [id, pk] of pickups) {
      if (!pk.mesh.parent) continue;
      pk.mesh.rotation.y += dt * 1.5;
      if (Math.abs(pk.x - player.pos.x) < 9 && Math.abs(pk.z - player.pos.z) < 9 && Math.abs(pk.y - player.pos.y) < 14) {
        const heal = pk.kind === 'droplet' ? 15 : 10; player.hp = Math.min(100, player.hp + heal);
        if (pk.kind === 'droplet') player.air = 100;
        hud.toast(pk.kind === 'droplet' ? `Dew drop +${heal} HP` : `Crumb +${heal} HP`);
        collected.add(id); pk.mesh.parent.remove(pk.mesh); pickups.delete(id);
      }
    }
    if (!player.hasSpear && player.pos.distanceTo(spearPos) < 16) { player.hasSpear = true; player.spear.visible = true; scene.remove(spearMesh, spearGlow); hud.toast('Found a toothpick spear! Double damage.'); }
    // checkpoints
    for (let i = cp + 1; i < CPS.length; i++) if (player.pos.z < CPS[i].z) { cp = i; hud.toast('Checkpoint: ' + CPS[i].name); }
    // flavor line
    const fl = flavorFor(player.pos); if (fl !== lastFlavor) { lastFlavor = fl; flavorT = 4.5; $('flavor').textContent = fl; }
    flavorT -= dt; $('flavor').style.opacity = flavorT > 0 ? Math.min(1, flavorT) : 0;
    // HUD
    $('hp').style.width = player.hp + '%'; $('st').style.width = player.stamina + '%';
    $('airw').style.display = player.air < 99 ? 'block' : 'none'; $('air').style.width = player.air + '%';
    $('warn').textContent = warnText; $('warn').style.opacity = warnText ? 1 : 0;
    toastT -= dt; if (toastT < 0) $('toast').style.opacity = 0;
    const dx = LAB_DOOR.x - player.pos.x, dz = LAB_DOOR.z - player.pos.z, d = Math.hypot(dx, dz);
    const fx = -Math.sin(cam.yaw), fz = -Math.cos(cam.yaw);
    const ang = Math.atan2(fx * dz - fz * dx, fx * dx + fz * dz);
    $('arrow').style.transform = `rotate(${ang}rad)`;
    $('dist').textContent = `${(d / 1000).toFixed(1)} m to Lab · feels like ${(d * 0.000175).toFixed(1)} km`;
    const mm = Math.floor(runTime / 60), ss = Math.floor(runTime % 60); $('timer').textContent = `${mm}:${ss.toString().padStart(2, '0')}`;
    if (player.hp <= 0) { state = 'dead'; setScreen('dead'); document.exitPointerLock?.(); }
    if (player.pos.z < Z.LAB + 260 && Math.abs(player.pos.x) < 520) { state = 'win'; $('winTime').textContent = `${mm}:${ss.toString().padStart(2, '0')}`; setScreen('win'); document.exitPointerLock?.(); }
  } else if (state === 'title') {
    // slow orbit for the title backdrop
    player.update(dt, { moveX: 0, moveY: 0 }, cam.yaw); cam.yaw += dt * .08;
    streamT -= dt; if (streamT <= 0) { streamT = 1; stream(); }
  }
  cam.update(dt, player);
  if (shakeAmt > 0) { camera.position.x += (Math.random() - .5) * shakeAmt * 8; camera.position.y += (Math.random() - .5) * shakeAmt * 8; shakeAmt = Math.max(0, shakeAmt - dt); }
  grassUniforms.uCam.value.copy(camera.position);
  // sun + shadows follow the player
  sun.position.copy(player.pos).addScaledVector(sunDir, 4000); sun.target.position.copy(player.pos);
  // motes stay around the camera
  motes.position.set(Math.floor(camera.position.x / 500) * 500, camera.position.y, Math.floor(camera.position.z / 500) * 500);
  motes.rotation.y = time * .01; motes.position.y += Math.sin(time * .3) * 5;
  renderer.render(scene, camera); fpsN++; if (!window.__r1) { window.__r1 = 1; _lg('first render'); }
}
window.__snap = () => { cam.update(0.05, player); renderer.render(scene, camera); return canvas.toDataURL('image/jpeg', .85); };
window.__dbg = { player, camera, cam };
window.__stop = () => { state = 'test'; };
window.__tp = (x, z) => { player.respawn(new THREE.Vector3(x, 0, z)); cam.first = true; stream(true); };
let fpsN = 0, fpsT = 0; setInterval(() => { window.__fps = fpsN; fpsN = 0; }, 1000);
setScreen('title'); player.respawn(new THREE.Vector3(0, 0, -200)); _lg('pre-stream'); stream(true); _lg('stream');
$('loading').style.display = 'none';
frame();
