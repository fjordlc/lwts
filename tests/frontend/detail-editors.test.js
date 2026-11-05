// Description and comment editors in the card detail (web/styles/detail.css).
// Run with: node --test tests/frontend/detail-editors.test.js

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { JSDOM } = require('jsdom');

const ROOT = path.join(__dirname, '..', '..');
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf-8');

function load() {
  const html = read('web/index.html').replace(/<script\b[\s\S]*?<\/script>/gi, '').replace(/<link\b[^>]*>/gi, '');
  const dom = new JSDOM(html, { url: 'https://board.test/', runScripts: 'outside-only' });
  const w = dom.window;
  const style = w.document.createElement('style');
  style.textContent = read('web/styles/editor.css') + '\n' + read('web/styles/detail.css');
  w.document.head.appendChild(style);
  w.eval(`(function () {\n${read('web/src/editor.js')}\n})();`);
  new w.FnEditor(w.document.getElementById('detail-description'), {});
  new w.FnEditor(w.document.getElementById('comment-editor-container'), { compact: true });
  return w;
}

describe('detail editors', () => {
  it('puts the Save and Cancel buttons on the right', () => {
    const w = load();
    for (const sel of ['.detail-desc-edit-actions', '.comment-expanded-actions']) {
      assert.equal(w.getComputedStyle(w.document.querySelector(sel)).justifyContent, 'flex-end', sel);
    }
  });

  it("lets each editor reach into the padding by its own text inset, so the text keeps the column's edge", () => {
    const w = load();
    const cases = [
      ['#detail-desc-edit', '.detail-desc-edit-actions', '15px', '14px'], // body padding 14px + 1px border
      ['#comment-expanded', '.comment-expanded-actions', '13px', '12px'], // compact: 12px + 1px border
    ];
    for (const [zoneSel, actionsSel, bleed, padding] of cases) {
      const zone = w.document.querySelector(zoneSel);
      const editor = zone.querySelector('.lwts-editor');
      assert.equal(w.getComputedStyle(zone).getPropertyValue('--editor-bleed').trim(), bleed, zoneSel);
      assert.equal(w.getComputedStyle(editor.querySelector('.lwts-editor-body')).paddingLeft, padding, zoneSel);
      const cs = w.getComputedStyle(editor);
      assert.equal(cs.marginLeft, 'calc(-1 * var(--editor-bleed))', zoneSel);
      assert.equal(cs.marginRight, 'calc(-1 * var(--editor-bleed))', zoneSel);
      assert.equal(w.getComputedStyle(zone.querySelector(actionsSel)).marginRight, 'calc(-1 * var(--editor-bleed))', zoneSel);
    }
    const comment = w.document.querySelector('#comment-expanded .lwts-editor');
    assert.equal(w.getComputedStyle(comment).width, 'auto', 'a 100% width would not grow into the padding');
  });
});
