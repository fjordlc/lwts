// Custom field filters: one filter menu per choice custom field of the open board.
// Run with: node --test tests/frontend/custom-field-filters.test.js

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

async function load({ width = 1440 } = {}) {
  const dom = new JSDOM(indexHtml, { url: 'https://board.test/', pretendToBeVisual: true, runScripts: 'outside-only' });
  const w = dom.window;
  const loaded = new Promise((r) => w.document.addEventListener('DOMContentLoaded', () => setTimeout(r, 0), { once: true }));
  Object.defineProperty(w, 'innerWidth', { value: width, configurable: true, writable: true });
  Object.defineProperty(w, 'innerHeight', { value: 844, configurable: true });
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

describe('custom field filters', () => {
  it('adds one menu per choice field after Type, with "No <field>"', async () => {
    const w = await load();
    w.render();
    const ids = Array.from(w.document.querySelectorAll('#filter-bar .filter-group > .filter-dropdown')).map((d) => d.id);
    assert.deepEqual(ids.slice(0, 4), ['filter-assignee-wrap', 'filter-priority-wrap', 'filter-tag-wrap', 'filter-cf-team-wrap']);
    assert.equal(w.document.getElementById('filter-cf-note-wrap'), null);
    const labels = Array.from(w.document.querySelectorAll('#filter-cf-team-menu label')).map((l) => l.textContent.trim());
    assert.deepEqual(labels, ['Core', 'Web', 'No team']);
    assert.match(w.document.querySelector('#filter-cf-team-wrap .filter-btn').textContent, /Team/);
  });

  it('shows only the cards with the ticked values', async () => {
    const w = await load();
    w.render();
    tick(w, 'team', 'core');
    assert.deepEqual(visible(w), ['a']);
    tick(w, 'team', '');
    assert.deepEqual(visible(w), ['a', 'c']);
    const badge = w.document.getElementById('filter-cf-team-badge');
    assert.equal(badge.textContent, '2');
    assert.match(w.document.getElementById('filter-status').textContent, /2 filters/);
    assert.equal(w.activeFilterCount(), 2);
  });

  it('combines with the other filters and survives a re-render', async () => {
    const w = await load();
    w.state.todo[1].priority = 'high';
    w.render();
    tick(w, 'team', 'web');
    const box = w.document.querySelector('#filter-priority-menu input[value="medium"]');
    box.checked = true;
    w.onFilterCheckbox('priority', box);
    assert.deepEqual(visible(w), []);
    w.render();
    assert.deepEqual(visible(w), []);
    assert.ok(w.document.querySelector('#filter-cf-team-menu input[value="web"]').checked);
  });

  it('filters the list view rows', async () => {
    const w = await load();
    w.render();
    w.switchView('list');
    tick(w, 'team', 'web');
    const rows = Array.from(w.document.querySelectorAll('#list-view .list-row')).filter((r) => r.style.display !== 'none').map((r) => r.dataset.id);
    assert.deepEqual(rows, ['b']);
  });

  it('is cleared by Clear all', async () => {
    const w = await load();
    w.render();
    tick(w, 'team', 'core');
    w.clearAllFilters();
    assert.deepEqual(visible(w), ['a', 'b', 'c']);
    assert.equal(w.document.querySelector('#filter-cf-team-menu input[value="core"]').checked, false);
    assert.equal(w.activeFilterCount(), 0);
  });

  it('follows the open board\'s fields', async () => {
    const w = await load();
    w.render();
    tick(w, 'team', 'core');
    w.currentBoardId = 'b2';
    w.state.todo.forEach((c) => { c.custom_fields = {}; });
    w.render();
    assert.equal(w.document.getElementById('filter-cf-team-wrap'), null);
    assert.ok(w.document.getElementById('filter-cf-area-wrap'));
    assert.equal(w.activeFilterCount(), 0);
    assert.deepEqual(visible(w), ['a', 'b', 'c']);
  });
});
