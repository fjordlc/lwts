// Card detail side pane on wide screens (web/src/sidepane.js).
// Run with: node --test tests/frontend/sidepane.test.js

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

async function load({ wide = true, storedWidth } = {}) {
  const dom = new JSDOM(indexHtml, { url: 'https://board.test/', pretendToBeVisual: true, runScripts: 'outside-only' });
  const w = dom.window;
  const loaded = new Promise((r) => w.document.addEventListener('DOMContentLoaded', () => setTimeout(r, 0), { once: true }));
  // jsdom has no matchMedia: a switchable stand-in for the (min-width: 769px) query.
  const listeners = [];
  const mq = { matches: wide, addEventListener: (t, fn) => listeners.push(fn), removeEventListener() {} };
  w.matchMedia = () => mq;
  const setWide = (v) => { mq.matches = v; listeners.forEach((fn) => fn({ matches: v })); };
  Object.defineProperty(w, 'innerWidth', { value: 1440, configurable: true });
  if (storedWidth) w.localStorage.setItem('lwts-detail-pane-width', String(storedWidth));
  const saved = [];
  w.API = { updateCard: () => Promise.resolve({}), listComments: () => Promise.resolve([]) };
  w.Toast = { success() {}, error() {}, info() {} };
  w.FnEditor = function () { return { getMarkdown: () => '', setMarkdown() {}, destroy() {}, focus() {} }; };
  w._settingsCache = {};
  w.HTMLElement.prototype.scrollIntoView = function () {};
  w.CSS = { escape: (s) => String(s) };
  // The browser loads these as ES modules: top-level names stay private, only window.* is shared.
  w.eval(`(function () {\n${read('web/src/dropdown.js')}\n})();`);
  w.eval(`(function () {\n${read('web/src/kanban.js')}\n})();`);
  w.eval(`(function () {\n${read('web/src/sidepane.js')}\n})();`);
  await loaded;
  const state = {};
  for (const col of w.COLUMNS) state[col.id] = [];
  state.todo.push(card(), card({ id: 'c2', key: 'ALP-2', title: 'Second card' }));
  w.state = state;
  w.currentBoardId = 'b1';
  w.boardList = [{ id: 'b1', name: 'Alpha', project_key: 'ALP' }];
  const save = w.saveDetailFields;
  w.saveDetailFields = function () { saved.push(w.detailCard && w.detailCard.id); return save.apply(this, arguments); };
  return { w, setWide, saved };
}

const tick = () => new Promise((r) => setTimeout(r, 0));
const modal = (w) => w.document.getElementById('detail-modal');
const isPane = (w) => modal(w).classList.contains('detail-pane');

describe('card detail side pane', () => {
  it('docks the detail view as a pane on wide screens and makes room on the board', async () => {
    const { w } = await load();
    w.openDetail('c1');
    await tick();
    assert.equal(isPane(w), true);
    assert.equal(w.document.body.classList.contains('detail-pane-open'), true);
    assert.equal(w.document.documentElement.style.getPropertyValue('--detail-pane-w'), '560px');
    const outline = Array.from(w.document.querySelectorAll('style')).map((st) => st.textContent).find((t) => t.includes('[data-id="c1"]'));
    assert.match(outline || '', /var\(--card-selected\)/, "the open card is outlined in the theme's selection colour");
  });

  it('keeps the full-screen modal on narrow screens', async () => {
    const { w } = await load({ wide: false });
    w.openDetail('c1');
    await tick();
    assert.equal(modal(w).classList.contains('active'), true);
    assert.equal(isPane(w), false);
  });

  it('drops every pane class when the window becomes narrow, without looping', async () => {
    const { w, setWide } = await load();
    w.openDetail('c1');
    await tick();
    w.closeDetail();
    await tick();
    setWide(false); // must return: an endless MutationObserver loop would hang this test
    await tick();
    assert.ok(!/detail-pane/.test(modal(w).className), modal(w).className);
    w.openDetail('c1');
    await tick();
    assert.equal(isPane(w), false);
  });

  it('restores a remembered width, kept within limits', async () => {
    const remembered = await load({ storedWidth: 700 });
    assert.equal(remembered.w.document.documentElement.style.getPropertyValue('--detail-pane-w'), '700px');
    const tooWide = await load({ storedWidth: 5000 });
    assert.equal(tooWide.w.document.documentElement.style.getPropertyValue('--detail-pane-w'), Math.round(1440 * 0.7) + 'px');
  });

  it('saves the open card before showing another one', async () => {
    const { w, saved } = await load();
    w.openDetail('c1');
    await tick();
    w.openDetail('c2');
    await tick();
    assert.deepEqual(saved, ['c1']);
    assert.equal(w.document.getElementById('detail-title').value, 'Second card');
  });

  it('closes when the card that is open is clicked on the board', async () => {
    const { w } = await load();
    w.render();
    w.openDetail('c1');
    await tick();
    const el = w.document.querySelector('.card[data-id="c1"]');
    assert.ok(el, 'card is rendered');
    el.dispatchEvent(new w.MouseEvent('click', { bubbles: true }));
    await tick();
    assert.equal(modal(w).classList.contains('active'), false);
  });
});

describe('card title in the side pane', () => {
  it('is measured again after the card opens in the pane', async () => {
    const { w } = await load();
    const measured = [];
    const resize = w.autoResizeTextarea;
    w.autoResizeTextarea = function (el) { measured.push(el.id); return resize.apply(this, arguments); };
    w.openDetail('c1');
    await new Promise((r) => w.requestAnimationFrame(() => setTimeout(r, 0)));
    assert.ok(measured.includes('detail-title'), JSON.stringify(measured));
  });
});
