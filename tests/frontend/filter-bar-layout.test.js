// Filter row layout: search, filters and view controls in one row above the board.
// Run with: node --test tests/frontend/filter-bar-layout.test.js

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

async function load({ width = 1440 } = {}) {
  const dom = new JSDOM(indexHtml, { url: 'https://board.test/', pretendToBeVisual: true, runScripts: 'outside-only' });
  const w = dom.window;
  const loaded = new Promise((r) => w.document.addEventListener('DOMContentLoaded', () => setTimeout(r, 0), { once: true }));
  Object.defineProperty(w, 'innerWidth', { value: width, configurable: true, writable: true });
  Object.defineProperty(w, 'innerHeight', { value: 844, configurable: true });
  w.matchMedia = (q) => ({ matches: /max-width: 768px/.test(q) ? width <= 768 : false, addEventListener() {}, removeEventListener() {} });
  w.API = { updateCard: () => Promise.resolve({}), listComments: () => Promise.resolve([]), searchCards: () => Promise.resolve([]) };
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
  state.todo.push(card(), card({ id: 'c2', key: 'ALP-2', title: 'Second card' }));
  w.state = state;
  w.currentBoardId = 'b1';
  w.boardList = [{ id: 'b1', name: 'Alpha', project_key: 'ALP' }];
  return w;
}

const tick = (ms = 0) => new Promise((r) => setTimeout(r, ms));
const frame = (w) => new Promise((r) => w.requestAnimationFrame(() => r()));

describe('filter row', () => {
  it('holds the search box first, before the filters', async () => {
    const w = await load();
    const bar = w.document.getElementById('filter-bar');
    const search = w.document.getElementById('header-search-wrap');
    assert.equal(search.parentElement, bar);
    assert.ok(search.compareDocumentPosition(bar.querySelector('.filter-group')) & w.Node.DOCUMENT_POSITION_FOLLOWING);
    assert.equal(w.document.querySelector('.header-actions #header-search-wrap'), null);
  });

  it('holds density and the board/list switch together at the end', async () => {
    const w = await load();
    const group = w.document.querySelector('#filter-bar .filter-view-group');
    assert.ok(group);
    assert.equal(group.parentElement.lastElementChild, group);
    assert.ok(group.querySelector('#filter-density-wrap'));
    assert.ok(group.querySelector('.view-switcher .view-switcher-btn[data-view="list"]'));
    assert.equal(w.document.querySelector('.header-actions > .view-switcher'), null);
  });

  it('keeps the moved controls working', async () => {
    const w = await load();
    w.render();
    w.document.querySelector('#filter-bar .view-switcher-btn[data-view="list"]').click();
    assert.equal(w.currentView, 'list');
    const input = w.document.getElementById('header-search');
    input.value = 'second';
    input.dispatchEvent(new w.Event('input'));
    assert.equal(w.document.getElementById('header-search-clear').classList.contains('hidden'), false);
  });

  it('takes the width of one board column and ends at the last column', async () => {
    const w = await load();
    w.render();
    const cols = Array.from(w.document.querySelectorAll('#board .column'));
    cols.forEach((c, i) => {
      Object.defineProperty(c, 'offsetWidth', { configurable: true, get: () => 250 });
      c.getBoundingClientRect = () => ({ left: 16 + i * 262, right: 266 + i * 262, width: 250, top: 0, bottom: 0 });
    });
    w.document.getElementById('board').style.paddingRight = '16px';
    w.document.getElementById('board').getBoundingClientRect = () => ({ left: 0, right: 2000, width: 2000, top: 0, bottom: 0 });
    w.syncFilterBarToColumns();
    const bar = w.document.getElementById('filter-bar');
    assert.equal(bar.style.getPropertyValue('--filter-column-width'), '250px');
    const last = 266 + (cols.length - 1) * 262;
    assert.equal(bar.style.getPropertyValue('--filter-columns-width'), (last + 16) + 'px');
  });

  it('sits above the phone column tabs even when the tabs came first', async () => {
    const w = await load({ width: 390 });
    w.document.getElementById('filter-bar').remove();
    w.document.getElementById('mobile-column-tabs')?.remove();
    w.initMobileColumnTabs();
    w.initFilterBar();
    const bar = w.document.getElementById('filter-bar');
    assert.equal(bar.nextElementSibling, w.document.getElementById('mobile-column-tabs'));
  });

  it('styles the row for wide screens', () => {
    const css = read('web/styles/board.css');
    assert.match(css, /\.filter-bar > \.filter-bar-search \{[^}]*width: var\(--filter-column-width, 240px\);/);
    assert.match(css, /\.filter-bar \{\s*box-sizing: border-box;\s*max-width: var\(--filter-columns-width, none\);/);
    assert.match(css, /\.filter-view-group \{[^}]*margin-left: auto;/);
    assert.match(css, /\.filter-view-group \.filter-menu \{\s*left: auto;\s*right: 0;/);
  });
});

describe('search on phones', () => {
  it('is an icon that opens the search box in the row', async () => {
    const w = await load({ width: 390 });
    const bar = w.document.getElementById('filter-bar');
    assert.equal(bar.firstElementChild.className, 'filter-search-toggle');
    assert.equal(bar.classList.contains('search-open'), false);
    w.openFilterBarSearch();
    assert.equal(bar.classList.contains('search-open'), true);
    assert.equal(w.document.activeElement, w.document.getElementById('header-search'));
  });

  it('grows with its text', async () => {
    const w = await load({ width: 390 });
    w.openFilterBarSearch();
    const input = w.document.getElementById('header-search');
    input.value = 'a much longer query';
    input.dispatchEvent(new w.Event('input'));
    assert.equal(input.style.getPropertyValue('--search-chars'), '20ch');
  });

  it('closes again when it is left empty, and stays open with a query', async () => {
    const w = await load({ width: 390 });
    const bar = w.document.getElementById('filter-bar');
    const input = w.document.getElementById('header-search');
    w.openFilterBarSearch();
    input.value = 'card';
    input.blur();
    await tick(200);
    assert.equal(bar.classList.contains('search-open'), true);
    w.openFilterBarSearch();
    input.value = '';
    input.blur();
    await tick(200);
    assert.equal(bar.classList.contains('search-open'), false);
  });

  it('closes when the query is cleared', async () => {
    const w = await load({ width: 390 });
    const bar = w.document.getElementById('filter-bar');
    const input = w.document.getElementById('header-search');
    w.openFilterBarSearch();
    input.value = 'card';
    input.blur();
    w.clearGlobalSearch(); // the clear button's inline handler
    w.document.getElementById('header-search-clear').dispatchEvent(new w.MouseEvent('click', { bubbles: true }));
    await tick(200);
    assert.equal(bar.classList.contains('search-open'), false);
  });

  it('shows the search box and hides the icon on wide screens', () => {
    const responsive = read('web/styles/responsive.css');
    assert.match(read('web/styles/board.css'), /\.filter-search-toggle \{\s*display: none;/);
    assert.match(responsive, /\.filter-bar\.search-open > \.filter-bar-search \{\s*display: flex;/);
    assert.match(responsive, /\.filter-bar > \.filter-group \{\s*overflow-x: auto;/);
  });
});

describe('filter menus on phones', () => {
  it('lift an open menu out of the scrolling row, under the bar', async () => {
    const w = await load({ width: 390 });
    w.document.getElementById('filter-bar').getBoundingClientRect = () => ({ top: 48, bottom: 96, left: 0, right: 390, width: 390, height: 48 });
    w.toggleFilterDropdown('assignee');
    const menu = w.document.getElementById('filter-assignee-menu');
    assert.equal(menu.parentElement, w.document.body);
    assert.equal(menu.classList.contains('hidden'), false);
    assert.equal(menu.style.top, '100px');
  });

  it('stay open when the lifted menu itself is clicked, and close on a click elsewhere', async () => {
    const w = await load({ width: 390 });
    w.toggleFilterDropdown('priority');
    const menu = w.document.getElementById('filter-priority-menu');
    menu.querySelector('.filter-checkbox-item').dispatchEvent(new w.MouseEvent('click', { bubbles: true }));
    assert.equal(menu.classList.contains('hidden'), false);
    w.document.getElementById('board').dispatchEvent(new w.MouseEvent('click', { bubbles: true }));
    assert.equal(menu.classList.contains('hidden'), true);
  });

  it('open next to their button on wide screens, also after a phone lifted them', async () => {
    const w = await load({ width: 390 });
    w.toggleFilterDropdown('tag');
    w.toggleFilterDropdown('tag');
    w.innerWidth = 1440;
    w.toggleFilterDropdown('tag');
    const menu = w.document.getElementById('filter-tag-menu');
    assert.equal(menu.parentElement.id, 'filter-tag-wrap');
    assert.equal(menu.style.top, '');
  });
});

describe('column tabs on phones', () => {
  it('scroll the active tab into view when the tabs do not fit', async () => {
    const w = await load({ width: 320 });
    w.render();
    const tabs = w.document.getElementById('mobile-column-tabs');
    Object.defineProperty(tabs, 'scrollWidth', { configurable: true, get: () => 600 });
    Object.defineProperty(tabs, 'clientWidth', { configurable: true, get: () => 320 });
    const all = Array.from(tabs.querySelectorAll('.mobile-tab'));
    all.forEach((t, i) => {
      Object.defineProperty(t, 'offsetLeft', { configurable: true, get: () => i * 120 });
      Object.defineProperty(t, 'offsetWidth', { configurable: true, get: () => 120 });
    });
    let to = null;
    tabs.scrollTo = (o) => { to = o.left; };
    const last = all[all.length - 1];
    w.switchMobileTab(last.dataset.col);
    assert.equal(to, (all.length - 1) * 120 - 100);
  });

  it('let the tabs keep their width and scroll instead of squeezing them', () => {
    assert.match(read('web/styles/responsive.css'), /\.mobile-tab \{\s*flex: 1 0 auto;\s*min-width: auto;/);
  });

  it('leave room for the board name in the header', () => {
    assert.match(read('web/styles/responsive.css'), /#board-picker-label \{[^}]*max-width: 14ch;[^}]*text-overflow: ellipsis;/);
  });
});
