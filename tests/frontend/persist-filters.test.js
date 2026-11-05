// Filters are remembered per user and board.
// Run with: node --test tests/frontend/persist-filters.test.js

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

const B1 = JSON.stringify({ custom_fields: [
  { id: 'team', name: 'Team', type: 'select', options: [{ id: 'core', label: 'Core' }, { id: 'web', label: 'Web' }] },
  { id: 'note', name: 'Note', type: 'text' },
] });
const B2 = JSON.stringify({ custom_fields: [{ id: 'area', name: 'Area', type: 'select', options: [{ id: 'x', label: 'X' }] }] });

async function load({ width = 1440, storage = {}, user = 'u1' } = {}) {
  const dom = new JSDOM(indexHtml, { url: 'https://board.test/', pretendToBeVisual: true, runScripts: 'outside-only' });
  const w = dom.window;
  const loaded = new Promise((r) => w.document.addEventListener('DOMContentLoaded', () => setTimeout(r, 0), { once: true }));
  Object.defineProperty(w, 'innerWidth', { value: width, configurable: true, writable: true });
  Object.defineProperty(w, 'innerHeight', { value: 844, configurable: true });
  for (const [k, v] of Object.entries(storage)) w.localStorage.setItem(k, v);
  w.Auth = { getUser: () => ({ id: user }) };
  w.matchMedia = (q) => ({ matches: /max-width: 768px/.test(q) ? width <= 768 : false, addEventListener() {}, removeEventListener() {} });
  w.API = { updateCard: () => Promise.resolve({}), moveCard: () => Promise.resolve({}), putSettings: () => Promise.resolve({}), listComments: () => Promise.resolve([]), searchCards: () => Promise.resolve([]) };
  w.Toast = { success() {}, error() {}, info() {} };
  w.FnEditor = function () { return { getMarkdown: () => '', setMarkdown() {}, destroy() {}, focus() {} }; };
  w._settingsCache = {};
  w.HTMLElement.prototype.scrollIntoView = function () {};
  w.CSS = { escape: (s) => String(s) };
  w.parseBoardSettings = (raw) => JSON.parse(raw || '{}');
  for (const f of ['dropdown.js', 'kanban.js', 'listview.js', 'features.js', 'a11y.js']) {
    w.eval(`(function () {\n${read('web/src/' + f)}\n})();`);
  }
  await loaded;
  const state = {};
  for (const col of w.COLUMNS) state[col.id] = [];
  state.todo.push(card({ id: 'a', custom_fields: { team: 'core' } }), card({ id: 'b', custom_fields: { team: 'web' } }), card({ id: 'c' }));
  w.state = state;
  w.currentBoardId = 'b1';
  w.boardList = [{ id: 'b1', name: 'Alpha', project_key: 'ALP', settings: B1 }, { id: 'b2', name: 'Beta', project_key: 'BET', settings: B2 }];
  return w;
}

const visible = (w) => Array.from(w.document.querySelectorAll('#board .card:not(.search-hidden)')).map((c) => c.dataset.id);
function tick(w, field, value, on = true) {
  const box = w.document.querySelector(`#filter-cf-${field}-menu input[value="${value}"]`);
  box.checked = on;
  box.dispatchEvent(new w.Event('change'));
}

function tickBox(w, sel) {
  const box = w.document.querySelector(sel);
  box.checked = !box.checked;
  return box;
}

describe('filters per board', () => {
  it('saves the card filters per user and board, not the search', async () => {
    const w = await load();
    w.render();
    w.onFilterCheckbox('priority', tickBox(w, '#filter-priority-menu input[value="high"]'));
    tickBox(w, '#filter-cf-team-menu input[value="web"]').dispatchEvent(new w.Event('change'));
    w.onFilterSearch('first');
    const saved = JSON.parse(w.localStorage.getItem('lwts-filters:u1:b1'));
    assert.deepEqual(saved, { assignees: [], priorities: ['high'], tags: [], custom: { team: ['web'] } });
  });

  it('restores them when the board loads', async () => {
    const w = await load({ storage: { 'lwts-filters:u1:b1': JSON.stringify({ assignees: [], priorities: [], tags: ['blue'], custom: { team: ['core'] } }) } });
    w.render();
    w.API.listCards = () => Promise.resolve({ todo: [
      { id: 'a', key: 'ALP-1', title: 'A', tag: 'blue', custom_fields: { team: 'core' } },
      { id: 'b', key: 'ALP-2', title: 'B', tag: 'blue', custom_fields: { team: 'web' } },
      { id: 'c', key: 'ALP-3', title: 'C', tag: 'red', custom_fields: { team: 'core' } },
    ] });
    await w.loadBoardCards('b1');
    assert.deepEqual(visible(w), ['a']);
    assert.ok(w.document.querySelector('#filter-tag-menu input[value="blue"]').checked);
    assert.ok(w.document.querySelector('#filter-cf-team-menu input[value="core"]').checked);
    assert.equal(w.document.getElementById('filter-tag-badge').textContent, '1');
  });

  it('switching boards brings that board\'s filters, or none', async () => {
    const w = await load();
    w.render();
    w.onFilterCheckbox('priority', tickBox(w, '#filter-priority-menu input[value="medium"]'));
    w.API.listCards = () => Promise.resolve({ todo: [{ id: 'x', key: 'BET-1', title: 'X', priority: 'low' }] });
    w.currentBoardId = 'b2';
    await w.loadBoardCards('b2');
    assert.deepEqual(visible(w), ['x']);
    assert.equal(w.document.querySelector('#filter-priority-menu input[value="medium"]').checked, false);
    w.API.listCards = () => Promise.resolve({ todo: [{ id: 'a', key: 'ALP-1', title: 'A', priority: 'medium' }, { id: 'b', key: 'ALP-2', title: 'B', priority: 'high' }] });
    w.currentBoardId = 'b1';
    await w.loadBoardCards('b1');
    assert.deepEqual(visible(w), ['a']);
  });

  it('keeps users apart and drops the saved filters on Clear all', async () => {
    const stored = { 'lwts-filters:u1:b1': JSON.stringify({ assignees: [], priorities: ['high'], tags: [], custom: {} }) };
    const other = await load({ storage: stored, user: 'u2' });
    other.restoreBoardFilters('b1');
    assert.equal(other.activeFilterCount(), 0);
    const w = await load({ storage: stored });
    w.render();
    w.restoreBoardFilters('b1');
    assert.equal(w.activeFilterCount(), 1);
    w.clearAllFilters();
    assert.equal(w.localStorage.getItem('lwts-filters:u1:b1'), null);
  });
});
