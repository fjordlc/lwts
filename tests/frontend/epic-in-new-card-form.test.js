// Choosing an epic in the new-card form (web/src/kanban.js).
// Run with: node --test tests/frontend/epic-in-new-card-form.test.js

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { JSDOM } = require('jsdom');

const ROOT = path.join(__dirname, '..', '..');
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf-8');
const indexHtml = read('web/index.html').replace(/<script\b[\s\S]*?<\/script>/gi, '');

function card(over) {
  return { id: 'c1', key: 'ALP-1', board_id: 'b1', title: 'A card', tag: 'blue', priority: 'medium',
    assignee: null, reporter: null, points: 0, date: '2026-01-01', description: '', attachments: [],
    comments: [], version: 1, custom_fields: {}, epic_id: null, ...over };
}
const EPIC = card({ id: 'e1', key: 'ALP-9', title: 'Faster onboarding', tag: 'epic' });

async function load(cards) {
  const dom = new JSDOM(indexHtml, { url: 'https://board.test/', pretendToBeVisual: true, runScripts: 'outside-only' });
  const w = dom.window;
  const loaded = new Promise((r) => w.document.addEventListener('DOMContentLoaded', () => setTimeout(r, 0), { once: true }));
  const created = [];
  w.API = {
    createCard: (boardId, body) => { created.push(body); return Promise.resolve({ ...body, id: 'srv-' + created.length, key: 'ALP-' + (10 + created.length) }); },
    updateCard: () => Promise.resolve({}),
    listComments: () => Promise.resolve([]),
  };
  w.Toast = { success() {}, error() {}, info() {} };
  w.FnEditor = function () { return { getMarkdown: () => '', setMarkdown() {}, destroy() {}, focus() {} }; };
  w._settingsCache = {};
  w.HTMLElement.prototype.scrollIntoView = function () {};
  // The browser loads these as ES modules: top-level names stay private, only window.* is shared.
  w.eval(`(function () {\n${read('web/src/dropdown.js')}\n})();`);
  w.eval(`(function () {\n${read('web/src/kanban.js')}\n})();`);
  await loaded;
  const state = {};
  for (const col of w.COLUMNS) state[col.id] = [];
  for (const c of cards) state.todo.push(c);
  w.state = state;
  w.currentBoardId = 'b1';
  w.boardList = [{ id: 'b1', name: 'Alpha', project_key: 'ALP' }];
  return { w, created };
}

const epicRowShown = (w) => w.document.getElementById('detail-epic-row').style.display !== 'none';
function pickEpic(w, label) {
  w.toggleSidebarField('epic');
  const opt = Array.from(w.document.querySelectorAll('#detail-epic .fn-dropdown-option')).find((o) => o.textContent.includes(label));
  assert.ok(opt, 'epic option ' + label);
  opt.click();
}
function create(w, title) {
  w.document.getElementById('detail-title').value = title;
  w.submitCreateFromDetail(); // what the Create button does
}

describe('epic in the new-card form', () => {
  it('hides the epic row when the board has no epics', async () => {
    const { w } = await load([card()]);
    w.openDetail('c1'); // whatever card was open before must not decide
    w.closeDetail();
    w.openCreateModal();
    assert.equal(epicRowShown(w), false);
  });

  it('offers the epic row when the board has an epic', async () => {
    const { w } = await load([card(), EPIC]);
    w.openCreateModal();
    assert.equal(epicRowShown(w), true);
  });

  it('sends the chosen epic with the new card and shows it in the form', async () => {
    const { w, created } = await load([card(), EPIC]);
    w.openCreateModal();
    pickEpic(w, 'Faster onboarding');
    assert.match(w.document.getElementById('detail-epic-text').textContent, /ALP-9/);
    create(w, 'Child card');
    assert.equal(created.length, 1);
    assert.equal(created[0].epic_id, 'e1');
  });

  it('sends no epic when none was chosen, and starts the next form empty', async () => {
    const { w, created } = await load([card(), EPIC]);
    w.openCreateModal();
    pickEpic(w, 'Faster onboarding');
    pickEpic(w, 'None');
    create(w, 'Plain card');
    w.openCreateModal();
    assert.equal(w.document.getElementById('detail-epic-text').textContent.trim(), 'None');
    create(w, 'Next card');
    assert.deepEqual(created.map((c) => c.epic_id), [null, null]);
  });
});
