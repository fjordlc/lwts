// Card detail side pane — on wide screens the detail view docks to the right of the board instead of
// covering it, so the board stays visible and clickable. Narrow screens keep the full-screen modal.
// Styles: detail.css (.detail-pane*).

const PANE_WIDTH_KEY = 'lwts-detail-pane-width';
const wideScreen = window.matchMedia('(min-width: 769px)');
const clampWidth = w => Math.max(380, Math.min(w, Math.round(window.innerWidth * 0.7)));
let paneWidth = clampWidth(Number(localStorage.getItem(PANE_WIDTH_KEY)) || 560);

function setPaneWidth(w) {
  paneWidth = clampWidth(w);
  document.documentElement.style.setProperty('--detail-pane-w', paneWidth + 'px');
}

// The pane's header lines up with the app header.
function syncHeaderHeight() {
  const h = document.querySelector('.header');
  const height = h ? h.getBoundingClientRect().height : 0;
  if (height > 0) document.documentElement.style.setProperty('--app-header-h', height + 'px');
}

// Outline the card that is open in the pane.
const openCardStyle = document.createElement('style');
document.head.appendChild(openCardStyle);
let openCardId = null;
function markOpenCard(id) {
  if (id === openCardId) return;
  openCardId = id;
  openCardStyle.textContent = id
    ? `.card[data-id="${CSS.escape(id)}"], .list-row[data-id="${CSS.escape(id)}"] { outline: 2px solid var(--card-selected) !important; outline-offset: -2px; }`
    : '';
}

const modal = document.getElementById('detail-modal');

function paneCardId() {
  return modal.classList.contains('detail-pane') && !window._isCreateMode && window.detailCard ? window.detailCard.id : null;
}

// The title grows to fit its text, measured at the width it had when the card opened. The pane is
// narrower than the modal and can be resized, so measure again whenever its width can change.
function refitTitle() {
  const title = document.getElementById('detail-title');
  if (title && typeof window.autoResizeTextarea === 'function') window.autoResizeTextarea(title);
}
const refitTitleSoon = () => requestAnimationFrame(refitTitle);

// A long description is clamped for the modal; the taller pane often fits it whole.
function unclampDescriptionIfItFits() {
  const view = document.getElementById('detail-desc-view');
  if (!view || !modal.classList.contains('detail-pane')) return;
  if (view.classList.contains('clamped') && view.scrollHeight <= view.clientHeight + 1) {
    view.classList.remove('clamped');
    const toggle = document.getElementById('detail-desc-toggle');
    if (toggle) toggle.remove();
  }
}

let exitTimer = 0;
// Switch between pane and modal as the detail view opens and closes or the window crosses the breakpoint.
function syncPane() {
  if (!wideScreen.matches) {
    // Narrow screens always use the modal, also when the window shrank while the pane was closed.
    // Only touch the classes when one is set: classList.remove rewrites the attribute even when nothing
    // changes, which would wake the MutationObserver below and call this again, forever.
    const paneClasses = ['detail-pane', 'detail-pane-enter', 'detail-pane-exit', 'detail-pane-gone'];
    clearTimeout(exitTimer);
    if (paneClasses.some(c => modal.classList.contains(c))) modal.classList.remove(...paneClasses);
    if (document.body.classList.contains('detail-pane-open')) document.body.classList.remove('detail-pane-open');
    return;
  }
  const on = modal.classList.contains('active');
  const isPane = modal.classList.contains('detail-pane');
  const exiting = modal.classList.contains('detail-pane-exit');
  const gone = modal.classList.contains('detail-pane-gone');
  if (on) {
    clearTimeout(exitTimer);
    if (isPane && !exiting && !gone) return;
    modal.classList.remove('detail-pane-exit', 'detail-pane-gone');
    modal.classList.add('detail-pane', 'detail-pane-enter');
    document.body.classList.add('detail-pane-open');
    setTimeout(() => modal.classList.remove('detail-pane-enter'), 300);
  } else if (isPane && !exiting && !gone) {
    document.body.classList.remove('detail-pane-open');
    modal.classList.add('detail-pane-exit');
    exitTimer = setTimeout(() => {
      modal.classList.remove('detail-pane-exit');
      modal.classList.add('detail-pane-gone');
    }, 200);
  }
}

function initSidePane() {
  if (!modal) return;
  setPaneWidth(paneWidth);
  syncHeaderHeight();

  // Drag the left edge to resize; the width is remembered.
  const handle = document.createElement('div');
  handle.className = 'detail-pane-handle';
  modal.querySelector('.lwts-modal').appendChild(handle);
  handle.addEventListener('pointerdown', e => {
    e.preventDefault();
    handle.setPointerCapture(e.pointerId);
    handle.classList.add('dragging');
    const board = document.getElementById('app-board');
    if (board) board.style.transition = 'none';
    const move = ev => { setPaneWidth(window.innerWidth - ev.clientX); refitTitle(); };
    const up = () => {
      handle.classList.remove('dragging');
      handle.removeEventListener('pointermove', move);
      handle.removeEventListener('pointerup', up);
      if (board) board.style.transition = '';
      try { localStorage.setItem(PANE_WIDTH_KEY, String(paneWidth)); } catch (e) { /* storage unavailable */ }
    };
    handle.addEventListener('pointermove', move);
    handle.addEventListener('pointerup', up);
  });

  new MutationObserver(() => { syncPane(); markOpenCard(paneCardId()); refitTitleSoon(); })
    .observe(modal, { attributes: true, attributeFilter: ['class'] });
  wideScreen.addEventListener('change', syncPane);
  window.addEventListener('resize', () => { setPaneWidth(paneWidth); syncHeaderHeight(); refitTitleSoon(); setTimeout(unclampDescriptionIfItFits, 120); });

  // Clicking the card that is open in the pane closes the pane.
  document.addEventListener('click', e => {
    const el = e.target.closest && e.target.closest('.card[data-id], .list-row[data-id]');
    if (el && el.dataset.id === paneCardId() && !modal.classList.contains('detail-pane-exit') && !e.target.closest('a, button, select, input')) {
      e.stopPropagation();
      e.preventDefault();
      window.closeDetail();
    }
  }, true);

  // Opening another card while the pane shows one: save the current card first, as closing it would.
  const openDetailBeforePane = window.openDetail;
  if (typeof openDetailBeforePane === 'function') {
    window.openDetail = function (cardId, fromHash) {
      if (paneCardId() && paneCardId() !== cardId) {
        window.saveDetailFields();
        window.render();
      }
      syncHeaderHeight();
      const result = openDetailBeforePane.call(this, cardId, fromHash);
      markOpenCard(paneCardId());
      refitTitleSoon();
      setTimeout(unclampDescriptionIfItFits, 120);
      return result;
    };
  }
}

initSidePane();
