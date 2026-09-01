/* 通神 · 第二关「结印」
   HandLandmarker 实时识别古蜀手印 → 限时结印 → 连击计分 */
import { FilesetResolver, HandLandmarker } from './lib/mediapipe/vision_bundle.mjs';

const $ = id => document.getElementById(id);
const show = id => {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('on'));
  $(id).classList.add('on');
};

const ROUNDS = 8;
const HOLD_FRAMES = 4;        /* 连续命中帧数 → 判定成立（防抖，约 150ms） */
const T_START = 5200, T_MIN = 2600, T_STEP = 340; /* 每关时限递减 */

const state = {
  landmarker: null, stream: null, running: false,
  round: 0, score: 0, combo: 0, maxCombo: 0, hits: 0,
  target: null, tEnd: 0, holdCount: 0, locked: false, rafId: 0, bag: []
};

/* ---------- 开始页：手印预览 ---------- */
MUDRAS.forEach(m => {
  const el = document.createElement('div');
  el.className = 'mp-chip';
  el.textContent = m.name;
  $('mp-list').appendChild(el);
});

/* ---------- 音效 ---------- */
let AC = null;
function actx() {
  if (!AC) { try { AC = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { return null; } }
  if (AC.state === 'suspended') AC.resume();
  return AC;
}
function beep(freq, dur, type, vol) {
  const a = actx(); if (!a) return;
  const o = a.createOscillator(), g = a.createGain();
  o.type = type || 'sine'; o.frequency.value = freq;
  g.gain.setValueAtTime(0.0001, a.currentTime);
  g.gain.exponentialRampToValueAtTime(vol || 0.13, a.currentTime + 0.012);
  g.gain.exponentialRampToValueAtTime(0.0001, a.currentTime + (dur || 0.4));
  o.connect(g).connect(a.destination); o.start(); o.stop(a.currentTime + (dur || 0.4) + 0.05);
}
const sHit = n => beep(880 + Math.min(n, 8) * 70, 0.45, 'sine', 0.15);
const sMiss = () => beep(150, 0.35, 'triangle', 0.12);
const sEnd = () => { [98, 147, 196].forEach((f, i) => setTimeout(() => beep(f, 1.8, 'sine', 0.13 / (i + 1)), i * 60)); };

/* ---------- 摄像头 ----------
   不用 facingMode（那是移动端概念，在 Mac 上会挑错设备甚至失败），
   改为显式设备选择：Mac mini 靠 iPhone 连续互通相机时必须能选。 */
const CAM_KEY = 'sxd_cam_id';

function camConstraints() {
  const id = localStorage.getItem(CAM_KEY);
  const base = { width: { ideal: 960 }, height: { ideal: 720 } };
  return { video: id ? Object.assign({ deviceId: { exact: id } }, base) : base, audio: false };
}

async function openCamera() {
  try {
    return await navigator.mediaDevices.getUserMedia(camConstraints());
  } catch (e) {
    /* 记住的设备失效（比如 iPhone 拿走了）→ 清掉重来 */
    if (localStorage.getItem(CAM_KEY)) {
      localStorage.removeItem(CAM_KEY);
      return await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
    }
    throw e;
  }
}

async function listCameras() {
  const sel = $('cam-select');
  try {
    const devs = (await navigator.mediaDevices.enumerateDevices()).filter(d => d.kind === 'videoinput');
    sel.innerHTML = '';
    devs.forEach((d, i) => {
      const o = document.createElement('option');
      o.value = d.deviceId;
      o.textContent = d.label || ('摄像头 ' + (i + 1));
      sel.appendChild(o);
    });
    const saved = localStorage.getItem(CAM_KEY);
    if (saved && devs.some(d => d.deviceId === saved)) sel.value = saved;
    $('cam-pick').classList.toggle('on', devs.length > 0);
    return devs;
  } catch (e) { return []; }
}

function camError(err) {
  const name = err && err.name ? err.name : '';
  const tips = {
    NotAllowedError: '浏览器或系统拒绝了摄像头权限。<br>请在 系统设置 → 隐私与安全性 → 摄像头 中允许该浏览器，然后刷新。',
    NotFoundError: '没有检测到任何摄像头。<br>Mac mini 用 iPhone 当摄像头时：两台设备同一 Apple ID、蓝牙与 Wi-Fi 均开启，<b>iPhone 横放、锁屏、背面朝向你</b>，靠近 Mac 静置片刻即可出现。',
    NotReadableError: '摄像头被其他程序占用（FaceTime／腾讯会议／另一个标签页）。<br>关掉它们再试。',
    OverconstrainedError: '所选摄像头不支持该参数，已重置选择，请再点一次开启。',
    AbortError: '摄像头启动被中断，请重试。'
  };
  return '<b>' + (name || '启动失败') + '</b><br>' + (tips[name] ||
    (err && err.message ? err.message : '未知错误')) +
    '<br><br>另：Mac 上请用 <b>http://localhost:8765/seal.html</b> 打开（自签名 https 页面会被浏览器禁用摄像头）。';
}

/* ---------- 启动 ---------- */
$('btn-start').addEventListener('click', async () => {
  actx();
  show('s-load');
  try {
    $('load-bar').style.width = '25%';
    const fileset = await FilesetResolver.forVisionTasks('./lib/mediapipe/wasm');
    $('load-bar').style.width = '55%';
    state.landmarker = await HandLandmarker.createFromOptions(fileset, {
      baseOptions: { modelAssetPath: './lib/mediapipe/hand_landmarker.task', delegate: 'GPU' },
      runningMode: 'VIDEO', numHands: 2,
      minHandDetectionConfidence: 0.5, minHandPresenceConfidence: 0.5, minTrackingConfidence: 0.5
    });
    $('load-bar').style.width = '78%';
    state.stream = await openCamera();
    const cam = $('cam');
    cam.srcObject = state.stream;
    await cam.play();
    await listCameras();  /* 授权后才拿得到设备名 */
    $('load-bar').style.width = '100%';
    setTimeout(startGame, 260);
  } catch (err) {
    show('s-intro');
    $('intro-note').className = 'err';
    $('intro-note').innerHTML = camError(err);
    listCameras();
    console.error('[camera]', err);
  }
});

/* 切换摄像头：立即换流，并记住选择 */
$('cam-select').addEventListener('change', async e => {
  localStorage.setItem(CAM_KEY, e.target.value);
  if (state.stream) state.stream.getTracks().forEach(t => t.stop());
  try {
    state.stream = await navigator.mediaDevices.getUserMedia(camConstraints());
    $('cam').srcObject = state.stream;
    await $('cam').play();
    $('intro-note').className = '';
    $('intro-note').innerHTML = '已切换到：' + e.target.selectedOptions[0].textContent + '<br>点上方按钮开始';
  } catch (err) {
    $('intro-note').className = 'err';
    $('intro-note').innerHTML = camError(err);
  }
});

$('btn-redetect').addEventListener('click', async () => {
  localStorage.removeItem(CAM_KEY);
  $('intro-note').className = '';
  $('intro-note').innerHTML = '正在检测…';
  try {
    /* 先取一次权限，否则设备名是空的 */
    const s = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
    s.getTracks().forEach(t => t.stop());
  } catch (e) { /* 无权限也先列一下 */ }
  const devs = await listCameras();
  $('intro-note').innerHTML = devs.length
    ? '检测到 ' + devs.length + ' 个摄像头，可在上方选择'
    : '仍未检测到摄像头。iPhone 需：同一 Apple ID、蓝牙+Wi-Fi 开启、<b>横放锁屏、背面朝你</b>、靠近 Mac。';
});

/* 进页面先尝试列一次（无权限时只有占位名，但能看出有没有设备） */
listCameras();

/* 手机用 http 打开时摄像头必被禁用（非安全上下文）→ 直接给一键跳转 https，
   避免在地址栏手输 https:// 和端口出错 */
(function httpsHop() {
  if (window.isSecureContext) return;
  const host = location.hostname;
  if (host === 'localhost' || host === '127.0.0.1') return;
  const url = 'https://' + host + ':8443' + location.pathname;
  $('btn-start').style.display = 'none';
  $('intro-note').className = 'err';
  $('intro-note').innerHTML =
    '当前是 <b>http</b>，浏览器不允许开摄像头。<br>点下面的按钮换到 https：<br>' +
    '<a href="' + url + '" style="display:inline-block;margin-top:12px;padding:12px 26px;' +
    'color:#f0d48a;border:1px solid #d9b25c;border-radius:2px;text-decoration:none;' +
    'letter-spacing:.2em;font-size:15px">前 往 安 全 连 接</a>' +
    '<br><br>首次会提示证书不受信任（自签名，仅在你的局域网内）：<br>' +
    'Safari 点「显示详细信息 → 访问此网站」，Chrome 点「高级 → 继续前往」。';
})();

/* ---------- 出题：洗牌不重复（沿用 GESTO 98 的 bag 思路） ---------- */
function pick() {
  if (!state.bag.length) state.bag = MUDRAS.slice().sort(() => Math.random() - 0.5);
  const next = state.bag.pop();
  if (state.target && next.id === state.target.id && state.bag.length) {
    state.bag.unshift(next);
    return state.bag.pop();
  }
  return next;
}

function startGame() {
  show('s-play');
  fitCanvas();
  Summon.init($('scene3d'));
  Object.assign(state, { running: true, round: 0, score: 0, combo: 0, maxCombo: 0, hits: 0, bag: [] });
  $('score').textContent = '0';
  $('combo').textContent = '';
  ['prompt', 'timebar', 'live', 'hud'].forEach(id => { $(id).style.display = ''; });
  $('finale').classList.remove('on');
  nextRound();
  state.rafId = requestAnimationFrame(loop);
}

function nextRound() {
  state.round++;
  if (state.round > ROUNDS) { endGame(); return; }
  state.target = pick();
  state.holdCount = 0;
  state.locked = false;
  const limit = Math.max(T_MIN, T_START - (state.round - 1) * T_STEP);
  state.tEnd = performance.now() + limit;
  state.tLimit = limit;
  $('p-name').textContent = [...state.target.name].join(' ');
  $('p-hint').textContent = state.target.hint;
  $('p-src').textContent = state.target.source;
  $('progress').textContent = state.round + '/' + ROUNDS;
}

function flash(text, cls) {
  const v = $('verdict');
  v.className = ''; void v.offsetWidth;
  v.textContent = text; v.className = cls;
}

function onHit() {
  state.locked = true;
  state.hits++;
  state.combo++;
  state.maxCombo = Math.max(state.maxCombo, state.combo);
  const left = Math.max(0, state.tEnd - performance.now());
  const speed = Math.round(120 * (left / state.tLimit));
  state.score += Math.round((100 + speed) * (1 + (state.combo - 1) * 0.25));
  $('combo').textContent = state.combo >= 2 ? state.combo + ' 连' : '';
  sHit(state.combo);
  /* 整屏金光一闪 + 轻微震屏 + 手机震动：结成的即时反馈 */
  const fl = $('flash'); fl.classList.remove('go'); void fl.offsetWidth; fl.classList.add('go');
  const sp = $('s-play'); sp.classList.remove('shake'); void sp.offsetWidth; sp.classList.add('shake');
  if (navigator.vibrate) navigator.vibrate([28, 26, 55]);
  burst();
  /* 奖励画面：一块碎片从黑暗中飞回、嵌进面具（取代分数弹窗） */
  Summon.landShard(state.hits - 1);
  $('p-name').textContent = '';
  $('p-hint').textContent = '';
  $('p-src').textContent = '';
  setTimeout(nextRound, 900);   /* 留出碎片飞行时间 */
}

function onMiss() {
  state.locked = true;
  state.combo = 0;
  $('combo').textContent = '';
  flash('失', 'miss');
  sMiss();
  if (navigator.vibrate) navigator.vibrate([50, 30, 50]);
  setTimeout(nextRound, 700);
}

/* 结束：不弹分数评价，而是让复原的面具在你眼前亮起 */
function endGame() {
  state.running = false;
  const allDone = state.hits >= ROUNDS;

  $('prompt').style.display = 'none';
  $('timebar').style.display = 'none';
  $('live').style.display = 'none';
  $('hud').style.display = 'none';

  /* 无论结成几印，面具都要复原、都要有画面：
     没结出来的部分以半透明"推测形态"补上 —— 这正是博物馆研究性复原的做法 */
  const missing = allDone ? 0 : Summon.fillMissing();
  const fillMs = missing * 220 + 900;

  setTimeout(() => {
    Summon.complete();
    sEnd();
    if (navigator.vibrate) navigator.vibrate([60, 40, 140]);
    const fl = $('flash'); fl.classList.remove('go'); void fl.offsetWidth; fl.classList.add('go');
  }, allDone ? 0 : fillMs);

  setTimeout(() => {
    $('finale-title').textContent = allDone ? '纵目面具 · 完整复原' : '纵目面具 · 研究性复原';
    $('finale-sub').innerHTML = allDone
      ? '八印俱全，三千年前被打碎掩埋的它，此刻在你掌中重聚'
      : '你唤回了 ' + state.hits + ' 块，其余 ' + missing + ' 块由推测补全<br>' +
        '<span style="color:#5c6b60">——博物馆里的复原件，也是这样做成的</span>';
    $('finale').classList.add('on');
  }, (allDone ? 0 : fillMs) + 2600);
}

/* 摄像头一直开着，重开一局直接重载页面重置 3D 场景（最省事、也不会残留状态） */
$('btn-again').addEventListener('click', () => location.reload());
$('btn-quit').addEventListener('click', () => location.reload());

/* ---------- 画布特效 ---------- */
const fx = $('fx'), fctx = fx.getContext('2d');
let parts = [];
function fitCanvas() {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  fx.width = window.innerWidth * dpr;
  fx.height = window.innerHeight * dpr;
  fctx.setTransform(dpr, 0, 0, dpr, 0, 0);
}
window.addEventListener('resize', fitCanvas);

function burst() {
  const w = window.innerWidth, h = window.innerHeight;
  for (let i = 0; i < 46; i++) {
    const a = Math.random() * Math.PI * 2, v = 2 + Math.random() * 5;
    parts.push({ x: w / 2, y: h * 0.52, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life: 1 });
  }
}

/* 虚线手位提示：告诉用户手该摆在哪、是拳还是掌
   画面是镜像的，而手位提示左右基本对称，故直接用屏幕坐标 */
function drawZones(target, hands, now) {
  if (!target || !target.zones) return;
  const w = window.innerWidth, h = window.innerHeight;
  const R = Math.min(w, h) * 0.098;

  /* 手的屏幕坐标（landmarks 未镜像 → x 需翻转） */
  const handPts = hands.map(hd => {
    const lm = hd.landmarks;
    let cx = 0, cy = 0;
    lm.forEach(p => { cx += p.x; cy += p.y; });
    return { x: (1 - cx / lm.length) * w, y: (cy / lm.length) * h };
  });

  target.zones.forEach(z => {
    const zx = z.x * w, zy = z.y * h;
    const near = handPts.some(p => Math.hypot(p.x - zx, p.y - zy) < R * 1.55);
    const pulse = 0.5 + 0.5 * Math.sin(now * 0.004);

    fctx.save();
    fctx.strokeStyle = near ? 'rgba(240,212,138,.95)' : 'rgba(217,178,92,' + (0.34 + pulse * 0.2) + ')';
    fctx.lineWidth = near ? 3 : 2;
    fctx.setLineDash(near ? [] : [9, 9]);
    fctx.shadowColor = 'rgba(217,178,92,.85)';
    fctx.shadowBlur = near ? 22 : 8;
    fctx.beginPath(); fctx.arc(zx, zy, R, 0, Math.PI * 2); fctx.stroke();

    /* 圈内画手形符号：拳=实心小圆+横线，掌=五指线 */
    fctx.setLineDash([]);
    fctx.lineWidth = 2;
    fctx.strokeStyle = near ? 'rgba(240,212,138,.9)' : 'rgba(217,178,92,.5)';
    if (z.fist) {
      fctx.beginPath(); fctx.arc(zx, zy + R * .1, R * .42, 0, Math.PI * 2); fctx.stroke();
      for (let i = -1; i <= 1; i++) {
        fctx.beginPath();
        fctx.moveTo(zx - R * .3, zy + R * .1 + i * R * .17);
        fctx.lineTo(zx + R * .3, zy + R * .1 + i * R * .17);
        fctx.stroke();
      }
    } else {
      fctx.beginPath();
      fctx.moveTo(zx - R * .3, zy + R * .45);
      fctx.lineTo(zx - R * .3, zy + R * .02);
      fctx.lineTo(zx + R * .3, zy + R * .02);
      fctx.lineTo(zx + R * .3, zy + R * .45);
      fctx.stroke();
      for (let i = 0; i < 4; i++) {
        const fx2 = zx - R * .27 + i * R * .18;
        fctx.beginPath();
        fctx.moveTo(fx2, zy + R * .02);
        fctx.lineTo(fx2, zy - R * .5);
        fctx.stroke();
      }
    }
    fctx.restore();
  });
}

/* 手部关键点描绘：确认"机器看见你了" */
function drawHands(hands) {
  const w = window.innerWidth, h = window.innerHeight;
  const video = $('cam');
  const vw = video.videoWidth || 4, vh = video.videoHeight || 3;
  /* object-fit: cover 的映射 */
  const scale = Math.max(w / vw, h / vh);
  const ox = (w - vw * scale) / 2, oy = (h - vh * scale) / 2;
  const mapX = x => w - (x * vw * scale + ox); /* 镜像 */
  const mapY = y => y * vh * scale + oy;

  const BONES = [[0,1],[1,2],[2,3],[3,4],[0,5],[5,6],[6,7],[7,8],[5,9],[9,10],[10,11],[11,12],
    [9,13],[13,14],[14,15],[15,16],[13,17],[17,18],[18,19],[19,20],[0,17]];

  hands.forEach(hd => {
    const lm = hd.landmarks;
    fctx.strokeStyle = 'rgba(217,178,92,.55)';
    fctx.lineWidth = 2;
    fctx.beginPath();
    BONES.forEach(([a, b]) => {
      fctx.moveTo(mapX(lm[a].x), mapY(lm[a].y));
      fctx.lineTo(mapX(lm[b].x), mapY(lm[b].y));
    });
    fctx.stroke();
    fctx.fillStyle = 'rgba(240,212,138,.9)';
    lm.forEach(p => { fctx.beginPath(); fctx.arc(mapX(p.x), mapY(p.y), 3, 0, 7); fctx.fill(); });
  });
}

/* ---------- 主循环 ---------- */
let lastVideoTime = -1;
function loop(now) {
  if (!state.running) return;
  state.rafId = requestAnimationFrame(loop);

  const video = $('cam');
  const w = window.innerWidth, h = window.innerHeight;
  fctx.clearRect(0, 0, w, h);

  /* 粒子 */
  parts = parts.filter(p => p.life > 0);
  parts.forEach(p => {
    p.x += p.vx; p.y += p.vy; p.vy += 0.12; p.life -= 0.022;
    fctx.fillStyle = 'rgba(240,212,138,' + Math.max(0, p.life) + ')';
    fctx.beginPath(); fctx.arc(p.x, p.y, 2.4, 0, 7); fctx.fill();
  });

  let hands = [];
  if (state.landmarker && video.readyState >= 2 && video.currentTime !== lastVideoTime) {
    lastVideoTime = video.currentTime;
    try {
      const res = state.landmarker.detectForVideo(video, now);
      if (res && res.landmarks) {
        hands = res.landmarks.map((lm, i) => ({
          landmarks: lm,
          handedness: res.handednesses && res.handednesses[i] && res.handednesses[i][0]
            ? res.handednesses[i][0].categoryName : '?'
        }));
      }
    } catch (e) { /* 掉帧忽略 */ }
  }
  if (!state.locked) drawZones(state.target, hands, now);
  if (hands.length) drawHands(hands);

  /* 计时条 */
  if (!state.locked) {
    const left = Math.max(0, state.tEnd - now);
    $('timebar-i').style.transform = 'scaleX(' + (left / state.tLimit) + ')';
    if (left <= 0) { onMiss(); return; }
  }

  /* 判定 */
  const m = classifyMudra(hands);
  const liveEl = $('live');
  if (!hands.length) {
    liveEl.innerHTML = '<span id="nohand">未见双手</span>';
  } else if (m) {
    const hit = m.id === state.target.id;
    liveEl.innerHTML = '识出 <b>' + MUDRAS.find(x => x.id === m.id).name + '</b>' + (hit ? ' ✓' : '');
  } else {
    liveEl.innerHTML = '<span id="nohand">' + (hands.length === 1 ? '再抬起另一只手' : '手印未成') + '</span>';
  }

  if (!state.locked && m && m.id === state.target.id) {
    state.holdCount++;
    if (state.holdCount >= HOLD_FRAMES) onHit();
  } else if (state.holdCount > 0) {
    state.holdCount = Math.max(0, state.holdCount - 1);
  }
}

/* 调试入口：控制台可查看当前特征、单独预览手位提示 */
window.__seal = { state, handFeatures, classifyMudra, drawZones, fitCanvas, fctx };
