// The new card shown on the board while it is being written (web/src/kanban.js).
// Run with: node --test tests/frontend/new-card-draft.test.js

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

const footerButtons = (w) =>
  Array.from(w.document.querySelectorAll('#detail-modal .detail-footer button')).map((b) => b.textContent.trim());
const drafts = (w) => Object.values(w.state).flat().filter((c) => c.id === 'draft-new-card');
function typeTitle(w, text) {
  const el = w.document.getElementById('detail-title');
  el.value = text;
  el.dispatchEvent(new w.Event('input', { bubbles: true }));
}

describe('new card shown while it is being written', () => {
  it('shows a placeholder card on the board that follows the title', async () => {
    const { w } = await load();
    w.openCreateModal();
    assert.equal(drafts(w).length, 1);
    assert.equal(drafts(w)[0].title, 'New card');
    typeTitle(w, 'Draft title');
    assert.equal(drafts(w).length, 1);
    assert.equal(drafts(w)[0].title, 'Draft title');
  });

  it('offers only Discard in the footer, and existing cards keep Delete card / Close', async () => {
    const { w } = await load();
    w.openCreateModal();
    assert.deepEqual(footerButtons(w), ['Discard']);
    w.discardCreate();
    w.openDetail('c1');
    assert.deepEqual(footerButtons(w), ['Delete card', 'Close']);
  });

  it('saves a titled card exactly once when the form is closed', async () => {
    const { w, created } = await load();
    w.openCreateModal();
    typeTitle(w, 'Saved on close');
    w.closeDetail();
    assert.deepEqual(created.map((c) => c.title), ['Saved on close']);
    assert.equal(drafts(w).length, 0);
  });

  it('saves nothing when the form is closed without a title', async () => {
    const { w, created } = await load();
    w.openCreateModal();
    w.closeDetail();
    assert.equal(created.length, 0);
    assert.equal(drafts(w).length, 0);
  });

  it('drops the card on Discard', async () => {
    const { w, created } = await load();
    w.openCreateModal();
    typeTitle(w, 'Not wanted');
    w.discardCreate();
    assert.equal(created.length, 0);
    assert.equal(drafts(w).length, 0);
    assert.equal(w.document.getElementById('detail-modal').classList.contains('active'), false);
  });

  it('saves the new card, not a copy, when another card is opened while writing', async () => {
    const { w, created } = await load();
    w.openCreateModal();
    typeTitle(w, 'Half-written new card');
    w.openDetail('c1');
    assert.equal(w._isCreateMode, false);
    assert.equal(w.document.getElementById('detail-title').value, 'Existing card');
    assert.deepEqual(created.map((c) => c.title), ['Half-written new card']);
  });
  it('re-renders through window.render so wrappers (such as the phone layout) still run', async () => {
    const { w } = await load();
    let calls = 0;
    const inner = w.render;
    w.render = function () { calls++; return inner.apply(this, arguments); };
    w.openCreateModal();
    typeTitle(w, 'Draft');
    w.discardCreate();
    assert.ok(calls >= 3, `window.render called ${calls} times`);
  });
});
describe('saving the new card directly', () => {
  it('saves it once when submitCreateFromDetail is called while the form is open', async () => {
    const { w, created } = await load();
    w.openCreateModal();
    typeTitle(w, 'Submitted directly');
    w.submitCreateFromDetail();
    assert.deepEqual(created.map((c) => c.title), ['Submitted directly']);
    assert.equal(drafts(w).length, 0);
  });
});

describe('placeholder style', () => {
  it("is outlined in the theme's selection colour", () => {
    const css = read('web/styles/board.css');
    const rule = css.match(/\.card\[data-id="draft-new-card"\]\s*\{([^}]*)\}/);
    assert.ok(rule, 'has a rule for the placeholder card');
    assert.match(rule[1], /outline:[^;]*var\(--card-selected\)/);
    const theme = read('web/styles/theme.css');
    assert.match(theme, /:root\s*\{[^}]*--card-selected:/, 'dark theme defines it');
    assert.match(theme, /body\.light-theme\s*\{[^}]*--card-selected:/, 'light theme defines it');
    assert.doesNotMatch(rule[1], /#[0-9a-f]{3,6}/i, 'no fixed colour');
  });
});
