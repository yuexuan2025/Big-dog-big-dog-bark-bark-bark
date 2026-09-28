const http = require('http');
const { spawn } = require('child_process');
const path = require('path');

function get(p, port) {
  return new Promise((res, rej) => {
    http.get({ host: '127.0.0.1', port, path: p }, (r) => {
      let d = '';
      r.on('data', (c) => (d += c));
      r.on('end', () => res(d));
    }).on('error', rej);
  });
}

async function connect(port) {
  for (let i = 0; i < 20; i++) {
    try {
      const list = JSON.parse(await get('/json/list', port));
      const page = list.find((t) => t.type === 'page');
      if (!page) throw new Error('no page');
      const WebSocket = globalThis.WebSocket;
      const ws = new WebSocket(page.webSocketDebuggerUrl);
      let id = 0;
      const pending = new Map();
      const errors = [];
      ws.addEventListener('message', (e) => {
        const m = JSON.parse(String(e.data));
        if (m.id && pending.has(m.id)) {
          pending.get(m.id)(m);
          pending.delete(m.id);
        }
        if (m.method === 'Runtime.exceptionThrown') {
          errors.push(m.params.exceptionDetails?.exception?.description || m.params.exceptionDetails?.text);
        }
      });
      await new Promise((r) => ws.addEventListener('open', r, { once: true }));
      const send = (method, params = {}) =>
        new Promise((resolve) => {
          const mid = ++id;
          pending.set(mid, resolve);
          ws.send(JSON.stringify({ id: mid, method, params }));
        });
      await send('Runtime.enable');
      const ev = async (expression) => {
        const r = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
        if (r.result?.exceptionDetails) return { __err: r.result.exceptionDetails.exception?.description || r.result.exceptionDetails.text };
        return r.result?.result?.value;
      };
      return { ws, ev, errors };
    } catch (_) {
      await new Promise((r) => setTimeout(r, 250));
    }
  }
  throw new Error('cdp connect failed');
}

(async () => {
  const exe = path.resolve('dist/win-unpacked/大狗Tap.exe');
  const child = spawn(exe, ['--remote-debugging-port=9320'], { stdio: 'ignore' });
  try {
    const { ev, errors, ws } = await connect(9320);

    // UI 元素完整性
    const ui = await ev(`({
      hasAuthor: !!document.getElementById('author-link'),
      hasVolume: !!document.getElementById('master-volume'),
      hasAppNotice: !!document.getElementById('app-notice'),
      settingsBtns: document.querySelectorAll('.setting-row').length,
      sfxCount: document.querySelectorAll('.sfx-option').length,
      title: document.title,
      orphanLockCss: !!document.querySelector('.sfx-lock'),
    })`);

    // 启动
    await ev(`document.getElementById('stage').dispatchEvent(new PointerEvent('pointerdown',{bubbles:true,pointerId:1,clientX:120,clientY:120,isPrimary:true}))`);
    for (let i = 0; i < 20; i++) {
      await new Promise((r) => setTimeout(r, 300));
      const s = await ev(`({started, n:Object.keys(buffers||{}).length})`);
      if (s?.started && s.n > 0) break;
    }

    // 音量
    const vol = await ev(`(function(){
      const slider = document.getElementById('master-volume');
      slider.value = '55';
      slider.dispatchEvent(new Event('input', {bubbles:true}));
      return { percent: volumePercent, label: document.getElementById('master-volume-value').textContent, ls: localStorage.getItem('yuexuan_volume_v1') };
    })()`);

    // 设置面板
    const settings = await ev(`(function(){
      document.getElementById('settings-button').click();
      return {
        open: document.getElementById('settings-overlay').classList.contains('is-open'),
        pianoDisabled: document.getElementById('piano-mode-setting').disabled,
      };
    })()`);
    await ev(`window.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}))`);

    // 演奏
    await ev(`(function(){
      const stage = document.getElementById('stage');
      stage.dispatchEvent(new PointerEvent('pointerdown',{bubbles:true,pointerId:9,clientX:220,clientY:240,isPrimary:true,buttons:1}));
      stage.dispatchEvent(new PointerEvent('pointerup',{bubbles:true,pointerId:9,clientX:220,clientY:240,isPrimary:true}));
      return 'ok';
    })()`);
    await new Promise((r) => setTimeout(r, 500));

    const final = await ev(`({
      started,
      n: Object.keys(buffers||{}).length,
      overlay: document.getElementById('overlay').className,
    })`);

    console.log(JSON.stringify({ ui, vol, settings, final, errors }, null, 2));
    ws.close();
  } finally {
    child.kill();
  }
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
