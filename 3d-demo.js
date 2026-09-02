/* 跨坑复原 · 3D 碎片拖拽拼合 Demo
   自包含：Three.js 本地 bundle + GLB base64 内嵌（小工具沙箱合规路线）
   玩法：8 块碎片环绕悬浮 → 拖动每块回中心归位（吸附+金光+叮）→ 全部归位金光爆发
   视角设计：相机固定正前方永不移动；复原后拖动旋转的是面具本身 → 永不出画 */
'use strict';

const $ = id => document.getElementById(id);
const canvas = $('stage');

/* ---------- 场景 ---------- */
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.localClippingEnabled = true;
renderer.outputColorSpace = THREE.SRGBColorSpace;

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x0d0f0e);
scene.fog = new THREE.Fog(0x0d0f0e, 5.5, 11);

const camera = new THREE.PerspectiveCamera(35, 1, 0.1, 50);
/* 相机只沿 z 轴推拉（view.dist），永远看向原点 */
const view = { dist: 4.6, targetDist: 4.6, rotY: 0, rotX: 0, spinning: false, lastX: 0, lastY: 0, auto: false };
camera.position.set(0, 0.2, view.dist);
camera.lookAt(0, 0, 0);

scene.add(new THREE.AmbientLight(0x4a5258, 1.3));
const key = new THREE.DirectionalLight(0xf0d48a, 2.0); key.position.set(2, 3, 2); scene.add(key);
const front = new THREE.DirectionalLight(0xd8cfa8, 1.1); front.position.set(0, 0.5, 6); scene.add(front);
const rim = new THREE.PointLight(0x3d7a68, 12, 20); rim.position.set(-3, 1, -2.5); scene.add(rim);

/* 背景星尘 */
(function stars() {
  const n = 260, pos = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    const r = 5.5 + Math.random() * 3, a = Math.random() * Math.PI * 2, y = (Math.random() - 0.5) * 7;
    pos[i * 3] = Math.cos(a) * r; pos[i * 3 + 1] = y; pos[i * 3 + 2] = Math.sin(a) * r;
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const m = new THREE.PointsMaterial({ color: 0xd9b25c, size: 0.015, transparent: true, opacity: 0.55 });
  const p = new THREE.Points(g, m); p.name = 'stars'; scene.add(p);
})();

function fit() {
  const w = window.innerWidth, h = window.innerHeight;
  if (!w || !h) return;
  renderer.setSize(w, h, false);
  camera.aspect = w / h; camera.updateProjectionMatrix();
}
window.addEventListener('resize', fit); fit();

/* ---------- 音效（Web Audio 合成，无音频文件） ---------- */
let AC = null;
function audioCtx() {
  if (!AC) { try { AC = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { return null; } }
  if (AC && AC.state === 'suspended') AC.resume();
  return AC;
}
function ding(freq) {
  const a = audioCtx(); if (!a) return;
  const o = a.createOscillator(), g = a.createGain();
  o.type = 'sine'; o.frequency.value = freq || 1240;
  g.gain.setValueAtTime(0.001, a.currentTime);
  g.gain.exponentialRampToValueAtTime(0.14, a.currentTime + 0.012);
  g.gain.exponentialRampToValueAtTime(0.0001, a.currentTime + 0.5);
  o.connect(g).connect(a.destination); o.start(); o.stop(a.currentTime + 0.55);
}
function gong() {
  const a = audioCtx(); if (!a) return;
  [82, 123, 164].forEach((f, i) => {
    const o = a.createOscillator(), g = a.createGain();
    o.type = 'sine'; o.frequency.value = f;
    g.gain.setValueAtTime(0.001, a.currentTime);
    g.gain.exponentialRampToValueAtTime(0.16 / (i + 1), a.currentTime + 0.03);
    g.gain.exponentialRampToValueAtTime(0.0001, a.currentTime + 2.2);
    o.connect(g).connect(a.destination); o.start(); o.stop(a.currentTime + 2.3);
  });
}

/* ---------- 模型加载与碎片化 ---------- */
const state = { phase: 'loading', shards: [], full: null, particles: [], lockedCount: 0, fullPulseT0: 0 };
const SECTORS = 4, LAYERS = 2;
const SNAP_R = 0.4;
const SNAP_MS = 200;

new GLTFLoader().load('./assets/models/mask.glb', gltf => {
  const root = gltf.scene;
  const box = new THREE.Box3().setFromObject(root);
  const size = box.getSize(new THREE.Vector3()), center = box.getCenter(new THREE.Vector3());
  const scale = 1.5 / Math.max(size.x, size.y, size.z);
  root.position.sub(center).multiplyScalar(scale);
  root.scale.setScalar(scale);

  const holder = new THREE.Group();
  holder.add(root); scene.add(holder);
  state.full = holder;
  holder.visible = false;
  root.updateMatrixWorld(true);

  let srcMesh = null;
  root.traverse(o => { if (o.isMesh && !srcMesh) srcMesh = o; });
  srcMesh.material.side = THREE.DoubleSide;

  /* 屏幕平面环形散布：按视口自适应，8 块全部保证在画面内 */
  const halfH = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) * view.dist;
  const halfW = halfH * camera.aspect;
  const rx = Math.max(0.7, Math.min(1.25, halfW - 1.0));
  const ry = Math.max(0.45, Math.min(0.68, halfH - 1.0));

  for (let s = 0; s < SECTORS; s++) {
    for (let l = 0; l < LAYERS; l++) {
      const a = s * Math.PI / 2 + Math.PI / 4;
      const localPlanes = [
        new THREE.Plane(new THREE.Vector3(-Math.sin(a - Math.PI / 4), 0, Math.cos(a - Math.PI / 4)), 0.02),
        new THREE.Plane(new THREE.Vector3(Math.sin(a + Math.PI / 4), 0, -Math.cos(a + Math.PI / 4)), 0.02),
        new THREE.Plane(new THREE.Vector3(0, l === 0 ? 1 : -1, 0), 0.02)
      ];
      const worldPlanes = localPlanes.map(() => new THREE.Plane());

      const wrap = new THREE.Group();
      const m = srcMesh.clone();
      m.material = srcMesh.material.clone();
      m.material.clippingPlanes = worldPlanes;
      m.matrixAutoUpdate = false;
      m.matrix.copy(srcMesh.matrixWorld);
      wrap.add(m);
      scene.add(wrap);

      /* 8 等分环形：每块独立槽位，不重叠 */
      const slot = Math.PI / 8 + (s * LAYERS + l) * Math.PI / 4;
      const jx = (Math.random() - 0.5) * 0.08, jy = (Math.random() - 0.5) * 0.08;
      state.shards.push({
        wrap, mesh: m, localPlanes, worldPlanes,
        status: 'free',
        basePos: new THREE.Vector3(
          Math.cos(slot) * rx + jx,
          Math.sin(slot) * ry * 1.15 + jy,
          (Math.random() - 0.5) * 0.2),
        baseRot: new THREE.Euler((Math.random() - 0.5) * 0.24, (Math.random() - 0.5) * 0.3, (Math.random() - 0.5) * 0.24),
        seed: Math.random() * Math.PI * 2,
        snapT0: 0, snapFromP: new THREE.Vector3(), snapFromR: new THREE.Euler(),
        pulseT0: 0
      });
    }
  }
  state.phase = 'playing';
  $('loading').style.display = 'none';
  updateHud();
}, undefined, err => {
  $('loading').textContent = '模型加载失败';
  console.error(err);
});

function syncPlanes(sh) {
  sh.wrap.updateMatrixWorld();
  for (let i = 0; i < sh.localPlanes.length; i++) {
    sh.worldPlanes[i].copy(sh.localPlanes[i]).applyMatrix4(sh.wrap.matrixWorld);
  }
}

function updateHud() {
  if (state.phase === 'done') return;
  $('hud-title').textContent = '六坑之中 · 碎片沉睡';
  $('hud-sub').textContent = '拖动碎片，拼回它的位置 · 已复原 ' + state.lockedCount + ' / ' + state.shards.length;
}

/* ---------- 交互：playing 拖碎片 / done 转面具 ---------- */
const ray = new THREE.Raycaster();
const ndcV = new THREE.Vector2();
const dragPlane = new THREE.Plane();
const tmpV = new THREE.Vector3();
let dragging = null;
const dragOffset = new THREE.Vector3();

function toNdc(e) {
  const r = canvas.getBoundingClientRect();
  ndcV.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
}

canvas.addEventListener('pointerdown', e => {
  audioCtx();
  if (state.phase === 'playing') {
    toNdc(e); ray.setFromCamera(ndcV, camera);
    const frees = state.shards.filter(s => s.status === 'free');
    const hits = ray.intersectObjects(frees.map(s => s.mesh), false);
    for (const h of hits) {
      const sh = frees.find(s => s.mesh === h.object);
      if (sh && sh.worldPlanes.every(p => p.distanceToPoint(h.point) > -0.03)) {
        dragging = sh; sh.status = 'drag';
        try { canvas.setPointerCapture(e.pointerId); } catch (_) {}
        dragPlane.set(new THREE.Vector3(0, 0, 1), -sh.wrap.position.z); /* 沿块所在 z 平面拖动 */
        if (ray.ray.intersectPlane(dragPlane, tmpV)) dragOffset.copy(sh.wrap.position).sub(tmpV);
        canvas.style.cursor = 'grabbing';
        return;
      }
    }
  } else if (state.phase === 'done') {
    view.spinning = true; view.lastX = e.clientX; view.lastY = e.clientY;
    try { canvas.setPointerCapture(e.pointerId); } catch (_) {}
    canvas.style.cursor = 'grabbing';
  }
});

canvas.addEventListener('pointermove', e => {
  if (dragging) {
    toNdc(e); ray.setFromCamera(ndcV, camera);
    if (ray.ray.intersectPlane(dragPlane, tmpV)) {
      dragging.wrap.position.copy(tmpV.add(dragOffset));
    }
  } else if (view.spinning) {
    view.rotY += (e.clientX - view.lastX) * 0.006;
    view.rotX = Math.max(-0.5, Math.min(0.65, view.rotX + (e.clientY - view.lastY) * 0.004));
    view.lastX = e.clientX; view.lastY = e.clientY;
  }
});

function endPointer() {
  canvas.style.cursor = '';
  view.spinning = false;
  if (!dragging) return;
  const sh = dragging; dragging = null;
  if (sh.wrap.position.length() < SNAP_R) startSnap(sh);
  else { sh.status = 'free'; sh.basePos.copy(sh.wrap.position); }
}
window.addEventListener('pointerup', endPointer);
window.addEventListener('pointercancel', endPointer);

/* 滚轮 / 触摸板：推拉距离（clamp，永远看向原点） */
canvas.addEventListener('wheel', e => {
  e.preventDefault();
  view.targetDist = Math.max(2.6, Math.min(4.6, view.targetDist + e.deltaY * 0.0025));
}, { passive: false });

function startSnap(sh, delay) {
  sh.status = 'snapping';
  sh.snapT0 = performance.now() + (delay || 0);
  sh.snapFromP.copy(sh.wrap.position);
  sh.snapFromR.copy(sh.wrap.rotation);
}

function onLocked(sh) {
  sh.status = 'locked';
  sh.wrap.position.set(0, 0, 0);
  sh.wrap.rotation.set(0, 0, 0);
  syncPlanes(sh);
  state.lockedCount++;
  sh.mesh.material.emissive = new THREE.Color(0xd9b25c);
  sh.mesh.material.emissiveIntensity = 1.1;
  sh.pulseT0 = performance.now();
  burst(sh.wrap.position, 50, 0.018);
  ding(980 + state.lockedCount * 60);
  if (navigator.vibrate) navigator.vibrate(35);
  updateHud();
  if (state.lockedCount >= state.shards.length) setTimeout(finish, 260);
}

/* ---------- 金尘粒子 ---------- */
function burst(origin, count, speed) {
  const n = count, pos = new Float32Array(n * 3), vel = [];
  for (let i = 0; i < n; i++) {
    pos[i * 3] = origin.x; pos[i * 3 + 1] = origin.y; pos[i * 3 + 2] = origin.z;
    vel.push(new THREE.Vector3(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5)
      .normalize().multiplyScalar(speed * (0.5 + Math.random())));
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const m = new THREE.PointsMaterial({ color: 0xf0d48a, size: 0.028, transparent: true, opacity: 1 });
  const obj = new THREE.Points(g, m);
  scene.add(obj);
  state.particles.push({ obj, vel, t0: performance.now(), life: 1400 });
}

/* ---------- 完成 ---------- */
function finish() {
  if (state.phase === 'done') return;
  state.phase = 'done';
  state.shards.forEach(sh => { sh.wrap.visible = false; });
  state.full.visible = true;
  state.full.traverse(o => {
    if (o.isMesh) {
      o.material.emissive = new THREE.Color(0xd9b25c);
      o.material.emissiveIntensity = 1.5;
    }
  });
  state.fullPulseT0 = performance.now();
  burst(new THREE.Vector3(0, 0, 0), 260, 0.03);
  gong();
  if (navigator.vibrate) navigator.vibrate([60, 40, 130]);
  view.targetDist = 3.3;  /* 仪式感：缓缓推近 */
  view.rotY = 0; view.rotX = 0; view.auto = true;
  $('hud-title').textContent = '纵目面具 · 跨坑复原';
  $('hud-sub').textContent = '裂痕即金 · 拖动旋转，滚轮缩放';
  $('btn-auto').style.display = 'none';
}

/* ---------- 主循环 ---------- */
const easeOutCubic = t => 1 - Math.pow(1 - t, 3);

function tick(now) {
  requestAnimationFrame(tick);

  const stars = scene.getObjectByName('stars');
  if (stars) stars.rotation.y = now * 0.00002;

  /* 相机：只做 z 轴推拉，永远看原点 */
  view.dist += (view.targetDist - view.dist) * 0.07;
  camera.position.set(0, state.phase === 'done' ? 0.25 : 0.2, view.dist);
  camera.lookAt(0, 0, 0);

  if (state.phase === 'playing') {
    state.shards.forEach(sh => {
      if (sh.status === 'free') {
        const f = Math.sin(now * 0.001 + sh.seed) * 0.025;
        sh.wrap.position.set(sh.basePos.x, sh.basePos.y + f, sh.basePos.z);
        sh.wrap.rotation.set(
          sh.baseRot.x + Math.sin(now * 0.0006 + sh.seed) * 0.03,
          sh.baseRot.y + Math.sin(now * 0.0004 + sh.seed * 2) * 0.05,
          sh.baseRot.z);
      } else if (sh.status === 'snapping') {
        const k = Math.min(1, Math.max(0, (now - sh.snapT0) / SNAP_MS));
        const e = easeOutCubic(k);
        sh.wrap.position.lerpVectors(sh.snapFromP, tmpV.set(0, 0, 0), e);
        sh.wrap.rotation.set(sh.snapFromR.x * (1 - e), sh.snapFromR.y * (1 - e), sh.snapFromR.z * (1 - e));
        if (k >= 1) { onLocked(sh); return; }
      }
      syncPlanes(sh);
      if (sh.pulseT0) {
        const k = Math.min(1, (now - sh.pulseT0) / 700);
        sh.mesh.material.emissiveIntensity = 1.1 * (1 - k);
        if (k >= 1) sh.pulseT0 = 0;
      }
    });
  } else if (state.phase === 'done') {
    if (!view.spinning && view.auto) view.rotY += 0.0035;
    state.full.rotation.set(view.rotX, view.rotY, 0);
    if (state.fullPulseT0) {
      const k = Math.min(1, (now - state.fullPulseT0) / 1700);
      const it = 1.5 * (1 - k) + 0.12;
      state.full.traverse(o => { if (o.isMesh) o.material.emissiveIntensity = it; });
      if (k >= 1) state.fullPulseT0 = 0;
    }
  }

  for (let pi = state.particles.length - 1; pi >= 0; pi--) {
    const p = state.particles[pi];
    const k = (now - p.t0) / p.life;
    const arr = p.obj.geometry.attributes.position.array;
    for (let i = 0; i < p.vel.length; i++) {
      arr[i * 3] += p.vel[i].x; arr[i * 3 + 1] += p.vel[i].y; arr[i * 3 + 2] += p.vel[i].z;
    }
    p.obj.geometry.attributes.position.needsUpdate = true;
    p.obj.material.opacity = Math.max(0, 1 - k);
    if (k >= 1) { scene.remove(p.obj); state.particles.splice(pi, 1); }
  }

  renderer.render(scene, camera);
}
requestAnimationFrame(tick);

/* ---------- 一键复原（演示捷径） ---------- */
$('btn-auto').addEventListener('click', () => {
  if (state.phase !== 'playing') return;
  let d = 0;
  state.shards.forEach(sh => {
    if (sh.status === 'free' || sh.status === 'drag') { startSnap(sh, d); d += 130; }
  });
  if (dragging) { dragging = null; canvas.style.cursor = ''; }
});
