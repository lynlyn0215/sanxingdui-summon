/* 古蜀手印识别 —— 基于 MediaPipe HandLandmarker 的几何判别
   设计约束：全部在胸前 / 头侧的小空间内完成，双手必须留在手机画面内。
   （旧的「平举」要求双臂向两侧展开，实测超出画面，已废弃）
   四个手印全部有出土文物为证，见 MUDRAS[].source */
'use strict';

/* zones：屏幕上的虚线手位提示（归一化坐标，与下方判别阈值保持一致）
   fist=true 画拳形，false 画掌形；用户把手放进虚线圈即可 */
const MUDRAS = [
  {
    id: 'huanwo', name: '环握', hint: '双拳虚握，上下相叠于胸前',
    source: '青铜大立人 · 金沙小铜立人',
    zones: [{ x: .50, y: .45, fist: true }, { x: .50, y: .63, fist: true }]
  },
  {
    id: 'xiangxiang', name: '相向', hint: '双掌立起相对，掌间留一道缝',
    source: '扭头跪坐人像（掌间原嵌有物）',
    zones: [{ x: .39, y: .55, fist: false }, { x: .61, y: .55, fist: false }]
  },
  {
    id: 'dingzun', name: '顶尊', hint: '双手抬到头两侧，像托住头顶的器物',
    source: '铜顶尊跪坐人像',
    zones: [{ x: .28, y: .30, fist: false }, { x: .72, y: .30, fist: false }]
  },
  {
    id: 'shuwo', name: '独持', hint: '只用一只手，握成持物的样子',
    source: '铜持龙立人像 · 铜持鸟立人像',
    zones: [{ x: .50, y: .55, fist: true }]
  }
];

/* ---- 单手特征 ---- */
const FINGERS = [
  { tip: 8, pip: 6, mcp: 5 },   // 食指
  { tip: 12, pip: 10, mcp: 9 }, // 中指
  { tip: 16, pip: 14, mcp: 13 },// 无名指
  { tip: 20, pip: 18, mcp: 17 } // 小指
];

function dist(a, b) {
  const dx = a.x - b.x, dy = a.y - b.y, dz = (a.z || 0) - (b.z || 0);
  return Math.sqrt(dx * dx + dy * dy + dz * dz);
}

function handFeatures(lm) {
  const wrist = lm[0];
  const palm = dist(lm[5], lm[17]) || 1e-6; /* 掌宽做尺度归一，抵消远近 */

  let curled = 0;
  FINGERS.forEach(f => {
    if (dist(lm[f.tip], wrist) < dist(lm[f.pip], wrist) * 1.05) curled++;
  });

  const spread = FINGERS.reduce((s, f) => s + dist(lm[f.tip], wrist), 0) / 4 / palm;
  const cx = lm.reduce((s, p) => s + p.x, 0) / lm.length;
  const cy = lm.reduce((s, p) => s + p.y, 0) / lm.length;

  const dirX = lm[9].x - wrist.x, dirY = lm[9].y - wrist.y;
  const dirLen = Math.hypot(dirX, dirY) || 1e-6;

  return {
    curled, spread, cx, cy, palm,
    upness: -dirY / dirLen,           // 1 = 指尖朝上
    sideness: Math.abs(dirX) / dirLen // 1 = 指尖朝侧
  };
}

/* ---- 手印判别 ----
   四个手印用彼此正交的特征区分，避免相邻阈值互相串：
     手数(1/2) × 蜷曲(拳/掌) × 排布(上下叠/左右分) × 高度(头侧/胸前) */
function classifyMudra(hands) {
  if (!hands || !hands.length) return null;

  if (hands.length === 1) {
    const h = handFeatures(hands[0].landmarks);
    if (h.curled >= 3 && h.spread < 1.4) return { id: 'shuwo', score: 0.6 + 0.1 * h.curled };
    return null;
  }

  const a = handFeatures(hands[0].landmarks);
  const b = handFeatures(hands[1].landmarks);
  const dx = Math.abs(a.cx - b.cx);
  const dy = Math.abs(a.cy - b.cy);
  const bothCurled = a.curled >= 3 && b.curled >= 3;
  const openish = a.curled <= 2 && b.curled <= 2;

  /* 环握：双拳、水平贴近、垂直错开（上下相叠） */
  if (bothCurled && dx < 0.17 && dy > 0.04 && dy < 0.30) {
    return { id: 'huanwo', score: 0.9 - dx };
  }
  /* 顶尊：双掌张开、抬到头两侧（画面上部） */
  if (openish && a.cy < 0.40 && b.cy < 0.40) {
    return { id: 'dingzun', score: 0.85 };
  }
  /* 相向：双掌竖立相对、掌间留缝、位于胸前（明显低于顶尊） */
  if (openish && dx > 0.08 && dx < 0.36 && dy < 0.18 &&
      a.upness > 0.40 && b.upness > 0.40 &&
      a.cy >= 0.42 && b.cy >= 0.42 && a.cy < 0.68 && b.cy < 0.68) {
    return { id: 'xiangxiang', score: 0.8 };
  }
  return null;
}

window.MUDRAS = MUDRAS;
window.classifyMudra = classifyMudra;
window.handFeatures = handFeatures;
