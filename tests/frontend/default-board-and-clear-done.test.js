// Default board, delete board, per-board "Clear done" switch and the team presence switch,
// all kept in the signed-in user's preferences (GET/PUT /api/v1/me/preferences).
// Run with: node --test tests/frontend/default-board-and-clear-done.test.js

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { JSDOM } = require('jsdom');

const ROOT = path.join(__dirname, '..', '..');
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf-8');
const indexHtml = read('web/index.html').replace(/<script\b[\s\S]*?<\/script>/gi, '');

const BOARDS = [
  { id: 'b1', name: 'Alpha', project_key: 'ALP', owner_id: 'u-admin', columns: '', settings: '{}' },
  { id: 'b2', name: 'Beta', project_key: 'BET', owner_id: 'u-admin', columns: '', settings: '{}' },
  { id: 'b3', name: 'Gamma', project_key: 'GAM', owner_id: 'u-member', columns: '', settings: '{}' },
];

async function load({ prefs = {}, role = 'admin', userId = 'u-admin', url = 'https://board.test/', lastBoard = null, confirm = true } = {}) {
  const dom = new JSDOM(indexHtml, { url, pretendToBeVisual: true, runScripts: 'outside-only' });
  const w = dom.window;
  const loaded = new Promise((r) => w.document.addEventListener('DOMContentLoaded', () => setTimeout(r, 0), { once: true }));
  if (lastBoard) w.localStorage.setItem('lwts-board-id', lastBoard);
  w.matchMedia = () => ({ matches: false, addEventListener() {}, removeEventListener() {} });
  const calls = [];
  let stored = JSON.parse(JSON.stringify(prefs));
  w.API = {
    listBoards: () => Promise.resolve(BOARDS.map((b) => ({ ...b }))),
    listCards: (boardId) => { calls.push({ op: 'listCards', boardId }); return Promise.resolve({}); },
    getBoard: (id) => Promise.resolve({ id, card_counts: {} }),
    getPreferences: () => { calls.push({ op: 'getPreferences' }); return Promise.resolve(JSON.parse(JSON.stringify(stored))); },
    putPreferences: (patch) => {
      calls.push({ op: 'putPreferences', patch });
      const next = { ...stored };
      Object.entries(patch).forEach(([k, v]) => { if (v === null) delete next[k]; else next[k] = v; });
      stored = next;
      return Promise.resolve(JSON.parse(JSON.stringify(stored)));
    },
    deleteBoard: (id) => { calls.push({ op: 'deleteBoard', id }); return Promise.resolve(null); },
    clearDoneCards: (id) => { calls.push({ op: 'clearDone', id }); return Promise.resolve({}); },
    updateBoard: () => Promise.resolve({}),
    putSettings: () => Promise.resolve({}),
    searchCards: () => Promise.resolve([]),
  };
  w.Toast = { success() {}, error(m) { calls.push({ op: 'toast-error', m }); }, info() {} };
  w.HTMLCanvasElement.prototype.getContext = () => new Proxy({}, { get: () => () => {}, set: () => true });
  w.HTMLCanvasElement.prototype.toDataURL = () => 'data:image/png;base64,';
  w.FnEditor = function () { return { getMarkdown: () => '', setMarkdown() {}, destroy() {}, focus() {} }; };
  w._settingsCache = {};
  w.HTMLElement.prototype.scrollIntoView = function () {};
  w.CSS = { escape: (s) => String(s) };
  w.parseBoardSettings = (raw) => JSON.parse(raw || '{}');
  w.Auth = { getUser: () => ({ id: userId, role }), redirectToLogin() {} };
  for (const f of ['dropdown.js', 'kanban.js', 'listview.js', 'features.js', 'settings.js']) {
    w.eval(`(function () {\n${read('web/src/' + f)}\n})();`);
  }
  await loaded;
  w.fnConfirm = (msg) => { calls.push({ op: 'confirm', msg }); return Promise.resolve(confirm); };
  w.currentUser = { id: userId, role };
  w.calls = calls;
  return w;
}

const plain = (x) => JSON.parse(JSON.stringify(x));
const patches = (w) => plain(w.calls.filter((c) => c.op === 'putPreferences').map((c) => c.patch));
const tick = (ms = 0) => new Promise((r) => setTimeout(r, ms));
const pickerRows = (w) => Array.from(w.document.querySelectorAll('#board-menu .header-board-option'))
  .filter((o) => BOARDS.some((b) => o.textContent.includes(b.name)));
const rowFor = (w, name) => pickerRows(w).find((o) => o.textContent.includes(name));

describe('default board at startup', () => {
  it('opens your default board instead of the last board used', async () => {
    const w = await load({ prefs: { default_board_id: 'b2' }, lastBoard: 'b3' });
    await w.loadFromAPI();
    assert.equal(w.currentBoardId, 'b2');
    const lists = w.calls.filter((c) => c.op === 'listCards');
    assert.deepEqual(lists.map((c) => c.boardId), ['b2'], 'no other board is loaded first');
    assert.equal(new w.URL(w.location.href).searchParams.get('board'), 'b2');
  });

  it('a board named in the URL still wins', async () => {
    const w = await load({ prefs: { default_board_id: 'b2' }, url: 'https://board.test/?board=b3' });
    await w.loadFromAPI();
    assert.equal(w.currentBoardId, 'b3');
  });

  it('without a default (or with a deleted one) keeps the last board used, else the first', async () => {
    const w = await load({ prefs: { default_board_id: 'gone' }, lastBoard: 'b3' });
    await w.loadFromAPI();
    assert.equal(w.currentBoardId, 'b3');
    assert.equal(w.effectiveDefaultBoardId(), 'b1', 'an unknown default falls back to the first board');
  });
});

describe('board picker', () => {
  it('stars your default board and makes another board the default from its star', async () => {
    const w = await load({ prefs: { default_board_id: 'b2' } });
    await w.loadFromAPI();
    w.renderBoardPicker();
    const star = (name) => rowFor(w, name).querySelector('.board-default-btn');
    assert.ok(star('Beta').classList.contains('is-default'));
    assert.equal(star('Beta').textContent, '★');
    assert.equal(star('Alpha').textContent, '☆');
    star('Gamma').click();
    await tick();
    assert.deepEqual(patches(w), [{ default_board_id: 'b3' }]);
    assert.ok(star('Gamma').classList.contains('is-default'), 'the picker is redrawn with the new default');
    assert.equal(w.currentBoardId, 'b2', 'starring a board does not open it');
  });

  it('offers delete only on boards you may delete, never on your default board', async () => {
    const admin = await load({ prefs: { default_board_id: 'b2' } });
    await admin.loadFromAPI();
    admin.renderBoardPicker();
    assert.ok(rowFor(admin, 'Alpha').querySelector('.board-delete-btn'), 'admins may delete any board');
    assert.ok(!rowFor(admin, 'Beta').querySelector('.board-delete-btn'), 'not the default board');
    assert.ok(rowFor(admin, 'Gamma').querySelector('.board-delete-btn'));

    const member = await load({ role: 'member', userId: 'u-member' });
    await member.loadFromAPI();
    member.renderBoardPicker();
    assert.ok(!rowFor(member, 'Alpha').querySelector('.board-delete-btn'), 'default board (first)');
    assert.ok(!rowFor(member, 'Beta').querySelector('.board-delete-btn'), 'a board the member did not create');
    assert.ok(rowFor(member, 'Gamma').querySelector('.board-delete-btn'), 'the board the member created');
    assert.ok(rowFor(member, 'Beta').querySelector('.board-default-btn'), 'every role can choose a default board');
  });

  it('deletes only after confirming, then opens your default board', async () => {
    const w = await load({ prefs: { default_board_id: 'b2' }, url: 'https://board.test/?board=b3' });
    await w.loadFromAPI();
    w.renderBoardPicker();
    assert.equal(await w.deleteBoard('b3', 'Gamma'), true);
    assert.deepEqual(w.calls.filter((c) => c.op === 'confirm' || c.op === 'deleteBoard').map((c) => c.op), ['confirm', 'deleteBoard']);
    assert.equal(w.currentBoardId, 'b2');

    const no = await load({ confirm: false });
    await no.loadFromAPI();
    assert.equal(await no.deleteBoard('b3', 'Gamma'), false);
    assert.ok(!no.calls.some((c) => c.op === 'deleteBoard'), 'cancelled: nothing is deleted');
  });
});

describe('Clear done switch and team presence', () => {
  it('hides Clear done on the boards where you switched it off, and it does nothing there', async () => {
    const w = await load({ prefs: { clear_done_disabled: { b2: true } }, url: 'https://board.test/?board=b2' });
    await w.loadFromAPI();
    const btn = w.document.getElementById('clear-done-btn');
    assert.ok(btn.classList.contains('clear-done-off'));
    w.clearCompleted();
    await tick(20);
    assert.ok(!w.calls.some((c) => c.op === 'clearDone'));
    w.selectBoard('b1', 'Alpha');
    assert.ok(!btn.classList.contains('clear-done-off'), 'shown again on another board');
  });

  it('hides the presence avatars when Show team presence is off', async () => {
    const w = await load({ prefs: { show_presence: false } });
    await w.loadFromAPI();
    assert.ok(w.document.body.classList.contains('presence-hidden'));
    const input = w.document.getElementById('settings-show-presence');
    input.checked = true;
    await w.setShowPresence(true);
    assert.ok(!w.document.body.classList.contains('presence-hidden'));
    assert.deepEqual(patches(w), [{ show_presence: true }]);
  });
});

describe('Settings > Boards', () => {
  async function openBoards(opts) {
    const w = await load(opts);
    await w.loadFromAPI();
    await w.loadBoardsSettings();
    return w;
  }
  const card = (w, id) => w.document.querySelector(`.settings-board-card[data-board-id="${id}"]`);

  it('marks your default board and lets you choose another one', async () => {
    const w = await openBoards({ prefs: { default_board_id: 'b2' } });
    const badges = Array.from(w.document.querySelectorAll('.settings-board-card .settings-board-badge'));
    assert.equal(badges.length, 1);
    assert.ok(card(w, 'b2').contains(badges[0]));
    const dd = w.document.getElementById('settings-default-board-dropdown');
    assert.match(dd.textContent, /Beta/);
    dd.querySelector('.fn-dropdown-trigger').click();
    const item = Array.from(w.document.querySelectorAll('.fn-dropdown-menu.open .fn-dropdown-option, #settings-default-board-dropdown .fn-dropdown-option'))
      .find((i) => i.textContent.includes('Alpha'));
    item.click();
    await tick();
    assert.deepEqual(patches(w), [{ default_board_id: 'b1' }]);
    assert.ok(card(w, 'b1').querySelector('.settings-board-badge'), 'the badge moves');
    assert.ok(!card(w, 'b2').querySelector('.settings-board-badge'));
    assert.equal(card(w, 'b1').querySelector('.board-delete-action').disabled, true, 'the new default cannot be deleted');
    assert.equal(card(w, 'b2').querySelector('.board-delete-action').disabled, false);
  });

  it('shows Delete board to those who may delete it, and confirms first', async () => {
    const member = await openBoards({ role: 'member', userId: 'u-member' });
    assert.ok(!card(member, 'b2').querySelector('.board-delete-action'), 'members cannot delete others\' boards');
    assert.ok(card(member, 'b3').querySelector('.board-delete-action'), 'but can delete the board they created');

    const w = await openBoards({ prefs: { default_board_id: 'b1' } });
    card(w, 'b3').querySelector('.board-delete-action').click();
    await tick(10);
    assert.deepEqual(w.calls.filter((c) => c.op === 'confirm' || c.op === 'deleteBoard').map((c) => c.op), ['confirm', 'deleteBoard']);
    assert.equal(card(w, 'b3'), null, 'the deleted board leaves the list');
  });

  it('switches the Clear done button per board, just for you', async () => {
    const w = await openBoards({ role: 'member', userId: 'u-member', prefs: { clear_done_disabled: { b1: true } } });
    const toggle = (id) => card(w, id).querySelector('.board-clear-done-toggle');
    assert.equal(toggle('b1').checked, false);
    assert.equal(toggle('b2').checked, true);
    assert.ok(toggle('b2').closest('.settings-personal'), 'usable by members in the read-only boards section');
    toggle('b2').checked = false;
    toggle('b2').dispatchEvent(new w.Event('change'));
    await tick();
    toggle('b1').checked = true;
    toggle('b1').dispatchEvent(new w.Event('change'));
    await tick();
    assert.deepEqual(patches(w), [
      { clear_done_disabled: { b1: true, b2: true } },
      { clear_done_disabled: { b2: true } },
    ]);
    toggle('b2').checked = true;
    toggle('b2').dispatchEvent(new w.Event('change'));
    await tick();
    assert.deepEqual(patches(w).pop(), { clear_done_disabled: null }, 'an empty map is removed');
  });
});
