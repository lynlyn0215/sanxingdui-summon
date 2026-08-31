/* 掌中古蜀 · 主流程：入场门 → 序章 → 修复现场 → 假说剧场 → 结语 */
'use strict';

const $ = id => document.getElementById(id);
function show(id) {
  document.querySelectorAll('.scene').forEach(s => s.classList.remove('on'));
  $(id).classList.add('on');
}

/* ================= 假说数据 ================= */
const HYPOTHESES = [
  {
    id: 'fire', tag: '意 外', name: '神庙失火说',
    img: './assets/hypothesis/fire-hall.webp',
    desc: '大件空心铜器碎裂严重，小件实心器物却近乎完好——若是人为砸毁，理应无差别。坑中红烧土是墙体残件，灰烬九成是屋顶竹料，且在坑外焚烧后才倒入。或许，那只是一场吞没神庙的大火，之后他们郑重地掩埋了受伤的神。（2026 年最新考古观点）',
    verdict: '你相信那只是一场意外。\n可意外之后，他们为何弃城而去，再未归来？'
  },
  {
    id: 'rite', tag: '大 典', name: '祭祀燎烧说',
    img: './assets/hypothesis/burial.webp',
    desc: '砸碎与焚烧，本身就是"燎祭"仪式的一部分——以毁为献，以火通神。先埋器物、再压象牙、最后倾倒灰烬，六坑两两并列，秩序如同葬礼。这是 1986 年以来最早的解释：一场献给天地的最后大典。',
    verdict: '你相信那是献给神的最后大典。\n燃烧，是最高的供奉。'
  },
  {
    id: 'farewell', tag: '告 别', name: '失灵弃置说',
    img: './assets/hypothesis/farewell.webp',
    desc: '当神不再回应祈祷，神像便失去了存在的意义——被仪式性地"送走"，如同他方古文明中退役的神器。可若真的不再相信，为何满坑的黄金青铜一件未取，掩埋得如此郑重？',
    verdict: '你相信神已失灵，被人间辞退。\n可他们告别神明时，为何如此郑重？'
  },
  {
    id: 'upheaval', tag: '清 算', name: '变局毁神说',
    img: './assets/hypothesis/upheaval.webp',
    desc: '商周变局之际，古蜀内部或许经历了一场权力更替——旧的神权体系被系统性终结，神像被砸碎掩埋，都城随之迁往金沙。器物坑的年代恰与迁都重合。但至今，没有找到战争或屠杀的直接证据。（学界假说，尚无实证）',
    verdict: '你相信有人亲手终结了神的时代。\n历史由胜者书写——而胜者，一字未留。'
  }
];

/* ================= S1 序章：考古现场倒叙 =================
   只讲已证实的事实（发现经过、掩埋状态、跨坑拼对），不预设任何假说。
   "那一夜发生了什么"留给结尾的假说剧场。 */
const PROLOGUE = [
  { card: '1986 年 7 月<br>四川广汉', ms: 3000 },
  { img: './assets/prologue/quarry.webp', sub: '砖厂工人的锄头，碰到了三千年前', ms: 4600 },
  { img: './assets/prologue/pit.webp', sub: '青铜与象牙层层叠压，全部被砸碎、焚烧过', ms: 4800 },
  { img: './assets/prologue/pit.webp', sub: '掩埋的顺序却一丝不乱：先器物，再象牙，最后灰烬', ms: 4800 },
  { img: './assets/prologue/site.webp', sub: '这样的坑，一共六座', ms: 4200 },
  { img: './assets/prologue/match.webp', sub: '同一件器物的碎片，散落在不同的坑中', ms: 4800 },
  { card: '是谁？为什么？<br><span style="color:var(--paper-dim);font-size:.8em">三千年，无人回答</span>', ms: 3600 }
];

let prologueDone = false, proTimer = 0;

$('gate-enter').addEventListener('click', () => {
  show('scene-prologue');
  playPrologue();
});
$('btn-skip').addEventListener('click', endPrologue);

function playPrologue() {
  const img = $('pro-img'), sub = $('pro-sub'), card = $('pro-card-text');
  let i = 0;
  (function next() {
    if (prologueDone) return;
    if (i >= PROLOGUE.length) { endPrologue(); return; }
    const s = PROLOGUE[i++];
    /* 文字先淡出，再换内容 */
    sub.classList.remove('show'); card.classList.remove('show');
    setTimeout(() => {
      if (prologueDone) return;
      if (s.card) {
        img.classList.remove('show');
        card.innerHTML = s.card;
        card.classList.add('show');
      } else {
        const sameImg = img.getAttribute('src') === s.img;
        sub.textContent = s.sub;
        const reveal = () => { img.classList.add('show'); sub.classList.add('show'); };
        if (sameImg) { reveal(); }             /* 同图换字：图保持可见 */
        else {
          img.classList.remove('show');
          img.onload = reveal;                  /* 等解码完成再淡入，避免闪白 */
          img.src = s.img;
          if (img.complete && img.naturalWidth) reveal();
        }
      }
    }, 500);
    proTimer = setTimeout(next, s.ms);
  })();
}

function endPrologue() {
  if (prologueDone) return;
  prologueDone = true;
  clearTimeout(proTimer);
  $('btn-skip').style.display = 'none';
  $('pro-sub').classList.remove('show');
  $('pro-card-text').classList.remove('show');
  $('title-reveal').classList.add('on');
  setTimeout(() => { show('scene-restore'); startRestore(); }, 2400);
}

/* ================= S2 修复现场 ================= */
let restoreStarted = false;
function startRestore() {
  if (restoreStarted) return;
  restoreStarted = true;
  window.initRestoreScene(() => {
    /* 全部复原：先让用户欣赏成果，再升起"研究性复原"揭示 */
    setTimeout(() => { $('reveal-panel').classList.add('on'); }, 2800);
  });
}
$('btn-continue').addEventListener('click', () => { show('scene-theater'); renderHypo(0); });

/* ================= S3 假说剧场 ================= */
let hypoIdx = 0;
const dotsBox = $('th-dots');
HYPOTHESES.forEach(() => {
  const d = document.createElement('div');
  d.className = 'th-dot';
  dotsBox.appendChild(d);
});

function renderHypo(i) {
  hypoIdx = (i + HYPOTHESES.length) % HYPOTHESES.length;
  const h = HYPOTHESES[hypoIdx];
  $('th-img').src = h.img;
  $('th-tag').textContent = h.tag;
  $('th-name').textContent = h.name;
  $('th-desc').textContent = h.desc;
  [...dotsBox.children].forEach((d, k) => d.classList.toggle('on', k === hypoIdx));
}
$('th-prev').addEventListener('click', () => renderHypo(hypoIdx - 1));
$('th-next').addEventListener('click', () => renderHypo(hypoIdx + 1));

/* 触屏左右滑动切换 */
let swipeX = null;
$('scene-theater').addEventListener('pointerdown', e => { swipeX = e.clientX; });
$('scene-theater').addEventListener('pointerup', e => {
  if (swipeX === null) return;
  const dx = e.clientX - swipeX; swipeX = null;
  if (Math.abs(dx) > 60) renderHypo(hypoIdx + (dx < 0 ? 1 : -1));
});

/* ================= S4 结语 ================= */
$('btn-believe').addEventListener('click', () => {
  const h = HYPOTHESES[hypoIdx];
  $('ep-choice').textContent = '你选择相信 · ' + h.name;
  $('ep-verdict').innerHTML = h.verdict.replace('\n', '<br>');
  show('scene-epilogue');
});
$('ep-again').addEventListener('click', () => location.reload());
