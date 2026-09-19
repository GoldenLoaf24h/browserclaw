"""Tests for native-bridge token resolution in the Hermes plugin.

Run from the repo root:
    python -m pytest -q plugins/browserclaw/tests
"""
from __future__ import annotations

import importlib.util
import io
import json
import sys
import urllib.error
import urllib.request
from pathlib import Path
from unittest import mock

import pytest

PLUGIN_INIT = Path(__file__).resolve().parents[1] / '__init__.py'


@pytest.fixture(scope='module')
def plugin():
    spec = importlib.util.spec_from_file_location('browserclaw_plugin_under_test', PLUGIN_INIT)
    module = importlib.util.module_from_spec(spec)
    sys.modules[spec.name] = module
    spec.loader.exec_module(module)
    return module


@pytest.fixture
def home(tmp_path, monkeypatch):
    monkeypatch.setattr(Path, 'home', classmethod(lambda cls: tmp_path))
    monkeypatch.delenv('BROWSERCLAW_MCP_TOKEN', raising=False)
    monkeypatch.delenv('CHROME_MCP_TOKEN', raising=False)
    return tmp_path


def _write_token_file(home: Path, text: str) -> None:
    (home / '.chrome-mcp').mkdir()
    (home / '.chrome-mcp' / 'bridge-token').write_text(text, encoding='utf-8')


def test_none_when_nothing_configured(plugin, home):
    assert plugin._bridge_token() is None


def test_file_fallback_is_stripped(plugin, home):
    _write_token_file(home, '  filetoken\n')
    assert plugin._bridge_token() == 'filetoken'


def test_empty_file_yields_none(plugin, home):
    _write_token_file(home, '\n')
    assert plugin._bridge_token() is None


def test_chrome_env_beats_file(plugin, home, monkeypatch):
    _write_token_file(home, 'filetoken')
    monkeypatch.setenv('CHROME_MCP_TOKEN', 'chrometoken')
    assert plugin._bridge_token() == 'chrometoken'


def test_browserclaw_env_beats_chrome_env(plugin, home, monkeypatch):
    monkeypatch.setenv('CHROME_MCP_TOKEN', 'chrometoken')
    monkeypatch.setenv('BROWSERCLAW_MCP_TOKEN', ' clawtoken ')
    assert plugin._bridge_token() == 'clawtoken'


def _fake_response(payload: dict) -> io.BytesIO:
    # BytesIO is a context manager and has .read(), which is all _call_browserclaw uses.
    return io.BytesIO(json.dumps(payload).encode('utf-8'))


def test_call_sends_bearer_header(plugin, home, monkeypatch):
    monkeypatch.setenv('BROWSERCLAW_MCP_TOKEN', 'secret123')
    captured = []

    def fake_urlopen(req, timeout=None):
        captured.append(req)
        return _fake_response({'jsonrpc': '2.0', 'id': 1, 'result': {}})

    with mock.patch.object(urllib.request, 'urlopen', fake_urlopen):
        out = plugin._call_browserclaw('browserclaw_get_windows_and_tabs', {})

    assert json.loads(out) == {}
    assert len(captured) == 1
    assert captured[0].get_header('Authorization') == 'Bearer secret123'
    assert json.loads(captured[0].data)['params']['name'] == 'get_windows_and_tabs'


def test_call_without_token_sends_no_auth_header(plugin, home):
    captured = []

    def fake_urlopen(req, timeout=None):
        captured.append(req)
        return _fake_response({'result': {}})

    with mock.patch.object(urllib.request, 'urlopen', fake_urlopen):
        plugin._call_browserclaw('browserclaw_navigate', {'url': 'https://example.com'})

    assert captured[0].get_header('Authorization') is None


def test_401_returns_actionable_error_without_leaking_token(plugin, home, monkeypatch):
    monkeypatch.setenv('BROWSERCLAW_MCP_TOKEN', 'supersecret')

    def fake_urlopen(req, timeout=None):
        raise urllib.error.HTTPError(req.full_url, 401, 'Unauthorized', None, io.BytesIO(b''))

    with mock.patch.object(urllib.request, 'urlopen', fake_urlopen):
        out = json.loads(plugin._call_browserclaw('browserclaw_get_windows_and_tabs', {}))

    assert '401' in out['error']
    assert 'BROWSERCLAW_MCP_TOKEN' in out['error']
    assert 'supersecret' not in out['error']
