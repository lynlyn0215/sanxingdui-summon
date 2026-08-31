/* 古蜀手印识别 —— 基于 MediaPipe HandLandmarker 的几何判别
   五个手印全部有出土文物为证，见 MUDRAS[].source
   ponytail: 用几何规则而非 KNN —— 无需训练数据、阈值可直接调；
             若真机上误判率高，再升级为 GESTO 98 那套录样本 KNN。 */
'use strict';

const MUDRAS = [
  {
    id: 'huanwo', name: '环握', hint: '双手虚握于胸前，右手在上',
    source: '青铜大立人 · 金沙小铜立人',
    artifact: '大立人手中之谜'
  },
  {
    id: 'pingju', name: '平举', hint: '双臂向两侧平举，五指张开',
    source: '二号神树座跪姿护卫 · 玉璋祭祀图',
    artifact: '青铜神树'
  },
  {
    id: 'shangtuo', name: '上托', hint: '双手上举过头，掌心向上',
    source: '顶尊跪坐人像',
    artifact: '铜顶尊跪坐人像'
  },
  {
    id: 'xiangxiang', name: '相向', hint: '双掌相对，掌间留一缝',
    source: '扭头跪坐人像（掌间原嵌有物）',
    artifact: '扭头跪坐人像'
  },
  {
    id: 'shuwo', name: '独持', hint: '单手握持，如持杖',
    source: '铜持龙立人像 · 铜持鸟立人像',
    artifact: '金杖'
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
  /* 掌宽做尺度归一，抵消远近差异 */
  const palm = dist(lm[5], lm[17]) || 1e-6;

  /* 蜷曲度：指尖离腕比指根离腕更近 → 蜷曲 */
  let curled = 0;
  FINGERS.forEach(f => {
    if (dist(lm[f.tip], wrist) < dist(lm[f.pip], wrist) * 1.05) curled++;
  });

  /* 张开度：四指尖平均离腕距离 / 掌宽 */
  const spread = FINGERS.reduce((s, f) => s + dist(lm[f.tip], wrist), 0) / 4 / palm;

  const cx = lm.reduce((s, p) => s + p.x, 0) / lm.length;
  const cy = lm.reduce((s, p) => s + p.y, 0) / lm.length;

  /* 手掌朝向：腕→中指根 的方向（用于判断上举/侧举） */
  const dirX = lm[9].x - wrist.x, dirY = lm[9].y - wrist.y;
  const dirLen = Math.hypot(dirX, dirY) || 1e-6;

  return {
    curled, spread, cx, cy, palm,
    upness: -dirY / dirLen,          // 1 = 指尖朝上
    sideness: Math.abs(dirX) / dirLen // 1 = 指尖朝侧
  };
}

/* ---- 手印判别 ----
   hands: [{landmarks, handedness}]，返回 {id, score} 或 null
   注意：画面镜像显示，MediaPipe 的 handedness 已是真实左右手 */
function classifyMudra(hands) {
  if (!hands || !hands.length) return null;

  if (hands.length === 1) {
    const h = handFeatures(hands[0].landmarks);
    /* 独持：单手握拳/握持 */
    if (h.curled >= 3 && h.spread < 2.1) return { id: 'shuwo', score: 0.6 + 0.1 * h.curled };
    return null;
  }

  /* 双手：按画面 x 排序，取两只主手 */
  const a = handFeatures(hands[0].landmarks);
  const b = handFeatures(hands[1].landmarks);
  const dx = Math.abs(a.cx - b.cx);
  const dy = Math.abs(a.cy - b.cy);
  const bothCurled = a.curled >= 3 && b.curled >= 3;
  const bothOpen = a.curled <= 1 && b.curled <= 1;
  const openish = a.curled <= 2 && b.curled <= 2;

  /* 环握：双手蜷握、水平贴近、垂直错开 */
  if (bothCurled && dx < 0.17 && dy > 0.04 && dy < 0.30) {
    return { id: 'huanwo', score: 0.9 - dx };
  }
  /* 上托：双手张开且都在画面上部、指尖朝上 */
  if (openish && a.cy < 0.45 && b.cy < 0.45 && a.upness > 0.25 && b.upness > 0.25) {
    return { id: 'shangtuo', score: 0.85 };
  }
  /* 平举：双手张开、左右拉得很开、高度接近、在肩胸高度（排除自然垂手） */
  if (bothOpen && dx > 0.38 && dy < 0.20 && a.cy < 0.72 && b.cy < 0.72) {
    return { id: 'pingju', score: 0.6 + Math.min(0.3, dx - 0.38) };
  }
  /* 相向：双掌竖立相对、掌间留缝、高度接近、位于胸前（非上举）
     注意：掌心相对时手指是朝上的，不能用 sideness 判 */
  if (openish && dx > 0.10 && dx < 0.32 && dy < 0.16 &&
      a.upness > 0.45 && b.upness > 0.45 &&
      a.cy >= 0.42 && b.cy >= 0.42 && a.cy < 0.74 && b.cy < 0.74) {
    return { id: 'xiangxiang', score: 0.8 };
  }
  return null;
}

window.MUDRAS = MUDRAS;
window.classifyMudra = classifyMudra;
window.handFeatures = handFeatures;
