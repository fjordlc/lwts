// Avatar menu > Profile opens the edit-user modal for yourself (web/src/settings.js).
// Run with: node --test tests/frontend/profile.test.js

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { JSDOM } = require('jsdom');

const ROOT = path.join(__dirname, '..', '..');
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf-8');
const indexHtml = read('web/index.html').replace(/<script\b[\s\S]*?<\/script>/gi, '');

const USERS = [
  { id: 'u1', name: 'Me Myself', email: 'me@board.test', role: 'member', avatar_url: '' },
  { id: 'u2', name: 'Someone Else', email: 'else@board.test', role: 'member', avatar_url: '' },
];

async function load() {
  const dom = new JSDOM(indexHtml, { url: 'https://board.test/', pretendToBeVisual: true, runScripts: 'outside-only' });
  const w = dom.window;
  const loaded = new Promise((r) => w.document.addEventListener('DOMContentLoaded', () => setTimeout(r, 0), { once: true }));
  const calls = [];
  w.Auth = { getUser: () => ({ id: 'u1', role: 'member' }) };
  w.API = {
    listUsers: async () => USERS.map((u) => ({ ...u })),
    updateUserRole: async (id, role) => { calls.push(['role', id, role]); return {}; },
    updateUserAvatar: async (id, url) => { calls.push(['avatar', id, url]); return {}; },
  };
  const toasts = [];
  w.Toast = { success: (m) => toasts.push(['success', m]), error: (m) => toasts.push(['error', m]), info() {} };
  w.matchMedia = () => ({ matches: false, addEventListener() {}, removeEventListener() {} });
  w.HTMLElement.prototype.scrollIntoView = function () {};
  // The default avatars are drawn on a canvas: jsdom has none.
  w.HTMLCanvasElement.prototype.getContext = () => new Proxy({}, { get: () => () => {}, set: () => true });
  w.HTMLCanvasElement.prototype.toDataURL = () => 'data:image/png;base64,test';
  w.eval(`(function () {\n${read('web/src/dropdown.js')}\n})();`);
  w.eval(`(function () {\n${read('web/src/settings.js')}\n})();`);
  await loaded;
  return { w, calls, toasts };
}

const tick = () => new Promise((r) => setTimeout(r, 0));
const profileItem = (w) => Array.from(w.document.querySelectorAll('#header-user-dropdown .header-user-item'))
  .find((el) => el.textContent.trim() === 'Profile');
const roleGroup = (w) => w.document.getElementById('create-user-role').closest('.form-group');

describe('profile menu item', () => {
  it('opens your own user instead of the settings page', async () => {
    const { w } = await load();
    const onclick = profileItem(w).getAttribute('onclick');
    assert.match(onclick, /openProfile\(\)/);
    assert.doesNotMatch(onclick, /openSettings/);
    await w.openProfile();
    assert.equal(w.document.getElementById('create-user-modal').classList.contains('active'), true);
    assert.equal(w.document.getElementById('user-modal-title').textContent, 'Me Myself');
    assert.equal(w.document.getElementById('create-user-email').value, 'me@board.test');
    assert.equal(w.document.getElementById('user-modal-delete').classList.contains('hidden'), true);
  });

  it('hides the role field for yourself and shows it again for someone else', async () => {
    const { w } = await load();
    await w.openProfile();
    assert.equal(roleGroup(w).style.display, 'none');
    w.openEditUserModal(USERS[1]);
    assert.equal(roleGroup(w).style.display, '');
  });

  it('saves your avatar without trying to change your own role', async () => {
    const { w, calls, toasts } = await load();
    await w.openProfile();
    w.document.getElementById('create-user-avatar').value = 'data:image/png;base64,AAAA';
    await w.submitUserModal();
    await tick();
    assert.deepEqual(calls, [['avatar', 'u1', 'data:image/png;base64,AAAA']]);
    assert.deepEqual(toasts.filter((t) => t[0] === 'error'), []);
    assert.equal(w.document.getElementById('create-user-modal').classList.contains('active'), false);
  });

  it('still sends the role when editing someone else', async () => {
    const { w, calls } = await load();
    w.openEditUserModal(USERS[1]);
    await w.submitUserModal();
    assert.deepEqual(calls[0], ['role', 'u2', 'member']);
  });

  it('gives email and password back after a bot was edited', async () => {
    const { w } = await load();
    w.openEditBotModal({ id: 'b1', name: 'Bot', role: 'member' });
    assert.equal(w.document.getElementById('create-user-email').disabled, true);
    await w.openProfile();
    assert.equal(w.document.getElementById('create-user-email').disabled, false);
    assert.equal(w.document.getElementById('create-user-password').disabled, false);
  });
});
