// The card detail shows a card's epic as "KEY title" (web/src/kanban.js).
// Run with: node --test tests/frontend/epic-key-and-title.test.js

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

// widths: the field's width and the natural widths of the key and title (jsdom has no layout).
async function openWithEpic({ field = 300, key = 50, name = 120 } = {}) {
  const dom = new JSDOM(indexHtml, { url: 'https://board.test/', pretendToBeVisual: true, runScripts: 'outside-only' });
  const w = dom.window;
  const loaded = new Promise((r) => w.document.addEventListener('DOMContentLoaded', () => setTimeout(r, 0), { once: true }));
  w.API = { updateCard: () => Promise.resolve({}), listComments: () => Promise.resolve([]) };
  w.Toast = { success() {}, error() {}, info() {} };
  w.FnEditor = function () { return { getMarkdown: () => '', setMarkdown() {}, destroy() {}, focus() {} }; };
  w._settingsCache = {};
  w.HTMLElement.prototype.scrollIntoView = function () {};
  const def = (prop, fn) => Object.defineProperty(w.HTMLElement.prototype, prop, { configurable: true, get() { return fn(this); } });
  def('clientWidth', (el) => (el.id === 'detail-epic-text' ? field : 0));
  def('offsetWidth', (el) => (el.classList.contains('detail-epic-key') ? key : 0));
  def('scrollWidth', (el) => (el.classList.contains('detail-epic-name') ? name : 0));
  // The browser loads these as ES modules: top-level names stay private, only window.* is shared.
  w.eval(`(function () {\n${read('web/src/dropdown.js')}\n})();`);
  w.eval(`(function () {\n${read('web/src/kanban.js')}\n})();`);
  await loaded;
  const state = {};
  for (const col of w.COLUMNS) state[col.id] = [];
  state.todo.push(card({ epic_id: 'e1' }), card({ id: 'e1', key: 'ALP-9', title: 'Faster onboarding', tag: 'epic' }));
  w.state = state;
  w.currentBoardId = 'b1';
  w.boardList = [{ id: 'b1', name: 'Alpha', project_key: 'ALP' }];
  w.openDetail('c1');
  await new Promise((r) => w.requestAnimationFrame(() => setTimeout(r, 0)));
  return w.document.getElementById('detail-epic-text');
}

describe('epic shown as key and title', () => {
  it('shows the epic key and its title', async () => {
    const el = await openWithEpic();
    assert.equal(el.querySelector('.detail-epic-key').textContent, 'ALP-9');
    assert.equal(el.querySelector('.detail-epic-name').textContent, 'Faster onboarding');
    assert.equal(el.title, 'ALP-9 Faster onboarding');
    assert.equal(el.classList.contains('detail-epic-compact'), false);
  });

  it('drops the key when key and title do not fit together', async () => {
    const el = await openWithEpic({ field: 150, key: 50, name: 120 });
    assert.equal(el.classList.contains('detail-epic-compact'), true);
    assert.equal(el.querySelector('.detail-epic-name').textContent, 'Faster onboarding');
  });
});
