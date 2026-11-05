// Sort button: order the cards in each column (and the list) without touching their stored order;
// the board view and density are remembered per board.
// Run with: node --test tests/frontend/sort-cards.test.js

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
    assignee: null, reporter: null, points: 0, date: '2026-01-01', description: '', attachments: [],
    comments: [], version: 1, custom_fields: {}, epic_id: null,
    created_at: '2026-01-01T10:00:00Z', updated_at: '2026-01-01T10:00:00Z', ...over };
}

async function load({ width = 1440, storage = {}, epics = false } = {}) {
  const dom = new JSDOM(indexHtml, { url: 'https://board.test/', pretendToBeVisual: true, runScripts: 'outside-only' });
  const w = dom.window;
  const loaded = new Promise((r) => w.document.addEventListener('DOMContentLoaded', () => setTimeout(r, 0), { once: true }));
  Object.defineProperty(w, 'innerWidth', { value: width, configurable: true, writable: true });
  Object.defineProperty(w, 'innerHeight', { value: 844, configurable: true });
  for (const [k, v] of Object.entries(storage)) w.localStorage.setItem(k, v);
  w.matchMedia = (q) => ({ matches: /max-width: 768px/.test(q) ? width <= 768 : false, addEventListener() {}, removeEventListener() {} });
  const moves = [];
  w.API = {
    updateCard: () => Promise.resolve({ version: 2 }),
    moveCard: (id, body) => { moves.push({ id, ...body }); return Promise.resolve({ version: 2 }); },
    putSettings: () => Promise.resolve({}),
    listComments: () => Promise.resolve([]), searchCards: () => Promise.resolve([]),
  };
  w.Toast = { success() {}, error() {}, info() {} };
  w.FnEditor = function () { return { getMarkdown: () => '', setMarkdown() {}, destroy() {}, focus() {} }; };
  w._settingsCache = {};
  w.HTMLElement.prototype.scrollIntoView = function () {};
  w.CSS = { escape: (s) => String(s) };
  for (const f of ['dropdown.js', 'kanban.js', 'listview.js', 'features.js', 'a11y.js']) {
    w.eval(`(function () {\n${read('web/src/' + f)}\n})();`);
  }
  await loaded;
  const state = {};
  for (const col of w.COLUMNS) state[col.id] = [];
  // Stored (manual) order: B, C, A
  state.todo.push(
    card({ id: 'b', key: 'ALP-12', title: 'Bravo', priority: 'low', created_at: '2026-01-03T10:00:00Z', updated_at: '2026-01-05T10:00:00Z' }),
    card({ id: 'c', key: 'ALP-3', title: 'Charlie', priority: 'highest', created_at: '2026-01-01T10:00:00Z', updated_at: '2026-01-04T10:00:00Z' }),
    card({ id: 'a', key: 'ALP-7', title: 'Alpha', priority: 'high', created_at: '2026-01-02T10:00:00Z', updated_at: '2026-01-06T10:00:00Z' }),
  );
  state.backlog.push(card({ id: 'd', key: 'ALP-20', title: 'Delta' }));
  if (epics) {
    state.todo.forEach((c) => { c.epic_id = 'e1'; });
    state.backlog.push(card({ id: 'e1', key: 'ALP-30', title: 'An epic', tag: 'epic' }));
  }
  w.state = state;
  w.currentBoardId = 'b1';
  w.boardList = [{ id: 'b1', name: 'Alpha', project_key: 'ALP' }, { id: 'b2', name: 'Beta', project_key: 'BET' }];
  w.moves = moves;
  return w;
}

const shown = (w, col = 'todo') => Array.from(w.document.querySelectorAll(`#board .column-body[data-col="${col}"] .card`)).map((c) => c.dataset.id);
const stored = (w, col = 'todo') => w.state[col].map((c) => c.id);
function choose(w, key) {
  w.toggleFilterDropdown('sort');
  w.document.querySelector(`#filter-sort-menu [data-sort="${key}"]`).click();
}
function drag(w, id, toCol, overId) {
  const el = w.document.querySelector(`#board .card[data-id="${id}"]`);
  w.onDragStart({ target: el, dataTransfer: { setData() {} } });
  const body = w.document.querySelector(`#board .column-body[data-col="${toCol}"]`);
  const ev = { preventDefault() {}, currentTarget: body, clientY: 0, dataTransfer: {} };
  if (overId) {
    const over = w.document.querySelector(`#board .card[data-id="${overId}"]`);
    ev.clientY = 5;
    over.getBoundingClientRect = () => ({ top: 0, bottom: 10 });
  }
  w.onDragOver(ev);
  w.onDrop(ev);
}

describe('sort button', () => {
  it('is the first view control and offers the sort orders', async () => {
    const w = await load();
    w.render();
    const group = w.document.querySelector('#filter-bar .filter-view-group');
    assert.equal(group.firstElementChild.id, 'filter-sort-wrap');
    w.toggleFilterDropdown('sort');
    const items = Array.from(w.document.querySelectorAll('#filter-sort-menu .filter-sort-item')).map((i) => i.dataset.sort);
    assert.deepEqual(items, ['manual', 'priority', 'title', 'key', 'updated', 'created']);
    assert.ok(w.document.querySelector('#filter-sort-menu [data-sort="manual"]').classList.contains('active'));
  });

  it('orders the cards on the board but not their stored order', async () => {
    const w = await load();
    w.render();
    assert.deepEqual(shown(w), ['b', 'c', 'a']);
    choose(w, 'priority');
    assert.deepEqual(shown(w), ['c', 'a', 'b']);
    assert.deepEqual(stored(w), ['b', 'c', 'a']);
    assert.ok(w.document.getElementById('filter-sort-menu').classList.contains('hidden'));
    assert.ok(w.document.querySelector('#filter-sort-wrap .filter-btn').classList.contains('filter-btn-active'));
    choose(w, 'title');
    assert.deepEqual(shown(w), ['a', 'b', 'c']);
    choose(w, 'key');
    assert.deepEqual(shown(w), ['c', 'a', 'b']);
    choose(w, 'updated');
    assert.deepEqual(shown(w), ['a', 'b', 'c']);
    choose(w, 'created');
    assert.deepEqual(shown(w), ['b', 'a', 'c']);
    assert.equal(w.moves.length, 0);
  });

  it('reverses the direction when the same order is chosen again', async () => {
    const w = await load();
    w.render();
    choose(w, 'title');
    choose(w, 'title');
    assert.deepEqual(shown(w), ['c', 'b', 'a']);
    w.toggleFilterDropdown('sort');
    assert.equal(w.document.querySelector('#filter-sort-menu [data-sort="title"] .filter-sort-dir').textContent, '↓');
  });

  it('goes back to the drag order with Manual order', async () => {
    const w = await load();
    w.render();
    choose(w, 'priority');
    choose(w, 'manual');
    assert.deepEqual(shown(w), ['b', 'c', 'a']);
    assert.equal(w.localStorage.getItem('lwts-sort:b1'), null);
    assert.ok(!w.document.querySelector('#filter-sort-wrap .filter-btn').classList.contains('filter-btn-active'));
  });

  it('is kept per board across renders and reloads', async () => {
    const w = await load();
    w.render();
    choose(w, 'priority');
    assert.deepEqual(JSON.parse(w.localStorage.getItem('lwts-sort:b1')), { key: 'priority', dir: 'asc' });
    w.currentBoardId = 'b2';
    w.render();
    assert.deepEqual(shown(w), ['b', 'c', 'a']);
    const again = await load({ storage: { 'lwts-sort:b1': '{"key":"title","dir":"desc"}' } });
    again.render();
    assert.deepEqual(shown(again), ['c', 'b', 'a']);
  });

  it('orders the cards inside epic swimlanes', async () => {
    const w = await load({ epics: true });
    w.render();
    choose(w, 'priority');
    const lane = Array.from(w.document.querySelectorAll('.epic-lane[data-epic-id="e1"] .column-body[data-col="todo"] .card')).map((c) => c.dataset.id);
    assert.deepEqual(lane, ['c', 'a', 'b']);
  });

  it('keeps stored positions when a card is dragged within a sorted column', async () => {
    const w = await load();
    w.render();
    choose(w, 'priority');
    drag(w, 'b', 'todo', 'c');
    assert.deepEqual(stored(w), ['b', 'c', 'a']);
    assert.equal(w.moves.length, 0);
    assert.deepEqual(shown(w), ['c', 'a', 'b']);
  });

  it('moves a card to the end of another sorted column', async () => {
    const w = await load();
    w.render();
    choose(w, 'priority');
    drag(w, 'd', 'todo', 'c');
    assert.deepEqual(stored(w), ['b', 'c', 'a', 'd']);
    assert.equal(w.moves.length, 1);
    assert.equal(w.moves[0].column_id, 'todo');
    assert.equal(w.moves[0].position, 3);
    assert.deepEqual(shown(w), ['c', 'a', 'd', 'b']); // d is medium priority
  });

  it('still reorders by dragging in manual order', async () => {
    const w = await load();
    w.render();
    drag(w, 'a', 'todo', 'b');
    assert.deepEqual(stored(w), ['a', 'b', 'c']);
    assert.equal(w.moves[0].position, 0);
  });

  it('keeps the order when a card arrives from another session', async () => {
    const w = await load();
    w.fromAPI = (c) => card({ ...c, priority: c.priority });
    w.render();
    choose(w, 'priority');
    w.addCardToState({ id: 'n', key: 'ALP-40', title: 'New', column_id: 'todo', priority: 'highest', tag: 'blue' });
    assert.deepEqual(shown(w), ['c', 'n', 'a', 'b']);
  });

  it('orders the list view too', async () => {
    const w = await load();
    w.render();
    w.switchView('list');
    choose(w, 'priority');
    const th = w.document.querySelector('#list-view th[data-sort="priority"]');
    assert.ok(th.classList.contains('sort-asc'));
    const rows = Array.from(w.document.querySelectorAll('#list-view .list-row')).map((r) => r.dataset.id);
    assert.deepEqual(rows, ['c', 'a', 'd', 'b']);
  });
});

describe('view and density per board', () => {
  it('remembers board or list per board', async () => {
    const w = await load();
    w.render();
    w.switchView('list');
    assert.deepEqual(JSON.parse(w.localStorage.getItem('lwts-board-view:b1')), { view: 'list' });
    w.currentBoardId = 'b2';
    w.switchView('board');
    w.restoreBoardView('b1');
    assert.equal(w.currentView, 'list');
    assert.equal(w.document.getElementById('board').style.display, 'none');
    assert.equal(w.document.getElementById('list-view').style.display, '');
    w.restoreBoardView('b2');
    assert.equal(w.currentView, 'board');
  });

  it('keeps the current view on a board without a memory', async () => {
    const w = await load();
    w.render();
    w.switchView('list');
    w.restoreBoardView('b2');
    assert.equal(w.currentView, 'list');
  });

  it('remembers the density per board', async () => {
    const w = await load();
    w.render();
    w.selectDensity('compact');
    assert.deepEqual(JSON.parse(w.localStorage.getItem('lwts-board-view:b1')), { density: 'compact' });
    w.currentBoardId = 'b2';
    w.selectDensity('comfortable');
    w.restoreBoardView('b1');
    assert.ok(w.document.body.classList.contains('density-compact'));
    assert.equal(w.document.getElementById('density-toggle-label').textContent, 'Compact');
    w.restoreBoardView('b2');
    assert.ok(w.document.body.classList.contains('density-comfortable'));
  });

  it('restores the view when a board loads', async () => {
    const w = await load({ storage: { 'lwts-board-view:b2': '{"view":"list","density":"compact"}' } });
    w.render();
    w.API.listCards = () => Promise.resolve({ todo: [card({ id: 'x', board_id: 'b2' })] });
    w.currentBoardId = 'b2';
    await w.loadBoardCards('b2');
    assert.equal(w.currentView, 'list');
    assert.ok(w.document.body.classList.contains('density-compact'));
    assert.ok(w.document.querySelector('#list-view .list-row[data-id="x"]'));
  });

  it('does not remember the view of All Boards', async () => {
    const w = await load();
    w.render();
    w.currentBoardId = 'all';
    w.switchView('list');
    assert.equal(w.localStorage.getItem('lwts-board-view:all'), null);
  });
});
