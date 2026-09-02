// 用法：node shot.mjs <url> <outPrefix> <t1,t2,...秒>
// 起无头 Chrome（swiftshader 跑 WebGL），按真实时间在指定秒数截图
import { spawn } from 'node:child_process';
import { writeFileSync } from 'node:fs';
const [url, prefix, times, evalAfter] = process.argv.slice(2);
const CH = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const port = 9333 + Math.floor(Math.random() * 100);
const chrome = spawn(CH, ['--headless=new', '--no-sandbox', '--disable-logging', '--hide-scrollbars',
  '--window-size=390,844', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--autoplay-policy=no-user-gesture-required',
  '--remote-debugging-port=' + port, '--user-data-dir=/tmp/shot-profile-' + port, 'about:blank'], { stdio: 'ignore' });
const sleep = ms => new Promise(r => setTimeout(r, ms));
let ws, id = 0; const pending = new Map(); const logs = [];
const send = (method, params = {}) => new Promise((res, rej) => { const i = ++id; pending.set(i, { res, rej }); ws.send(JSON.stringify({ id: i, method, params })); });
try {
  let targets = [];
  for (let i = 0; i < 40 && !targets.length; i++) { await sleep(250); try { targets = (await (await fetch(`http://127.0.0.1:${port}/json`)).json()).filter(t => t.type === 'page'); } catch (e) {} }
  ws = new WebSocket(targets[0].webSocketDebuggerUrl);
  await new Promise(r => ws.onopen = r);
  ws.onmessage = ev => { const m = JSON.parse(ev.data); if (m.id && pending.has(m.id)) { const p = pending.get(m.id); pending.delete(m.id); m.error ? p.rej(m.error) : p.res(m.result); }
    else if (m.method === 'Runtime.consoleAPICalled' && ['error', 'warning'].includes(m.params.type)) logs.push(m.params.type + ': ' + m.params.args.map(a => a.value || a.description).join(' '));
    else if (m.method === 'Runtime.exceptionThrown') logs.push('EXC: ' + (m.params.exceptionDetails.exception?.description || m.params.exceptionDetails.text)); };
  await send('Runtime.enable'); await send('Page.enable');
  await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
  const t0 = Date.now();
  await send('Page.navigate', { url });
  if (evalAfter) { await sleep(1000); await send('Runtime.evaluate', { expression: evalAfter }); }
  for (const t of times.split(',').map(Number)) {
    await sleep(Math.max(0, t0 + t * 1000 - Date.now()));
    const { data } = await send('Page.captureScreenshot', { format: 'png' });
    writeFileSync(`${prefix}-${t}s.png`, Buffer.from(data, 'base64'));
    const st = await send('Runtime.evaluate', { expression: "window.__seal ? JSON.stringify({phase:__seal.state.phase,step:__seal.state.step,ready:Summon.ready,finale:document.getElementById('finale').classList.contains('on')}) : 'no __seal'", returnByValue: true });
    console.log(`t=${t}s`, st.result.value);
  }
  console.log(logs.length ? 'CONSOLE:\n' + logs.join('\n') : 'console: no errors/warnings');
} finally { chrome.kill(); }
