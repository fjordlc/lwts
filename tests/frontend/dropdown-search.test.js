// The dropdown search box in web/src/dropdown.js is a filter, not a credential field.
// Run with: node --test tests/frontend/dropdown-search.test.js

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { JSDOM } = require('jsdom');

const ROOT = path.join(__dirname, '..', '..');
const dropdownSrc = fs.readFileSync(path.join(ROOT, 'web', 'src', 'dropdown.js'), 'utf-8');

function make() {
  const dom = new JSDOM('<!DOCTYPE html><html><body><div id="host"></div></body></html>', {
    url: 'https://board.test/', pretendToBeVisual: true, runScripts: 'outside-only',
  });
  const w = dom.window;
  w.eval(`(function () {\n${dropdownSrc}\n})();`);
  const dd = new w.FnDropdown(w.document.getElementById('host'), {
    value: 'a', options: [{ value: 'a', label: 'Alice' }, { value: 'b', label: 'Bob' }],
  });
  return { w, dd, input: w.document.querySelector('.fn-dropdown-search-input') };
}

describe('dropdown search box', () => {
  it('is marked as a plain filter, not a field to autofill', () => {
    const { input } = make();
    assert.equal(input.getAttribute('autocomplete'), 'off');
    assert.equal(input.getAttribute('role'), 'combobox');
    assert.equal(input.getAttribute('aria-label'), 'Filter options');
    for (const a of ['data-lpignore', 'data-1p-ignore', 'data-bwignore']) assert.equal(input.getAttribute(a), 'true', a);
  });

  it('stays read-only until the user touches it or presses a key', () => {
    const { w, input } = make();
    assert.equal(input.readOnly, true);
    input.dispatchEvent(new w.KeyboardEvent('keydown', { key: 'b' }));
    assert.equal(input.readOnly, false);
    input.dispatchEvent(new w.Event('blur'));
    assert.equal(input.readOnly, true);
    input.dispatchEvent(new w.Event('pointerdown'));
    assert.equal(input.readOnly, false);
  });

  it('still filters the options', () => {
    const { w, input } = make();
    input.dispatchEvent(new w.KeyboardEvent('keydown', { key: 'b' }));
    input.value = 'bo';
    input.dispatchEvent(new w.Event('input'));
    const visible = Array.from(w.document.querySelectorAll('.fn-dropdown-option'))
      .filter((o) => o.style.display !== 'none').map((o) => o.textContent.trim());
    assert.deepEqual(visible, ['Bob']);
  });
});
