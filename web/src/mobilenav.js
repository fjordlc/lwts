// ═══════════════════════════════════════════════════════════════
// PHONE NAVIGATION
// ═══════════════════════════════════════════════════════════════
//
// On phones a bar at the bottom of the board and the list holds Boards,
// Filter, New card, View and Account. Each (but New card) opens a sheet above
// the bar. The sheets show the app's own controls: the board picker menu, the
// search box and the filter row's menus (features.js), the board/list
// switcher and the account menu. Those nodes move into the sheet while it is
// open and go back to their place when it closes, so their listeners and
// state stay where they are. The bar and the sheets only show on phones
// (responsive.css); the filter row, the account avatar and the round New card
// button make way for them there.
//
// Settings open in the sheet too: Account > Settings lists the sections, a
// section opens in the sheet with a way back, and the gear next to a board in
// the Boards sheet opens that board's settings. The sections are lent from the
// settings page the same way, so the board stays in view behind the sheet.

const MOBILE_NAV_MAX_WIDTH = 768;
const _sheetBack = '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="15 18 9 12 15 6"/></svg>';
const _sheetNext = '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="9 18 15 12 9 6"/></svg>';
const _sheetGear = '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>';
const _sheetChevron = '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="6 9 12 15 18 9"/></svg>';

let _openSheet = null;
let _openButton = null; // the bar button lit for the open sheet
let _docked = []; // { node, marker } for nodes lent to the open sheet
let _undockHooks = []; // run when the lent nodes go back
let _sheetRender = 0; // bumped on every render, so a late settings load can tell it is stale

function isMobileNavShown() {
  const nav = document.getElementById('mobile-nav');
  if (!nav || window.innerWidth > MOBILE_NAV_MAX_WIDTH) return false;
  return getComputedStyle(nav).display !== 'none';
}

// Lends a node to the sheet; a comment keeps its place.
function _dock(node, host) {
  if (!node || !host) return;
  const marker = document.createComment('mobile-sheet');
  node.parentNode.insertBefore(marker, node);
  host.appendChild(node);
  _docked.push({ node, marker });
}

function _undockAll() {
  _undockHooks.forEach(fn => fn());
  _undockHooks = [];
  _docked.reverse().forEach(({ node, marker }) => {
    if (marker.parentNode) marker.parentNode.replaceChild(node, marker);
    else node.remove(); // its place is gone (e.g. another board's custom field menu)
  });
  _docked = [];
}

// One collapsible section per menu: its title, a summary of the current
// choice, and the menu itself. One section is open at a time.
function _sheetSection(body, { type, title, single }) {
  const menu = document.getElementById(`filter-${type}-menu`);
  if (!menu) return null;
  const section = document.createElement('div');
  section.className = 'mobile-sheet-section';
  section.dataset.menu = type;
  const head = document.createElement('button');
  head.type = 'button';
  head.className = 'mobile-sheet-section-head';
  head.setAttribute('aria-expanded', 'false');
  head.innerHTML = _sheetChevron + '<span class="mobile-sheet-section-title"></span><span class="mobile-sheet-section-value"></span>';
  head.querySelector('.mobile-sheet-section-title').textContent = title;
  const content = document.createElement('div');
  content.className = 'mobile-sheet-section-body';
  section.append(head, content);
  body.appendChild(section);

  window.buildFilterMenu(type);
  _dock(menu, content);
  head.addEventListener('click', () => {
    const open = !section.classList.contains('open');
    body.querySelectorAll('.mobile-sheet-section.open').forEach(s => _setSectionOpen(s, false));
    _setSectionOpen(section, open);
  });
  // A single choice (sort, group, density) closes its section once picked
  if (single) {
    content.addEventListener('click', (e) => {
      if (e.target.closest('.filter-checkbox-item')) setTimeout(() => _setSectionOpen(section, false), 0);
    });
  }
  return section;
}

function _setSectionOpen(section, open) {
  section.classList.toggle('open', open);
  section.querySelector('.mobile-sheet-section-head').setAttribute('aria-expanded', open ? 'true' : 'false');
}

function _refreshSectionSummaries() {
  document.querySelectorAll('#mobile-sheet-body .mobile-sheet-section').forEach(section => {
    const sum = window.filterMenuSummary(section.dataset.menu);
    const value = section.querySelector('.mobile-sheet-section-value');
    value.textContent = sum.text;
    value.classList.toggle('set', !!sum.set);
  });
}

function _sheetBackRow(body, label, onclick) {
  const b = document.createElement('button');
  b.type = 'button';
  b.className = 'mobile-sheet-back';
  b.innerHTML = _sheetBack + '<span></span>';
  b.lastChild.textContent = label;
  b.addEventListener('click', (e) => { e.stopPropagation(); onclick(); });
  body.appendChild(b);
}

// Lends one settings section to the sheet once its data is loaded. With a
// board id only that board's settings show, opened.
async function _sheetSettingsSection(body, id, boardId) {
  const render = _sheetRender;
  try { if (typeof window.prepareSettings === 'function') await window.prepareSettings(); } catch (e) { /* show what loaded */ }
  if (render !== _sheetRender) return;
  window.showSettingsSection(id, true);
  const sec = document.getElementById('settings-' + id);
  if (!sec) return;
  _dock(sec, body);
  if (!boardId) return;
  const cfg = document.getElementById('board-config-' + boardId);
  const card = cfg && cfg.closest('.settings-board-card');
  if (!card) return;
  sec.classList.add('mobile-sheet-one-board');
  card.classList.add('mobile-sheet-target');
  if (cfg.classList.contains('hidden')) window.toggleBoardConfig(cfg.id);
  _undockHooks.push(() => {
    sec.classList.remove('mobile-sheet-one-board');
    card.classList.remove('mobile-sheet-target');
  });
}

const _sheets = {
  boards(body) {
    const menu = document.createElement('div');
    menu.className = 'mobile-sheet-boards';
    body.appendChild(menu);
    window._buildPickerMenu(menu, { activeId: window.currentBoardId, closeMenu: closeMobileSheet });
    // A gear next to each board opens its settings here; the menu's own
    // Settings item opens the settings list instead of the settings page.
    const options = menu.querySelectorAll(':scope > .header-board-option');
    (window.boardList || []).forEach((board, i) => {
      const opt = options[i];
      if (!opt) return;
      const gear = document.createElement('button');
      gear.type = 'button';
      gear.className = 'mobile-sheet-board-gear';
      gear.setAttribute('aria-label', 'Board settings');
      gear.innerHTML = _sheetGear;
      gear.addEventListener('click', (e) => { e.stopPropagation(); openMobileSheet('settings', { section: 'boards', board: board.id, title: board.name }); });
      opt.appendChild(gear);
    });
    const last = options[options.length - 1];
    if (last && last.textContent.trim() === 'Settings') {
      last.onclick = (e) => { e.stopPropagation(); openMobileSheet('settings', {}); };
    }
  },
  filter(body) {
    _dock(document.getElementById('header-search-wrap'), body);
    window.filterMenusFor('filter').forEach(m => _sheetSection(body, m));
  },
  view(body) {
    _dock(document.querySelector('#filter-view-group .view-switcher'), body);
    window.filterMenusFor('view').forEach(m => _sheetSection(body, m));
  },
  account(body) {
    const menu = document.getElementById('header-user-dropdown');
    _dock(menu, body);
    if (menu) menu.classList.remove('hidden');
  },
  settings(body, opts) {
    if (opts.board) {
      _sheetBackRow(body, 'Boards', () => openMobileSheet('boards', {}));
      if (opts.title) {
        const t = document.createElement('div');
        t.className = 'mobile-sheet-title';
        t.textContent = opts.title;
        body.appendChild(t);
      }
      _sheetSettingsSection(body, opts.section, opts.board);
      return;
    }
    if (opts.section) {
      _sheetBackRow(body, 'Settings', () => openMobileSheet('settings', {}));
      _sheetSettingsSection(body, opts.section);
      return;
    }
    _sheetBackRow(body, 'Account', () => openMobileSheet('account', {}));
    // Rendering the navigation first tells which sections this user gets
    if (typeof window.prepareSettings === 'function') window.prepareSettings().catch(() => {});
    const items = document.querySelectorAll('#settings-nav .settings-nav-item');
    const groups = window.SETTINGS_GROUPS || {};
    let group = null;
    (window.SETTINGS_SECTIONS || []).forEach((sec, i) => {
      if (items[i] && items[i].style.display === 'none') return;
      if (sec.group !== group) {
        group = sec.group;
        const g = document.createElement('div');
        g.className = 'mobile-sheet-group-title';
        g.textContent = groups[group] || group;
        body.appendChild(g);
      }
      const row = document.createElement('button');
      row.type = 'button';
      row.className = 'mobile-sheet-link';
      row.innerHTML = sec.icon + '<span></span>' + _sheetNext;
      row.querySelector('span').textContent = sec.label;
      row.addEventListener('click', (e) => { e.stopPropagation(); openMobileSheet('settings', { section: sec.id }); });
      body.appendChild(row);
    });
  },
};

// The bar button that lights up for a sheet
const _sheetButton = { settings: 'account' };

// opts (from inside the sheets) moves to another view without toggling;
// from the bar, the open sheet's button closes it.
function openMobileSheet(name, opts) {
  if (!_sheets[name]) return;
  const button = name === 'settings' && opts && opts.board ? 'boards' : (_sheetButton[name] || name);
  if (!opts && _openSheet && _openButton === button) { closeMobileSheet(); return; }
  closeMobileSheet();
  const sheet = document.getElementById('mobile-sheet');
  const body = document.getElementById('mobile-sheet-body');
  if (!sheet || !body) return;
  _openSheet = name;
  _openButton = button;
  body.textContent = '';
  body.dataset.sheet = name;
  _sheets[name](body, opts || {});
  _refreshSectionSummaries();
  sheet.hidden = false;
  document.getElementById('mobile-sheet-backdrop').hidden = false;
  document.querySelectorAll('#mobile-nav .mobile-nav-btn[data-sheet]').forEach(b => {
    const on = b.dataset.sheet === button;
    b.classList.toggle('active', on);
    b.setAttribute('aria-expanded', on ? 'true' : 'false');
  });
  body.scrollTop = 0;
}

// The boards sheet follows the board picker (a new default board, a deleted board).
function refreshBoardsSheet() {
  if (_openSheet !== 'boards') return;
  const body = document.getElementById('mobile-sheet-body');
  const scroll = body.scrollTop;
  body.textContent = '';
  _sheets.boards(body);
  body.scrollTop = scroll;
}

function closeMobileSheet() {
  if (!_openSheet) return;
  _openSheet = null;
  _sheetRender++;
  _undockAll();
  const menu = document.getElementById('header-user-dropdown');
  if (menu) menu.classList.add('hidden');
  document.querySelectorAll('.filter-menu').forEach(m => m.classList.add('hidden'));
  const body = document.getElementById('mobile-sheet-body');
  if (body) { body.textContent = ''; delete body.dataset.sheet; }
  const sheet = document.getElementById('mobile-sheet');
  if (sheet) sheet.hidden = true;
  const backdrop = document.getElementById('mobile-sheet-backdrop');
  if (backdrop) backdrop.hidden = true;
  document.querySelectorAll('#mobile-nav .mobile-nav-btn[data-sheet]').forEach(b => {
    b.classList.remove('active');
    b.setAttribute('aria-expanded', 'false');
  });
}

function initMobileNav() {
  const nav = document.getElementById('mobile-nav');
  if (!nav || nav.dataset.ready) return;
  nav.dataset.ready = '1';
  nav.querySelectorAll('.mobile-nav-btn[data-sheet]').forEach(btn => {
    btn.setAttribute('aria-expanded', 'false');
    btn.addEventListener('click', () => openMobileSheet(btn.dataset.sheet));
  });
  const body = document.getElementById('mobile-sheet-body');
  // Account > Settings stays in the sheet (capture runs before the item's own onclick)
  body.addEventListener('click', (e) => {
    if (_openSheet === 'account' && e.target.closest('.header-user-item[onclick*="openSettings"]')) {
      e.stopPropagation();
      openMobileSheet('settings', {});
    }
  }, true);
  // The menus change their own state; the summaries follow. An account menu
  // item, or a card picked from the search results, also closes the sheet.
  body.addEventListener('click', (e) => {
    if (e.target.closest('.header-user-item, .search-result-item')) { closeMobileSheet(); return; }
    setTimeout(_refreshSectionSummaries, 0);
  });
  body.addEventListener('change', () => setTimeout(_refreshSectionSummaries, 0));
  document.getElementById('mobile-sheet-backdrop').addEventListener('click', closeMobileSheet);
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && _openSheet) closeMobileSheet(); });
  // New card, Settings or a wider window: the sheet gets out of the way
  const fab = document.getElementById('new-card-fab');
  if (fab) fab.addEventListener('click', closeMobileSheet);
  window.addEventListener('resize', () => { if (_openSheet && !isMobileNavShown()) closeMobileSheet(); });
  window.addEventListener('hashchange', closeMobileSheet);
}

document.addEventListener('DOMContentLoaded', initMobileNav);

window.isMobileNavShown = isMobileNavShown;
window.openMobileSheet = openMobileSheet;
window.closeMobileSheet = closeMobileSheet;
window.refreshBoardsSheet = refreshBoardsSheet;
window.initMobileNav = initMobileNav;
