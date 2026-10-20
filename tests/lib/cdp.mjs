// Trình điều khiển Chrome/Edge headless tối giản qua DevTools Protocol (Node 22+ có WebSocket sẵn).
import { spawn } from 'node:child_process';
import { existsSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Máy chủ game cho kiểm thử: dữ liệu hồ sơ ghi vào thư mục tạm (không đụng data/ của người dùng).
export function startServer(root, port, env = {}) {
  return spawn(process.execPath, [join(root, 'server.js'), String(port)], {
    stdio: 'ignore',
    env: { ...process.env, DATA_FILE: join(mkdtempSync(join(tmpdir(), 'ctp-data-')), 'profiles.json'), ...env },
  });
}

export function findChrome() {
  return [
    process.env.CHROME_PATH,
    'C:/Program Files/Google/Chrome/Application/chrome.exe',
    'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
    '/usr/bin/google-chrome',
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  ].filter(Boolean).find((p) => existsSync(p));
}

// serve=false: không tự chạy máy chủ (nhiều trình duyệt dùng chung một máy chủ).
// mobile=true: giả lập điện thoại (màn hình cảm ứng, devicePixelRatio 2).
export async function launch({ root, port, debugPort, width = 1440, height = 900, serve = true, mobile = false, env = {} }) {
  const chromePath = findChrome();
  if (!chromePath) throw new Error('Không tìm thấy Chrome/Edge. Đặt biến CHROME_PATH.');
  const server = serve ? startServer(root, port, env) : null;
  const chrome = spawn(chromePath, [
    '--headless=new', `--remote-debugging-port=${debugPort}`, `--user-data-dir=${mkdtempSync(join(tmpdir(), 'ctp-'))}`,
    `--window-size=${width},${height}`, '--ignore-gpu-blocklist', '--enable-gpu',
    ...(process.env.SOFTWARE_GL ? ['--enable-unsafe-swiftshader', '--use-angle=swiftshader'] : ['--use-angle=d3d11']),
    '--no-first-run', '--no-default-browser-check', 'about:blank',
  ], { stdio: 'ignore' });
  let page;
  for (let i = 0; i < 60 && !page; i++) {
    try {
      page = (await (await fetch(`http://127.0.0.1:${debugPort}/json/list`)).json()).find((t) => t.type === 'page');
    } catch { await sleep(250); }
  }
  const ws = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((r) => ws.addEventListener('open', r, { once: true }));
  let id = 0;
  const pending = new Map();
  const listeners = [];
  ws.addEventListener('message', (ev) => {
    const msg = JSON.parse(ev.data);
    if (msg.id && pending.has(msg.id)) {
      const p = pending.get(msg.id);
      pending.delete(msg.id);
      if (msg.error) p.rej(new Error(msg.error.message));
      else p.res(msg.result);
    } else if (msg.method) listeners.forEach((fn) => fn(msg));
  });
  const send = (method, params = {}) => new Promise((res, rej) => {
    const i = ++id;
    pending.set(i, { res, rej });
    ws.send(JSON.stringify({ id: i, method, params }));
  });
  const evaluate = async (expression) => {
    const r = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
    if (r.exceptionDetails) throw new Error(`${expression.slice(0, 120)}\n→ ${r.exceptionDetails.exception?.description || r.exceptionDetails.text}`);
    return r.result.value;
  };
  const waitFor = async (expression, timeout = 60000, label = expression) => {
    const start = Date.now();
    while (Date.now() - start < timeout) {
      try {
        if (await evaluate(expression)) return;
      } catch { /* chưa sẵn sàng */ }
      await sleep(200);
    }
    throw new Error(`Hết thời gian chờ: ${label}`);
  };
  const console_ = [];
  const requests = [];
  listeners.push((msg) => {
    if (msg.method === 'Runtime.exceptionThrown') console_.push({ level: 'exception', text: msg.params.exceptionDetails.exception?.description || msg.params.exceptionDetails.text });
    if (msg.method === 'Runtime.consoleAPICalled') console_.push({ level: msg.params.type, text: msg.params.args.map((a) => a.value ?? a.description).join(' ') });
    if (msg.method === 'Log.entryAdded') console_.push({ level: `log-${msg.params.entry.level}`, text: `${msg.params.entry.text} ${msg.params.entry.url || ''}` });
    if (msg.method === 'Network.requestWillBeSent') requests.push(msg.params.request.url);
  });
  await send('Runtime.enable');
  await send('Log.enable');
  await send('Page.enable');
  await send('Network.enable');
  await send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: mobile ? 2 : 1, mobile });
  if (mobile) await send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
  const shot = async (dir, name) => {
    const { data } = await send('Page.captureScreenshot', { format: 'png' });
    const file = join(dir, `${name}.png`);
    writeFileSync(file, Buffer.from(data, 'base64'));
    console.log(`  📸 ${file}`);
  };
  const click = async (x, y) => {
    await send('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button: 'left', clickCount: 1 });
    await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x, y, button: 'left', clickCount: 1 });
  };
  const close = () => {
    ws.close();
    chrome.kill();
    server?.kill();
  };
  return { send, evaluate, waitFor, shot, click, close, console: console_, requests, chromePath };
}
