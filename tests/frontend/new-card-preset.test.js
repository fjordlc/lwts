// openCreateModal(preset) pre-fills the new-card form (web/src/kanban.js).
// Run with: node --test tests/frontend/new-card-preset.test.js

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { JSDOM } = require('jsdom');

const ROOT = path.join(__dirname, '..', '..');
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf-8');
const indexHtml = read('web/index.html').replace(/<script\b[\s\S]*?<\/script>/gi, '');

async function load() {
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
  state.todo.push({ id: 'c1', key: 'ALP-1', board_id: 'b1', title: 'Existing card', tag: 'blue', priority: 'medium',
    assignee: null, reporter: null, points: 0, date: '2026-01-01', description: '', attachments: [], comments: [],
    version: 1, custom_fields: {}, epic_id: null });
  w.state = state;
  w.currentBoardId = 'b1';
  w.boardList = [{ id: 'b1', name: 'Alpha', project_key: 'ALP' }];
  return { w, created };
}

function create(w, title) {
  w.document.getElementById('detail-title').value = title;
  w.submitCreateFromDetail(); // what the Create button does
}
const footerButtons = (w) =>
  Array.from(w.document.querySelectorAll('#detail-modal .detail-footer button')).map((b) => b.textContent.trim());

describe('new-card preset', () => {
  it('pre-fills the form and sends the preset values', async () => {
    const { w, created } = await load();
    // Built inside the page, like a caller in the app would.
    w.eval("openCreateModal({ column_id: 'in-progress', priority: 'high', tag: 'red', custom_fields: { size: 'l' } })");
    assert.equal(w.document.getElementById('detail-column-text').textContent.trim(), 'In Progress');
    create(w, 'From a preset');
    const body = created[0];
    assert.deepEqual([body.column_id, body.priority, body.tag], ['in-progress', 'high', 'red']);
    assert.equal(JSON.stringify(body.custom_fields), JSON.stringify({ size: 'l' }));
  });

  it('keeps the usual defaults without a preset, and ignores an Event passed by a click handler', async () => {
    const { w, created } = await load();
    w.openCreateModal();
    create(w, 'Plain');
    w.openCreateModal(new w.MouseEvent('click'));
    create(w, 'From a click handler');
    assert.equal(created[1].column_id, created[0].column_id);
    assert.equal(created[1].priority, created[0].priority);
  });
  it('ignores a second open while the form is open, so existing cards keep their footer', async () => {
    const { w } = await load();
    w.openCreateModal();
    w.openCreateModal({ column_id: 'done' });
    assert.notEqual(w.document.getElementById('detail-column-text').textContent.trim(), 'Done');
    w.closeDetail();
    w.openDetail('c1');
    assert.deepEqual(footerButtons(w), ['Delete card', 'Close']);
  });
});
