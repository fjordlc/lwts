# Demo board

A tongue-in-cheek demo board for the README screenshots: the kanban board of a dinosaur theme park on the day a few
experts come to visit. What could possibly go wrong.

The cards, comments and descriptions are written for this demo.

## Run it

```sh
docs/demo/start.sh            # builds LWTS, starts it on http://localhost:8090 and seeds the board
```

Log in as `hammond@isla-nublar.test` / `spared-no-expense`. Every staff member has the same password, so you can also
log in as `nedry@…`, `muldoon@…` and the others. The data lives in a temporary directory; set `LWTS_DEMO_DIR` to keep
it somewhere else. Stop the server with `kill $(cat "$LWTS_DEMO_DIR/lwts.pid")`.

## What is on the board

- Five epics, shown as swimlanes: animal containment, the experts' visit, park systems, the genetics lab and the visitor
  experience.
- 27 cards across all statuses, with assignees, priorities, points, due dates and an **Area** custom field.
- Comments from several staff members.

## Screenshots

```sh
npm install --no-save playwright && npx playwright install chromium
node docs/demo/screenshots.mjs http://localhost:8090     # writes docs/img/sc-1.png to sc-3.png and sc-phone-1.png to sc-phone-3.png
```
