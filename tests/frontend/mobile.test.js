// Phone layout: column tabs, board render, header menus and sidebar dropdowns.
// Run with: node --test tests/frontend/mobile.test.js

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

async function load({ width = 390 } = {}) {
  const dom = new JSDOM(indexHtml, { url: 'https://board.test/', pretendToBeVisual: true, runScripts: 'outside-only' });
  const w = dom.window;
  const loaded = new Promise((r) => w.document.addEventListener('DOMContentLoaded', () => setTimeout(r, 0), { once: true }));
  Object.defineProperty(w, 'innerWidth', { value: width, configurable: true });
  Object.defineProperty(w, 'innerHeight', { value: 844, configurable: true });
  w.matchMedia = (q) => ({ matches: /max-width: 768px/.test(q) ? width <= 768 : false, addEventListener() {}, removeEventListener() {} });
  w.API = { updateCard: () => Promise.resolve({}), listComments: () => Promise.resolve([]) };
  w.Toast = { success() {}, error() {}, info() {} };
  w.FnEditor = function () { return { getMarkdown: () => '', setMarkdown() {}, destroy() {}, focus() {} }; };
  w._settingsCache = {};
  w.HTMLElement.prototype.scrollIntoView = function () {};
  w.CSS = { escape: (s) => String(s) };
  // The browser loads these as ES modules: top-level names stay private, only window.* is shared.
  for (const f of ['dropdown.js', 'kanban.js', 'listview.js', 'features.js', 'a11y.js']) {
    w.eval(`(function () {\n${read('web/src/' + f)}\n})();`);
  }
  await loaded;
  const state = {};
  for (const col of w.COLUMNS) state[col.id] = [];
  state.todo.push(card({ priority: 'high' }), card({ id: 'c2', key: 'ALP-2', title: 'Second card' }),
    card({ id: 'c3', key: 'ALP-3', title: 'Third card' }));
  state.backlog.push(card({ id: 'c4', key: 'ALP-4', title: 'Backlog card', priority: 'high' }));
  w.state = state;
  w.currentBoardId = 'b1';
  w.boardList = [{ id: 'b1', name: 'Alpha', project_key: 'ALP' }];
  return w;
}

const tick = (ms = 0) => new Promise((r) => setTimeout(r, ms));
const frame = (w) => new Promise((r) => w.requestAnimationFrame(() => r()));
const tabCount = (w, col) => w.document.querySelector(`.mobile-tab[data-col="${col}"] .tab-count`).textContent;

describe('board on phones', () => {
  it('does not start the unfurl animation on phones, where the hidden columns would keep it', async () => {
    const w = await load();
    w._renderAnimateCards = true;
    w.render();
    assert.ok(w.document.querySelectorAll('#board .card').length > 0);
    assert.equal(w.document.querySelectorAll('#board .card.unfurl').length, 0);
    assert.equal(Array.from(w.document.querySelectorAll('#board .card')).filter((c) => c.style.animationDelay).length, 0);
  });

  it('keeps the unfurl animation on wide screens', async () => {
    const w = await load({ width: 1440 });
    w._renderAnimateCards = true;
    w.render();
    assert.ok(w.document.querySelectorAll('#board .card.unfurl').length > 0);
  });

  it('opens a column tab scrolled to the top', async () => {
    const w = await load();
    w.render();
    const board = w.document.getElementById('board');
    let top = 500;
    Object.defineProperty(board, 'scrollTop', { configurable: true, get: () => top, set: (v) => { top = v; } });
    w.switchMobileTab('backlog');
    assert.equal(top, 0);
    top = 300; // WebKit may restore the old offset for a frame
    await frame(w);
    assert.equal(top, 0);
  });

  it('shows the filtered card count on the column tabs', async () => {
    const w = await load();
    w.render();
    assert.equal(tabCount(w, 'todo'), '3');
    w.onFilterCheckbox('priority', { checked: true, value: 'high' });
    assert.equal(tabCount(w, 'todo'), '1');
    assert.equal(tabCount(w, 'backlog'), '1');
    w.onFilterCheckbox('priority', { checked: false, value: 'high' });
    assert.equal(tabCount(w, 'todo'), '3');
  });

  it('keeps the filtered counts when the board renders again', async () => {
    const w = await load();
    w.render();
    w.onFilterCheckbox('priority', { checked: true, value: 'high' });
    w.render();
    assert.equal(tabCount(w, 'todo'), '1');
  });

  it('hides the column tabs in the list view', async () => {
    const w = await load();
    w.render();
    const tabs = w.document.getElementById('mobile-column-tabs');
    assert.equal(tabs.classList.contains('mobile-tabs-off'), false);
    w.renderListView = () => {};
    w.switchView('list');
    assert.equal(tabs.classList.contains('mobile-tabs-off'), true);
    w.switchView('board');
    assert.equal(tabs.classList.contains('mobile-tabs-off'), false);
  });

  it('hides the column tabs while settings is open', async () => {
    const w = await load();
    w.render();
    const tabs = w.document.getElementById('mobile-column-tabs');
    w.document.getElementById('settings-page').classList.add('active');
    w.updateMobileTabsVisibility();
    assert.equal(tabs.classList.contains('mobile-tabs-off'), true);
    w.document.getElementById('settings-page').classList.remove('active');
    w.updateMobileTabsVisibility();
    assert.equal(tabs.classList.contains('mobile-tabs-off'), false);
  });

  it('updates the tabs when settings opens and closes', () => {
    const src = read('web/src/settings.js');
    const open = src.slice(src.indexOf('function openSettings'), src.indexOf('function closeSettings'));
    const close = src.slice(src.indexOf('function closeSettings'), src.indexOf('function toggleBoardEnabled'));
    assert.match(open, /settings\.classList\.add\('active'\);\s*\n\s*if \(typeof window\.updateMobileTabsVisibility === 'function'\) window\.updateMobileTabsVisibility\(\);/);
    assert.match(close, /settings\.classList\.remove\('active'\);\s*\n\s*if \(typeof window\.updateMobileTabsVisibility === 'function'\) window\.updateMobileTabsVisibility\(\);/);
  });
});

describe('board menu on phones', () => {
  async function openMenu(width) {
    const w = await load({ width });
    w.render();
    const menu = w.document.getElementById('board-menu');
    Object.defineProperty(menu, 'offsetHeight', { configurable: true, get: () => 180 });
    menu.parentElement.getBoundingClientRect = () => ({ top: 10, bottom: 38, left: 44, right: 120, width: 76, height: 28 });
    w.document.querySelector('.header').getBoundingClientRect = () => ({ top: 0, bottom: 48, left: 0, right: width, width, height: 48 });
    w.toggleBoardPicker();
    await frame(w);
    return { w, menu, header: w.document.querySelector('.header') };
  }

  it('spans the screen under the header and pushes the page down', async () => {
    const { menu, header } = await openMenu(390);
    assert.equal(menu.classList.contains('header-menu-docked'), true);
    assert.equal(menu.style.top, '38px');
    assert.equal(menu.style.left, '-44px');
    assert.equal(menu.style.width, '100vw');
    assert.equal(header.style.marginBottom, '180px');
  });

  it('gives the space back when it closes', async () => {
    const { w, menu, header } = await openMenu(390);
    w.closeBoardPicker();
    assert.equal(menu.classList.contains('header-menu-docked'), false);
    assert.equal(menu.style.left, '');
    assert.equal(header.style.marginBottom, '');
  });

  it('stays a floating menu on wide screens', async () => {
    const { menu, header } = await openMenu(1440);
    assert.equal(menu.classList.contains('header-menu-docked'), false);
    assert.equal(header.style.marginBottom, '');
  });
});

describe('dropdowns that float on phones', () => {
  function dropdown(w, opts = {}) {
    const host = w.document.createElement('div');
    w.document.body.appendChild(host);
    host.getBoundingClientRect = () => ({ top: 600, bottom: 630, left: 300, right: 380, width: 80, height: 30 });
    const dd = new w.FnDropdown(host, { floatOnMobile: true, value: 'a',
      options: [{ value: 'a', label: 'Alpha' }, { value: 'b', label: 'Beta' }], ...opts });
    Object.defineProperty(dd.menu, 'offsetHeight', { configurable: true, get: () => 120 });
    dd.menu.getBoundingClientRect = () => ({ top: 0, bottom: 120, left: 0, right: 200, width: 200, height: 120 });
    return { dd, host };
  }

  it('lifts the open menu into <body>, inside the screen, without focusing the search box', async () => {
    const w = await load();
    const { dd, host } = dropdown(w);
    let focused = false;
    dd.searchInput.focus = () => { focused = true; };
    dd.open();
    assert.equal(dd.menu.parentElement, w.document.body);
    assert.equal(dd.menu.classList.contains('fn-dropdown-floating'), true);
    assert.equal(dd.menu.style.left, `${390 - 16 - 200}px`, 'kept 16px from the right edge');
    assert.equal(dd.menu.style.top, '634px');
    await tick(60);
    assert.equal(focused, false);
    dd.close();
    assert.equal(dd.menu.parentElement, host);
    assert.equal(dd.menu.classList.contains('fn-dropdown-floating'), false);
    assert.equal(dd.menu.style.left, '');
  });

  it('opens upwards when there is no room below', async () => {
    const w = await load();
    const { dd, host } = dropdown(w);
    host.getBoundingClientRect = () => ({ top: 780, bottom: 810, left: 20, right: 100, width: 80, height: 30 });
    dd.open();
    assert.equal(dd.menu.style.top, 'auto');
    assert.equal(dd.menu.style.bottom, `${844 - 780 + 4}px`);
    assert.equal(dd.menu.style.left, '16px');
  });

  it('picks an option from the lifted menu', async () => {
    const w = await load();
    let picked = null;
    const { dd } = dropdown(w, { onChange: (v) => { picked = v; } });
    dd.open();
    const beta = dd.menu.querySelector('.fn-dropdown-option[data-value="b"]');
    beta.dispatchEvent(new w.MouseEvent('click', { bubbles: true }));
    assert.equal(picked, 'b');
    assert.equal(dd.menu.parentElement, dd.el);
  });

  it('does not close when the lifted menu itself is clicked', async () => {
    const w = await load();
    const { dd } = dropdown(w);
    dd.open();
    assert.equal(dd.menu.parentElement, w.document.body);
    dd.searchInput.dispatchEvent(new w.MouseEvent('click', { bubbles: true }));
    assert.equal(dd.isOpen, true);
  });

  it('stays in place on wide screens', async () => {
    const w = await load({ width: 1440 });
    const { dd, host } = dropdown(w);
    dd.open();
    assert.equal(dd.menu.parentElement, host);
  });

  it('is used for the card sidebar fields', async () => {
    const w = await load();
    w.openDetail('c1');
    await tick();
    w.toggleSidebarField('assignee');
    await tick(40);
    const menu = w.document.querySelector('body > .fn-dropdown-menu.fn-dropdown-floating');
    assert.ok(menu, 'the assignee menu floats');
    w.closeAllSidebarFields();
    assert.equal(w.document.querySelector('body > .fn-dropdown-menu'), null);
    assert.ok(w.document.querySelector('#detail-assignee .fn-dropdown-menu'));
  });
});

describe('phone stylesheet', () => {
  const responsive = read('web/styles/responsive.css');
  it('keeps text fields at 16px on touch screens so iOS does not zoom in', () => {
    assert.match(responsive, /@media \(pointer: coarse\) \{\s*input:not\(\[type="checkbox"\]\)[^{]*textarea,[^{]*select,[^{]*\{\s*font-size: 16px !important;/);
  });
  it('hides switched-off column tabs', () => {
    assert.match(responsive, /\.mobile-column-tabs\.mobile-tabs-off \{\s*display: none;/);
  });
  it('styles the docked board menu', () => {
    assert.match(responsive, /\.header-board-menu\.header-menu-docked \{[^}]*border-radius: 0;/);
  });
  it('positions floating dropdown menus fixed, above the card detail', () => {
    assert.match(read('web/styles/dropdown.css'), /\.fn-dropdown-menu\.fn-dropdown-floating \{[^}]*position: fixed;[^}]*z-index: 30000;/);
  });
  it('draws one divider per sidebar row', () => {
    assert.match(read('web/styles/detail.css'), /\.detail-sidebar \.detail-field-row \{[^}]*border-bottom: 1px solid var\(--border-faint\);/);
  });
});
