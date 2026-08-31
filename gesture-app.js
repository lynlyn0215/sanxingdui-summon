/* 掌中古蜀 · 三星堆召唤 —— 全部逻辑本地运行，无网络请求
   按小红书小工具容器约束编写：脚本外置 / 无 eval / 无 WASM / 无 Worker / 资源自包含 */
'use strict';

/* ================= 文物数据 ================= */
const GOLD = '#d9b25c', GOLD_HI = '#f0d48a';

function artSvg(inner) {
  return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200" fill="none" ' +
    'stroke="' + GOLD + '" stroke-width="4" stroke-linecap="round" stroke-linejoin="round">' +
    inner + '</svg>';
}

const ARTIFACTS = [
  {
    id: 'jinzhang', name: '金杖', seal: '执', elem: '金',
    hypo: '一号坑出土过 1.42 米的纯金权杖。有学者推测，大立人掌中所握，正是这样一柄象征王权的杖。',
    verdict: '你掌中有定夺之力。众人犹疑不决时，总是你落下第一子。',
    svg: artSvg('<line x1="100" y1="52" x2="100" y2="178"/><circle cx="100" cy="34" r="16"/>' +
      '<line x1="88" y1="86" x2="112" y2="86"/><line x1="88" y1="104" x2="112" y2="104"/>' +
      '<path d="M84 34h-14M130 34h-14" />')
  },
  {
    id: 'yucong', name: '玉琮', seal: '通', elem: '土',
    hypo: '大立人环握的双手外方内圆，恰与玉琮之形相合——礼地之器，贯通天地，"玉琮说"由此而来。',
    verdict: '你是天地之间的信使。看似沉默，实则上下贯通，无所不达。',
    svg: artSvg('<rect x="42" y="42" width="116" height="116" rx="6"/>' +
      '<rect x="60" y="60" width="80" height="80" rx="4" stroke-opacity=".55"/>' +
      '<circle cx="100" cy="100" r="30"/>')
  },
  {
    id: 'xiangya', name: '象牙', seal: '护', elem: '木',
    hypo: '他双手所握的两个圆孔并不在一条直线上——弯曲的象牙恰能穿过，这是"象牙说"最有力的依据。',
    verdict: '你温厚，却藏着巨兽之力。被你护着的人，从未见过风雨。',
    svg: artSvg('<path d="M48 168 C 52 96, 96 46, 160 40" stroke-width="10"/>' +
      '<path d="M60 150 C 66 104, 100 62, 148 52" stroke-width="3" stroke-opacity=".5"/>')
  },
  {
    id: 'tongshe', name: '铜蛇', seal: '变', elem: '水',
    hypo: '祭祀坑出土过青铜蛇。有学者推想：大立人握蛇而立，以蛇通灵，沟通人神两界。',
    verdict: '你从不走直路。世界转弯的地方，你早已等在那里。',
    svg: artSvg('<path d="M66 44 C 140 52, 58 96, 102 112 C 150 128, 138 168, 66 162"/>' +
      '<circle cx="62" cy="42" r="7" fill="' + GOLD + '" stroke="none"/>')
  },
  {
    id: 'taiyanglun', name: '太阳轮', seal: '曜', elem: '火',
    hypo: '形似方向盘的青铜太阳轮，是古蜀太阳崇拜的图腾。五道芒，一轮心，转动即是白昼。',
    verdict: '你自带光源。别人追逐光，而你只需转身，光就跟着你。',
    svg: artSvg('<circle cx="100" cy="100" r="66"/><circle cx="100" cy="100" r="20"/>' +
      '<line x1="100" y1="80" x2="100" y2="34"/><line x1="119" y1="106" x2="163" y2="120"/>' +
      '<line x1="112" y1="117" x2="139" y2="153"/><line x1="88" y1="117" x2="61" y2="153"/>' +
      '<line x1="81" y1="106" x2="37" y2="120"/>')
  },
  {
    id: 'xuwo', name: '虚握', seal: '空', elem: '∅', rare: true,
    hypo: '也有学者认为：他掌中本就空无一物。他握住的，是仪式本身。',
    verdict: '你的本命之物是"无"。你不需要外物证明自己——你即是仪式。',
    svg: artSvg('<circle cx="100" cy="100" r="58" stroke-dasharray="6 12" stroke-opacity=".85"/>')
  }
];

/* ================= 匹配逻辑 ================= */
function digitRoot(n) { while (n > 9) n = String(n).split('').reduce((s, c) => s + +c, 0); return n; }

function resolveDestiny(birthStr, choiceB) {
  const digits = birthStr.replace(/\D/g, '');
  const root = digitRoot(digits.split('').reduce((s, c) => s + +c, 0)); // 1..9
  if (root === 9) return ARTIFACTS[5];                                  // 隐藏款：虚握
  return ARTIFACTS[(root + (choiceB ? 1 : 0)) % 5];
}

/* ================= 通用 ================= */
const $ = id => document.getElementById(id);
function show(id) {
  document.querySelectorAll('.scene').forEach(s => s.classList.remove('on'));
  $(id).classList.add('on');
}
let toastTimer = 0;
function toast(msg) {
  const t = $('toast'); t.textContent = msg; t.style.opacity = 1;
  clearTimeout(toastTimer); toastTimer = setTimeout(() => t.style.opacity = 0, 2200);
}

/* ================= 状态 ================= */
const state = { name: '有缘人', birth: '2000-01-01', choiceB: false, artifact: null, cardUrl: '' };

/* ================= S1 问卜 ================= */
$('btn-start').addEventListener('click', () => show('scene-input'));
$('ch-a').addEventListener('click', () => { state.choiceB = false; $('ch-a').classList.add('sel'); $('ch-b').classList.remove('sel'); });
$('ch-b').addEventListener('click', () => { state.choiceB = true; $('ch-b').classList.add('sel'); $('ch-a').classList.remove('sel'); });
$('btn-divine').addEventListener('click', () => {
  state.birth = $('in-birth').value || '2000-01-01';
  state.name = ($('in-name').value || '有缘人').trim().slice(0, 8) || '有缘人';
  state.artifact = resolveDestiny(state.birth, state.choiceB);
  runDivine();
});

/* ================= S2 推演动画 ================= */
function runDivine() {
  show('scene-divine');
  const seq = ['金', '木', '水', '火', '土'];
  const g = $('divine-glyphs');
  let i = 0;
  const spin = setInterval(() => { g.textContent = seq[i++ % 5]; }, 150);
  setTimeout(() => {
    clearInterval(spin);
    g.textContent = state.artifact.rare ? '空' : state.artifact.elem;
    $('divine-note').textContent = '你的本命之物已定 · 现在，去唤醒它';
    setTimeout(() => { show('scene-summon'); }, 1400);
  }, 2300);
}

/* ================= S3 召唤（摄像头 · 参考帧差分） ================= */
const cam = $('cam'), overlay = $('overlay');
const octx = overlay.getContext('2d');
const det = document.createElement('canvas');   // 降采样检测画布
det.width = 96; det.height = 72;
const dctx = det.getContext('2d', { willReadFrequently: true });

const GOAL_MS = 2200;          // 手印保持时长
const TH = 13;                 // 差分阈值
let refFrame = null, progress = 0, lastT = 0, summonDone = false, rafId = 0, stream = null;

// 两个引导环（画面比例坐标，居中对称 → 不受镜像影响）
const RINGS = [{ x: .5, y: .44, r: .105 }, { x: .5, y: .625, r: .105 }];

$('btn-gate-ok').addEventListener('click', startCamera);
$('btn-gate-skip').addEventListener('click', enableFallback);

async function startCamera() {
  try {
    stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: 'user', width: { ideal: 640 } }, audio: false
    });
    cam.srcObject = stream;
    await cam.play();
    $('gate').style.display = 'none';
    fitOverlay();
    countdownRef();
  } catch (e) {
    toast('无法开启摄像头，改用指印仪式');
    enableFallback();
  }
}

function fitOverlay() {
  overlay.width = overlay.clientWidth * (window.devicePixelRatio || 1);
  overlay.height = overlay.clientHeight * (window.devicePixelRatio || 1);
}
window.addEventListener('resize', fitOverlay);

// 3-2-1 拍参考帧（此时双手尚未抬起）
function countdownRef() {
  const tip = $('summon-tip'), sub = $('summon-sub');
  tip.textContent = '自然站好，双手放下';
  let n = 3;
  sub.textContent = n;
  const t = setInterval(() => {
    n--;
    if (n > 0) { sub.textContent = n; return; }
    clearInterval(t);
    grabRef();
    tip.textContent = '现在——学他的手印';
    sub.textContent = '右手在上，左手在下，双手环握，对准光环';
    lastT = performance.now();
    rafId = requestAnimationFrame(tick);
  }, 800);
}

function grabFrame() {
  dctx.drawImage(cam, 0, 0, det.width, det.height);
  const d = dctx.getImageData(0, 0, det.width, det.height).data;
  const g = new Uint8ClampedArray(det.width * det.height);
  for (let i = 0, j = 0; i < d.length; i += 4, j++) g[j] = (d[i] * 3 + d[i + 1] * 4 + d[i + 2]) >> 3;
  return g;
}
function grabRef() { refFrame = grabFrame(); }

function meanDiff(cur, cx, cy, r) {
  let sum = 0, n = 0;
  const x0 = Math.max(0, cx - r | 0), x1 = Math.min(det.width - 1, cx + r | 0);
  const y0 = Math.max(0, cy - r | 0), y1 = Math.min(det.height - 1, cy + r | 0);
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
    const dx = x - cx, dy = y - cy;
    if (dx * dx + dy * dy > r * r) continue;
    const i = y * det.width + x;
    sum += Math.abs(cur[i] - refFrame[i]); n++;
  }
  return n ? sum / n : 0;
}

/* ponytail: 参考帧差分只判"该区域出现了不属于背景的东西"，不识别手型；
   光照突变靠四角背景补偿粗略抵消。M2 计划用 tfjs 手部关键点升级为真手印识别。 */
function tick(now) {
  if (summonDone) return;
  const dt = now - lastT; lastT = now;
  const cur = grabFrame();

  // 四角背景差 → 全局光照补偿
  const cw = det.width, ch = det.height;
  let bg = 0;
  [[8, 8], [cw - 9, 8], [8, ch - 9], [cw - 9, ch - 9]].forEach(p => { bg += meanDiff(cur, p[0], p[1], 7); });
  bg /= 4;

  let allOn = true;
  const sig = RINGS.map(rg => {
    const s = meanDiff(cur, rg.x * cw, rg.y * ch, rg.r * 2 * ch) - bg * .7;
    if (s < TH) allOn = false;
    return s;
  });

  progress = Math.max(0, Math.min(GOAL_MS, progress + (allOn ? dt : -dt * 1.6)));
  drawOverlay(progress / GOAL_MS, sig);

  if (progress >= GOAL_MS) { summonSuccess(); return; }
  rafId = requestAnimationFrame(tick);
}

function drawOverlay(pct, sig) {
  const w = overlay.width, h = overlay.height;
  octx.clearRect(0, 0, w, h);
  RINGS.forEach((rg, i) => {
    const cx = rg.x * w, cy = rg.y * h, r = rg.r * h * 1.6;
    const active = sig && sig[i] >= TH;
    octx.save();
    octx.shadowColor = GOLD; octx.shadowBlur = active ? 26 : 10;
    octx.strokeStyle = active ? GOLD_HI : 'rgba(217,178,92,.55)';
    octx.lineWidth = 2.5;
    octx.setLineDash([10, 14]);
    octx.beginPath(); octx.arc(cx, cy, r, 0, Math.PI * 2); octx.stroke();
    // 进度实线环
    octx.setLineDash([]);
    octx.strokeStyle = GOLD_HI; octx.lineWidth = 4;
    octx.beginPath(); octx.arc(cx, cy, r + 9, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * pct); octx.stroke();
    octx.restore();
  });
  if (pct > 0.02) {
    $('summon-sub').textContent = pct >= 1 ? '' : '保持手印 ' + Math.round(pct * 100) + '%';
  }
}

/* —— 无摄像头降级：长按 3 秒 —— */
function enableFallback() {
  $('gate').style.display = 'none';
  const zone = $('fallback-zone');
  zone.style.display = 'flex';
  zone.style.pointerEvents = 'auto';
  $('summon-tip').textContent = '以指为印';
  $('summon-sub').textContent = '长按光环 3 秒，完成仪式';
  let timer = 0;
  const start = e => { e.preventDefault(); timer = setTimeout(summonSuccess, 3000); zone.style.opacity = .55; };
  const cancel = () => { clearTimeout(timer); zone.style.opacity = 1; };
  zone.addEventListener('pointerdown', start);
  zone.addEventListener('pointerup', cancel);
  zone.addEventListener('pointercancel', cancel);
  zone.addEventListener('pointerleave', cancel);
}

/* —— 召唤成功：金光粒子 → 揭晓 —— */
function summonSuccess() {
  if (summonDone) return;
  summonDone = true;
  cancelAnimationFrame(rafId);
  if (navigator.vibrate) navigator.vibrate([60, 40, 120]);
  $('summon-tip').textContent = '缘 · 现';
  $('summon-sub').textContent = '';
  burst(() => {
    stopCamera();
    revealCard();
  });
}

function stopCamera() {
  if (stream) { stream.getTracks().forEach(t => t.stop()); stream = null; }
}

function burst(done) {
  const w = overlay.width, h = overlay.height;
  const cx = w / 2, cy = h * .53;
  const parts = [];
  for (let i = 0; i < 120; i++) {
    const a = Math.random() * Math.PI * 2, v = (Math.random() * .5 + .18) * h / 60;
    parts.push({ x: cx, y: cy, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life: 1 });
  }
  const t0 = performance.now();
  (function anim(now) {
    const k = (now - t0) / 1200;
    octx.clearRect(0, 0, w, h);
    octx.save();
    octx.globalCompositeOperation = 'lighter';
    parts.forEach(p => {
      p.x += p.vx; p.y += p.vy; p.vy += .02; p.life = 1 - k;
      octx.fillStyle = 'rgba(240,212,138,' + Math.max(0, p.life) + ')';
      octx.beginPath(); octx.arc(p.x, p.y, 2.2, 0, Math.PI * 2); octx.fill();
    });
    octx.restore();
    if (k < 1) requestAnimationFrame(anim); else { octx.clearRect(0, 0, w, h); done(); }
  })(t0);
}

/* ================= S4 揭晓 · 缘分卡 ================= */
function revealCard() {
  const a = state.artifact;
  $('seal-char').textContent = a.seal;
  $('artifact-stage').innerHTML = a.svg;
  $('artifact-name').textContent = a.name;
  $('artifact-elem').textContent = a.rare ? '五行之外' : '五行 · ' + a.elem;
  $('verdict').textContent = '「' + a.verdict + '」';
  $('hypo').textContent = a.hypo;
  $('rare-tag').style.display = a.rare ? 'inline-block' : 'none';
  show('scene-card');
  drawCard().then(url => {
    state.cardUrl = url;
    const img = $('card-preview');
    img.src = url; img.style.display = 'block';
  });
}

function spacedText(ctx, text, x, y, gap) {
  const chars = [...text];
  const total = chars.reduce((s, c) => s + ctx.measureText(c).width, 0) + gap * (chars.length - 1);
  let px = x - total / 2;
  chars.forEach(c => { const w = ctx.measureText(c).width; ctx.fillText(c, px + w / 2, y); px += w + gap; });
}
function wrapText(ctx, text, x, y, maxW, lineH) {
  let line = '';
  for (const ch of text) {
    if (ctx.measureText(line + ch).width > maxW) { ctx.fillText(line, x, y); y += lineH; line = ch; }
    else line += ch;
  }
  if (line) ctx.fillText(line, x, y);
  return y;
}
function svgToImage(svg) {
  return new Promise(res => {
    const img = new Image();
    img.onload = () => res(img);
    img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
  });
}

async function drawCard() {
  const a = state.artifact;
  const W = 1080, H = 1440;
  const c = document.createElement('canvas'); c.width = W; c.height = H;
  const x = c.getContext('2d');
  const serif = '"Songti SC","STSong","Noto Serif CJK SC","SimSun",serif';

  x.fillStyle = '#0d0f0e'; x.fillRect(0, 0, W, H);
  // 双线边框
  x.strokeStyle = 'rgba(217,178,92,.85)'; x.lineWidth = 2; x.strokeRect(36, 36, W - 72, H - 72);
  x.strokeStyle = 'rgba(61,122,104,.5)'; x.lineWidth = 1; x.strokeRect(52, 52, W - 104, H - 104);
  x.textAlign = 'center'; x.textBaseline = 'middle';

  x.fillStyle = '#3d7a68'; x.font = '26px ' + serif;
  spacedText(x, '三星堆 · 掌中古蜀', W / 2, 128, 14);

  // 缘签大字
  x.save();
  x.fillStyle = GOLD_HI; x.font = '330px ' + serif;
  x.shadowColor = 'rgba(217,178,92,.5)'; x.shadowBlur = 60;
  x.fillText(a.seal, W / 2, 430);
  x.restore();

  // 文物图
  const img = await svgToImage(a.svg);
  x.save();
  x.shadowColor = 'rgba(217,178,92,.35)'; x.shadowBlur = 40;
  x.drawImage(img, W / 2 - 150, 640, 300, 300);
  x.restore();

  x.fillStyle = GOLD_HI; x.font = '44px ' + serif;
  spacedText(x, a.name, W / 2, 1010, 18);
  x.fillStyle = '#3d7a68'; x.font = '24px ' + serif;
  spacedText(x, a.rare ? '五行之外 · 万中无一' : '五行 · ' + a.elem, W / 2, 1058, 10);

  x.fillStyle = '#e8e0cc'; x.font = '30px ' + serif;
  wrapText(x, '「' + a.verdict + '」', W / 2, 1130, 780, 52);

  x.fillStyle = '#9a917c'; x.font = '24px ' + serif;
  const d = new Date();
  const ds = d.getFullYear() + '.' + String(d.getMonth() + 1).padStart(2, '0') + '.' + String(d.getDate()).padStart(2, '0');
  x.fillText(state.name + ' · ' + ds + ' 得此缘', W / 2, 1268);

  x.fillStyle = '#5c6b60'; x.font = '22px ' + serif;
  x.fillText('三千年前，他握着谜；三千年后，你是答案。', W / 2, 1352);

  return c.toDataURL('image/png');
}

/* —— 保存：小工具容器走端能力，浏览器走下载 —— */
$('btn-save').addEventListener('click', async () => {
  if (!state.cardUrl) { toast('缘分卡尚未生成'); return; }
  const mt = window.xhs && window.xhs.miniTool;
  if (mt && mt.saveImageToPhotosAlbum) {
    try {
      await mt.saveImageToPhotosAlbum({ filePath: state.cardUrl });
      toast('已存入相册 · 去发一篇笔记吧');
    } catch (e) { toast('保存失败，可截图留存'); }
  } else {
    const aEl = document.createElement('a');
    aEl.href = state.cardUrl; aEl.download = 'sanxingdui-' + state.artifact.id + '.png';
    document.body.appendChild(aEl); aEl.click(); aEl.remove();
    toast('缘分卡已导出');
  }
});

$('btn-again').addEventListener('click', () => { stopCamera(); location.reload(); });
