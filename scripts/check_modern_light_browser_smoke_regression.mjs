#!/usr/bin/env node
import assert from 'node:assert/strict';
import fs from 'node:fs';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, '..');

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function collectOutput(stream, bucket) {
  if (!stream) return;
  stream.on('data', (chunk) => {
    bucket.push(chunk.toString());
    if (bucket.join('').length > 12000) {
      const joined = bucket.join('');
      bucket.length = 0;
      bucket.push(joined.slice(-12000));
    }
  });
}

async function getFreePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      const port = typeof address === 'object' && address ? address.port : null;
      server.close((error) => {
        if (error) reject(error);
        else resolve(port);
      });
    });
    server.on('error', reject);
  });
}

function resolveChromeBinary() {
  const candidates = [
    process.env.CHROME_BIN,
    process.env.GOOGLE_CHROME_BIN,
    '/usr/bin/google-chrome',
    '/usr/bin/google-chrome-stable',
    'google-chrome',
    'google-chrome-stable',
  ].filter(Boolean);

  for (const candidate of candidates) {
    const probe = spawnSync(candidate, ['--version'], { stdio: 'ignore' });
    if (probe.status === 0) return candidate;
  }
  throw new Error('Не найден google-chrome / google-chrome-stable для browser smoke regression.');
}

async function waitForFetch(url, { timeoutMs = 15000, check = null } = {}) {
  const startedAt = Date.now();
  let lastError = null;
  while (Date.now() - startedAt < timeoutMs) {
    try {
      const response = await fetch(url);
      if (check) {
        const data = await check(response);
        if (data) return data;
      } else if (response.ok) {
        return response;
      }
    } catch (error) {
      lastError = error;
    }
    await wait(150);
  }
  throw new Error(`Timeout waiting for ${url}${lastError ? `: ${lastError.message}` : ''}`);
}

class CdpClient {
  constructor(wsUrl) {
    this.wsUrl = wsUrl;
    this.ws = null;
    this.nextId = 1;
    this.pending = new Map();
    this.runtimeExceptions = [];
    this.consoleErrors = [];
  }

  async open() {
    await new Promise((resolve, reject) => {
      const ws = new WebSocket(this.wsUrl);
      this.ws = ws;
      ws.onopen = () => resolve();
      ws.onerror = (event) => reject(new Error(event?.message || 'CDP websocket error'));
      ws.onmessage = (event) => this.#handleMessage(event.data.toString());
      ws.onclose = () => {
        for (const { reject: rejectPending } of this.pending.values()) {
          rejectPending(new Error('CDP websocket closed'));
        }
        this.pending.clear();
      };
    });
  }

  #handleMessage(raw) {
    const data = JSON.parse(raw);
    if (data.id) {
      const pending = this.pending.get(data.id);
      if (!pending) return;
      this.pending.delete(data.id);
      if (data.error) pending.reject(new Error(data.error.message || JSON.stringify(data.error)));
      else pending.resolve(data.result);
      return;
    }

    if (data.method === 'Runtime.exceptionThrown') {
      this.runtimeExceptions.push(data.params?.exceptionDetails || data.params || data);
      return;
    }

    if (data.method === 'Runtime.consoleAPICalled') {
      const type = data.params?.type || 'log';
      if (type === 'error' || type === 'assert') {
        this.consoleErrors.push(data.params);
      }
      return;
    }

    if (data.method === 'Log.entryAdded') {
      const entry = data.params?.entry;
      if (entry?.level === 'error' && !String(entry?.url || '').endsWith('/favicon.ico')) {
        this.consoleErrors.push(entry);
      }
    }
  }

  send(method, params = {}) {
    const id = this.nextId += 1;
    this.ws.send(JSON.stringify({ id, method, params }));
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
    });
  }

  async enable() {
    await this.send('Runtime.enable');
    await this.send('Page.enable');
    await this.send('Log.enable');
  }

  async evaluate(expression, { awaitPromise = true, returnByValue = true } = {}) {
    const result = await this.send('Runtime.evaluate', {
      expression,
      awaitPromise,
      returnByValue,
    });
    if (result?.exceptionDetails) {
      throw new Error(result.exceptionDetails.text || 'Runtime.evaluate failed');
    }
    return result?.result?.value;
  }

  async waitFor(expression, label, timeoutMs = 12000) {
    const startedAt = Date.now();
    let lastValue = null;
    while (Date.now() - startedAt < timeoutMs) {
      lastValue = await this.evaluate(expression);
      if (lastValue) return lastValue;
      await wait(150);
    }
    throw new Error(`Timeout waiting for ${label}. Last value: ${JSON.stringify(lastValue)}`);
  }

  async click(selector) {
    const expression = `(() => {
      const node = document.querySelector(${JSON.stringify(selector)});
      if (!node) return false;
      node.click();
      return true;
    })()`;
    const clicked = await this.evaluate(expression);
    assert.equal(clicked, true, `Selector not found for click: ${selector}`);
  }

  close() {
    try {
      this.ws?.close();
    } catch {}
  }
}

async function main() {
  const chromeBin = resolveChromeBinary();
  const serverPort = await getFreePort();
  const cdpPort = await getFreePort();
  const targetUrl = `http://127.0.0.1:${serverPort}/variants/modern-light/`;
  const chromeProfileDir = fs.mkdtempSync(path.join(os.tmpdir(), 'kc2-browser-smoke-'));
  const serverLogs = [];
  const browserLogs = [];
  const childProcesses = [];

  const cleanup = () => {
    for (const child of childProcesses.reverse()) {
      if (child && !child.killed) {
        try { child.kill('SIGTERM'); } catch {}
      }
    }
    try {
      fs.rmSync(chromeProfileDir, { recursive: true, force: true });
    } catch {}
  };

  process.on('exit', cleanup);
  process.on('SIGINT', () => {
    cleanup();
    process.exit(130);
  });
  process.on('SIGTERM', () => {
    cleanup();
    process.exit(143);
  });

  try {
    const server = spawn('python3', ['scripts/run_local_server.py', String(serverPort)], {
      cwd: ROOT,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    childProcesses.push(server);
    collectOutput(server.stdout, serverLogs);
    collectOutput(server.stderr, serverLogs);

    await waitForFetch(targetUrl);

    const browser = spawn(chromeBin, [
      '--headless=new',
      '--disable-gpu',
      '--no-first-run',
      '--no-default-browser-check',
      `--remote-debugging-port=${cdpPort}`,
      `--user-data-dir=${chromeProfileDir}`,
      'about:blank',
    ], {
      cwd: ROOT,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    childProcesses.push(browser);
    collectOutput(browser.stdout, browserLogs);
    collectOutput(browser.stderr, browserLogs);

    const versionInfo = await waitForFetch(`http://127.0.0.1:${cdpPort}/json/version`, {
      check: async (response) => (response.ok ? response.json() : null),
    });
    assert.ok(versionInfo.webSocketDebuggerUrl, 'CDP websocket url must be available');

    const pageInfoResponse = await fetch(`http://127.0.0.1:${cdpPort}/json/new?${targetUrl}`, {
      method: 'PUT',
    });
    assert.equal(pageInfoResponse.ok, true, `Failed to create browser page: ${pageInfoResponse.status}`);
    const pageInfo = await pageInfoResponse.json();
    assert.ok(pageInfo.webSocketDebuggerUrl, 'Page websocket debugger url must be available');

    const cdp = new CdpClient(pageInfo.webSocketDebuggerUrl);
    await cdp.open();
    await cdp.enable();
    await cdp.send('Page.navigate', { url: targetUrl });

    await cdp.waitFor('document.readyState === "complete"', 'document ready');
    await cdp.waitFor('Array.from(document.querySelectorAll(".nav-chip")).map((node) => node.textContent.trim()).join("|").includes("Реквизиты|Удержания|XML|КС-2")', 'top navigation chips');
    await cdp.waitFor('document.getElementById("content")?.innerText?.includes("Реквизиты single-sheet формы")', 'requisites pane render');

    await cdp.click('[data-field-path="documentContext.contractNumber"] .xml-indicator');
    await cdp.waitFor('document.getElementById("content")?.innerText?.includes("XML preview ·")', 'xml preview pane render via field jump', 20000);
    await cdp.waitFor('Boolean(document.querySelector(`.xml-preview-code-row.is-jump-target .xml-line[data-source-path="documentContext.contractNumber"], .xml-preview-code-row.is-jump-target .xml-line-note[data-source-path="documentContext.contractNumber"]`))', 'contract number xml highlight', 20000);

    await cdp.click('[data-pane="xml"]');
    await cdp.waitFor('document.getElementById("content")?.innerText?.includes("XML-модель: P и Z")', 'xml pane render');

    await cdp.click('[data-pane="ks2:0"]');
    await cdp.waitFor('document.getElementById("content")?.innerText?.includes("XML preview ·")', 'ks2 xml pane render');
    await cdp.click('[data-action="toggle-ks2-preview-compare"][data-sheet-index="0"]');
    await cdp.waitFor('document.getElementById("content")?.innerText?.includes("Compare mode показывает P и Z side-by-side")', 'ks2 compare mode render');
    await cdp.waitFor('document.getElementById("content")?.innerText?.includes("Derived differences")', 'ks2 compare summary render');
    await cdp.click('[data-action="toggle-ks2-preview-compare"][data-sheet-index="0"]');
    await cdp.waitFor('document.getElementById("content")?.innerText?.includes("Подрядчик (P)") && document.getElementById("content")?.innerText?.includes("Заказчик (Z)")', 'ks2 stacked preview render');
    await cdp.click('[data-action="set-ks2-view-mode"][data-mode="form"]');
    await cdp.waitFor('document.getElementById("content")?.innerText?.includes("Название листа")', 'ks2 pane render');
    await cdp.waitFor('!document.querySelector(`[data-action="add-section-row"], [data-action="add-note-row"], [data-action="toggle-sheet-add-menu"]`)', 'ks2 bottom add controls removed');
    const beforeKs2Rows = await cdp.evaluate('document.querySelectorAll(`#content table tbody tr`).length');
    await cdp.click('[data-action="toggle-row-menu"][data-sheet-index="0"][data-row-index="0"]');
    await cdp.waitFor('Boolean(document.querySelector(`[data-action="insert-row-after"][data-sheet-index="0"][data-row-index="0"][data-row-kind="note"]`))', 'ks2 row add menu open');
    await cdp.click('[data-action="insert-row-after"][data-sheet-index="0"][data-row-index="0"][data-row-kind="note"]');
    await cdp.waitFor(`document.querySelectorAll('#content table tbody tr').length === ${Number(beforeKs2Rows) + 1}`, 'ks2 row inserted via per-row add menu');

    await cdp.click('[data-pane="holdbacks"]');
    await cdp.waitFor('document.getElementById("content")?.innerText?.includes("Удержания текущего листа КС-2")', 'holdbacks pane render');
    await cdp.click('[data-action="toggle-holdbacks-xml-export"]');
    await cdp.waitFor('document.getElementById("content")?.innerText?.includes("Удержания в XML: выкл")', 'holdbacks xml toggle off');
    await cdp.waitFor('Boolean(document.querySelector(`[data-field-path="holdbacks.rows.0.name"] .xml-indicator.is-unused`))', 'holdback indicator switched to unused');

    await cdp.click('[data-pane="ks2:0"]');
    await cdp.waitFor('document.getElementById("content")?.innerText?.includes("Название листа")', 'ks2 pane rerender after holdbacks toggle');
    await cdp.click('[data-action="set-ks2-view-mode"][data-mode="xml"]');
    await cdp.waitFor('document.getElementById("content")?.innerText?.includes("XML preview ·")', 'ks2 xml preview after holdbacks toggle', 20000);
    await cdp.waitFor('document.querySelectorAll(`.xml-preview-code .xml-line[data-source-path^="holdbacks.rows."], .xml-preview-code .xml-line-note[data-source-path^="holdbacks.rows."]`).length === 0', 'holdbacks removed from xml preview', 20000);
    await cdp.waitFor('document.getElementById("content")?.innerText?.includes(`ВсегоКОплатОтч="6257958.31"`)', 'xml payable switches back to gross total when holdbacks export is disabled', 20000);

    const seriousExceptions = cdp.runtimeExceptions.filter(Boolean);
    const seriousConsoleErrors = cdp.consoleErrors.filter((entry) => {
      const text = JSON.stringify(entry);
      return !text.includes('favicon.ico');
    });

    assert.equal(seriousExceptions.length, 0, `Browser runtime exceptions detected:\n${JSON.stringify(seriousExceptions, null, 2)}`);
    assert.equal(seriousConsoleErrors.length, 0, `Browser console errors detected:\n${JSON.stringify(seriousConsoleErrors, null, 2)}`);

    cdp.close();
    cleanup();
    process.off('exit', cleanup);
    console.log('OK: modern-light browser smoke regression passed');
  } catch (error) {
    cleanup();
    process.off('exit', cleanup);
    const debug = [
      error?.stack || String(error),
      serverLogs.length ? `\n--- server logs ---\n${serverLogs.join('').trim()}` : '',
      browserLogs.length ? `\n--- browser logs ---\n${browserLogs.join('').trim()}` : '',
    ].filter(Boolean).join('\n');
    console.error(debug);
    process.exit(1);
  }
}

await main();
