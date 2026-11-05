// fn2 Dropdown — custom styled dropdown with search

class FnDropdown {
  constructor(el, options = {}) {
    this.el = el;
    this.options = options.options || [];
    this.value = options.value || '';
    this.onChange = options.onChange || null;
    this.compact = options.compact || false;
    // floatOnMobile: on phones, lift the open menu out of the page into <body>
    // (for dropdowns inside containers that clip or scroll, like the card sidebar)
    this.floatOnMobile = options.floatOnMobile || false;
    this.isOpen = false;
    this._onDocClick = this._onDocClick.bind(this);
    this._onKeyDown = this._onKeyDown.bind(this);
    this.render();
  }

  render() {
    // A floating menu lives in <body>; drop it before building a new one
    if (this.menu && this.menu.parentNode && this.menu.parentNode !== this.el) this.menu.remove();
    this.el.classList.add('fn-dropdown');
    if (this.compact) this.el.classList.add('compact');
    this.el.innerHTML = '';

    const trigger = document.createElement('button');
    trigger.type = 'button';
    trigger.className = 'fn-dropdown-trigger';
    const selected = this.options.find(o => o.value === this.value);
    trigger.innerHTML = `
      <span>${this._renderLabel(selected)}</span>
      <svg class="fn-dropdown-chevron" viewBox="0 0 24 24"><polyline points="6 9 12 15 18 9"/></svg>
    `;
    trigger.addEventListener('click', (e) => { e.stopPropagation(); this.toggle(); });
    this.trigger = trigger;
    this.el.appendChild(trigger);

    const menu = document.createElement('div');
    menu.className = 'fn-dropdown-menu';

    const search = document.createElement('div');
    search.className = 'fn-dropdown-search';
    const searchInput = document.createElement('input');
    searchInput.type = 'text';
    searchInput.className = 'fn-dropdown-search-input';
    searchInput.placeholder = 'Search...';
    FnDropdown._hideFromPasswordManagers(searchInput);
    searchInput.addEventListener('input', () => this._filter(searchInput.value));
    searchInput.addEventListener('click', (e) => e.stopPropagation());
    search.appendChild(searchInput);
    this.searchInput = searchInput;
    menu.appendChild(search);

    const list = document.createElement('div');
    list.className = 'fn-dropdown-list';
    this.optionEls = [];
    this.options.forEach(opt => {
      const item = document.createElement('div');
      item.className = 'fn-dropdown-option' + (opt.value === this.value ? ' selected' : '');
      item.dataset.value = opt.value;
      item.innerHTML = `
        <span class="fn-dropdown-option-label">
          ${opt.dot ? `<span class="fn-dropdown-dot" style="background:${opt.dot}"></span>` : ''}
          ${this._esc(opt.label)}
        </span>
        <svg class="fn-dropdown-check" viewBox="0 0 24 24"><polyline points="20 6 9 17 4 12"/></svg>
      `;
      item.addEventListener('click', (e) => { e.stopPropagation(); this.setValue(opt.value); this.close(); });
      list.appendChild(item);
      this.optionEls.push({ el: item, opt });
    });
    menu.appendChild(list);

    this.menu = menu;
    this.el.appendChild(menu);
  }

  _renderLabel(opt) {
    if (!opt) return '';
    if (opt.dot) return `<span class="fn-dropdown-dot" style="background:${opt.dot}"></span> ${this._esc(opt.label)}`;
    return this._esc(opt.label);
  }

  _filter(query) {
    const q = query.toLowerCase().trim();
    this.optionEls.forEach(({ el, opt }) => { el.style.display = (!q || opt.label.toLowerCase().includes(q)) ? '' : 'none'; });
  }

  toggle() { this.isOpen ? this.close() : this.open(); }

  open() {
    this.isOpen = true;
    this.trigger.classList.add('open');
    this.menu.classList.add('visible');
    this.searchInput.value = '';
    this._filter('');
    if (this.floatOnMobile && window.innerWidth <= 768) {
      // No automatic focus here: on a phone it scrolls the page to the search
      // box (iOS jumps the card detail to the top). Tapping the box focuses it.
      this._float();
    } else {
      this._autoFlip();
      setTimeout(() => this.searchInput.focus(), 30);
    }
    document.addEventListener('click', this._onDocClick, true);
    document.addEventListener('keydown', this._onKeyDown, true);
  }

  _autoFlip() {
    const triggerRect = this.trigger.getBoundingClientRect();
    const menuHeight = this.menu.scrollHeight || 260;
    const spaceBelow = window.innerHeight - triggerRect.bottom;
    const spaceAbove = triggerRect.top;
    if (spaceBelow < menuHeight + 8 && spaceAbove > spaceBelow) this.el.classList.add('drop-up');
    else this.el.classList.remove('drop-up');
  }

  // Show the menu above everything, fixed to the viewport next to the field it
  // belongs to, opening upwards when there is more room there, and kept inside
  // the screen. Inside a clipping container it was cut off or painted beneath
  // the panes before it.
  _float() {
    let anchor = this.el;
    while (anchor.parentElement && anchor.getBoundingClientRect().height === 0) anchor = anchor.parentElement;
    const rect = anchor.getBoundingClientRect();
    document.body.appendChild(this.menu);
    this.menu.classList.add('fn-dropdown-floating');
    const gap = 16;
    const width = this.menu.getBoundingClientRect().width;
    const left = Math.max(gap, Math.min(rect.left - 8, window.innerWidth - gap - width));
    const height = this.menu.offsetHeight || 260;
    const below = window.innerHeight - rect.bottom;
    const up = below < height + 8 && rect.top > below;
    Object.assign(this.menu.style, {
      left: left + 'px',
      top: up ? 'auto' : (rect.bottom + 4) + 'px',
      bottom: up ? (window.innerHeight - rect.top + 4) + 'px' : 'auto',
    });
  }

  _unfloat() {
    if (!this.menu.classList.contains('fn-dropdown-floating')) return;
    this.menu.classList.remove('fn-dropdown-floating');
    ['left', 'top', 'bottom'].forEach(p => this.menu.style.removeProperty(p));
    this.el.appendChild(this.menu);
  }

  close() {
    this._unfloat();
    this.isOpen = false;
    this.trigger.classList.remove('open');
    this.menu.classList.remove('visible');
    document.removeEventListener('click', this._onDocClick, true);
    document.removeEventListener('keydown', this._onKeyDown, true);
  }

  _onDocClick(e) { if (!this.el.contains(e.target) && !this.menu.contains(e.target)) this.close(); }
  _onKeyDown(e) { if (e.key === 'Escape') { this.close(); e.stopPropagation(); } }

  setValue(val, silent) {
    this.value = val;
    const selected = this.options.find(o => o.value === val);
    const label = this.trigger.querySelector('span');
    label.innerHTML = this._renderLabel(selected);
    this.optionEls.forEach(({ el, opt }) => { el.classList.toggle('selected', opt.value === val); });
    if (!silent && this.onChange) this.onChange(val);
  }

  getValue() { return this.value; }

  // The search box filters options; it is not a credential field. Password managers (iCloud Keychain etc.)
  // otherwise offer to fill it, so mark it as a plain combobox and keep it read-only until the user engages.
  static _hideFromPasswordManagers(input) {
    input.setAttribute('role', 'combobox');
    input.setAttribute('aria-autocomplete', 'list');
    input.setAttribute('aria-label', 'Filter options');
    input.setAttribute('autocomplete', 'off');
    input.setAttribute('autocorrect', 'off');
    input.setAttribute('autocapitalize', 'off');
    input.setAttribute('spellcheck', 'false');
    input.setAttribute('name', 'fn-opt-' + Math.random().toString(36).slice(2, 8));
    input.setAttribute('enterkeyhint', 'done');
    ['data-lpignore', 'data-1p-ignore', 'data-bwignore'].forEach(a => input.setAttribute(a, 'true'));
    input.setAttribute('data-form-type', 'other');
    input.readOnly = true;
    const unlock = () => { input.readOnly = false; };
    ['pointerdown', 'touchstart', 'keydown'].forEach(ev => input.addEventListener(ev, unlock, true));
    input.addEventListener('blur', () => { input.readOnly = true; });
  }

  setOptions(newOptions) { this.options = newOptions; this.render(); }

  _esc(s) { const d = document.createElement('div'); d.textContent = s; return d.innerHTML; }
}

window.FnDropdown = FnDropdown;
