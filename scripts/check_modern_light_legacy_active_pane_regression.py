#!/usr/bin/env python3
from __future__ import annotations

import json
import subprocess
import tempfile
import time
import urllib.request
from pathlib import Path

import websocket

ROOT = Path(__file__).resolve().parents[1]
URL = 'http://127.0.0.1:4173/variants/modern-light/'
CHROME_PORT = 9333
STORAGE_KEY = 'kc2kc3-web-form-v1'


def wait_for_debugger(port: int) -> dict:
    last_error = None
    for _ in range(100):
        try:
            with urllib.request.urlopen(f'http://127.0.0.1:{port}/json/version', timeout=1) as response:
                return json.load(response)
        except Exception as error:  # pragma: no cover - best effort in CI/local runs
            last_error = error
            time.sleep(0.1)
    raise RuntimeError(f'Chrome debugger did not start on port {port}: {last_error}')


class ChromeCdp:
    def __init__(self, ws_url: str, origin: str):
        self._ws = websocket.create_connection(ws_url, origin=origin)
        self._message_id = 0

    def close(self):
        self._ws.close()

    def send(self, method: str, params: dict | None = None, session_id: str | None = None) -> dict:
        self._message_id += 1
        payload = {'id': self._message_id, 'method': method, 'params': params or {}}
        if session_id:
            payload['sessionId'] = session_id
        self._ws.send(json.dumps(payload))
        while True:
            raw = json.loads(self._ws.recv())
            if raw.get('id') == self._message_id:
                return raw

    def evaluate(self, expression: str, session_id: str) -> object:
        result = self.send(
            'Runtime.evaluate',
            {'expression': expression, 'returnByValue': True, 'awaitPromise': True},
            session_id=session_id,
        )
        return (((result.get('result') or {}).get('result') or {}).get('value'))


def main() -> None:
    profile = tempfile.mkdtemp(prefix='kc2-modern-light-pane-')
    chrome = subprocess.Popen(
        [
            'google-chrome',
            '--headless=new',
            '--disable-gpu',
            f'--remote-debugging-port={CHROME_PORT}',
            '--remote-allow-origins=*',
            f'--user-data-dir={profile}',
            '--no-first-run',
            '--no-default-browser-check',
            'about:blank',
        ],
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
        cwd=ROOT,
    )

    try:
        version = wait_for_debugger(CHROME_PORT)
        cdp = ChromeCdp(version['webSocketDebuggerUrl'], origin=f'http://127.0.0.1:{CHROME_PORT}')
        try:
            target_id = cdp.send('Target.createTarget', {'url': URL})['result']['targetId']
            session_id = cdp.send('Target.attachToTarget', {'targetId': target_id, 'flatten': True})['result']['sessionId']
            cdp.send('Runtime.enable', session_id=session_id)
            cdp.send('Page.enable', session_id=session_id)
            cdp.send('Page.navigate', {'url': URL}, session_id=session_id)
            time.sleep(1.5)

            cdp.evaluate(
                f"localStorage.setItem({json.dumps(STORAGE_KEY)}, JSON.stringify({json.dumps({'ui': {'activePane': 'ks2'}, 'ks2Sheets': [{'id': 'legacy-sheet', 'title': 'Legacy sheet', 'rows': []}], 'common': {}, 'documentContext': {}})}));",
                session_id,
            )
            cdp.send('Page.reload', {'ignoreCache': True}, session_id=session_id)
            time.sleep(1.5)

            state = cdp.evaluate(
                "({pane: document.querySelector('.nav-chip.active')?.dataset?.pane, title: document.querySelector('.panel-title')?.textContent?.trim(), empty: document.querySelector('.empty-state')?.textContent?.trim()})",
                session_id,
            )
            if state.get('pane') != 'ks2:0':
                raise AssertionError(f"Expected stale activePane='ks2' to normalize to 'ks2:0', got {state.get('pane')!r}")
            if state.get('empty'):
                raise AssertionError(f"Expected KS-2 pane to render instead of empty state, got {state.get('empty')!r}")
            if state.get('title') != 'Legacy sheet':
                raise AssertionError(f"Expected normalized KS-2 pane title 'Legacy sheet', got {state.get('title')!r}")
        finally:
            cdp.close()
    finally:
        chrome.kill()

    print("OK: modern-light legacy activePane regression passed")


if __name__ == '__main__':
    main()
