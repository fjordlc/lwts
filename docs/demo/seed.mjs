// Seed a tongue-in-cheek demo board: the park's kanban board on the day the experts visit.
// Usage: node docs/demo/seed.mjs <base url> <password>   (start.sh creates the users first and runs this)
const [base, password] = process.argv.slice(2);
const DOMAIN = 'isla-nublar.test';

async function login(handle) {
  const r = await fetch(base + '/api/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: `${handle}@${DOMAIN}`, password }) });
  if (!r.ok) throw new Error(`login ${handle}: ${r.status} ${await r.text()}`);
  const { access_token } = await r.json();
  const call = async (method, path, body) => {
    const res = await fetch(base + path, { method, headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + access_token },
      body: body === undefined ? undefined : JSON.stringify(body) });
    if (!res.ok) throw new Error(`${method} ${path}: ${res.status} ${await res.text()}`);
    return res.status === 204 ? null : res.json();
  };
  await call('POST', '/api/auth/welcomed'); // no welcome dialog in the screenshots
  return call;
}

// Without a due date the card shows its creation date (today), so give every card one that fits its status.
const DEFAULT_DUE = { 'done': -4, 'wont-do': -8, 'backlog': 12, 'todo': 2, 'in-progress': 1 };
const day = (offset) => { const d = new Date(); d.setDate(d.getDate() + offset); return d.toISOString().slice(0, 10); };

const STAFF = ['hammond', 'arnold', 'nedry', 'muldoon', 'wu', 'gennaro', 'sattler', 'grant', 'malcolm'];
const as = {};
for (const h of STAFF) as[h] = await login(h);
const hammond = as.hammond;

const users = await hammond('GET', '/api/v1/users');
const userList = Array.isArray(users) ? users : (users.users || []);
const id = (handle) => {
  const u = userList.find((x) => (x.email || '').startsWith(handle + '@'));
  if (!u) throw new Error('no user ' + handle);
  return u.id;
};

// Board, with an "Area" field for where on the island the work happens
const board = await hammond('POST', '/api/v1/boards', { name: 'Jurassic Park', project_key: 'JP' });
const AREAS = [
  { id: 'control', label: 'Control Room', color: '#579DFF' },
  { id: 'paddocks', label: 'Paddocks', color: '#4ade80' },
  { id: 'visitor', label: 'Visitor Center', color: '#f5cd47' },
  { id: 'lab', label: 'Genetics Lab', color: '#9f8fef' },
  { id: 'dock', label: 'East Dock', color: '#6cc3e0' },
];
await hammond('PUT', '/api/v1/boards/' + board.id, {
  settings: JSON.stringify({ custom_fields: [{ id: 'area', name: 'Area', type: 'choice', options: AREAS }] }),
});

const card = (c) => hammond('POST', `/api/v1/boards/${board.id}/cards`, {
  title: c.title, description: c.desc || '', tag: c.tag || 'blue', priority: c.prio || 'medium',
  column_id: c.col, assignee_id: c.who ? id(c.who) : null, reporter_id: id(c.by || 'hammond'),
  points: c.pts || null, due_date: day(c.due !== undefined ? c.due : DEFAULT_DUE[c.col] + (c.title.length % 3)), epic_id: c.epic || null,
  custom_fields: c.area ? { area: c.area } : {},
});
const comment = (who, cardId, body) => as[who]('POST', `/api/v1/cards/${cardId}/comments`, { body });

// Epics are the swimlanes
const epic = async (title, desc, who, col = 'in-progress') => (await card({ title, desc, who, col, tag: 'epic', prio: 'high' })).id;
const E = {
  animals: await epic('Animal containment', 'Keep the animals in the paddocks and the guests in the cars.', 'muldoon'),
  visit: await epic('Endorsement weekend', 'The investors want the experts to sign off before we open. Show them everything. Nothing can go wrong.', 'hammond'),
  systems: await epic('Park systems', 'Everything on the island runs from the control room.', 'arnold'),
  lab: await epic('Genetics lab', 'Where the magic happens.', 'wu'),
  guests: await epic('Visitor experience', 'Opening day is close. Spare no expense.', 'hammond'),
};

const cards = [
  // Endorsement weekend
  { epic: E.visit, col: 'done', who: 'hammond', title: 'Fly the experts in from the Montana dig', tag: 'blue', pts: 3, area: 'visitor',
    desc: 'Dr. Grant and Dr. Sattler said yes once we offered to fund their dig for three more years. Helicopter lands on the east pad.' },
  { epic: E.visit, col: 'in-progress', who: 'gennaro', by: 'gennaro', title: "Get the investors' lawyer to sign off on the park", prio: 'high', pts: 5, due: 0, area: 'visitor',
    desc: 'After the incident at the raptor pen the investors want independent experts. Apparently that includes a mathematician.' },
  { epic: E.visit, col: 'todo', who: 'hammond', title: "Prepare answers for Dr. Malcolm's chaos theory questions", prio: 'medium', pts: 2, due: 0, area: 'visitor',
    desc: 'He keeps letting drops of water roll off the back of people\'s hands. Ask him to stop.',
    comments: [['malcolm', 'Happy to walk everyone through it. Short version: it will not go according to plan.']] },
  { epic: E.visit, col: 'done', who: 'hammond', title: 'Tour car for the grandkids, Tim and Lex', tag: 'blue', pts: 1, area: 'visitor' },
  { epic: E.visit, col: 'done', who: 'hammond', title: 'Lunch for the guests in the visitor center', tag: 'green', pts: 2, area: 'visitor',
    comments: [['hammond', 'Spared no expense.'], ['sattler', 'The lunch was lovely. The ethics discussion less so.']] },

  // Park systems
  { epic: E.systems, col: 'todo', who: 'arnold', by: 'arnold', title: "Find out what 'whte_rbt.obj' is doing in the system", tag: 'red', prio: 'lowest', pts: 1, area: 'control',
    desc: 'It shows up in the logs now and then. Dennis says it is nothing.',
    comments: [['nedry', "It's nothing. Don't touch it."]] },
  { epic: E.systems, col: 'backlog', who: 'nedry', by: 'arnold', title: 'Document the park software (all two million lines)', tag: 'orange', prio: 'lowest', pts: 13, area: 'control' },
  { epic: E.systems, col: 'wont-do', who: 'hammond', by: 'nedry', title: "Renegotiate Dennis Nedry's contract", tag: 'blue', prio: 'low', area: 'control',
    comments: [['hammond', 'No.']] },
  { epic: E.systems, col: 'in-progress', who: 'arnold', title: 'Electric fences: show clearly which ones are on', tag: 'orange', prio: 'high', pts: 5, due: 1, area: 'paddocks' },
  { epic: E.systems, col: 'todo', who: 'arnold', title: 'Full system restart: write the steps down first', tag: 'orange', prio: 'high', pts: 3, due: 2, area: 'control',
    desc: 'Nobody has ever shut the whole park down. Should be fine.' },
  { epic: E.systems, col: 'todo', who: 'nedry', by: 'arnold', title: 'Tour cars: doors must stay locked during the tour', tag: 'red', prio: 'medium', pts: 2, area: 'visitor' },
  { epic: E.systems, col: 'in-progress', who: 'nedry', by: 'nedry', title: 'Hand over before leaving on the 7 o\'clock boat', tag: 'blue', prio: 'medium', pts: 1, due: 0, area: 'dock',
    comments: [['arnold', 'Make sure everything is saved before you go.'], ['nedry', "It'll all still be there. Mostly."]] },

  // Animal containment
  { epic: E.animals, col: 'in-progress', who: 'muldoon', by: 'muldoon', title: 'Raptor pen: they test the fences, never twice in the same place', tag: 'red', prio: 'highest', pts: 8, due: -1, area: 'paddocks',
    desc: 'They remember. Recommend destroying all of them.', comments: [['hammond', 'Out of the question.']] },
  { epic: E.animals, col: 'todo', who: 'muldoon', title: 'T. rex paddock: the goat is not working as a lure', tag: 'blue', prio: 'low', pts: 2, area: 'paddocks' },
  { epic: E.animals, col: 'backlog', who: 'arnold', by: 'malcolm', title: 'Head count only looks for the number of animals we expect', tag: 'red', prio: 'high', pts: 3, area: 'control',
    desc: 'The computer stops counting once it reaches the expected total. Has anyone tried looking for more?' },
  { epic: E.animals, col: 'done', who: 'muldoon', title: "Dilophosaurus paddock: 'do not feed' signs", tag: 'green', prio: 'low', pts: 1, area: 'paddocks' },
  { epic: E.animals, col: 'backlog', who: 'muldoon', title: 'Gallimimus flock keeps running toward the tree line', tag: 'blue', prio: 'low', pts: 2, area: 'paddocks' },
  { epic: E.animals, col: 'in-progress', who: 'sattler', by: 'sattler', title: 'Sick Triceratops: find the cause', tag: 'red', prio: 'high', pts: 3, due: 0, area: 'paddocks',
    comments: [['sattler', "Checking the plants in the paddock. Pretty sure it's the lilac berries."]] },

  // Genetics lab
  { epic: E.lab, col: 'done', who: 'wu', by: 'wu', title: 'Fill the gaps in the dinosaur DNA', tag: 'green', pts: 8, area: 'lab',
    desc: 'Used frog DNA for the missing sequences. No side effects expected.' },
  { epic: E.lab, col: 'done', who: 'wu', by: 'wu', title: 'Make sure every animal is female', tag: 'blue', pts: 5, area: 'lab',
    comments: [['malcolm', 'Life tends to find a way.'], ['wu', 'Not in this case.']] },
  { epic: E.lab, col: 'in-progress', who: 'wu', title: 'Raptor hatching demo for the guests', tag: 'blue', prio: 'medium', pts: 2, due: 0, area: 'lab' },
  { epic: E.lab, col: 'backlog', who: 'gennaro', by: 'wu', title: 'Embryo cold storage: check what staff take to the dock', tag: 'orange', prio: 'medium', pts: 3, area: 'dock',
    desc: 'Somebody was asking about shaving cream cans.' },

  // Visitor experience
  { epic: E.guests, col: 'done', who: 'hammond', title: 'Welcome film: final cut of the DNA cartoon', tag: 'blue', pts: 3, area: 'visitor' },
  { epic: E.guests, col: 'done', who: 'hammond', title: 'Hang the banner in the visitor center rotunda', tag: 'green', prio: 'low', pts: 1, area: 'visitor',
    desc: 'The one that says "When Dinosaurs Ruled the Earth". Make sure it is attached properly.' },
  { epic: E.guests, col: 'in-progress', who: 'hammond', title: 'Gift shop: plush dinosaurs, lunch boxes, flashlights', tag: 'blue', prio: 'medium', pts: 5, due: 3, area: 'visitor' },
  { epic: E.guests, col: 'in-progress', who: 'arnold', title: 'Tropical storm on the way: keep the tour on schedule', tag: 'orange', prio: 'highest', pts: 2, due: 0, area: 'dock',
    comments: [['muldoon', 'The boat crew wants to leave early.'], ['arnold', 'The tour goes ahead.']] },
  { epic: E.guests, col: 'wont-do', who: 'hammond', title: 'Opening speech: fewer flea circus stories', tag: 'blue', prio: 'lowest', pts: 1, area: 'visitor' },
];

let n = 0;
for (const c of cards) {
  const created = await card(c);
  for (const [who, body] of c.comments || []) await comment(who, created.id, body);
  n++;
}
console.log(`seeded board "${board.name}" (${board.id}): ${Object.keys(E).length} epics, ${n} cards`);
