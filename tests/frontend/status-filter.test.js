// Status filter: choose which columns show on the board, the phone tabs and the list view.
// Run with: node --test tests/frontend/status-filter.test.js

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
    comments: [], version: 1, custom_fields: {}, epic_id: null, ...over };
}

async function load({ width = 1440, storage = {} } = {}) {
  const dom = new JSDOM(indexHtml, { url: 'https://board.test/', pretendToBeVisual: true, runScripts: 'outside-only' });
  const w = dom.window;
  const loaded = new Promise((r) => w.document.addEventListener('DOMContentLoaded', () => setTimeout(r, 0), { once: true }));
  Object.defineProperty(w, 'innerWidth', { value: width, configurable: true, writable: true });
  Object.defineProperty(w, 'innerHeight', { value: 844, configurable: true });
  for (const [k, v] of Object.entries(storage)) w.localStorage.setItem(k, v);
  w.matchMedia = (q) => ({ matches: /max-width: 768px/.test(q) ? width <= 768 : false, addEventListener() {}, removeEventListener() {} });
  w.API = { updateCard: () => Promise.resolve({}), listComments: () => Promise.resolve([]), searchCards: () => Promise.resolve([]) };
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
  state.todo.push(card(), card({ id: 'c2', key: 'ALP-2', title: 'Second card' }));
  w.state = state;
  w.currentBoardId = 'b1';
  w.boardList = [{ id: 'b1', name: 'Alpha', project_key: 'ALP' }];
  return w;
}

const tick = (ms = 0) => new Promise((r) => setTimeout(r, ms));
const ids = (w, sel) => Array.from(w.document.querySelectorAll(sel)).map((e) => e.dataset.col || e.querySelector('[data-col]')?.dataset.col);
const hiddenCols = (w) => Array.from(w.document.querySelectorAll('#board .column.column-hidden')).map((c) => c.querySelector('.column-body').dataset.col);
function openMenu(w) {
  w.toggleFilterDropdown('column');
  return w.document.getElementById('filter-column-menu');
}
function uncheck(w, colId) {
  const box = openMenu(w).querySelector(`input[value="${colId}"]`);
  box.checked = false;
  box.dispatchEvent(new w.Event('change'));
  w.toggleFilterDropdown('column');
}

describe('status filter', () => {
  it('sits in the filter row after Type and lists the board\'s columns, all shown', async () => {
    const w = await load();
    const wrap = w.document.getElementById('filter-column-wrap');
    assert.ok(wrap);
    assert.equal(wrap.previousElementSibling.id, 'filter-tag-wrap');
    const boxes = Array.from(openMenu(w).querySelectorAll('input[type="checkbox"]'));
    assert.deepEqual(boxes.map((b) => b.value), [...w.COLUMNS].map((c) => c.id));
    assert.ok(boxes.every((b) => b.checked));
    assert.equal(w.document.querySelector('#filter-column-menu .filter-menu-action'), null);
  });

  it('hides an unticked column on the board and shows the number of shown columns', async () => {
    const w = await load();
    w.render();
    uncheck(w, 'backlog');
    assert.deepEqual(hiddenCols(w), ['backlog']);
    const badge = w.document.getElementById('filter-column-badge');
    assert.equal(badge.textContent, String(w.COLUMNS.length - 1));
    assert.equal(badge.style.display, 'inline-flex');
  });

  it('keeps the columns hidden when the board renders again', async () => {
    const w = await load();
    w.render();
    uncheck(w, 'done');
    w.render();
    assert.deepEqual(hiddenCols(w), ['done']);
  });

  it('is remembered per board', async () => {
    const w = await load();
    w.render();
    uncheck(w, 'backlog');
    assert.equal(w.localStorage.getItem('lwts-hidden-columns:b1'), '["backlog"]');
    w.currentBoardId = 'b2';
    w.render();
    assert.deepEqual(hiddenCols(w), []);
    w.currentBoardId = 'b1';
    w.render();
    assert.deepEqual(hiddenCols(w), ['backlog']);
  });

  it('restores the choice on the next visit', async () => {
    const w = await load({ storage: { 'lwts-hidden-columns:b1': '["todo","in-progress"]' } });
    w.render();
    assert.deepEqual(hiddenCols(w), ['todo', 'in-progress']);
  });

  it('keeps at least one column', async () => {
    const w = await load();
    w.render();
    const all = [...w.COLUMNS].map((c) => c.id);
    all.forEach((id) => uncheck(w, id));
    assert.deepEqual(hiddenCols(w), all.slice(0, -1));
    assert.equal(openMenu(w).querySelector(`input[value="${all[all.length - 1]}"]`).checked, true);
  });

  it('shows every column again with Show all', async () => {
    const w = await load();
    w.render();
    uncheck(w, 'backlog');
    uncheck(w, 'todo');
    openMenu(w).querySelector('.filter-menu-action').click();
    assert.deepEqual(hiddenCols(w), []);
    assert.equal(w.localStorage.getItem('lwts-hidden-columns:b1'), null);
    assert.equal(w.document.getElementById('filter-column-badge').style.display, 'none');
  });

  it('is not reset by Clear all', async () => {
    const w = await load();
    w.render();
    uncheck(w, 'backlog');
    w.clearAllFilters();
    assert.deepEqual(hiddenCols(w), ['backlog']);
  });

  it('hides the column headers and lane cells in the epic layout', async () => {
    const w = await load();
    w.state.todo.push(card({ id: 'e1', key: 'ALP-9', title: 'Epic', tag: 'epic' }));
    w.state.todo[0].epic_id = 'e1';
    w.render();
    assert.ok(w.document.querySelector('#board .board-column-headers'));
    uncheck(w, 'todo');
    const hdr = Array.from(w.document.querySelectorAll('.board-column-headers .column-header.column-hidden'));
    assert.deepEqual(hdr.map((h) => h.querySelector('.column-dot').dataset.col), ['todo']);
    const cells = Array.from(w.document.querySelectorAll('.epic-lane-cell.column-hidden'));
    assert.ok(cells.length > 0);
    assert.ok(cells.every((c) => c.querySelector('.column-body').dataset.col === 'todo'));
  });

  it('leaves the hidden columns\' cards out of the list view', async () => {
    const w = await load();
    w.render();
    w.state.backlog.push(card({ id: 'c9', key: 'ALP-9', title: 'Backlog card' }));
    uncheck(w, 'todo');
    w.renderListView();
    const rows = Array.from(w.document.querySelectorAll('#list-view .list-row')).map((r) => r.dataset.id);
    assert.deepEqual(rows, ['c9']);
  });
});

describe('column tabs on phones', () => {
  it('hide the tab of a hidden column and move off it when it was open', async () => {
    const w = await load({ width: 390 });
    w.render();
    assert.equal(w.document.querySelector('.mobile-tab.active').dataset.col, 'todo');
    uncheck(w, 'todo');
    assert.ok(w.document.querySelector('.mobile-tab[data-col="todo"]').classList.contains('column-hidden'));
    const active = w.document.querySelector('.mobile-tab.active').dataset.col;
    assert.notEqual(active, 'todo');
    assert.equal(w.document.querySelector('#board .column.mobile-active .column-body').dataset.col, active);
  });

  it('follow the columns of the board that is open', async () => {
    const w = await load({ width: 390 });
    w.render();
    const cols = [{ id: 'inbox', label: 'Inbox' }, { id: 'doing', label: 'Doing' }, { id: 'shipped', label: 'Shipped' }];
    w.COLUMNS.length = 0;
    cols.forEach((c) => w.COLUMNS.push(c));
    w.state = { inbox: [card({ id: 'x1', board_id: 'b2' })], doing: [], shipped: [] };
    w.currentBoardId = 'b2';
    w.render();
    assert.deepEqual(Array.from(w.document.querySelectorAll('.mobile-tab')).map((t) => t.dataset.col), ['inbox', 'doing', 'shipped']);
    assert.equal(w.document.querySelector('.mobile-tab.active').dataset.col, 'inbox');
    assert.equal(w.document.querySelector('#board .column.mobile-active .column-body').dataset.col, 'inbox');
  });
});

describe('status filter styles', () => {
  it('hides switched-off columns', () => {
    assert.match(read('web/styles/board.css'), /\.column-hidden \{ display: none !important; \}/);
  });
});
