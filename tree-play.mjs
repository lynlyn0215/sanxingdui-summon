/* 神树手感实验：手印来源沿用 mudra.js，操控与金鸟为幻想演绎。 */
const clamp = (x, a = 0, b = 1) => Math.max(a, Math.min(b, x));
export class TreeControl {
  phase = 'gather'; x = .5; y = .5; spread = 1; tilt = .22;
  held = 0; age = 0; travel = 0; previousX = null; releaseY = 0;
  update(input, dt) {
    dt = clamp(dt, 0, .08); // 后台恢复不补算蓄力或释放。
    if (!input || this.phase === 'done') {
      if (this.phase === 'ready') this.held = 0;
      return;
    }
    const { x, y, gap, pose } = input;
    this.age += dt;
    this.x += (clamp(x) - this.x) * (1 - Math.exp(-dt * 10));
    this.y += (clamp(y) - this.y) * (1 - Math.exp(-dt * 10));
    if (this.phase === 'gather') {
      if (pose === 'huanwo') {
        if (this.previousX !== null) this.travel += Math.abs(x - this.previousX);
        this.previousX = x;
        this.held += dt;
        this.spread = Math.max(.6, this.spread - dt * .3);
        if (this.held > .7 && this.travel > .06) this.next('join');
      } else this.previousX = null;
    } else if (this.phase === 'join') {
      if (pose === 'xiangxiang') {
        this.spread = clamp((gap - .09) / .26);
        this.held = this.spread < .22 ? this.held + dt : 0;
        if (this.held > .8) this.next('balance');
      } else this.held = 0;
    } else if (this.phase === 'balance') {
      // ponytail: 简单摆动模拟扶正手感；真机体验成立后再考虑刚体物理。
      const target = .22 * Math.cos(this.age * .7) - (x - .5) * 1.6;
      this.tilt += (target - this.tilt) * (1 - Math.exp(-dt * 5));
      this.spread = clamp(Math.abs(this.tilt) * 1.8, 0, .7);
      this.held = pose === 'dingzun' && Math.abs(this.tilt) < .10
        ? this.held + dt : Math.max(0, this.held - dt);
      if (this.held > 1.4) { this.releaseY = y; this.next('ready'); }
    } else if (this.phase === 'ready') {
      // 丢手、握拳、识别抖动都不算松手：需要看见双掌主动放低。
      this.held = pose === 'open' && y > this.releaseY + .10 ? this.held + dt : 0;
      if (this.held > .22) this.next('done');
    }
  }
  next(phase) { this.phase = phase; this.held = 0; this.age = 0; }
}

export function startTreePlay({ touch, video, canvas, sound, finish }) {
  const control = new TreeControl();
  const $ = id => document.getElementById(id);
  const ctx = canvas.getContext('2d');
  let pointer = null, lastPhase = '', ended = false;
  const surface = $('s-play');
  if (touch) {
    surface.style.touchAction = 'none';
    surface.addEventListener('pointerdown', e => {
      if (e.target.closest('button')) return;
      surface.setPointerCapture(e.pointerId);
      pointer = { x: e.clientX / innerWidth, y: e.clientY / innerHeight };
    });
    surface.addEventListener('pointermove', e => {
      if (pointer) pointer = { x: e.clientX / innerWidth, y: e.clientY / innerHeight };
    });
    surface.addEventListener('pointerup', () => {
      if (control.phase === 'ready' && pointer) {
        control.update({ ...pointer, pose: 'open', gap: .2, y: control.releaseY + .2 }, .08);
        // 触控释放是明确的 pointerup；无需模拟摄像头连续帧。
        control.next('done');
      }
      pointer = null;
    });
    surface.addEventListener('pointercancel', () => { pointer = null; });
  }
  $('rite-name').textContent = '掌 中 神 树 · 手 感 实 验';
  $('skip-hint').hidden = true;
  $('p-src').textContent = '文物启发的幻想交互 · AI 示意模型，非考古复原';
  const labels = {
    gather: ['牵 引', touch ? '按住画面，左右拖动碎片' : '环握双拳，左右移动，把碎片牵过来'],
    join: ['聚 合', touch ? '拖向画面中央聚合，向两侧拉散' : '双掌相向：靠近聚合，分开散开'],
    balance: ['撑 住', touch ? '向神树倾斜的一侧拖动，把它扶正' : '顶尊：双掌抬至头侧，向树倾斜的一侧移动'],
    ready: ['由 你 唤 醒', touch ? '蓄力已满 · 松开手指释放' : '蓄力已满 · 双掌放低，释放神树'],
    done: ['树 醒 了', '']
  };
  return {
    control,
    update(hands, now, dt) {
      if (document.hidden) return;
      let input = null;
      if (touch && pointer) {
        input = { ...pointer, gap: .09 + Math.abs(pointer.x - .5) * .9,
          pose: ({ gather: 'huanwo', join: 'xiangxiang', balance: 'dingzun', ready: 'dingzun' })[control.phase] };
      } else if (!touch && hands.length) {
        const features = hands.map(h => handFeatures(h.landmarks));
        const vw = video.videoWidth || 4, vh = video.videoHeight || 3;
        const scale = Math.max(innerWidth / vw, innerHeight / vh);
        const cx = features.reduce((n, h) => n + h.cx, 0) / features.length;
        const cy = features.reduce((n, h) => n + h.cy, 0) / features.length;
        const two = features.length === 2;
        const open = two && features.every(h => h.curled <= 2);
        const pose = classifyMudra(hands)?.id;
        input = { x: 1 - (cx * vw * scale + (innerWidth - vw * scale) / 2) / innerWidth,
          y: cy, gap: two ? Math.abs(features[0].cx - features[1].cx) : 1,
          pose: control.phase === 'ready' && open ? 'open' : pose };
      }
      control.update(input, dt);
      const phase = control.phase;
      if (phase !== lastPhase) {
        [$('p-name').textContent, $('p-hint').textContent] = labels[phase];
        $('rite-bar').innerHTML = ['gather', 'join', 'balance', 'ready'].map((p, i) =>
          `<span class="rb ${p === phase ? 'cur' : ''}">${['牵引', '聚合', '撑住', '释放'][i]}</span>`).join('');
        if (phase !== 'gather' && phase !== 'done') sound();
        lastPhase = phase;
      }
      $('live').textContent = phase === 'done' ? '' : !input
        ? (touch ? '按住画面，让碎片回应你' : '让双手留在画面内 · 失去追踪时暂停')
        : phase === 'balance' ? (Math.abs(control.tilt) < .1 ? '稳住了，再托住片刻' : '树正在倾斜，还能扶回来')
        : phase === 'ready' ? '等你松手，不会自动释放' : '你的移动，正在改变它';
      Summon.manipulate({ ...control, active: !!input });
      if (input && phase !== 'done') {
        const x = control.x * innerWidth, y = control.y * innerHeight;
        ctx.strokeStyle = 'rgba(230,199,123,.6)'; ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(x, y); ctx.quadraticCurveTo(innerWidth * .5, y - 80, innerWidth * .5, innerHeight * .48); ctx.stroke();
        ctx.beginPath(); ctx.arc(x, y, 10 + Math.sin(now * .004) * 2, 0, Math.PI * 2); ctx.stroke();
      }
      if (phase === 'done' && !ended) {
        ended = true;
        surface.classList.add('tree-released');
        // 爆发前留半秒安静，释放时机由用户决定。
        setTimeout(() => { Summon.complete(0); sound(); }, 420);
        setTimeout(finish, 3400);
      }
    }
  };
}
