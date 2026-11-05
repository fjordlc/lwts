// Epic filter: choose which epic swimlanes show; the board redraws when a card's epic changes.
// Run with: node --test tests/frontend/epic-lane-filter.test.js

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
  w.API = { updateCard: () => Promise.resolve({ version: 2 }), moveCard: () => Promise.resolve({ version: 2 }), listComments: () => Promise.resolve([]), searchCards: () => Promise.resolve([]) };
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
  state.todo.push(card(), card({ id: 'c2', key: 'ALP-2', title: 'Second card', epic_id: 'e1' }),
    card({ id: 'e1', key: 'ALP-9', title: 'Faster onboarding', tag: 'epic' }));
  state.backlog.push(card({ id: 'c3', key: 'ALP-3', title: 'Third card', epic_id: 'e2' }),
    card({ id: 'e2', key: 'ALP-8', title: 'Billing revamp', tag: 'epic' }));
  w.state = state;
  w.currentBoardId = 'b1';
  w.boardList = [{ id: 'b1', name: 'Alpha', project_key: 'ALP' }];
  return w;
}

const tick = (ms = 0) => new Promise((r) => setTimeout(r, ms));
const lanesShown = (w) => Array.from(w.document.querySelectorAll('#board .epic-lane:not(.lane-hidden)'))
  .map((l) => l.classList.contains('epic-lane-ungrouped') ? '' : l.dataset.epicId);
function openMenu(w) {
  w.toggleFilterDropdown('epic');
  return w.document.getElementById('filter-epic-menu');
}
function untick(w, laneId) {
  const box = openMenu(w).querySelector(`input[value="${laneId}"]`);
  box.checked = false;
  box.dispatchEvent(new w.Event('change'));
  w.toggleFilterDropdown('epic');
}
const laneOfCard = (w, id) => {
  const lane = w.document.querySelector(`#board .card[data-id="${id}"]`).closest('.epic-lane');
  return lane.classList.contains('epic-lane-ungrouped') ? '' : lane.dataset.epicId;
};

describe('epic filter', () => {
  it('offers every epic and "No epic", all shown', async () => {
    const w = await load();
    w.render();
    assert.notEqual(w.document.getElementById('filter-epic-wrap').style.display, 'none');
    const labels = Array.from(openMenu(w).querySelectorAll('label')).map((l) => l.textContent.trim().replace(/\s+/g, ' '));
    assert.deepEqual(labels, ['ALP-8 Billing revamp', 'ALP-9 Faster onboarding', 'No epic']);
    assert.ok(Array.from(w.document.querySelectorAll('#filter-epic-menu input')).every((b) => b.checked));
  });

  it('is not offered on a board without epics', async () => {
    const w = await load();
    w.state.todo = w.state.todo.filter((c) => c.tag !== 'epic');
    w.state.backlog = w.state.backlog.filter((c) => c.tag !== 'epic');
    w.render();
    assert.equal(w.document.getElementById('filter-epic-wrap').style.display, 'none');
  });

  it('hides an unticked epic\'s lane and the lane without epic', async () => {
    const w = await load();
    w.render();
    assert.deepEqual(lanesShown(w), ['e2', 'e1', '']);
    untick(w, 'e1');
    untick(w, '');
    assert.deepEqual(lanesShown(w), ['e2']);
    const badge = w.document.getElementById('filter-epic-badge');
    assert.equal(badge.textContent, '1');
    assert.equal(badge.style.display, 'inline-flex');
  });

  it('keeps lanes hidden across renders, per board', async () => {
    const w = await load();
    w.render();
    untick(w, 'e2');
    w.render();
    assert.deepEqual(lanesShown(w), ['e1', '']);
    assert.equal(w.localStorage.getItem('lwts-hidden-epics:b1'), '["e2"]');
    w.currentBoardId = 'b2';
    w.render();
    assert.deepEqual(lanesShown(w), ['e2', 'e1', '']);
  });

  it('shows every lane again with Show all', async () => {
    const w = await load();
    w.render();
    untick(w, 'e1');
    openMenu(w).querySelector('.filter-menu-action').click();
    assert.deepEqual(lanesShown(w), ['e2', 'e1', '']);
    assert.equal(w.localStorage.getItem('lwts-hidden-epics:b1'), null);
  });

  it('leaves hidden epic groups out of the list view', async () => {
    const w = await load();
    w.render();
    untick(w, 'e1');
    w.renderListView();
    const headers = Array.from(w.document.querySelectorAll('#list-view .list-epic-header')).map((h) => h.dataset.epic || 'other');
    assert.deepEqual(headers, ['e2', 'other']);
    const rows = Array.from(w.document.querySelectorAll('#list-view .list-row')).map((r) => r.dataset.id).sort();
    assert.deepEqual(rows, ['c1', 'c3']);
  });
});

describe('changing a card\'s epic', () => {
  it('moves the card into the new epic\'s lane right away', async () => {
    const w = await load();
    w.render();
    assert.equal(laneOfCard(w, 'c1'), '');
    w.openDetail('c1');
    w.toggleSidebarField('epic');
    const opt = Array.from(w.document.querySelectorAll('#detail-epic .fn-dropdown-option')).find((o) => o.textContent.includes('Billing revamp'));
    opt.click();
    assert.equal(laneOfCard(w, 'c1'), 'e2');
  });

  it('draws the swimlane layout once a card becomes an epic', async () => {
    const w = await load();
    w.state.todo = [card()];
    w.state.backlog = [card({ id: 'c3', key: 'ALP-3', title: 'Third card' })];
    w.render();
    assert.equal(w.document.querySelector('#board .epic-lane'), null);
    w.openDetail('c3');
    w.toggleSidebarField('tag');
    Array.from(w.document.querySelectorAll('#detail-tag .fn-dropdown-option')).find((o) => /epic/i.test(o.textContent)).click();
    assert.ok(w.document.querySelector('#board .epic-lane[data-epic-id="c3"]'));
  });
});
