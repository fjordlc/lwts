// The card detail shows the card's Type in its header (web/index.html, web/styles/detail.css).
// Run with: node --test tests/frontend/card-header-type.test.js

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { JSDOM } = require('jsdom');

const ROOT = path.join(__dirname, '..', '..');
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf-8');
const doc = new JSDOM(read('web/index.html')).window.document;

describe('Type in the card header', () => {
  it('puts the Type control in the detail header', () => {
    const text = doc.getElementById('detail-tag-text');
    assert.ok(text.closest('#detail-modal .lwts-modal-header'), 'Type text is in the header');
    assert.ok(doc.getElementById('detail-tag').closest('.lwts-modal-header'), 'Type dropdown is in the header');
    assert.equal(text.getAttribute('onclick'), "toggleSidebarField('tag')");
  });

  it('no longer has a Type row in the sidebar', () => {
    const labels = Array.from(doc.querySelectorAll('#detail-modal .detail-field-label')).map((l) => l.textContent.trim());
    assert.ok(!labels.includes('Type'), JSON.stringify(labels));
  });

});
