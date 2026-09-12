/**
 * cdp.mjs —— 零依赖 Chrome DevTools Protocol 客户端
 * 用途：在本机 Chromium 里打开「新宿决战.html」，注入输入、截图、取控制台日志。
 * 不依赖 playwright/puppeteer，只用 Node 22 内置的 WebSocket 与 child_process。
 */
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const CHROME_CANDIDATES = [
  process.env.CHROME_PATH,
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  join(process.env.LOCALAPPDATA || '', 'ms-playwright', 'chromium-1234', 'chrome-win64', 'chrome.exe'),
  join(process.env.LOCALAPPDATA || '', 'ms-playwright', 'chromium-1208', 'chrome-win64', 'chrome.exe'),
].filter(Boolean);

export function findChrome() {
  for (const p of CHROME_CANDIDATES) if (p && existsSync(p)) return p;
  throw new Error('找不到 Chrome/Chromium 可执行文件');
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export class Browser {
  constructor(opts = {}) {
    this.port = opts.port || 9333;
    this.width = opts.width || 1600;
    this.height = opts.height || 900;
    this.userDataDir = null;
    this.proc = null;
    this.ws = null;
    this.msgId = 0;
    this.pending = new Map();
    this.handlers = new Map();
    this.logs = [];
    this.errors = [];
    this.failedRequests = [];
  }

  async launch() {
    this.userDataDir = mkdtempSync(join(tmpdir(), 'cdp-'));
    const args = [
      '--headless=new',
      `--remote-debugging-port=${this.port}`,
      `--user-data-dir=${this.userDataDir}`,
      `--window-size=${this.width},${this.height}`,
      `--window-position=0,0`,
      '--no-first-run', '--no-default-browser-check', '--no-sandbox',
      '--disable-dev-shm-usage', '--disable-background-timer-throttling',
      '--disable-renderer-backgrounding', '--disable-backgrounding-occluded-windows',
      '--autoplay-policy=no-user-gesture-required',
      '--mute-audio',
      // 硬件渲染：本机有 NVIDIA GPU，headless=new 可走 D3D11 直通。
      // 实测 SwiftShader 软渲染只有 6 FPS 且观感失真，不能作为验收依据。
      '--enable-gpu', '--ignore-gpu-blocklist', '--enable-unsafe-swiftshader',
      '--enable-webgl', '--disable-frame-rate-limit',
      'about:blank',
    ];
    this.proc = spawn(findChrome(), args, { stdio: 'ignore', windowsHide: true });

    // 等 DevTools HTTP 端点就绪
    let version = null;
    for (let i = 0; i < 120; i++) {
      try {
        const r = await fetch(`http://127.0.0.1:${this.port}/json/version`);
        if (r.ok) { version = await r.json(); break; }
      } catch { /* 还没起来 */ }
      await sleep(250);
    }
    if (!version) throw new Error('DevTools 端点未就绪');
    this.browserVersion = version.Browser;
    return this;
  }

  async newPage(url = 'about:blank') {
    const r = await fetch(`http://127.0.0.1:${this.port}/json/new?${encodeURIComponent(url)}`, { method: 'PUT' });
    const target = await r.json();
    this.targetId = target.id;
    this.pageWsUrl = target.webSocketDebuggerUrl;
    await this.connect();
    await this.send('Page.enable');
    await this.send('Runtime.enable');
    await this.send('Log.enable');
    await this.send('Network.enable');
    await this.send('Emulation.setDeviceMetricsOverride', {
      width: this.width, height: this.height, deviceScaleFactor: 1, mobile: false,
    });
    return this;
  }

  async connect() {
    this.ws = new WebSocket(this.pageWsUrl);
    await new Promise((res, rej) => {
      this.ws.addEventListener('open', res, { once: true });
      this.ws.addEventListener('error', (e) => rej(new Error('WS 连接失败: ' + e.message)), { once: true });
    });
    this.ws.addEventListener('message', (ev) => this._onMessage(ev));
  }

  _onMessage(ev) {
    const msg = JSON.parse(ev.data);
    if (msg.id !== undefined) {
      const p = this.pending.get(msg.id);
      if (p) {
        this.pending.delete(msg.id);
        msg.error ? p.reject(new Error(JSON.stringify(msg.error))) : p.resolve(msg.result);
      }
      return;
    }
    if (msg.method === 'Runtime.consoleAPICalled') {
      const text = (msg.params.args || []).map((a) => {
        if (a.type === 'string') return a.value;
        if (a.type === 'number' || a.type === 'boolean') return String(a.value);
        return a.description || a.type;
      }).join(' ');
      this.logs.push({ type: msg.params.type, text: String(text).slice(0, 2000) });
    } else if (msg.method === 'Runtime.exceptionThrown') {
      const d = msg.params.exceptionDetails;
      this.errors.push({
        text: (d.exception && (d.exception.description || d.exception.value)) || d.text,
        line: d.lineNumber, url: d.url,
      });
    } else if (msg.method === 'Log.entryAdded') {
      const e = msg.params.entry;
      if (e.level === 'error') this.errors.push({ text: e.text, url: e.url });
      else this.logs.push({ type: e.level, text: e.text });
    } else if (msg.method === 'Network.loadingFailed') {
      this.failedRequests.push(msg.params.errorText);
    }
    const hs = this.handlers.get(msg.method);
    if (hs) hs.forEach((f) => f(msg.params));
  }

  send(method, params = {}, sessionId) {
    const id = ++this.msgId;
    const payload = { id, method, params };
    if (sessionId) payload.sessionId = sessionId;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.ws.send(JSON.stringify(payload));
      setTimeout(() => {
        if (this.pending.has(id)) {
          this.pending.delete(id);
          reject(new Error(`CDP 超时: ${method}`));
        }
      }, 60000);
    });
  }

  on(method, fn) {
    if (!this.handlers.has(method)) this.handlers.set(method, []);
    this.handlers.get(method).push(fn);
  }

  async goto(url, { waitMs = 3000 } = {}) {
    await this.send('Page.navigate', { url });
    await sleep(waitMs);
  }

  /** 在页面里求值，返回 JSON 化结果 */
  async evaluate(fnOrExpr, { awaitPromise = true } = {}) {
    const expression = typeof fnOrExpr === 'string' ? fnOrExpr : `(${fnOrExpr.toString()})()`;
    const r = await this.send('Runtime.evaluate', {
      expression, awaitPromise, returnByValue: true, userGesture: true,
    });
    if (r.exceptionDetails) {
      throw new Error('页面求值异常: ' + (r.exceptionDetails.exception?.description || r.exceptionDetails.text));
    }
    return r.result.value;
  }

  async screenshot(path, { clip } = {}) {
    const params = { format: 'png', captureBeyondViewport: false };
    if (clip) params.clip = { ...clip, scale: 1 };
    const r = await this.send('Page.captureScreenshot', params);
    const { writeFileSync, mkdirSync } = await import('node:fs');
    const { dirname } = await import('node:path');
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, Buffer.from(r.data, 'base64'));
    return path;
  }

  // ---- 输入 ----
  async key(keyName, code, keyCode, type = 'both') {
    const base = { key: keyName, code, windowsVirtualKeyCode: keyCode, nativeVirtualKeyCode: keyCode };
    if (type === 'both' || type === 'down') await this.send('Input.dispatchKeyEvent', { type: 'rawKeyDown', ...base });
    if (type === 'both' || type === 'up') await this.send('Input.dispatchKeyEvent', { type: 'keyUp', ...base });
  }

  /**
   * 解析按键名 → CDP 事件参数。
   *
   * ⚠️ 这里踩过一个很贵的坑：空格键的 `key` 必须是单个空格字符 ' '，不能写 "Space"。
   * 写错时 Chrome 会静默生成一个 code/key 都是空串的 keydown，游戏里 `e.code === "Space"`
   * 永远不成立 —— 表现成"游戏的空格（闪避/跳过播片）坏了"，实际是测试工具的锅。
   * 另外对 '`L`' 这种只给字母的写法做了补全（自动补成 KeyL）。
   */
  static resolveKey(keyName) {
    /**
     * 完整字母表：早期只手写了用到的键，漏掉的键会退化成 [name,name,0]，
     * 也就是 code 变成 'V' 而不是 'KeyV' —— 而游戏判的是 e.code === "KeyV"，
     * 探针会**静默失效**（按键事件发出去了，游戏完全没反应）。
     * 黑闪新增了同步键 V，必须先把这张表补全。
     */
    const LETTERS = {};
    for (let i = 0; i < 26; i++) {
      const ch = String.fromCharCode(65 + i);
      LETTERS['Key' + ch] = [ch.toLowerCase(), 'Key' + ch, 65 + i];
    }
    const map = Object.assign({
      Space: [' ', 'Space', 32, ' '],
      Escape: ['Escape', 'Escape', 27],
      ShiftLeft: ['Shift', 'ShiftLeft', 16],
      ShiftRight: ['Shift', 'ShiftRight', 16],
      Tab: ['Tab', 'Tab', 9], Enter: ['Enter', 'Enter', 13],
      Comma: [',', 'Comma', 188], Period: ['.', 'Period', 190],
      Semicolon: [';', 'Semicolon', 186], Slash: ['/', 'Slash', 191],
      Backslash: ['\\', 'Backslash', 220], Minus: ['-', 'Minus', 189]
    }, LETTERS);
    for (let i = 0; i <= 9; i++) map['Digit' + i] = [String(i), 'Digit' + i, 48 + i];
    let hit = map[keyName];
    if (!hit && /^[A-Za-z]$/.test(keyName)) hit = map['Key' + keyName.toUpperCase()];
    if (!hit && /^[0-9]$/.test(keyName)) hit = map['Digit' + keyName];
    return hit || [keyName, keyName, 0];
  }

  async pressKey(keyName, ms = 60) {
    const [k, c, kc, text] = Browser.resolveKey(keyName);
    // 有 text 的键走 keyDown（能带 text），其余走 rawKeyDown（不产生多余 char 事件）
    const down = text
      ? { type: 'keyDown', key: k, code: c, windowsVirtualKeyCode: kc, nativeVirtualKeyCode: kc, text }
      : { type: 'rawKeyDown', key: k, code: c, windowsVirtualKeyCode: kc, nativeVirtualKeyCode: kc };
    await this.send('Input.dispatchKeyEvent', down);
    await sleep(ms);
    await this.send('Input.dispatchKeyEvent', { type: 'keyUp', key: k, code: c, windowsVirtualKeyCode: kc, nativeVirtualKeyCode: kc });
  }

  async keyDown(keyName) {
    const [k, c, kc, text] = Browser.resolveKey(keyName);
    await this.send('Input.dispatchKeyEvent',
      text ? { type: 'keyDown', key: k, code: c, windowsVirtualKeyCode: kc, nativeVirtualKeyCode: kc, text }
           : { type: 'rawKeyDown', key: k, code: c, windowsVirtualKeyCode: kc, nativeVirtualKeyCode: kc });
  }
  async keyUp(keyName) {
    const [k, c, kc] = Browser.resolveKey(keyName);
    await this.send('Input.dispatchKeyEvent', { type: 'keyUp', key: k, code: c, windowsVirtualKeyCode: kc, nativeVirtualKeyCode: kc });
  }

  async click(x, y) {
    await this.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y, button: 'none' });
    await this.send('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button: 'left', clickCount: 1 });
    await sleep(40);
    await this.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x, y, button: 'left', clickCount: 1 });
  }

  async close() {
    try { this.ws && this.ws.close(); } catch {}
    try { this.proc && this.proc.kill('SIGKILL'); } catch {}
    await sleep(300);
    try { if (this.userDataDir) rmSync(this.userDataDir, { recursive: true, force: true }); } catch {}
  }
}

export { sleep };
