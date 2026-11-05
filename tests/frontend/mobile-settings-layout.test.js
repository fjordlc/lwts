// Settings on phones: the icon rail and scrolling page, switches beside their label, the team list's role pills and
// "Add member" / "Create bot" rows (settings.js, settings.css, responsive.css).
// Run with: node --test tests/frontend/mobile-settings-layout.test.js

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { JSDOM } = require('jsdom');

const ROOT = path.join(__dirname, '..', '..');
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf-8');
const indexHtml = read('web/index.html').replace(/<script\b[\s\S]*?<\/script>/gi, '');

const USERS = [
  { id: 'u-boss', name: 'Boss', email: 'boss@test.dev', role: 'owner' },
  { id: 'u-ann', name: 'Ann', email: 'ann@test.dev', role: 'member' },
  { id: 'u-vic', name: 'Vic', email: 'vic@test.dev', role: 'viewer' },
  { id: 'u-bot', name: 'Robo', email: 'robo@bots.local', role: 'member' },
];
const BOARDS = [{ id: 'b-1', name: 'One', project_key: 'ONE', owner_id: 'u-boss', columns: '', settings: '{}' }];

async function load({ me = 'u-boss' } = {}) {
  const dom = new JSDOM(indexHtml, { url: 'https://board.test/?board=b-1', pretendToBeVisual: true, runScripts: 'outside-only' });
  const w = dom.window;
  const loaded = new Promise((r) => w.document.addEventListener('DOMContentLoaded', () => setTimeout(r, 0), { once: true }));
  w.matchMedia = () => ({ matches: false, addEventListener() {}, removeEventListener() {} });
  const user = USERS.find((u) => u.id === me);
  const copy = (x) => JSON.parse(JSON.stringify(x));
  w.API = {
    listBoards: () => Promise.resolve(copy(BOARDS)),
    listCards: () => Promise.resolve({}),
    getBoard: (id) => Promise.resolve({ id, card_counts: {} }),
    getPreferences: () => Promise.resolve({}),
    putPreferences: () => Promise.resolve({}),
    listUsers: () => Promise.resolve(copy(USERS)),
    getMe: () => Promise.resolve(copy(user)),
    listBoardMembers: () => Promise.resolve([]),
    searchCards: () => Promise.resolve([]),
    putSettings: () => Promise.resolve({}),
  };
  w.Toast = { success() {}, error() {}, info() {} };
  w.HTMLCanvasElement.prototype.getContext = () => new Proxy({}, { get: () => () => {}, set: () => true });
  w.HTMLCanvasElement.prototype.toDataURL = () => 'data:image/png;base64,';
  w.FnEditor = function () { return { getMarkdown: () => '', setMarkdown() {}, destroy() {}, focus() {} }; };
  w._settingsCache = {};
  w.HTMLElement.prototype.scrollIntoView = function () {};
  w.CSS = { escape: (s) => String(s) };
  w.parseBoardSettings = (raw) => JSON.parse(raw || '{}');
  w.Auth = { getUser: () => ({ id: user.id, role: user.role }), redirectToLogin() {} };
  for (const f of ['dropdown.js', 'kanban.js', 'settings.js', 'listview.js', 'features.js', 'sidepane.js']) {
    w.eval(`(function () {\n${read('web/src/' + f)}\n})();`);
  }
  await loaded;
  w.currentUser = copy(user);
  return w;
}

const tick = (w, n = 5) => new Promise((r) => w.setTimeout(r, n));

describe('Settings > Team on phones', () => {
  it('puts each role in a pill inside the name and keeps the badge on the right', async () => {
    const w = await load();
    await w.loadTeamMembers();
    const rows = [...w.document.querySelectorAll('#settings-team-list .settings-user')];
    assert.equal(rows.length, 4);
    const pills = rows.map((r) => r.querySelector('.settings-user-name > .settings-user-role-pill'));
    assert.deepEqual(pills.map((p) => p && p.textContent), ['Owner', 'Member', 'Viewer', 'Member']);
    assert.ok(pills[0].classList.contains('settings-user-role-badge') && pills[0].classList.contains('owner'));
    rows.forEach((r) => assert.ok(r.querySelector('.settings-user-actions > .settings-user-role-badge'), 'right-hand badge stays for wide screens'));
  });

  it('gives admins an "Add member" row under the members and a "Create bot" row under the bots', async () => {
    const w = await load();
    const opened = [];
    w.openCreateUserModal = () => opened.push('user');
    w.openCreateBotModal = () => opened.push('bot');
    await w.loadTeamMembers();
    const list = w.document.getElementById('settings-team-list');
    const kids = [...list.children];
    const add = kids.filter((k) => k.classList.contains('settings-add-row'));
    assert.deepEqual(add.map((a) => a.textContent.trim()), ['Add member', 'Create bot']);
    assert.equal(add[0].tagName, 'BUTTON');
    const botsHeader = kids.find((k) => k.classList.contains('settings-group-title'));
    assert.equal(kids.indexOf(add[0]), kids.indexOf(botsHeader) - 1, 'Add member sits right above the Bots title');
    assert.equal(kids.indexOf(add[1]), kids.length - 1, 'Create bot is the last row');
    add[0].click();
    add[1].click();
    assert.deepEqual(opened, ['user', 'bot']);
  });

  it('shows no add rows to members', async () => {
    const w = await load({ me: 'u-ann' });
    await w.loadTeamMembers();
    assert.equal(w.document.querySelectorAll('#settings-team-list .settings-add-row').length, 0);
    assert.equal(w.document.querySelectorAll('#settings-team-list .settings-user-role-pill').length, 4);
  });
});

describe('Settings > Boards triggers', () => {
  it('lays out the trigger controls with a class instead of inline styles', async () => {
    const w = await load();
    await w.loadBoardsSettings();
    await tick(w);
    const controls = [...w.document.querySelectorAll('.settings-row-control.board-trigger-control')];
    assert.equal(controls.length, 4);
    controls.forEach((c) => {
      assert.equal(c.getAttribute('style'), null);
      assert.equal(c.querySelector('.board-trigger-webhook').getAttribute('style'), null);
      assert.equal(c.querySelector('.board-trigger-test').getAttribute('style'), null);
    });
  });
});

describe('Settings stylesheets', () => {
  const settingsCss = read('web/styles/settings.css');
  const responsive = read('web/styles/responsive.css');
  const phoneBlock = (() => {
    const at = responsive.indexOf('Settings on phones');
    assert.ok(at > 0, 'responsive.css has the phone settings block');
    return responsive.slice(at);
  })();

  it('keeps the phone-only pieces hidden on wide screens', () => {
    assert.match(settingsCss, /\.settings-user-role-pill,\s*\.settings-add-row\s*\{\s*display:\s*none;\s*\}/);
    assert.match(settingsCss, /\.settings-row-control\.board-trigger-control\s*\{[^}]*display:\s*flex[^}]*justify-content:\s*flex-end/);
  });

  it('turns the settings nav into a 52px icon rail beside a scrolling page on phones', () => {
    assert.match(phoneBlock, /^[^{]*@media \(max-width: 768px\)/m);
    assert.match(phoneBlock, /\.settings-page\s*\{[^}]*flex-direction:\s*row/);
    assert.match(phoneBlock, /\.settings-nav\s*\{[^}]*display:\s*flex;[^}]*flex-direction:\s*column;[^}]*width:\s*52px/);
    assert.match(phoneBlock, /\.settings-content\s*\{[^}]*min-height:\s*0/);
  });

  it('stacks controls under their label except a lone switch', () => {
    assert.match(phoneBlock, /\.settings-row:not\(:has\(> \.settings-row-control > \.settings-toggle:only-child\)\)\s*\{[^}]*flex-direction:\s*column/);
  });

  it('swaps the team buttons for the rows and the badge for the pill on phones', () => {
    assert.match(phoneBlock, /#team-action-buttons,\s*#settings-team-list \.settings-group-title \.settings-action-btn\s*\{\s*display:\s*none;/);
    assert.match(phoneBlock, /\.settings-add-row\s*\{[^}]*display:\s*flex/);
    assert.match(phoneBlock, /\.settings-user > \.settings-user-actions\s*\{\s*display:\s*none;/);
  });

  it('switches stay beside their label in the phone layout (jsdom :has check)', async () => {
    const w = await load();
    const rows = [...w.document.querySelectorAll('.settings-row')];
    const sel = '.settings-row:not(:has(> .settings-row-control > .settings-toggle:only-child))';
    const presence = w.document.getElementById('settings-show-presence').closest('.settings-row');
    assert.equal(presence.matches(sel), false, 'a row with only a switch stays inline');
    const name = rows.find((r) => r.querySelector('.settings-row-control > .settings-input'));
    assert.equal(name.matches(sel), true, 'a row with an input stacks');
  });
});
