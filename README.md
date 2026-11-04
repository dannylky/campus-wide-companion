# Campus Wide Companion

A read-only, campus-wide operations layer for [Bitfocus Companion](https://github.com/bitfocus/companion).

It turns Companion configuration exports into a searchable AV knowledge base, a live room/health dashboard, and a dynamic build engine that generates Companion connections, buttons, and functions as `.companionconfig` artifacts — without ever writing to a live Companion host.

## What it does

- **Inventory** — reads `/int/export/full?format=json` from one or more Companion hosts and normalizes pages, connections, devices, and rooms.
- **Knowledge base** — modules, device roles, protocols, room archetypes, fault taxonomy, and remediation playbooks.
- **Dashboard** — campus matrix, room detail, device health, PCU bits, projector state, off-hours and suspended handling.
- **Build engine** — declarative `RoomBlueprint` → Companion config (connections, buttons, actions, feedbacks, variables), with validation, diff, and export.
- **Advisory AI** — optional OpenAI-compatible assistant grounded in the knowledge base. It never receives write tools.

## Safety model

This project is **read-only by design**:

- The adapter only issues `GET` requests to allowlisted paths (`/int/export/*`, `/api/variable/*`, `/api/custom-variable/*`, `/api/connections` on 5.x).
- No button presses, restarts, imports, or device commands.
- Generated configs are written to `out/` for review. They are not imported.
- Real campus inventory belongs in `config/private/` (gitignored). The public repo ships a synthetic campus.

## Quick start

```bash
node --version          # 18+ (24 recommended)
npm test
npm start               # http://127.0.0.1:8090
```

The default host is the synthetic campus in `config/public/campus.json`, so the dashboard works offline.

### Windows launcher

Double-click `start.bat`, or run it from a terminal:

```bat
start.bat
start.bat 8091
```

It checks for Node.js, starts the server, and opens the dashboard. Set `NO_BROWSER=1` to skip opening the browser. If `.env` is missing it uses the synthetic campus and the offline AI fallback.

To point it at a live Companion instance:

```bash
cp .env.example .env
# set COMPANION_HOSTS to a JSON array, for example:
# [{"id":"prod","name":"Campus production","baseUrl":"http://192.0.2.10:8000","kind":"production"}]
npm start
```

Then open the host switcher in the dashboard.

## Build engine

```bash
npm run preview
# writes out/preview.companionconfig and prints a validation summary
```

The engine supports both observed config schemas:

| Companion | Export schema | Instance key | Button style |
|---|---|---|---|
| 4.2.5 | 9 | `instance_type` | `type: "button"` |
| 5.x | 12 | `moduleId` | `type: "button-layered"` |

Set `BUILD_SCHEMA=9` or `12` to choose the target.

## Repository layout

```
apps/dashboard/            zero-dependency Node server + vanilla UI
packages/companion-adapter version-aware read adapter
packages/build-engine/     blueprint -> Companion config compiler
packages/av-kb/            knowledge base loader and search
packages/ai/               OpenAI-compatible advisory client
config/public/             synthetic campus + module/archetype catalogs
config/private/            real inventory (gitignored)
docs/study/                seven-area study and architecture
docs/kb/                   human-readable knowledge base
tools/                     extract, sanitize, preview, verify
test/                      node:test suites
```

## API

| Method | Path | Purpose |
|---|---|---|
| GET | `/api/health` | service and host health |
| GET | `/api/hosts` | configured Companion hosts |
| GET | `/api/hosts/:id/summary` | normalized inventory summary |
| GET | `/api/hosts/:id/rooms` | room list with health |
| GET | `/api/hosts/:id/rooms/:roomId` | room detail |
| GET | `/api/kb/search?q=` | knowledge base search |
| GET | `/api/kb/modules` | module catalog |
| POST | `/api/build/preview` | generate + validate a config |
| POST | `/api/ai/ask` | advisory answer with citations |

## Publishing

The public repository is sanitized: synthetic rooms, RFC 5737 test IPs, no secrets. See `docs/study/07-github.md` for the release and Pages workflow.

## License

MIT for code. Documentation is CC BY 4.0. Bitfocus Companion itself is a separate project under its own license.
