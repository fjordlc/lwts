// Personal preferences API helpers: GET/PUT /api/v1/me/preferences.
// Run with: node --test tests/frontend/user-preferences.test.js

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { JSDOM } = require('jsdom');

const ROOT = path.join(__dirname, '..', '..');
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf-8');

function load() {
  const dom = new JSDOM('<!doctype html><body></body>', { url: 'https://board.test/', runScripts: 'outside-only' });
  const w = dom.window;
  const calls = [];
  w.fetch = (url, opts) => {
    calls.push({ url, method: opts.method, body: opts.body ? JSON.parse(opts.body) : null });
    return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({ default_board_id: 'b2' }) });
  };
  w.Auth = { getAccessToken: () => 'tok', getRefreshToken: () => null, clearTokens() {} };
  w.eval(`(function () {\n${read('web/src/api.js')}\n})();`);
  return { w, calls };
}

describe('preferences API helpers', () => {
  it('reads the signed-in user\'s preferences', async () => {
    const { w, calls } = load();
    const prefs = await w.API.getPreferences();
    assert.deepEqual(calls, [{ url: '/api/v1/me/preferences', method: 'GET', body: null }]);
    assert.equal(prefs.default_board_id, 'b2');
  });

  it('sends a patch, with null for keys to remove', async () => {
    const { w, calls } = load();
    await w.API.putPreferences({ default_board_id: 'b2', show_presence: null });
    assert.deepEqual(calls, [{ url: '/api/v1/me/preferences', method: 'PUT', body: { default_board_id: 'b2', show_presence: null } }]);
  });
});
