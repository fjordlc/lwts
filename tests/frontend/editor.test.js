// Markdown editor (web/src/editor.js + web/styles/editor.css): the text box grows with its content.
// Run with: node --test tests/frontend/editor.test.js

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { JSDOM } = require('jsdom');

const ROOT = path.join(__dirname, '..', '..');
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf-8');

function load({ resizeObserver = false } = {}) {
  const dom = new JSDOM(`<!doctype html><html><head><style>${read('web/styles/editor.css')}</style></head>
    <body><div id="ed"></div></body></html>`, { url: 'https://board.test/', runScripts: 'outside-only' });
  const w = dom.window;
  const observers = [];
  if (resizeObserver) {
    w.ResizeObserver = class {
      constructor(cb) { this.cb = cb; this.targets = []; observers.push(this); }
      observe(t) { this.targets.push(t); }
      disconnect() {}
      fire(width) { this.cb([{ target: this.targets[0], contentRect: { width } }]); }
    };
  }
  w.eval(`(function () {\n${read('web/src/editor.js')}\n})();`);
  const editor = new w.FnEditor(w.document.getElementById('ed'), {});
  // jsdom does no layout: let each test say how tall the text is.
  let contentHeight = 0;
  Object.defineProperty(editor.body, 'scrollHeight', { configurable: true, get: () => contentHeight });
  return { w, editor, observers, setContentHeight: (h) => { contentHeight = h; } };
}

describe('markdown editor', () => {
  it('lets the text box take its own height instead of a zero flex basis', () => {
    const { w, editor } = load();
    const cs = w.getComputedStyle(editor.body);
    assert.equal(cs.flexGrow, '0', 'a flex-grow:1 box with a zero basis ignores the height set by autoresize');
    assert.equal(cs.flexBasis, 'auto');
    assert.equal(cs.overflowY, 'hidden', 'the box is as tall as its text, so it needs no scrollbar');
  });

  it('sizes the box to its text when content is set or typed', () => {
    const { w, editor, setContentHeight } = load();
    setContentHeight(480);
    editor.setMarkdown('many\nlines');
    assert.equal(editor.body.style.height, '480px');
    setContentHeight(520);
    editor.body.dispatchEvent(new w.Event('input'));
    assert.equal(editor.body.style.height, '520px');
  });

  it('shrinks back when cleared', () => {
    const { editor, setContentHeight } = load();
    setContentHeight(480);
    editor.setMarkdown('many\nlines');
    setContentHeight(60);
    editor.clear();
    assert.equal(editor.body.style.height, '60px');
  });

  it('does not collapse a hidden editor to zero height', () => {
    const { editor, setContentHeight } = load();
    setContentHeight(0);
    editor.setMarkdown('text set while hidden');
    assert.equal(editor.body.style.height, '');
  });

  it('measures again when the box gets a different width', () => {
    const { editor, observers, setContentHeight } = load({ resizeObserver: true });
    assert.equal(observers.length, 1);
    assert.equal(observers[0].targets[0], editor.body);
    setContentHeight(300);
    observers[0].fire(600);
    assert.equal(editor.body.style.height, '300px');
    setContentHeight(450);
    observers[0].fire(600); // same width: its own height change, nothing to do
    assert.equal(editor.body.style.height, '300px');
    observers[0].fire(320);
    assert.equal(editor.body.style.height, '450px');
  });
});
