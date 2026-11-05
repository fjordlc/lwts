// Phone navigation: the bottom bar (Boards / Filter / New card / View / Account) and its sheets, which show the
// app's own board picker, search box, filter and view menus and account menu (mobilenav.js, features.js).
// Run with: node --test tests/frontend/mobile-bottom-nav.test.js

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
] });

async function load({ width = 390 } = {}) {
  const dom = new JSDOM(indexHtml, { url: 'https://board.test/', pretendToBeVisual: true, runScripts: 'outside-only' });
  const w = dom.window;
  const loaded = new Promise((r) => w.document.addEventListener('DOMContentLoaded', () => setTimeout(r, 0), { once: true }));
  Object.defineProperty(w, 'innerWidth', { value: width, configurable: true, writable: true });
  Object.defineProperty(w, 'innerHeight', { value: 844, configurable: true });
  w.matchMedia = (q) => ({ matches: /max-width: 768px/.test(q) ? width <= 768 : false, addEventListener() {}, removeEventListener() {} });
  const calls = [];
  w.API = { listCards: () => new Promise(() => {}), getBoard: () => new Promise(() => {}), updateCard: () => Promise.resolve({}), moveCard: () => Promise.resolve({}), putSettings: () => Promise.resolve({}), listComments: () => Promise.resolve([]), searchCards: () => Promise.resolve([]) };
  w.Toast = { success() {}, error() {}, info() {} };
  w.FnEditor = function () { return { getMarkdown: () => '', setMarkdown() {}, destroy() {}, focus() {} }; };
  w._settingsCache = {};
  w.HTMLElement.prototype.scrollIntoView = function () {};
  w.CSS = { escape: (s) => String(s) };
  w.parseBoardSettings = (raw) => JSON.parse(raw || '{}');
  for (const f of ['dropdown.js', 'kanban.js', 'listview.js', 'features.js', 'a11y.js', 'mobilenav.js']) {
    w.eval(`(function () {\n${read('web/src/' + f)}\n})();`);
  }
  await loaded;
  const state = {};
  for (const col of w.COLUMNS) state[col.id] = [];
  state.todo.push(card({ id: 'a', priority: 'high' }), card({ id: 'b' }));
  w.state = state;
  w.currentBoardId = 'b1';
  w.boardList = [{ id: 'b1', name: 'Alpha', project_key: 'ALP', settings: B1 }, { id: 'b2', name: 'Beta', project_key: 'BET', settings: '{}' }];
  w.openSettings = () => calls.push({ op: 'settings' });
  w.calls = calls;
  w.render();
  return w;
}

const $ = (w, s) => w.document.querySelector(s);
const sheetBody = (w) => $(w, '#mobile-sheet-body');
const sections = (w) => Array.from(sheetBody(w).querySelectorAll('.mobile-sheet-section'));
const summary = (w, type) => $(w, `.mobile-sheet-section[data-menu="${type}"] .mobile-sheet-section-value`).textContent;
const flush = (w) => new Promise((r) => w.setTimeout(r, 5));

describe('phone navigation bar', () => {
  it('holds Boards, Filter, New card, View and Account; the round New card button is its middle', async () => {
    const w = await load();
    const bar = $(w, '#mobile-nav .mobile-nav-bar');
    const items = Array.from(bar.children).map((b) => b.dataset.sheet || b.id);
    assert.deepEqual(items, ['boards', 'filter', 'new-card-fab', 'view', 'account']);
    assert.equal($(w, '#new-card-fab').getAttribute('aria-label'), 'New card');
    assert.equal(w.document.querySelectorAll('#new-card-fab').length, 1, 'no separate floating button');
  });

  it('shows the signed-in user\'s avatar on the Account button', async () => {
    const w = await load();
    w.USERS.push({ value: 'u1', label: 'Ann', initials: 'AN', avatar_color: '#82B1FF', avatar_url: '' });
    w.currentUser = { id: 'u1', name: 'Ann', email: 'ann@test.dev' };
    w.initUserMenu();
    assert.equal($(w, '#mobile-nav-avatar').textContent, 'AN');
    assert.equal($(w, '#mobile-nav-avatar').style.color, $(w, '#header-user-avatar').style.color);
  });
});

describe('Filter sheet', () => {
  it('lends the search box and the filter menus to the sheet, in the filter row\'s order', async () => {
    const w = await load();
    w.openMobileSheet('filter');
    assert.equal($(w, '#mobile-sheet').hidden, false);
    assert.equal($(w, '#mobile-sheet-backdrop').hidden, false);
    assert.equal($(w, '#header-search-wrap').parentElement, sheetBody(w));
    assert.deepEqual(sections(w).map((s) => s.dataset.menu), ['assignee', 'priority', 'tag', 'cf-team', 'column']);
    assert.deepEqual(sections(w).map((s) => s.querySelector('.mobile-sheet-section-title').textContent), ['Assignee', 'Priority', 'Type', 'Team', 'Status']);
    assert.ok($(w, '#filter-priority-menu').closest('.mobile-sheet-section[data-menu="priority"]'), 'the native menu itself is in the section');
    assert.ok($(w, '.mobile-nav-btn[data-sheet="filter"]').classList.contains('active'));
  });

  it('filters through the native menu and shows the choice in the summary and as a dot', async () => {
    const w = await load();
    w.openMobileSheet('filter');
    assert.equal(summary(w, 'priority'), 'Any');
    const box = $(w, '#filter-priority-menu input[value="high"]');
    box.checked = true;
    w.onFilterCheckbox('priority', box); // the box's inline onchange (jsdom does not run it)
    box.dispatchEvent(new w.Event('change', { bubbles: true }));
    await flush(w);
    assert.deepEqual([...w.activeFilters.priorities], ['high']);
    assert.equal(summary(w, 'priority'), 'High');
    assert.ok($(w, '.mobile-sheet-section[data-menu="priority"] .mobile-sheet-section-value').classList.contains('set'));
    assert.ok($(w, '#mobile-nav-filter').classList.contains('has-filters'));
    const shown = Array.from(w.document.querySelectorAll('#board .card:not(.search-hidden)')).map((c) => c.dataset.id);
    assert.deepEqual(shown, ['a']);
  });

  it('opens one section at a time', async () => {
    const w = await load();
    w.openMobileSheet('filter');
    const [a, p] = sections(w);
    a.querySelector('.mobile-sheet-section-head').click();
    assert.ok(a.classList.contains('open'));
    p.querySelector('.mobile-sheet-section-head').click();
    assert.ok(!a.classList.contains('open') && p.classList.contains('open'));
    assert.equal(p.querySelector('.mobile-sheet-section-head').getAttribute('aria-expanded'), 'true');
  });

  it('shows the Epic filter only while the board is grouped by epic', async () => {
    const w = await load();
    w.state.todo.push(card({ id: 'e1', key: 'ALP-9', tag: 'epic', title: 'Big' }));
    w.render();
    w.applyEpicLaneVisibility();
    w.openMobileSheet('filter');
    const has = sections(w).some((s) => s.dataset.menu === 'epic');
    assert.equal(has, w.currentGroupBy() === 'epic');
  });

  it('puts everything back when it closes', async () => {
    const w = await load();
    w.openMobileSheet('filter');
    w.closeMobileSheet();
    assert.equal($(w, '#mobile-sheet').hidden, true);
    assert.equal($(w, '#mobile-sheet-backdrop').hidden, true);
    assert.equal($(w, '#filter-priority-menu').parentElement, $(w, '#filter-priority-wrap'));
    assert.equal($(w, '#filter-cf-team-menu').parentElement, $(w, '#filter-cf-team-wrap'));
    assert.ok($(w, '#filter-priority-menu').classList.contains('hidden'));
    assert.equal($(w, '#header-search-wrap').previousElementSibling, $(w, '#filter-bar .filter-search-toggle'));
    assert.equal(sheetBody(w).children.length, 0);
    assert.ok(!$(w, '.mobile-nav-btn[data-sheet="filter"]').classList.contains('active'));
  });

  it('closes on a second tap, on the backdrop and on Escape', async () => {
    const w = await load();
    const btn = $(w, '.mobile-nav-btn[data-sheet="filter"]');
    btn.click();
    assert.equal($(w, '#mobile-sheet').hidden, false);
    btn.click();
    assert.equal($(w, '#mobile-sheet').hidden, true);
    btn.click();
    $(w, '#mobile-sheet-backdrop').click();
    assert.equal($(w, '#mobile-sheet').hidden, true);
    btn.click();
    w.document.dispatchEvent(new w.KeyboardEvent('keydown', { key: 'Escape' }));
    assert.equal($(w, '#mobile-sheet').hidden, true);
  });

  it('marks the Filter button while columns are hidden or a search is typed', async () => {
    const w = await load();
    const btn = $(w, '#mobile-nav-filter');
    assert.ok(!btn.classList.contains('has-filters'));
    w.toggleColumnVisibility('done');
    assert.ok(btn.classList.contains('has-filters'));
    w.showAllColumns();
    assert.ok(!btn.classList.contains('has-filters'));
    const input = $(w, '#header-search');
    input.value = 'first';
    input.dispatchEvent(new w.Event('input'));
    assert.ok(btn.classList.contains('has-filters'));
  });
});

describe('View sheet', () => {
  it('lends the board/list switch and the Sort, Group by, Properties and Density menus', async () => {
    const w = await load();
    w.openMobileSheet('view');
    assert.equal($(w, '.view-switcher').parentElement, sheetBody(w));
    assert.deepEqual(sections(w).map((s) => s.dataset.menu), ['sort', 'group', 'props', 'density']);
    assert.equal(summary(w, 'sort'), 'Manual order');
    assert.equal(summary(w, 'density'), 'Default');
  });

  it('closes a single-choice section once picked and shows the new choice', async () => {
    const w = await load();
    w.openMobileSheet('view');
    const sort = $(w, '.mobile-sheet-section[data-menu="sort"]');
    sort.querySelector('.mobile-sheet-section-head').click();
    $(w, '#filter-sort-menu .filter-sort-item[data-sort="title"]').click();
    await flush(w);
    assert.equal(w.getCardSort().key, 'title');
    assert.ok(!sort.classList.contains('open'));
    assert.equal(summary(w, 'sort'), 'Title ↑');
  });

  it('keeps the Properties section open while properties are switched', async () => {
    const w = await load();
    w.openMobileSheet('view');
    const props = $(w, '.mobile-sheet-section[data-menu="props"]');
    props.querySelector('.mobile-sheet-section-head').click();
    $(w, '#filter-props-menu .filter-sort-item:not(.disabled)').click();
    await flush(w);
    assert.ok(props.classList.contains('open'));
    assert.equal(summary(w, 'props'), '1 hidden');
  });

  it('switches to the list with the native switch', async () => {
    const w = await load();
    w.initListView && w.initListView();
    w.openMobileSheet('view');
    $(w, '#mobile-sheet-body .view-switcher-btn[data-view="list"]').click();
    assert.equal(w.currentView, 'list');
    w.closeMobileSheet();
    assert.ok($(w, '#filter-view-group .view-switcher'), 'the switch is back in the filter row');
  });
});

describe('Boards and Account sheets', () => {
  it('shows the board picker menu; picking a board closes the sheet', async () => {
    const w = await load();
    w.openMobileSheet('boards');
    const names = Array.from(w.document.querySelectorAll('#mobile-sheet-body .header-board-option')).map((o) => o.textContent.trim());
    assert.deepEqual(names.slice(0, 2).map((n) => n.replace(/[★☆]/g, '')), ['Alpha', 'Beta']);
    w.document.querySelectorAll('#mobile-sheet-body .header-board-option')[1].click();
    assert.equal(w.currentBoardId, 'b2');
    assert.equal($(w, '#mobile-sheet').hidden, true);
  });

  it('opens the boards sheet from the header picker when the bar is shown, the header menu otherwise', async () => {
    const w = await load();
    w.toggleBoardPicker();
    assert.equal($(w, '#mobile-sheet-body').dataset.sheet, 'boards');
    assert.ok($(w, '#board-menu').classList.contains('hidden'));
    w.closeMobileSheet();
    const wide = await load({ width: 1440 });
    wide.toggleBoardPicker();
    assert.ok(!wide.document.getElementById('board-menu').classList.contains('hidden'));
    assert.equal(wide.document.getElementById('mobile-sheet').hidden, true);
  });

  it('lends the account menu; an item runs and the menu goes back to the header', async () => {
    const w = await load();
    w.openMobileSheet('account');
    const menu = $(w, '#header-user-dropdown');
    assert.equal(menu.parentElement, sheetBody(w));
    assert.ok(!menu.classList.contains('hidden'));
    const profile = Array.from(menu.querySelectorAll('.header-user-item')).find((i) => /Profile/.test(i.textContent));
    profile.click();
    assert.equal($(w, '#mobile-sheet').hidden, true);
    assert.equal(menu.parentElement, $(w, '#header-user-menu'));
    assert.ok(menu.classList.contains('hidden'));
  });

  it('closes the sheet when New card is tapped', async () => {
    const w = await load();
    w.openMobileSheet('view');
    w.openCreateFromButton = () => {};
    $(w, '#new-card-fab').click();
    assert.equal($(w, '#mobile-sheet').hidden, true);
  });
});

describe('phone navigation stylesheet', () => {
  const board = read('web/styles/board.css');
  const css = read('web/styles/responsive.css');
  const block = css.slice(css.indexOf('Phones: bottom navigation'));

  it('is hidden on wide screens', () => {
    assert.match(board, /\.new-card-fab, \.mobile-nav, \.mobile-sheet-backdrop \{ display: none; \}/);
  });

  it('takes over the filter row and the account avatar on phones, but not on the settings page', () => {
    assert.match(block, /^[^{]*@media \(max-width: 768px\)/m);
    assert.match(block, /#filter-bar,\s*body:not\(:has\(\.settings-page\.active\)\) #header-user-menu \{ display: none; \}/);
    assert.match(block, /body:has\(\.settings-page\.active\) :is\(\.mobile-nav, \.mobile-sheet-backdrop\)/);
    assert.match(block, /body:has\(\.lwts-modal-overlay\.active\) :is\(\.mobile-nav, \.mobile-sheet-backdrop\)/);
    assert.match(block, /\.mobile-nav-bar > \.new-card-fab \{[^}]*display: flex/);
  });

  it('lays the lent menus flat in the sheet, open or not', () => {
    assert.match(block, /\.mobile-sheet-body \.filter-menu,\s*\.mobile-sheet-body \.filter-menu\.hidden,\s*\.mobile-sheet-body \.header-user-dropdown \{[^}]*display: block;[^}]*position: static/);
  });
});

describe('settings in the phone sheet', () => {
  function withSettings(w) {
    w.SETTINGS_SECTIONS = [
      { id: 'general', label: 'General', group: 'workspace', icon: '<svg></svg>' },
      { id: 'boards', label: 'Boards', group: 'workspace', icon: '<svg></svg>' },
      { id: 'team', label: 'Team', group: 'people', icon: '<svg></svg>' },
    ];
    w.SETTINGS_GROUPS = { workspace: 'Workspace', people: 'People' };
    w.prepareSettings = () => { w.calls.push({ op: 'prepare' }); return Promise.resolve(); };
    w.showSettingsSection = (id, fromHash) => w.calls.push({ op: 'section', id, fromHash });
    w.toggleBoardConfig = (id) => { w.document.getElementById(id).classList.remove('hidden'); };
    $(w, '#settings-boards-list').innerHTML = ['b1', 'b2'].map((id) => `<div class="settings-board-card"><div class="settings-board-header">${id}</div><div class="settings-board-config hidden" id="board-config-${id}"><div class="settings-column-row">x</div></div></div>`).join('');
    return w;
  }
  const lit = (w) => Array.from(w.document.querySelectorAll('#mobile-nav .mobile-nav-btn.active')).map((b) => b.dataset.sheet);

  it('Account > Settings lists the sections in the sheet instead of opening the settings page', async () => {
    const w = withSettings(await load());
    $(w, '#mobile-nav .mobile-nav-btn[data-sheet="account"]').click();
    const item = Array.from(sheetBody(w).querySelectorAll('.header-user-item')).find((i) => /openSettings/.test(i.getAttribute('onclick')));
    item.dispatchEvent(new w.MouseEvent('click', { bubbles: true }));
    assert.equal(sheetBody(w).dataset.sheet, 'settings');
    assert.equal(w.calls.filter((c) => c.op === 'settings').length, 0, 'the settings page did not open');
    assert.deepEqual(Array.from(sheetBody(w).querySelectorAll('.mobile-sheet-link')).map((r) => r.textContent.trim()), ['General', 'Boards', 'Team']);
    assert.deepEqual(Array.from(sheetBody(w).querySelectorAll('.mobile-sheet-group-title')).map((g) => g.textContent), ['Workspace', 'People']);
    assert.deepEqual(lit(w), ['account']);
  });

  it('opens a section in the sheet, goes back, and gives the section back when the sheet closes', async () => {
    const w = withSettings(await load());
    w.openMobileSheet('settings', {});
    Array.from(sheetBody(w).querySelectorAll('.mobile-sheet-link')).find((r) => r.textContent.trim() === 'Team').click();
    await flush(w);
    assert.ok(sheetBody(w).contains($(w, '#settings-team')), 'the Team section is in the sheet');
    assert.ok(w.calls.some((c) => c.op === 'section' && c.id === 'team' && c.fromHash === true), 'the URL is left alone');
    $(w, '#mobile-sheet .mobile-sheet-back').click();
    assert.ok(!sheetBody(w).contains($(w, '#settings-team')));
    assert.ok($(w, '.settings-content').contains($(w, '#settings-team')), 'back in the settings page');
    w.closeMobileSheet();
    assert.equal($(w, '#mobile-sheet').hidden, true);
  });

  it('a gear in the Boards sheet opens only that board\'s settings, opened, under Boards', async () => {
    const w = withSettings(await load());
    $(w, '#mobile-nav .mobile-nav-btn[data-sheet="boards"]').click();
    const gears = sheetBody(w).querySelectorAll('.mobile-sheet-board-gear');
    assert.equal(gears.length, 2, 'one gear per board');
    gears[1].click();
    await flush(w);
    const sec = $(w, '#settings-boards');
    assert.ok(sheetBody(w).contains(sec));
    assert.ok(sec.classList.contains('mobile-sheet-one-board'));
    assert.ok($(w, '#board-config-b2').closest('.settings-board-card').classList.contains('mobile-sheet-target'));
    assert.ok(!$(w, '#board-config-b2').classList.contains('hidden'), 'opened');
    assert.ok(!$(w, '#board-config-b1').closest('.settings-board-card').classList.contains('mobile-sheet-target'));
    assert.equal($(w, '#mobile-sheet .mobile-sheet-title').textContent, 'Beta');
    assert.deepEqual(lit(w), ['boards']);
    w.closeMobileSheet();
    assert.equal(w.document.querySelectorAll('.mobile-sheet-one-board, .mobile-sheet-target').length, 0, 'marks removed');
    assert.ok($(w, '.settings-content').contains(sec));
  });
});
