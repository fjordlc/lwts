// Add-card rows: an "Add card" row under each column and in each lane cell, the phones' round
// New card button, empty epic lanes that keep their cells, and the whole cell as a dropzone.
// Run with: node --test tests/frontend/add-card-rows.test.js

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
    assignee: null, reporter: null, points: 0, date: '', description: '', attachments: [],
    comments: [], version: 1, custom_fields: {}, epic_id: null, ...over };
}

const SETTINGS = JSON.stringify({ custom_fields: [
  { id: 'team', name: 'Team', type: 'select', group_by: true, options: [{ id: 'core', label: 'Core' }, { id: 'web', label: 'Web' }] },
] });

async function load({ width = 1440, epics = true } = {}) {
  const dom = new JSDOM(indexHtml, { url: 'https://board.test/', pretendToBeVisual: true, runScripts: 'outside-only' });
  const w = dom.window;
  const loaded = new Promise((r) => w.document.addEventListener('DOMContentLoaded', () => setTimeout(r, 0), { once: true }));
  Object.defineProperty(w, 'innerWidth', { value: width, configurable: true, writable: true });
  Object.defineProperty(w, 'innerHeight', { value: 844, configurable: true });
  w.matchMedia = (q) => ({ matches: /max-width: 768px/.test(q) ? width <= 768 : false, addEventListener() {}, removeEventListener() {} });
  const calls = [];
  w.API = {
    updateCard: (id, body) => { calls.push({ op: 'update', id, ...body }); return Promise.resolve({ id, version: (body.version || 0) + 1 }); },
    moveCard: (id, body) => { calls.push({ op: 'move', id, ...body }); return Promise.resolve({ id, version: (body.version || 0) + 1 }); },
    createCard: (boardId, body) => { calls.push({ op: 'create', ...body }); return Promise.resolve({ ...body, id: 'srv-1', key: 'ALP-50', version: 1 }); },
    putSettings: () => Promise.resolve({}),
    listComments: () => Promise.resolve([]), searchCards: () => Promise.resolve([]),
  };
  w.Toast = { success() {}, error() {}, info() {} };
  w.FnEditor = function () { return { getMarkdown: () => '', setMarkdown() {}, destroy() {}, focus() {} }; };
  w._settingsCache = {};
  w.HTMLElement.prototype.scrollIntoView = function () {};
  w.CSS = { escape: (s) => String(s) };
  w.parseBoardSettings = (raw) => JSON.parse(raw || '{}');
  w.Auth = { getUser: () => ({ id: 'u1' }) };
  for (const f of ['dropdown.js', 'kanban.js', 'listview.js', 'features.js', 'a11y.js']) {
    w.eval(`(function () {\n${read('web/src/' + f)}\n})();`);
  }
  await loaded;
  w.USERS.push({ value: 'u1', label: 'Ann', initials: 'A' }, { value: 'u2', label: 'Bob', initials: 'B' });
  const state = {};
  for (const col of w.COLUMNS) state[col.id] = [];
  state.todo.push(
    card({ id: 'a', key: 'ALP-1', priority: 'low', tag: 'red', assignee: 'u2', epic_id: epics ? 'e1' : null, custom_fields: { team: 'web' } }),
    card({ id: 'b', key: 'ALP-2', priority: 'high', assignee: 'u1', custom_fields: { team: 'core' } }),
  );
  if (epics) state.backlog.push(card({ id: 'e1', key: 'ALP-9', title: 'An epic', tag: 'epic' }), card({ id: 'e2', key: 'ALP-10', title: 'Empty epic', tag: 'epic' }));
  w.state = state;
  w.currentBoardId = 'b1';
  w.boardList = [{ id: 'b1', name: 'Alpha', project_key: 'ALP', settings: SETTINGS }];
  w.calls = calls;
  return w;
}

const tick = (ms = 0) => new Promise((r) => setTimeout(r, ms));
// What the form would send: fill a title and create.
function addFrom(w, row) {
  row.click();
  assert.ok(w.document.getElementById('detail-modal').classList.contains('active'), 'the new-card form opens');
  w.document.getElementById('detail-title').value = 'Added here';
  w.submitCreateFromDetail();
  return w.calls.filter((c) => c.op === 'create').pop();
}
const rowIn = (w, sel) => w.document.querySelector(`${sel} > .column-add-card`);
const cellSel = (lane, col) => `#board ${lane} .epic-lane-cell:has(> .column-body[data-col="${col}"])`;

describe('add-card rows', () => {
  it('ends each column with an Add card row that adds the card to that column', async () => {
    const w = await load({ epics: false });
    w.render();
    const cols = Array.from(w.document.querySelectorAll('#board > .column'));
    assert.equal(cols.length, w.COLUMNS.length);
    for (const col of cols) {
      const last = col.lastElementChild;
      assert.ok(last.classList.contains('column-add-card'), 'the row comes after the card list');
      assert.equal(last.tagName, 'BUTTON');
      assert.equal(last.textContent.trim(), 'Add card');
    }
    const body = addFrom(w, cols[2].querySelector('.column-add-card'));
    assert.equal(body.column_id, w.COLUMNS[2].id);
  });

  it('adds to the epic of the lane, and to no epic from the lane without one', async () => {
    const w = await load();
    w.render();
    const fromEpic = addFrom(w, rowIn(w, cellSel('.epic-lane[data-epic-id="e1"]', 'in-progress')));
    assert.deepEqual([fromEpic.column_id, fromEpic.epic_id], ['in-progress', 'e1']);
    w.discardCreate && w.closeDetail();
    const w2 = await load();
    w2.render();
    const plain = addFrom(w2, rowIn(w2, cellSel('.epic-lane-ungrouped', 'todo')));
    assert.equal(plain.column_id, 'todo');
    assert.ok(!plain.epic_id);
  });

  it('keeps the cells of an epic without cards, so cards can be added to it', async () => {
    const w = await load();
    w.render();
    const lane = w.document.querySelector('#board .epic-lane[data-epic-id="e2"]');
    assert.ok(!lane.classList.contains('epic-lane-collapsed'));
    assert.equal(lane.querySelectorAll('.epic-lane-cell').length, w.COLUMNS.length);
    assert.equal(lane.querySelector('.epic-lane-count').textContent, '0 cards');
    const body = addFrom(w, rowIn(w, cellSel('.epic-lane[data-epic-id="e2"]', 'done')));
    assert.deepEqual([body.column_id, body.epic_id], ['done', 'e2']);
  });

  it('still folds up an epic whose cards are all done', async () => {
    const w = await load();
    w.state.done.push(card({ id: 'd', key: 'ALP-3', epic_id: 'e2' }));
    w.render();
    assert.ok(w.document.querySelector('#board .epic-lane[data-epic-id="e2"]').classList.contains('epic-lane-collapsed'));
  });

  for (const [mode, key, expect] of [
    ['type', 'red', { tag: 'red' }],
    ['priority', 'high', { priority: 'high' }],
    ['assignee', 'u2', { assignee_id: 'u2' }],
    ['cf:team', 'core', { custom_fields: { team: 'core' } }],
  ]) {
    it(`gives a card added in a ${mode} lane that lane's value`, async () => {
      const w = await load();
      w.render();
      w.chooseGroupBy(mode);
      const sel = `#board .group-lane[data-group-key="${key}"] .epic-lane-cell:has(> .column-body[data-col="in-progress"])`;
      const body = addFrom(w, rowIn(w, sel));
      assert.equal(body.column_id, 'in-progress');
      for (const [k, v] of Object.entries(expect)) assert.equal(JSON.stringify(body[k]), JSON.stringify(v), k);
    });
  }

  it('sends drags anywhere in a lane cell to its card list, so an empty cell takes a drop', async () => {
    const w = await load();
    w.render();
    const cell = w.document.querySelector(cellSel('.epic-lane[data-epic-id="e2"]', 'in-progress'));
    const el = w.document.querySelector('#board .card[data-id="b"]');
    w.onDragStart({ target: el, dataTransfer: { setData() {} } });
    const row = cell.querySelector('.column-add-card');
    const ev = (type) => { const e = new w.Event(type, { bubbles: true, cancelable: true }); e.dataTransfer = {}; return e; };
    const over = ev('dragover');
    row.dispatchEvent(over);
    assert.ok(over.defaultPrevented, 'the cell accepts the drag');
    assert.ok(cell.querySelector('.column-body').classList.contains('drag-over'));
    cell.dispatchEvent(ev('drop'));
    await tick(10);
    const moved = Object.values(w.state).flat().find((c) => c.id === 'b');
    assert.equal(moved.epic_id, 'e2');
    assert.ok(w.state['in-progress'].includes(moved));
    assert.ok(w.calls.some((c) => c.op === 'move' && c.id === 'b' && c.column_id === 'in-progress'));
  });

  it('sends drags in a plain column below its cards to the card list too', async () => {
    const w = await load({ epics: false });
    w.render();
    const col = Array.from(w.document.querySelectorAll('#board > .column')).find((c) => c.querySelector('.column-body[data-col="done"]'));
    const el = w.document.querySelector('#board .card[data-id="a"]');
    w.onDragStart({ target: el, dataTransfer: { setData() {} } });
    const e = (type) => { const x = new w.Event(type, { bubbles: true, cancelable: true }); x.dataTransfer = {}; return x; };
    col.dispatchEvent(e('dragover'));
    col.dispatchEvent(e('drop'));
    await tick(10);
    assert.ok(w.state.done.some((c) => c.id === 'a'));
  });

  it('has a round New card button for phones that opens the form in the open tab\'s column', async () => {
    const w = await load({ width: 390, epics: false });
    w.render();
    const fab = w.document.getElementById('new-card-fab');
    assert.ok(fab, 'the button is on the page');
    assert.equal(fab.getAttribute('aria-label'), 'New card');
    w.initMobileColumnTabs();
    w.switchMobileTab('in-progress');
    assert.ok(w.document.querySelector('.mobile-tab.active[data-col="in-progress"]'), 'the tab is open');
    w.openCreateFromButton(); // what the button's onclick does
    w.document.getElementById('detail-title').value = 'From the button';
    w.submitCreateFromDetail();
    assert.equal(w.calls.filter((c) => c.op === 'create').pop().column_id, 'in-progress');
  });
});
