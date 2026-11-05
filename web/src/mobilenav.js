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

const MOBILE_NAV_MAX_WIDTH = 768;
const _sheetChevron = '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="6 9 12 15 18 9"/></svg>';

let _openSheet = null;
let _docked = []; // { node, marker } for nodes lent to the open sheet

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

const _sheets = {
  boards(body) {
    const menu = document.createElement('div');
    menu.className = 'mobile-sheet-boards';
    body.appendChild(menu);
    window._buildPickerMenu(menu, { activeId: window.currentBoardId, closeMenu: closeMobileSheet });
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
};

function openMobileSheet(name) {
  if (!_sheets[name]) return;
  if (_openSheet === name) { closeMobileSheet(); return; }
  closeMobileSheet();
  const sheet = document.getElementById('mobile-sheet');
  const body = document.getElementById('mobile-sheet-body');
  if (!sheet || !body) return;
  _openSheet = name;
  body.textContent = '';
  body.dataset.sheet = name;
  _sheets[name](body);
  _refreshSectionSummaries();
  sheet.hidden = false;
  document.getElementById('mobile-sheet-backdrop').hidden = false;
  document.querySelectorAll('#mobile-nav .mobile-nav-btn[data-sheet]').forEach(b => {
    const on = b.dataset.sheet === name;
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
