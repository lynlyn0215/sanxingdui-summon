/* 结印的奖励画面：碎片飞回 → 神器复原 → 定印聚气 → 金光镀金
   叠在摄像头画面之上的透明 3D 层。对外动作：
     Summon.init(canvas) / Summon.load(rite) / Summon.landShard(i, ghost)
     Summon.charge(k) / Summon.complete(rating)
   rite 结构见 seal.js 的 RITES：{ id, glb, fit, slice } */
'use strict';

window.Summon = (function () {

let renderer, scene, camera, shards = [], full = null, ready = false, rite = null;
let bursts = [], t0 = 0, completed = false, completeT0 = 0, chargeK = 0;
let ring = null, ghostObj = null, ghostPivot = null, flourish = [], anyGhost = false;
let interactive = false, birdShadows = [];
let spine = null;
const spinePoint = new THREE.Vector3();

/* 完成后要发金光的网格：完整件的所有 mesh，或（研究性复原时）亲手结成的那些碎片 */
function glowMeshes() {
  if (anyGhost) return shards.filter(sh => !sh.ghost).map(sh => sh.mesh);
  const out = []; full.traverse(o => { if (o.isMesh && o !== ghostObj) out.push(o); }); return out;
}

const SHARD_N = 8;

function init(canvas) {
  if (renderer) return true;
  if (!window.THREE) return false;

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

  /* 定印成功时扫过全屏的金色冲击环 */
  ring = new THREE.Mesh(
    new THREE.RingGeometry(0.92, 1, 64),
    new THREE.MeshBasicMaterial({ color: 0xf0d48a, transparent: true, opacity: 0, side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending, depthWrite: false })
  );
  ring.visible = false;
  scene.add(ring);

  fit();
  window.addEventListener('resize', fit);
  t0 = performance.now();
  requestAnimationFrame(tick);
  return true;
}

/* 载入一件神器：assets/models/*.glb */
function load(r) {
  rite = r;
  return new Promise((resolve, reject) => {
    new GLTFLoader().load(r.glb, gltf => { build(gltf.scene); resolve(); }, undefined,
      e => { console.error('[summon3d] glb', e); reject(e); });
  });
}

function build(root) {
  const box = new THREE.Box3().setFromObject(root);
  const size = box.getSize(new THREE.Vector3()), center = box.getCenter(new THREE.Vector3());
  const s = (rite.fit || 1.45) / Math.max(size.x, size.y, size.z);
  root.position.sub(center).multiplyScalar(s);
  root.scale.setScalar(s);

  full = new THREE.Group();
  full.add(root); scene.add(full);
  full.visible = false;
  root.updateMatrixWorld(true);

  let src = null;
  root.traverse(o => { if (o.isMesh && !src) src = o; });
  src.material.side = THREE.DoubleSide;

  /* 8 块碎片，用世界空间裁剪面切出：
       面具（扁宽）：4 扇区 × 上下 2 层
       高瘦神器（slice:'y'）：8 个水平层，自下而上依次飞回，神器像从地里长起来 */
  const tall = rite.slice === 'y';
  const H = rite.fit || 1.45;
  for (let i = 0; i < SHARD_N; i++) {
    const l = i & 1;
    const ang = (i >> 1) * Math.PI / 2 + Math.PI / 4;
    const y0 = -H / 2 + i * H / SHARD_N, y1 = y0 + H / SHARD_N;
    const local = tall ? [
      new THREE.Plane(new THREE.Vector3(0, 1, 0), -y0 + 0.004),
      new THREE.Plane(new THREE.Vector3(0, -1, 0), y1 + 0.004)
    ] : [
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

    /* 出发点：画面外的黑暗中，各自一个方向（高瘦神器：左右交替、从下方飞入） */
    const a2 = i * Math.PI / 4 + 0.3;
    shards.push({
      wrap, mesh: m, local, world,
      from: tall
        ? new THREE.Vector3((i % 2 ? 1 : -1) * 3.2, -2.4 + Math.random() * 0.8, -2.5 - Math.random() * 2)
        : new THREE.Vector3(Math.cos(a2) * 4.2, Math.sin(a2) * 3.0, -2.5 - Math.random() * 2),
      home: new THREE.Vector3(0, 0, 0),
      state: 'hidden', tStart: 0
    });
  }

  /* 大立人：手中之物已失，以半透明"推测形态"补一根（象牙 / 权杖 诸说，至今无解） */
  if (rite.id === 'figure') {
    ghostObj = new THREE.Mesh(
      new THREE.CylinderGeometry(0.02, 0.032, 0.74, 12),
      new THREE.MeshStandardMaterial({ color: 0xd9b25c, emissive: 0x8a6a28, transparent: true, opacity: 0 })
    );
    ghostObj.position.set(0.0, 0.2, 0.13);
    ghostObj.rotation.z = 0.06;
    ghostObj.visible = false;
    ghostPivot = new THREE.Group(); ghostPivot.add(ghostObj); scene.add(ghostPivot);
  }
  ready = true;
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

/* 定印按住时的聚气：k 0→1，碎片发亮抖动，金粉不断向中心汇聚 */
function manipulate({ phase, x, y, spread, tilt }) {
  if (!ready || completed) return;
  interactive = true;
  if (!spine) {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(SHARD_N * 3), 3));
    spine = new THREE.Line(geometry, new THREE.LineBasicMaterial({ color: 0xf0d48a,
      transparent: true, opacity: .65, depthTest: false }));
    scene.add(spine);
  }
  spine.visible = phase !== 'gather';
  shards.forEach((sh, i) => {
    sh.state = 'controlled';
    sh.wrap.visible = phase !== 'gather' || i === 3 || spread < .82;
    const scatter = spread * (phase === 'gather' ? 1 : .8);
    const angle = i * 2.4;
    sh.wrap.position.set((x - .5) * .65 + Math.cos(angle) * scatter * .36,
      (.5 - y) * .28 + Math.sin(angle) * scatter * .18, Math.sin(angle) * scatter * .35);
    sh.wrap.rotation.set(0, scatter * Math.sin(angle) * .22, phase === 'balance' ? -tilt : 0);
    sh.wrap.scale.setScalar(.78);
    sh.mesh.material.opacity = 1;
    sh.mesh.material.emissive.setHex(0x9f752d);
    sh.mesh.material.emissiveIntensity = phase === 'ready' ? .28 : .14 + (1 - spread) * .12;
    syncPlanes(sh);
    spinePoint.set(0, -(rite.fit / 2) + (i + .5) * rite.fit / SHARD_N, 0);
    sh.wrap.localToWorld(spinePoint);
    spine.geometry.attributes.position.setXYZ(i, spinePoint.x, spinePoint.y, spinePoint.z);
  });
  spine.geometry.attributes.position.needsUpdate = true;
  spine.frustumCulled = false;
}

function charge(k) {
  chargeK = Math.max(0, Math.min(1, k));
  if (!ready || completed) return;
  if (chargeK > 0 && Math.random() < 0.25 + chargeK * 0.5) {
    const a = Math.random() * Math.PI * 2, r = 1.6 + Math.random() * 0.8;
    addBurst(new THREE.Vector3(Math.cos(a) * r, Math.sin(a) * r * 0.7, 0.3), 3, -0.03 - chargeK * 0.02, true);
  }
}

/* rating: 0 一气呵成 / 1 稍有迟疑 / 2 结印生涩 —— 只影响金光强弱与冲击环大小 */
function complete(rating) {
  if (!ready || completed) return;
  completed = true;
  if (spine) spine.visible = false;
  completeT0 = performance.now();
  chargeK = 0;
  const power = [1, 0.72, 0.5][rating | 0] || 1;
  /* 有推测补全的碎片 → 保持碎片形态（推测部分半透明），这就是"研究性复原"的样子；
     全部亲手结成 → 换成完整件 */
  anyGhost = shards.some(sh => sh.ghost);
  if (!anyGhost) {
    shards.forEach(sh => { sh.wrap.visible = false; });
    full.visible = true;
  }
  glowMeshes().forEach(m => {
    m.material.emissive = new THREE.Color(0xd9b25c);
    m.material.emissiveIntensity = 0.55 * power;
  });
  addBurst(new THREE.Vector3(0, 0, 0), Math.round(420 * power), 0.04);
  ring.visible = true; ring.scale.setScalar(0.1); ring.material.opacity = 0.9;
  ring.userData.t0 = completeT0; ring.userData.power = power;

  /* 神树：九鸟自下而上依次点亮（三层各三只，按高度分批） */
  if (rite.id === 'tree') {
    if (interactive) {
      // 金鸟为幻想剪影，不冒充模型中已分离的文物部件。
      const geometry = new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(-.18,.07,0), new THREE.Vector3(-.07,.02,0),
        new THREE.Vector3(0,0,0), new THREE.Vector3(.07,.02,0), new THREE.Vector3(.18,.07,0)
      ]);
      for (let i = 0; i < 9; i++) {
        const bird = new THREE.Line(geometry, new THREE.LineBasicMaterial({ color: 0xffdf94,
          transparent: true, opacity: 0, depthTest: false }));
        scene.add(bird); birdShadows.push(bird);
      }
    }
    const h = rite.fit || 2.1;
    for (let i = 0; i < 9; i++) {
      const tier = Math.floor(i / 3), side = (i % 3) - 1;
      flourish.push({ at: completeT0 + 500 + i * 160,
        pos: new THREE.Vector3(side * 0.42, -h * 0.28 + tier * h * 0.27, 0.1), n: 40, speed: 0.012 });
    }
  }
  /* 大立人：手中之物以推测形态浮现 */
  if (ghostObj) { ghostObj.visible = true; ghostObj.userData.t0 = completeT0 + 1200; }
}

/* 金粉贴图：径向渐变的小圆点，避免 Points 默认的方块像素 */
let dustTex = null;
function dust() {
  if (dustTex) return dustTex;
  const c = document.createElement('canvas'); c.width = c.height = 32;
  const g = c.getContext('2d'), grd = g.createRadialGradient(16, 16, 0, 16, 16, 16);
  grd.addColorStop(0, 'rgba(255,240,200,1)'); grd.addColorStop(0.4, 'rgba(240,212,138,.8)'); grd.addColorStop(1, 'rgba(240,212,138,0)');
  g.fillStyle = grd; g.fillRect(0, 0, 32, 32);
  dustTex = new THREE.CanvasTexture(c);
  return dustTex;
}

function addBurst(origin, n, speed, inward) {
  const pos = new Float32Array(n * 3), vel = [];
  for (let i = 0; i < n; i++) {
    pos[i * 3] = origin.x; pos[i * 3 + 1] = origin.y; pos[i * 3 + 2] = origin.z;
    const v = inward
      ? origin.clone().normalize().multiplyScalar(speed * (0.8 + Math.random() * 0.4))
      : new THREE.Vector3(Math.random() - .5, Math.random() - .5, Math.random() - .5)
          .normalize().multiplyScalar(speed * (0.5 + Math.random()));
    vel.push(v);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const obj = new THREE.Points(g, new THREE.PointsMaterial({
    color: 0xf0d48a, size: inward ? 0.07 : 0.05, map: dust(), transparent: true, opacity: 1,
    blending: THREE.AdditiveBlending, depthWrite: false
  }));
  scene.add(obj);
  bursts.push({ obj, vel, t0: performance.now(), life: inward ? 1100 : 1500 });
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
        sh.wrap.position.lerpVectors(sh.from, sh.home, e);
        sh.wrap.rotation.set(sh.wrap.rotation.x * (1 - e * 0.22),
          sh.wrap.rotation.y * (1 - e * 0.22), sh.wrap.rotation.z * (1 - e * 0.22));
        sh.mesh.material.opacity = e;
        if (sh.ghost) sh.mesh.material.opacity = e * 0.42; /* 推测部分保持半透明 */
        if (k >= 1) {
          sh.state = 'locked';
          sh.wrap.position.copy(sh.home);
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
        /* 聚气：越按越亮、抖得越厉害 */
        if (chargeK > 0 && !completed) {
          sh.mesh.material.emissiveIntensity = 0.1 + chargeK * 1.4;
          const j = chargeK * 0.03;
          sh.wrap.position.set(sh.home.x + (Math.random() - .5) * j, sh.home.y + (Math.random() - .5) * j, sh.home.z);
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
      const rot = (now - completeT0) * 0.00042;
      const power = ring.userData.power || 1;
      if (anyGhost) shards.forEach(sh => { sh.wrap.rotation.y = rot; syncPlanes(sh); });
      else full.rotation.y = rot;
      if (interactive) {
        const rise = easeOut(Math.min(1, (now - completeT0) / 2000));
        full.scale.setScalar(.78 + rise * .55);
        full.position.y = rise * .22;
        full.rotation.y = .15 + rise * .25;
        camera.position.z = 3.6 + rise * .35;
        camera.lookAt(0, rise * .5, 0);
        birdShadows.forEach((bird, i) => {
          const t = (now - completeT0 - 450 - i * 140) / 1700;
          bird.material.opacity = t > 0 && t < 1 ? Math.sin(t * Math.PI) : 0;
          bird.position.set(((i % 3) - 1) * (.25 + Math.max(0,t) * .8),
            -.35 + Math.floor(i / 3) * .45 + t * .5, .2 + t * 3.3);
          bird.rotation.z = Math.sin(now * .012 + i) * .18;
          bird.scale.y = .5 + Math.abs(Math.sin(now * .014 + i));
        });
      }
      if (ghostPivot) ghostPivot.rotation.y = rot;
      glowMeshes().forEach(m => { m.material.emissiveIntensity = 0.55 * power * (1 - k) + 0.12; });
      /* 冲击环 */
      const rk = (now - ring.userData.t0) / 900;
      if (rk < 1) {
        ring.scale.setScalar(0.1 + rk * 4.2 * power);
        ring.material.opacity = 0.9 * (1 - rk);
      } else ring.visible = false;
      /* 神树九鸟点亮 */
      for (let i = flourish.length - 1; i >= 0; i--) {
        if (now >= flourish[i].at) { addBurst(flourish[i].pos, flourish[i].n, flourish[i].speed); flourish.splice(i, 1); }
      }
      /* 推测之物：呼吸式浮现 */
      if (ghostObj && ghostObj.visible && now > ghostObj.userData.t0) {
        const g = Math.min(1, (now - ghostObj.userData.t0) / 1400);
        ghostObj.material.opacity = 0.42 * g * (0.75 + 0.25 * Math.sin(now * 0.003));
      }
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
    if (k >= 1) { scene.remove(b.obj); b.obj.geometry.dispose(); b.obj.material.dispose(); bursts.splice(i, 1); }
  }

  renderer.render(scene, camera);
}

return {
  init, load, landShard, charge, complete, manipulate,
  get ready() { return ready; },
  get shardCount() { return SHARD_N; },
  get dbg() { return { renderer, scene, camera, tick }; } /* 调试：无头截图 / 虚拟时间驱动 */
};
})();
