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
  for (let i = 0; i < 24; i++) {
    try {
      const list = JSON.parse(await get('/json/list', port));
      const page = list.find((t) => t.type === 'page');
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
  throw new Error('cdp failed');
}

(async () => {
  const exe = path.resolve('dist/win-unpacked/大狗Tap.exe');
  const child = spawn(exe, ['--remote-debugging-port=9330'], { stdio: 'ignore' });
  try {
    const { ev, errors, ws } = await connect(9330);
    await ev(`document.getElementById('stage').dispatchEvent(new PointerEvent('pointerdown',{bubbles:true,pointerId:1,clientX:120,clientY:120,isPrimary:true}))`);
    for (let i = 0; i < 20; i++) {
      await new Promise((r) => setTimeout(r, 300));
      const s = await ev(`({started, n:Object.keys(buffers||{}).length})`);
      if (s?.started && s.n > 0) break;
    }

    // 非钢琴：↑ 调音量
    const before = await ev(`volumePercent`);
    await ev(`window.dispatchEvent(new KeyboardEvent('keydown',{key:'ArrowUp',bubbles:true}))`);
    const afterUp = await ev(`volumePercent`);

    // 开钢琴模式后：↑↓ 不应改音量；←→ 可切八度
    await ev(`(function(){
      document.getElementById('settings-button').click();
      const piano = document.getElementById('piano-mode-setting');
      if (piano.getAttribute('aria-checked') !== 'true') piano.click();
      const oct = document.getElementById('octave-switching-setting');
      if (oct && !oct.hidden && oct.getAttribute('aria-checked') !== 'true') oct.click();
      window.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}));
      return true;
    })()`);
    const volBefore = await ev(`volumePercent`);
    await ev(`window.dispatchEvent(new KeyboardEvent('keydown',{key:'ArrowUp',bubbles:true}))`);
    await ev(`window.dispatchEvent(new KeyboardEvent('keydown',{key:'ArrowDown',bubbles:true}))`);
    const volAfter = await ev(`volumePercent`);
    const pianoState = await ev(`({piano: performanceSettings.pianoMode, octave: performanceSettings.pianoOctaveStart})`);
    await ev(`window.dispatchEvent(new KeyboardEvent('keydown',{key:'ArrowLeft',code:'ArrowLeft',bubbles:true}))`);
    const pianoAfter = await ev(`({piano: performanceSettings.pianoMode, octave: performanceSettings.pianoOctaveStart})`);

    // CSP 生效检查
    const csp = await ev(`document.querySelector('meta[http-equiv="Content-Security-Policy"]')?.content || null`);

    console.log(JSON.stringify({
      volumeNonPiano: { before, afterUp, ok: afterUp === before + 5 },
      volumeInPiano: { volBefore, volAfter, ok: volBefore === volAfter },
      octave: { pianoState, pianoAfter, ok: pianoAfter.octave === pianoState.octave - 1 || pianoState.octave === 3 },
      hasCsp: !!csp,
      errors,
    }, null, 2));
    ws.close();
  } finally {
    child.kill();
  }
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
