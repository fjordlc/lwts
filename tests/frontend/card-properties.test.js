// Card properties: what board cards show and which list columns show, per user, board and view.
// Run with: node --test tests/frontend/card-properties.test.js

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { JSDOM } = require('jsdom');

const ROOT = path.join(__dirname, '..', '..');
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf-8');
const indexHtml = read('web/index.html').replace(/<script\b[\s\S]*?<\/script>/gi, '');

function card(over) {
  return { id: 'c1', key: 'ALP-1', board_id: 'b1', title: 'First card', tag: 'blue', priority: 'medium',
    assignee: 'u1', reporter: null, points: 3, date: '', description: '', attachments: [],
    comments: [], version: 1, custom_fields: {}, epic_id: null, ...over };
}

const SETTINGS = JSON.stringify({ custom_fields: [
  { id: 'team', name: 'Team', type: 'select', group_by: true, options: [{ id: 'core', label: 'Core' }, { id: 'web', label: 'Web' }] },
  { id: 'area', name: 'Area', type: 'text' },
  { id: 'size', name: 'Size', type: 'text' },
] });

async function load({ storage = {}, user = 'u1' } = {}) {
  const dom = new JSDOM(indexHtml, { url: 'https://board.test/', pretendToBeVisual: true, runScripts: 'outside-only' });
  const w = dom.window;
  const loaded = new Promise((r) => w.document.addEventListener('DOMContentLoaded', () => setTimeout(r, 0), { once: true }));
  Object.defineProperty(w, 'innerWidth', { value: 1440, configurable: true, writable: true });
  for (const [k, v] of Object.entries(storage)) w.localStorage.setItem(k, v);
  w.matchMedia = () => ({ matches: false, addEventListener() {}, removeEventListener() {} });
  w.API = {
    updateCard: () => Promise.resolve({}), moveCard: () => Promise.resolve({}), createCard: () => Promise.resolve({}),
    putSettings: () => Promise.resolve({}), listComments: () => Promise.resolve([]), searchCards: () => Promise.resolve([]),
  };
  w.Toast = { success() {}, error() {}, info() {} };
  w.FnEditor = function () { return { getMarkdown: () => '', setMarkdown() {}, destroy() {}, focus() {} }; };
  w._settingsCache = {};
  w.HTMLElement.prototype.scrollIntoView = function () {};
  w.CSS = { escape: (s) => String(s) };
  w.parseBoardSettings = (raw) => JSON.parse(raw || '{}');
  w.Auth = { getUser: () => ({ id: user }) };
  for (const f of ['dropdown.js', 'kanban.js', 'listview.js', 'features.js', 'a11y.js']) {
    w.eval(`(function () {\n${read('web/src/' + f)}\n})();`);
  }
  await loaded;
  w.USERS.push({ value: 'u1', label: 'Ann', initials: 'A' });
  const state = {};
  for (const col of w.COLUMNS) state[col.id] = [];
  state.todo.push(
    card({ id: 'a', custom_fields: { team: 'web', area: 'Login', size: 'L' } }),
    card({ id: 'b', key: 'ALP-2', priority: 'high', custom_fields: {} }),
  );
  w.state = state;
  w.currentBoardId = 'b1';
  w.boardList = [{ id: 'b1', name: 'Alpha', project_key: 'ALP', settings: SETTINGS }, { id: 'b2', name: 'Beta', project_key: 'BET', settings: '{}' }];
  return w;
}

const board = (w) => w.document.getElementById('board');
function openMenu(w) {
  if (w.document.getElementById('filter-props-menu').classList.contains('hidden')) w.toggleFilterDropdown('props');
  return w.document.getElementById('filter-props-menu');
}
const rows = (w) => Array.from(openMenu(w).querySelectorAll('[data-prop]')).map((r) => ({
  id: r.dataset.prop, shown: r.classList.contains('shown'), locked: r.classList.contains('disabled'),
}));
const click = (w, id) => openMenu(w).querySelector(`[data-prop="${id}"]`).click();
const chips = (w, id) => Array.from(w.document.querySelectorAll(`#board .card[data-id="${id}"] .card-custom-chip`)).map((c) => c.textContent);

describe('card properties', () => {
  it('puts a Properties button after Group by in the view group', async () => {
    const w = await load();
    w.render();
    const ids = Array.from(w.document.querySelector('#filter-bar .filter-view-group').children).map((c) => c.id);
    assert.equal(ids[ids.indexOf('filter-group-wrap') + 1], 'filter-props-wrap');
    assert.equal(w.document.querySelector('#filter-props-wrap .filter-btn').getAttribute('aria-label'), 'Card properties');
  });

  it('lists the card properties and the board\'s custom fields, all shown by default', async () => {
    const w = await load();
    w.render();
    assert.deepEqual(rows(w).map((r) => r.id), ['type', 'priority', 'assignee', 'points', 'due', 'key', 'cf:team', 'cf:area', 'cf:size']);
    assert.ok(rows(w).every((r) => r.shown && !r.locked));
    assert.equal(openMenu(w).querySelector('.filter-menu-title').textContent, 'Card properties');
  });

  it('hides a property on the cards with a class, keeps the menu open and remembers it', async () => {
    const w = await load();
    w.render();
    click(w, 'priority');
    assert.ok(board(w).classList.contains('cards-hide-priority'));
    assert.ok(!openMenu(w).classList.contains('hidden'));
    assert.equal(rows(w).find((r) => r.id === 'priority').shown, false);
    assert.deepEqual(JSON.parse(w.localStorage.getItem('lwts-card-props:u1:b1:board')), ['priority']);
    assert.ok(w.document.querySelector('#filter-props-wrap .filter-btn').classList.contains('filter-btn-active'));
    click(w, 'key');
    assert.ok(board(w).classList.contains('cards-hide-key'));
    click(w, 'priority');
    click(w, 'key');
    assert.ok(!board(w).classList.contains('cards-hide-priority'));
    assert.equal(w.localStorage.getItem('lwts-card-props:u1:b1:board'), null);
    assert.ok(!w.document.querySelector('#filter-props-wrap .filter-btn').classList.contains('filter-btn-active'));
  });

  it('hides custom-field chips one field at a time, so the next field can show', async () => {
    const w = await load();
    w.render();
    assert.deepEqual(chips(w, 'a'), ['Web', 'Login']);
    click(w, 'cf:team');
    assert.deepEqual(chips(w, 'a'), ['Login', 'L']);
  });

  it('restores the choice per user and board', async () => {
    const w = await load({ storage: { 'lwts-card-props:u1:b1:board': '["type","cf:area"]' } });
    w.render();
    assert.ok(board(w).classList.contains('cards-hide-type'));
    assert.deepEqual(chips(w, 'a'), ['Web', 'L']);
    w.currentBoardId = 'b2';
    w.render();
    assert.ok(!board(w).classList.contains('cards-hide-type'));
    const other = await load({ user: 'u2', storage: { 'lwts-card-props:u1:b1:board': '["type"]' } });
    other.render();
    assert.ok(!board(other).classList.contains('cards-hide-type'));
  });

  it('does not repeat the grouped property on the cards', async () => {
    const w = await load();
    w.render();
    w.chooseGroupBy('priority');
    assert.ok(board(w).classList.contains('cards-hide-priority'));
    const row = rows(w).find((r) => r.id === 'priority');
    assert.deepEqual([row.shown, row.locked], [false, true]);
    assert.match(openMenu(w).querySelector('[data-prop="priority"]').textContent, /grouped/);
    w.chooseGroupBy('cf:team');
    assert.ok(!board(w).classList.contains('cards-hide-priority'));
    assert.deepEqual(chips(w, 'a'), ['Login', 'L']);
    w.chooseGroupBy('off');
    assert.deepEqual(chips(w, 'a'), ['Web', 'Login']);
    assert.equal(w.localStorage.getItem('lwts-card-props:u1:b1:board'), null);
  });

  it('follows the Appearance switches: what they turn off stays off and cannot be switched on here', async () => {
    const w = await load();
    w.document.body.classList.add('hide-card-ids', 'hide-avatars');
    w.render();
    const r = rows(w);
    for (const id of ['key', 'assignee']) {
      const row = r.find((x) => x.id === id);
      assert.deepEqual([row.shown, row.locked], [false, true], id);
      assert.match(openMenu(w).querySelector(`[data-prop="${id}"]`).textContent, /off in Appearance/);
    }
    assert.equal(r.find((x) => x.id === 'priority').locked, false);
    openMenu(w).querySelector('[data-prop="key"]').click();
    assert.equal(w.localStorage.getItem('lwts-card-props:u1:b1:board'), null);
  });

  it('chooses list columns separately in the list view, with classes on the cells', async () => {
    const w = await load();
    w.render();
    click(w, 'type');
    w.toggleFilterDropdown('props');
    w.switchView('list');
    assert.deepEqual(rows(w).map((r) => r.id), ['key', 'status', 'type', 'priority', 'assignee', 'points', 'created', 'updated', 'due']);
    assert.ok(rows(w).every((r) => r.shown));
    assert.equal(openMenu(w).querySelector('.filter-menu-title').textContent, 'List columns');
    const list = w.document.getElementById('list-view');
    assert.equal(list.querySelectorAll('th.list-col-status').length, 1);
    assert.equal(list.querySelectorAll('td.list-col-status').length, 2);
    click(w, 'status');
    click(w, 'updated');
    assert.ok(list.classList.contains('list-hide-status') && list.classList.contains('list-hide-updated'));
    assert.ok(!list.classList.contains('list-hide-type'));
    assert.deepEqual(JSON.parse(w.localStorage.getItem('lwts-card-props:u1:b1:list')), ['status', 'updated']);
    assert.deepEqual(JSON.parse(w.localStorage.getItem('lwts-card-props:u1:b1:board')), ['type']);
  });

  it('makes list group headers span only the shown columns', async () => {
    const w = await load({ storage: { 'lwts-card-props:u1:b1:list': '["status","points"]' } });
    w.state.backlog.push(card({ id: 'e1', key: 'ALP-9', title: 'An epic', tag: 'epic' }));
    w.state.todo[0].epic_id = 'e1';
    w.switchView('list');
    const header = w.document.querySelector('#list-view .list-epic-header td');
    assert.equal(header.colSpan, 8);
  });
});
