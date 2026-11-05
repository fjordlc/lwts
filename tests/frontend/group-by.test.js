// Group by: swimlanes by epic (default with epics), type, priority, assignee or a choice custom field.
// Run with: node --test tests/frontend/group-by.test.js

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

const SETTINGS = JSON.stringify({ custom_fields: [
  { id: 'team', name: 'Team', type: 'select', group_by: true, options: [{ id: 'core', label: 'Core' }, { id: 'web', label: 'Web' }] },
  { id: 'area', name: 'Area', type: 'select', options: [{ id: 'x', label: 'X' }] },
] });

async function load({ width = 1440, storage = {}, epics = true } = {}) {
  const dom = new JSDOM(indexHtml, { url: 'https://board.test/', pretendToBeVisual: true, runScripts: 'outside-only' });
  const w = dom.window;
  const loaded = new Promise((r) => w.document.addEventListener('DOMContentLoaded', () => setTimeout(r, 0), { once: true }));
  Object.defineProperty(w, 'innerWidth', { value: width, configurable: true, writable: true });
  Object.defineProperty(w, 'innerHeight', { value: 844, configurable: true });
  for (const [k, v] of Object.entries(storage)) w.localStorage.setItem(k, v);
  w.matchMedia = (q) => ({ matches: /max-width: 768px/.test(q) ? width <= 768 : false, addEventListener() {}, removeEventListener() {} });
  const calls = [];
  w.API = {
    updateCard: (id, body) => { calls.push({ op: 'update', id, ...body }); return Promise.resolve({ id, version: (body.version || 0) + 1 }); },
    moveCard: (id, body) => { calls.push({ op: 'move', id, ...body }); return Promise.resolve({ id, version: (body.version || 0) + 1 }); },
    createCard: () => Promise.resolve({}),
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
    card({ id: 'b', key: 'ALP-2', priority: 'high', tag: 'blue', assignee: 'u1', custom_fields: { team: 'core' } }),
  );
  state.backlog.push(card({ id: 'c', key: 'ALP-3', priority: 'high', tag: 'green' }));
  if (epics) state.backlog.push(card({ id: 'e1', key: 'ALP-9', title: 'An epic', tag: 'epic' }));
  w.state = state;
  w.currentBoardId = 'b1';
  w.boardList = [{ id: 'b1', name: 'Alpha', project_key: 'ALP', settings: SETTINGS }, { id: 'b2', name: 'Beta', project_key: 'BET', settings: '{}' }];
  w.calls = calls;
  return w;
}

const plain = (v) => JSON.parse(JSON.stringify(v));
const tick = (ms = 0) => new Promise((r) => setTimeout(r, ms));
const menuModes = (w) => { w.toggleFilterDropdown('group'); const m = Array.from(w.document.querySelectorAll('#filter-group-menu [data-group]')).map((i) => i.dataset.group); w.toggleFilterDropdown('group'); return m; };
function choose(w, mode) {
  w.toggleFilterDropdown('group');
  w.document.querySelector(`#filter-group-menu [data-group="${mode}"]`).click();
}
const lanes = (w) => Array.from(w.document.querySelectorAll('#board .group-lane')).map((l) => ({
  key: l.dataset.groupKey,
  title: l.querySelector('.epic-lane-title').textContent,
  cards: Array.from(l.querySelectorAll('.card')).map((c) => c.dataset.id),
}));
function drag(w, id, body, overId) {
  const el = w.document.querySelector(`#board .card[data-id="${id}"]`);
  w.onDragStart({ target: el, dataTransfer: { setData() {} } });
  const ev = { preventDefault() {}, currentTarget: body, clientY: 0, dataTransfer: {} };
  if (overId) {
    ev.clientY = 5;
    body.querySelector(`.card[data-id="${overId}"]`).getBoundingClientRect = () => ({ top: 0, bottom: 10 });
  }
  w.onDragOver(ev);
  w.onDrop(ev);
}
const cell = (w, laneKey, col) => w.document.querySelector(`#board .group-lane[data-group-key="${laneKey}"] .column-body[data-col="${col}"]`);
const find = (w, id) => Object.values(w.state).flat().find((c) => c && c.id === id);

describe('group by', () => {
  it('offers Epic, Off, Type, Priority, Assignee and fields added to Group by', async () => {
    const w = await load();
    w.render();
    const group = w.document.querySelector('#filter-bar .filter-view-group');
    assert.equal(group.children[1].id, 'filter-group-wrap');
    assert.deepEqual(menuModes(w), ['epic', 'off', 'type', 'priority', 'assignee', 'cf:team']);
  });

  it('groups by epic by default on a board with epics, exactly as before', async () => {
    const w = await load();
    w.render();
    assert.equal(w.currentGroupBy(), 'epic');
    assert.ok(w.document.getElementById('board').classList.contains('board-epic-mode'));
    w.render(); // the first render animates the cards in
    const before = w.document.getElementById('board').innerHTML;
    choose(w, 'priority');
    choose(w, 'epic');
    assert.equal(w.document.getElementById('board').innerHTML, before);
    assert.ok(!w.document.querySelector('#filter-group-wrap .filter-btn').classList.contains('filter-btn-active'));
    assert.equal(w.localStorage.getItem('lwts-group-by:u1:b1'), null);
  });

  it('defaults to Off on a board without epics and does not offer Epic', async () => {
    const w = await load({ epics: false });
    w.render();
    assert.equal(w.currentGroupBy(), 'off');
    assert.ok(!w.document.getElementById('board').classList.contains('board-epic-mode'));
    assert.deepEqual(menuModes(w), ['off', 'type', 'priority', 'assignee', 'cf:team']);
  });

  it('groups by priority, type, assignee and a custom field', async () => {
    const w = await load();
    w.render();
    choose(w, 'priority');
    assert.deepEqual(lanes(w), [
      { key: 'high', title: 'High', cards: ['c', 'b'] },
      { key: 'low', title: 'Low', cards: ['a'] },
    ]);
    assert.ok(w.document.querySelector('#filter-group-wrap .filter-btn').classList.contains('filter-btn-active'));
    assert.equal(w.localStorage.getItem('lwts-group-by:u1:b1'), 'priority');
    choose(w, 'type');
    assert.deepEqual(lanes(w).map((l) => l.title), ['Feature', 'Fix', 'Bug']);
    choose(w, 'assignee');
    assert.deepEqual(lanes(w).map((l) => [l.title, l.cards]), [['Ann', ['b']], ['Bob', ['a']], ['Unassigned', ['c']]]);
    choose(w, 'cf:team');
    assert.deepEqual(lanes(w).map((l) => [l.title, l.cards]), [['Core', ['b']], ['Web', ['a']], ['No team', ['c']]]);
  });

  it('shows plain columns without the epic cards when Off', async () => {
    const w = await load();
    w.render();
    choose(w, 'off');
    assert.ok(!w.document.getElementById('board').classList.contains('board-epic-mode'));
    assert.equal(w.document.querySelectorAll('#board .column').length, w.COLUMNS.length);
    assert.equal(w.document.querySelector('#board .card[data-id="e1"]'), null);
    const counts = Array.from(w.document.querySelectorAll('#board .column-count')).map((c) => c.textContent.trim());
    assert.deepEqual(counts.slice(0, 2), ['1', '2']);
  });

  it('is remembered per user and board, and falls back when it no longer applies', async () => {
    const w = await load();
    w.render();
    choose(w, 'cf:team');
    w.currentBoardId = 'b2';
    assert.equal(w.currentGroupBy(), 'epic');
    w.currentBoardId = 'b1';
    assert.equal(w.currentGroupBy(), 'cf:team');
    w.boardList[0].settings = JSON.stringify({ custom_fields: [{ id: 'team', name: 'Team', type: 'select', options: [{ id: 'core', label: 'Core' }] }] });
    assert.equal(w.currentGroupBy(), 'epic');
    const other = await load({ storage: { 'lwts-group-by:u1:b1': 'priority' } });
    assert.equal(other.currentGroupBy(), 'priority');
    other.Auth = { getUser: () => ({ id: 'u2' }) };
    assert.equal(other.currentGroupBy(), 'epic');
  });

  it('sets the group value when a card is dragged into another group', async () => {
    const w = await load();
    w.render();
    choose(w, 'priority');
    drag(w, 'a', cell(w, 'high', 'todo'), 'b');
    assert.equal(find(w, 'a').priority, 'high');
    assert.equal(find(w, 'a').epic_id, 'e1', 'the epic stays');
    assert.deepEqual(w.state.todo.map((c) => c.id), ['a', 'b']);
    await tick();
    assert.deepEqual(w.calls.map((c) => c.op), ['move', 'update']);
    assert.equal(w.calls[0].position, 0);
    assert.equal('epic_id' in w.calls[0], false);
    assert.deepEqual({ priority: w.calls[1].priority, version: w.calls[1].version }, { priority: 'high', version: 2 });
    assert.deepEqual(lanes(w)[0].cards, ['c', 'a', 'b']);
  });

  it('sets assignee and custom field values the same way', async () => {
    const w = await load();
    w.render();
    choose(w, 'assignee');
    drag(w, 'c', cell(w, '', 'backlog'));
    drag(w, 'b', cell(w, '', 'todo'));
    assert.equal(find(w, 'b').assignee, null);
    await tick();
    assert.deepEqual(w.calls.filter((c) => c.op === 'update').map((c) => c.assignee_id), [null]);
    choose(w, 'cf:team');
    drag(w, 'c', cell(w, 'web', 'todo'));
    assert.equal(find(w, 'c').custom_fields.team, 'web');
    await tick();
    const last = w.calls[w.calls.length - 1];
    assert.deepEqual(plain(last.custom_fields), { team: 'web' });
  });

  it('only moves the card when it is dropped in its own group', async () => {
    const w = await load();
    w.render();
    choose(w, 'priority');
    drag(w, 'c', cell(w, 'high', 'todo'));
    await tick();
    assert.deepEqual(w.calls.map((c) => c.op), ['move']);
    assert.equal(w.calls[0].column_id, 'todo');
  });

  it('keeps the card epic when dragged in plain columns', async () => {
    const w = await load();
    w.render();
    choose(w, 'off');
    drag(w, 'a', w.document.querySelector('#board .column-body[data-col="done"]'));
    assert.equal(find(w, 'a').epic_id, 'e1');
    await tick();
    assert.equal('epic_id' in w.calls[0], false);
  });

  it('works with the status filter and shows the epic filter only for epic lanes', async () => {
    const w = await load();
    w.render();
    assert.notEqual(w.document.getElementById('filter-epic-wrap').style.display, 'none');
    choose(w, 'priority');
    assert.equal(w.document.getElementById('filter-epic-wrap').style.display, 'none');
    w.toggleColumnVisibility('todo');
    const hidden = Array.from(w.document.querySelectorAll('#board .group-lane .epic-lane-cell.column-hidden'))
      .map((c) => c.querySelector('.column-body').dataset.col);
    assert.deepEqual(hidden, ['todo', 'todo']);
  });

  it('hides groups without matching cards when filtering', async () => {
    const w = await load();
    w.render();
    choose(w, 'priority');
    const box = w.document.querySelector('#filter-tag-menu input[value="red"]');
    box.checked = true;
    w.onFilterCheckbox('tag', box);
    const shown = Array.from(w.document.querySelectorAll('#board .group-lane')).filter((l) => l.style.display !== 'none').map((l) => l.dataset.groupKey);
    assert.deepEqual(shown, ['low']);
  });

  it('shows the epic cards themselves when the Type filter is epics only', async () => {
    const w = await load();
    w.render();
    const box = w.document.querySelector('#filter-tag-menu input[value="epic"]');
    box.checked = true;
    w.onFilterCheckbox('tag', box);
    assert.ok(!w.document.getElementById('board').classList.contains('board-epic-mode'));
    const visible = w.document.querySelector('#board .card[data-id="e1"]');
    assert.ok(visible && !visible.classList.contains('search-hidden'));
    w.clearAllFilters();
    assert.ok(w.document.getElementById('board').classList.contains('board-epic-mode'));
    assert.equal(w.activeFilters.tags.length, 0);
  });

  it('shows the new card being written in its group', async () => {
    const w = await load();
    w.initDetailDropdowns();
    w.render();
    choose(w, 'priority');
    w.openCreateModal({ priority: 'low', column_id: 'backlog' });
    const lane = w.document.querySelector('#board .card[data-id="draft-new-card"]').closest('.group-lane');
    assert.equal(lane.dataset.groupKey, 'low');
    assert.deepEqual(plain(w.groupPreset('priority', 'low')), { priority: 'low' });
    assert.deepEqual(plain(w.groupPreset('cf:team', 'web')), { custom_fields: { team: 'web' } });
  });

  it('puts a card dropped on an epic lane card right before it', async () => {
    const w = await load();
    w.state.todo.push(card({ id: 'd', key: 'ALP-4', epic_id: 'e1' }));
    w.render();
    const body = w.document.querySelector('#board .epic-lane[data-epic-id="e1"] .column-body[data-col="todo"]');
    drag(w, 'b', body, 'd');
    assert.deepEqual(w.state.todo.map((c) => c.id), ['a', 'b', 'd']);
    assert.equal(find(w, 'b').epic_id, 'e1');
  });
});
