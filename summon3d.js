/* 结印的奖励画面：碎片飞回 → 面具复原 → 金光悬浮
   叠在摄像头画面之上的透明 3D 层。对外只暴露三个动作：
     Summon.init() / Summon.landShard(i) / Summon.complete() */
'use strict';

window.Summon = (function () {

let renderer, scene, camera, shards = [], full = null, ready = false;
let bursts = [], t0 = 0, completed = false, completeT0 = 0;

const SHARD_N = 8;

function init(canvas) {
  if (ready) return true;
  if (!window.THREE || !window.MASK_GLB_B64) return false;

  renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.localClippingEnabled = true;
  renderer.outputColorSpace = THREE.SRGBColorSpace;

  scene = new THREE.Scene();
  camera = new THREE.PerspectiveCamera(38, 1, 0.1, 60);
  camera.position.set(0, 0, 3.6);
  camera.lookAt(0, 0, 0);

  scene.add(new THREE.AmbientLight(0x5a6068, 1.2));
  const key = new THREE.DirectionalLight(0xf0d48a, 2.1); key.position.set(2, 3, 3); scene.add(key);
  const rim = new THREE.PointLight(0x3d7a68, 10, 20); rim.position.set(-3, 1, -2); scene.add(rim);

  const bin = atob(window.MASK_GLB_B64);
  const buf = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) buf[i] = bin.charCodeAt(i);

  new GLTFLoader().parse(buf.buffer, '', gltf => {
    const root = gltf.scene;
    const box = new THREE.Box3().setFromObject(root);
    const size = box.getSize(new THREE.Vector3()), center = box.getCenter(new THREE.Vector3());
    root.position.sub(center).multiplyScalar(1.45 / Math.max(size.x, size.y, size.z));
    root.scale.setScalar(1.45 / Math.max(size.x, size.y, size.z));

    full = new THREE.Group();
    full.add(root); scene.add(full);
    full.visible = false;
    root.updateMatrixWorld(true);

    let src = null;
    root.traverse(o => { if (o.isMesh && !src) src = o; });
    src.material.side = THREE.DoubleSide;

    /* 8 块：4 扇区 × 上下 2 层，用世界空间裁剪面切出 */
    for (let s = 0; s < 4; s++) {
      for (let l = 0; l < 2; l++) {
        const ang = s * Math.PI / 2 + Math.PI / 4;
        const local = [
          new THREE.Plane(new THREE.Vector3(-Math.sin(ang - Math.PI / 4), 0, Math.cos(ang - Math.PI / 4)), 0.02),
          new THREE.Plane(new THREE.Vector3(Math.sin(ang + Math.PI / 4), 0, -Math.cos(ang + Math.PI / 4)), 0.02),
          new THREE.Plane(new THREE.Vector3(0, l === 0 ? 1 : -1, 0), 0.02)
        ];
        const world = local.map(() => new THREE.Plane());

        const wrap = new THREE.Group();
        const m = src.clone();
        m.material = src.material.clone();
        m.material.clippingPlanes = world;
        m.material.transparent = true;
        m.material.opacity = 0;
        m.matrixAutoUpdate = false;
        m.matrix.copy(src.matrixWorld);
        wrap.add(m);
        wrap.visible = false;
        scene.add(wrap);

        /* 出发点：画面外的黑暗中，各自一个方向 */
        const a2 = (s * 2 + l) * Math.PI / 4 + 0.3;
        shards.push({
          wrap, mesh: m, local, world,
          from: new THREE.Vector3(Math.cos(a2) * 4.2, Math.sin(a2) * 3.0, -2.5 - Math.random() * 2),
          state: 'hidden', tStart: 0
        });
      }
    }
    ready = true;
  }, e => console.error('[summon3d] glb', e));

  fit();
  window.addEventListener('resize', fit);
  t0 = performance.now();
  requestAnimationFrame(tick);
  return true;
}

function fit() {
  if (!renderer) return;
  const w = window.innerWidth, h = window.innerHeight;
  if (!w || !h) return;
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
}

function syncPlanes(sh) {
  sh.wrap.updateMatrixWorld();
  for (let i = 0; i < sh.local.length; i++) {
    sh.world[i].copy(sh.local[i]).applyMatrix4(sh.wrap.matrixWorld);
  }
}

/* 第 i 块碎片飞回并嵌入。ghost=true 表示"研究性复原"——
   玩家没结出来的部分，以半透明金色推测形态补上（真实文物复原件正是如此） */
function landShard(i, ghost) {
  if (!ready || i >= shards.length) return;
  const sh = shards[i];
  if (sh.state !== 'hidden') return;
  sh.ghost = !!ghost;
  sh.state = 'flying';
  sh.tStart = performance.now();
  sh.wrap.visible = true;
  sh.wrap.position.copy(sh.from);
  sh.wrap.rotation.set(Math.random() * 3, Math.random() * 3, Math.random() * 3);
  if (ghost) {
    sh.mesh.material.color = new THREE.Color(0xd9b25c);
    sh.mesh.material.emissive = new THREE.Color(0x8a6a28);
  }
}

/* 把所有未归位的碎片以"推测"形态补齐，返回补了几块 */
function fillMissing() {
  if (!ready) return 0;
  let n = 0, delay = 0;
  shards.forEach((sh, i) => {
    if (sh.state === 'hidden') {
      setTimeout(() => landShard(i, true), delay);
      delay += 220;
      n++;
    }
  });
  return n;
}

function complete() {
  if (!ready || completed) return;
  completed = true;
  completeT0 = performance.now();
  shards.forEach(sh => { sh.wrap.visible = false; });
  full.visible = true;
  full.traverse(o => {
    if (o.isMesh) { o.material.emissive = new THREE.Color(0xd9b25c); o.material.emissiveIntensity = 2.2; }
  });
  addBurst(new THREE.Vector3(0, 0, 0), 300, 0.036);
}

function addBurst(origin, n, speed) {
  const pos = new Float32Array(n * 3), vel = [];
  for (let i = 0; i < n; i++) {
    pos[i * 3] = origin.x; pos[i * 3 + 1] = origin.y; pos[i * 3 + 2] = origin.z;
    vel.push(new THREE.Vector3(Math.random() - .5, Math.random() - .5, Math.random() - .5)
      .normalize().multiplyScalar(speed * (0.5 + Math.random())));
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const obj = new THREE.Points(g, new THREE.PointsMaterial({
    color: 0xf0d48a, size: 0.03, transparent: true, opacity: 1
  }));
  scene.add(obj);
  bursts.push({ obj, vel, t0: performance.now(), life: 1500 });
}

const easeOut = t => 1 - Math.pow(1 - t, 3);
const FLY_MS = 700;

function tick(now) {
  requestAnimationFrame(tick);
  if (!renderer) return;

  if (ready) {
    shards.forEach(sh => {
      if (sh.state === 'flying') {
        const k = Math.min(1, (now - sh.tStart) / FLY_MS);
        const e = easeOut(k);
        sh.wrap.position.lerpVectors(sh.from, new THREE.Vector3(0, 0, 0), e);
        sh.wrap.rotation.set(sh.wrap.rotation.x * (1 - e * 0.22),
          sh.wrap.rotation.y * (1 - e * 0.22), sh.wrap.rotation.z * (1 - e * 0.22));
        sh.mesh.material.opacity = e;
        if (sh.ghost) sh.mesh.material.opacity = e * 0.42; /* 推测部分保持半透明 */
        if (k >= 1) {
          sh.state = 'locked';
          sh.wrap.position.set(0, 0, 0);
          sh.wrap.rotation.set(0, 0, 0);
          sh.mesh.material.opacity = sh.ghost ? 0.42 : 1;
          if (!sh.ghost) {
            sh.mesh.material.emissive = new THREE.Color(0xd9b25c);
            sh.mesh.material.emissiveIntensity = 1.6;
            sh.pulseT0 = now;
          }
          addBurst(new THREE.Vector3(0, 0, 0), sh.ghost ? 24 : 60, 0.02);
        }
        syncPlanes(sh);
      } else if (sh.state === 'locked') {
        if (sh.pulseT0) {
          const k = Math.min(1, (now - sh.pulseT0) / 800);
          sh.mesh.material.emissiveIntensity = 1.6 * (1 - k) + 0.1;
          if (k >= 1) sh.pulseT0 = 0;
        }
        syncPlanes(sh);
      }
    });

    /* 已归位的碎片整体缓慢自转，未完成时也有"活着"的感觉 */
    if (!completed) {
      const spin = (now - t0) * 0.00016;
      shards.forEach(sh => { if (sh.state === 'locked') sh.wrap.rotation.y = spin; });
    } else {
      const k = Math.min(1, (now - completeT0) / 2000);
      full.rotation.y = (now - completeT0) * 0.00042;
      full.traverse(o => {
        if (o.isMesh) o.material.emissiveIntensity = 2.2 * (1 - k) + 0.18;
      });
    }
  }

  for (let i = bursts.length - 1; i >= 0; i--) {
    const b = bursts[i];
    const k = (now - b.t0) / b.life;
    const arr = b.obj.geometry.attributes.position.array;
    for (let j = 0; j < b.vel.length; j++) {
      arr[j * 3] += b.vel[j].x; arr[j * 3 + 1] += b.vel[j].y; arr[j * 3 + 2] += b.vel[j].z;
    }
    b.obj.geometry.attributes.position.needsUpdate = true;
    b.obj.material.opacity = Math.max(0, 1 - k);
    if (k >= 1) { scene.remove(b.obj); bursts.splice(i, 1); }
  }

  renderer.render(scene, camera);
}

return {
  init, landShard, fillMissing, complete,
  get ready() { return ready; },
  get shardCount() { return SHARD_N; }
};
})();
