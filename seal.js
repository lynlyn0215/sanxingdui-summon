/* 通神 · 结印
   一件神器一条咒式：三个手印依次结出（每印飞回两块碎片）→ 定印按住聚气 → 神器复原、金光镀金。
   没有失败：某个印久久结不成，可轻点屏幕跳过，那一段以半透明"推测形态"补全（研究性复原）。
   用时只决定评级，评级只决定金光强弱，不出分数。 */
import { FilesetResolver, HandLandmarker } from './lib/mediapipe/vision_bundle.mjs';

const $ = id => document.getElementById(id);
const show = id => {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('on'));
  $(id).classList.add('on');
};
const M = id => MUDRAS.find(m => m.id === id);

/* ---------- 神器与咒式（文案对照 research.md） ---------- */
const RITES = [
  { id: 'mask', name: '纵目面具', glb: './assets/models/mask.glb', fit: 1.0,
    seq: ['xiangxiang', 'dingzun', 'shuwo'], seal: 'huanwo',
    sub: '宽 1.38 米 · 眼球外凸 16 厘米',
    done: '三千年前被打碎掩埋的它，此刻在你掌中重聚' },
  { id: 'tree', slice: 'y', name: '青铜神树', glb: './assets/models/tree.glb', fit: 2.15,
    seq: ['huanwo', 'xiangxiang', 'shuwo'], seal: 'dingzun',
    sub: '高 3.96 米 · 九鸟栖枝 · 一号神树修复用了十余年',
    done: '九鸟依次点亮，通天之树重立。它是扶桑还是建木，至今无解' },
  { id: 'figure', slice: 'y', name: '青铜大立人', glb: './assets/models/figure.glb', fit: 2.15,
    seq: ['xiangxiang', 'shuwo', 'dingzun'], seal: 'huanwo',
    sub: '通高 2.62 米 · 世界铜像之王 · 禁止出国展览',
    done: '它与你结着同一个印。手中之物是象牙、玉琮还是权杖，至今无解' },
  { id: 'bird', slice: 'y', name: '鸟足曲身顶尊神像', glb: './assets/models/bird.glb', fit: 2.15,
    seq: ['shuwo', 'huanwo', 'xiangxiang'], seal: 'dingzun',
    sub: '二号坑 · 三号坑 · 八号坑 · 分离三千年后合璧',
    done: '实体因结构安全无法真正组合，博物馆里那一尊是 3D 打印的研究性复原件' }
];
const RATINGS = ['一气呵成', '稍有迟疑', '结印生涩'];
const RATING_MS = [16000, 32000];          /* 全程用时分界 */
const HOLD_FRAMES = 4;                     /* 序列印：连续命中帧数（约 150ms） */
const SEAL_MS = 1100;                      /* 定印：需持续按住的时长 */
const SKIP_AFTER_MS = 12000;               /* 同一印卡太久 → 允许轻点跳过 */

const params = new URLSearchParams(location.search);
const fromMain = params.get('from') === 'main';

const state = {
  landmarker: null, stream: null, running: false, rite: null,
  phase: 'seq', step: 0, target: null, holdCount: 0, holdMs: 0, locked: false,
  tGame: 0, tStep: 0, ghosts: 0, lastNow: 0, rafId: 0
};

/* ---------- 开始页：选神器 ---------- */
let riteId = RITES.some(r => r.id === params.get('rite')) ? params.get('rite') : 'mask';
function renderRiteList() {
  const box = $('rite-list'); box.innerHTML = '';
  RITES.forEach(r => {
    const el = document.createElement('button');
    el.className = 'rite-chip' + (r.id === riteId ? ' on' : '');
    el.innerHTML = '<b>' + r.name + '</b><i>' + r.seq.map(id => M(id).name).join(' · ') + ' · 定印 ' + M(r.seal).name + '</i>';
    el.addEventListener('click', () => { riteId = r.id; renderRiteList(); });
    box.appendChild(el);
  });
}
renderRiteList();

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
const sHit = n => { beep(392 + n * 98, 0.7, 'sine', 0.14); beep(196, 0.5, 'triangle', 0.08); }; /* 铜磬 */
const sEnd = () => { [98, 147, 196, 294].forEach((f, i) => setTimeout(() => beep(f, 2.2, 'sine', 0.14 / (i + 1)), i * 70)); };

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
    state.rite = RITES.find(r => r.id === riteId);
    Summon.init($('scene3d'));
    const modelReady = Summon.load(state.rite).catch(e => { e.isModel = true; throw e; });
    modelReady.catch(() => {}); /* 先挂一个空处理，避免摄像头还没开完就报 unhandled rejection */
    $('load-bar').style.width = '20%';
    const fileset = await FilesetResolver.forVisionTasks('./lib/mediapipe/wasm');
    $('load-bar').style.width = '50%';
    state.landmarker = await HandLandmarker.createFromOptions(fileset, {
      baseOptions: { modelAssetPath: './lib/mediapipe/hand_landmarker.task', delegate: 'GPU' },
      runningMode: 'VIDEO', numHands: 2,
      minHandDetectionConfidence: 0.5, minHandPresenceConfidence: 0.5, minTrackingConfidence: 0.5
    });
    $('load-bar').style.width = '75%';
    if (!params.get('nocam')) {          /* ?nocam=1：无摄像头调试，配合 __seal.fakeHands */
      state.stream = await openCamera();
      const cam = $('cam');
      cam.srcObject = state.stream;
      await cam.play();
      await listCameras();  /* 授权后才拿得到设备名 */
    }
    await modelReady;
    $('load-bar').style.width = '100%';
    setTimeout(startGame, 260);
  } catch (err) {
    show('s-intro');
    $('intro-note').className = 'err';
    $('intro-note').innerHTML = err && err.isModel
      ? '<b>神器模型加载失败</b><br>网络不稳或文件缺失，请刷新重试'
      : camError(err);
    listCameras();
    console.error('[seal] start', err);
  }
});

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
    const s = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
    s.getTracks().forEach(t => t.stop());
  } catch (e) { /* 无权限也先列一下 */ }
  const devs = await listCameras();
  $('intro-note').innerHTML = devs.length
    ? '检测到 ' + devs.length + ' 个摄像头，可在上方选择'
    : '仍未检测到摄像头。iPhone 需：同一 Apple ID、蓝牙+Wi-Fi 开启、<b>横放锁屏、背面朝你</b>、靠近 Mac。';
});

listCameras();

/* 手机用 http 打开时摄像头必被禁用（非安全上下文）→ 一键跳转 https */
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

/* ---------- 咒式条（火影式横排） ---------- */
function renderBar() {
  const bar = $('rite-bar'); bar.innerHTML = '';
  const ids = state.rite.seq.concat([state.rite.seal]);
  ids.forEach((id, i) => {
    const el = document.createElement('div');
    const done = state.phase === 'done' || (state.phase === 'seal' ? i < 3 : i < state.step);
    const cur = (state.phase === 'seq' && i === state.step) || (state.phase === 'seal' && i === 3);
    el.className = 'rb' + (done ? ' done' : '') + (cur ? ' cur' : '') + (i === 3 ? ' seal' : '');
    el.textContent = M(id).name;
    bar.appendChild(el);
  });
}

function startGame() {
  show('s-play');
  fitCanvas();
  Object.assign(state, { running: true, phase: 'seq', step: 0, holdCount: 0, holdMs: 0, locked: false, ghosts: 0 });
  state.tGame = performance.now(); state.lastNow = 0;
  ['prompt', 'live', 'hud'].forEach(id => { $(id).style.display = ''; });
  $('rite-name').textContent = state.rite.name;
  $('finale').classList.remove('on');
  setTarget();
  state.rafId = requestAnimationFrame(loop);
}

function setTarget() {
  const isSeal = state.phase === 'seal';
  state.target = M(isSeal ? state.rite.seal : state.rite.seq[state.step]);
  state.holdCount = 0; state.holdMs = 0; state.locked = false;
  state.tStep = performance.now();
  $('p-name').textContent = (isSeal ? '定印 · ' : '') + [...state.target.name].join(' ');
  $('p-hint').textContent = state.target.hint + (isSeal ? '，按住不动' : '');
  $('p-src').textContent = state.target.source;
  $('skip-hint').classList.remove('on');
  renderBar();
}

function flash(text, cls) {
  const v = $('verdict');
  v.className = ''; void v.offsetWidth;
  v.textContent = text; v.className = cls;
}
function goldFlash() {
  const fl = $('flash'); fl.classList.remove('go'); void fl.offsetWidth; fl.classList.add('go');
  const sp = $('s-play'); sp.classList.remove('shake'); void sp.offsetWidth; sp.classList.add('shake');
}

/* 序列印结成（ghost=跳过，以推测形态补全） */
function onHit(ghost) {
  state.locked = true;
  if (ghost) state.ghosts++;
  flash([...state.target.name].join(' '), ghost ? 'ghost' : 'hit');
  if (!ghost) { sHit(state.step); goldFlash(); burst(); if (navigator.vibrate) navigator.vibrate([28, 26, 55]); }
  const second = state.step * 2 + 1;
  Summon.landShard(state.step * 2, ghost);
  setTimeout(() => Summon.landShard(second, ghost), 140);
  $('p-name').textContent = ''; $('p-hint').textContent = ''; $('p-src').textContent = '';
  state.step++;
  renderBar();
  setTimeout(() => {
    if (state.step >= 3) state.phase = 'seal';
    setTarget();
  }, 800);
}

/* 定印聚满 → 召唤 */
function onSealed(ghost) {
  state.locked = true;
  state.phase = 'done';
  state.running = false;
  const used = performance.now() - state.tGame;
  if (ghost) state.ghosts++;
  let rating = used < RATING_MS[0] ? 0 : used < RATING_MS[1] ? 1 : 2;
  if (state.ghosts) rating = Math.max(rating, 1);
  Summon.charge(0);
  Summon.landShard(6, ghost); Summon.landShard(7, ghost);
  flash([...state.target.name].join(' '), ghost ? 'ghost' : 'hit');
  ['prompt', 'live', 'hud'].forEach(id => { $(id).style.display = 'none'; });
  $('skip-hint').classList.remove('on');
  fctx.clearRect(0, 0, window.innerWidth, window.innerHeight);

  setTimeout(() => {
    Summon.complete(rating);
    sEnd(); goldFlash();
    if (navigator.vibrate) navigator.vibrate([60, 40, 140, 40, 220]);
  }, 850);

  setTimeout(() => {
    const r = state.rite;
    $('finale-title').textContent = r.name + (state.ghosts ? ' · 研究性复原' : ' · 完整复原');
    $('finale-sub').innerHTML = '<b>' + RATINGS[rating] + '</b> · ' + r.sub + '<br>' + r.done +
      (state.ghosts ? '<br><span class="dim">有 ' + state.ghosts + ' 印由推测补全，博物馆里的复原件也是这样做成的</span>' : '');
    $('finale').classList.add('on');
  }, 3400);
}

/* 卡太久：轻点屏幕跳过当前印 */
$('s-play').addEventListener('click', () => {
  if (!state.running || state.locked) return;
  if (performance.now() - state.tStep < SKIP_AFTER_MS) return;
  if (state.phase === 'seal') onSealed(true); else onHit(true);
});

/* 结尾按钮：来自主流程 → 回到假说剧场；否则 再结一次 / 换一件 */
if (fromMain) {
  $('btn-primary').textContent = '那一夜，究竟发生了什么 ▸';
  $('btn-primary').addEventListener('click', () => { location.href = './index.html#theater'; });
  $('btn-again').textContent = '再 结 一 次';
  $('btn-again').addEventListener('click', () => location.reload());
} else {
  $('btn-primary').textContent = '再 结 一 次';
  $('btn-primary').addEventListener('click', () => location.reload());
  $('btn-again').textContent = '换 一 件 神 器';
  $('btn-again').addEventListener('click', () => { location.href = location.pathname; });
}

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

/* 定印进度环：越满越亮，满了召唤 */
function drawHoldRing(k, now) {
  const w = window.innerWidth, h = window.innerHeight;
  const cx = w / 2, cy = h * 0.52, R = Math.min(w, h) * 0.24;
  fctx.save();
  fctx.lineWidth = 3;
  fctx.strokeStyle = 'rgba(217,178,92,.25)';
  fctx.beginPath(); fctx.arc(cx, cy, R, 0, Math.PI * 2); fctx.stroke();
  if (k > 0) {
    fctx.lineWidth = 5 + k * 4;
    fctx.strokeStyle = 'rgba(240,212,138,' + (0.6 + k * 0.4) + ')';
    fctx.shadowColor = 'rgba(240,212,138,.9)'; fctx.shadowBlur = 14 + k * 26;
    fctx.beginPath(); fctx.arc(cx, cy, R, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * k); fctx.stroke();
    /* 金粉向手心汇聚 */
    for (let i = 0; i < 2 + k * 6; i++) {
      const a = Math.random() * Math.PI * 2, d = R * (1.3 + Math.random() * 0.9);
      parts.push({ x: cx + Math.cos(a) * d, y: cy + Math.sin(a) * d,
        vx: -Math.cos(a) * (3 + k * 5), vy: -Math.sin(a) * (3 + k * 5), life: 0.6, pull: true });
    }
  }
  fctx.restore();
}

/* 虚线手位提示：告诉用户手该摆在哪、是拳还是掌 */
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
  const dt = state.lastNow ? Math.min(150, now - state.lastNow) : 16; /* 慢机低帧率时定印仍按真实时间累计 */
  state.lastNow = now;

  const video = $('cam');
  const w = window.innerWidth, h = window.innerHeight;
  fctx.clearRect(0, 0, w, h);

  parts = parts.filter(p => p.life > 0);
  parts.forEach(p => {
    p.x += p.vx; p.y += p.vy; if (!p.pull) p.vy += 0.12; p.life -= 0.022;
    fctx.fillStyle = 'rgba(240,212,138,' + Math.max(0, p.life) + ')';
    fctx.beginPath(); fctx.arc(p.x, p.y, 2.4, 0, 7); fctx.fill();
  });

  let hands = [];
  if (state.landmarker && video.readyState >= 2 && video.currentTime !== lastVideoTime) {
    lastVideoTime = video.currentTime;
    try {
      const res = state.landmarker.detectForVideo(video, now);
      if (res && res.landmarks) hands = res.landmarks.map(lm => ({ landmarks: lm }));
    } catch (e) { /* 掉帧忽略 */ }
  }
  if (window.__seal.fakeHands) hands = window.__seal.fakeHands; /* 无摄像头调试：注入合成关键点 */

  const isSeal = state.phase === 'seal';
  if (!state.locked) {
    drawZones(state.target, hands, now);
    if (isSeal) drawHoldRing(state.holdMs / SEAL_MS, now);
  }
  if (hands.length) drawHands(hands);

  const m = classifyMudra(hands);
  const liveEl = $('live');
  if (!hands.length) {
    liveEl.innerHTML = '<span id="nohand">未见双手</span>';
  } else if (m) {
    const hit = m.id === state.target.id;
    liveEl.innerHTML = '识出 <b>' + M(m.id).name + '</b>' + (hit ? ' ✓' : '');
  } else {
    liveEl.innerHTML = '<span id="nohand">' + (hands.length === 1 ? '再抬起另一只手' : '手印未成') + '</span>';
  }

  if (!state.locked) {
    const matched = m && m.id === state.target.id;
    if (isSeal) {
      state.holdMs = matched ? state.holdMs + dt : Math.max(0, state.holdMs - dt * 1.5);
      Summon.charge(state.holdMs / SEAL_MS);
      if (state.holdMs >= SEAL_MS) { onSealed(false); return; }
    } else if (matched) {
      state.holdCount++;
      if (state.holdCount >= HOLD_FRAMES) { onHit(false); return; }
    } else if (state.holdCount > 0) {
      state.holdCount = Math.max(0, state.holdCount - 1);
    }
    if (now - state.tStep > SKIP_AFTER_MS) $('skip-hint').classList.add('on');
  }
}

/* 调试：?nocam=1&auto=1 —— 无摄像头时按时间表自动注入合成手势，跑完整条咒式
   （本机没有摄像头，无头 Chrome 截图验证全靠它；合成关键点与 mudra-test.html 同源） */
if (params.get('auto')) {
  const mk = synthHand; /* 与 mudra-test.html 同一份合成关键点 */
  const POSES = { huanwo: [mk(.5,.52,true), mk(.5,.66,true)], xiangxiang: [mk(.42,.6,false), mk(.6,.6,false)],
    dingzun: [mk(.34,.28,false), mk(.66,.28,false)], shuwo: [mk(.5,.55,true)] };
  const pose = id => { window.__seal.fakeHands = id ? POSES[id] : null; };
  window.addEventListener('load', () => setTimeout(() => $('btn-start').click(), 300));
  const plan = () => {
    const r = state.rite, t = ms => new Promise(res => setTimeout(res, ms));
    (async () => {
      await t(600);
      for (const id of r.seq) { pose(id); await t(500); pose(null); await t(1300); }
      pose(r.seal); await t(2600); pose(null);
    })();
  };
  const obs = new MutationObserver(() => { if ($('s-play').classList.contains('on') && state.running) { obs.disconnect(); plan(); } });
  obs.observe($('s-play'), { attributes: true, attributeFilter: ['class'] });
}

/* 调试入口：控制台可查看当前特征、注入合成手势 */
window.__seal = { state, RITES, handFeatures, classifyMudra, fitCanvas, fctx, fakeHands: null, loop,
  start: id => { riteId = id || riteId; renderRiteList(); } };
