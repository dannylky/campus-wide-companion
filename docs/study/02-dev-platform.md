# 02 — Development platform assessment

## The two Companion instances

| Instance | Address | Build | Role |
|---|---|---|---|
| Campus production | `companion.example.edu:8000` | 4.2.5+8815 | Live room estate; read-only source of truth |
| Local lab | `127.0.0.1:8000` | 5.1.1+10000 | Module and UI integration testing |

The local lab is **not** a copy of the campus system. It is a separate installation used for PTZ, OBS, audio, and protocol experiments.

## Local lab inventory (5.1.1)

- 10 pages: `Master`, `Master backup`, `Main Camera`, `OBS`, `Side Camera (2)`, `Side Camera`, `Stream Deck`, `Test`, `test`, `Bose`.
- 18 connections: `aver-ptz` ×3, `generic-smtp` ×3, `generic-pingandwake` ×2, `obs-studio`, `extron-ipl-t-pcs4`, `behringer-wing`, `lgtv-display`, `kramer-matrix`, `vicreo-hotkey`, `tplink-taposmartplug`, `novastar-controller`, `audinate-dantecontroller`, `generic-tcp-udp`.
- 3 surfaces, 4 surface instances.
- `/api/connections` returns 18 entries; 8 report `good`, 10 are disabled or unknown.
- REST API v2 is installed but disabled (`403 API_DISABLED`).

## Production inventory (4.2.5)

- 18 pages, 9 status pages, 10 groups.
- 81 spaces: 77 active, 4 suspended.
- 287 connections: `generic-tcp-udp` 133, `generic-ping` 91, `generic-pjlink` 80.
- Export schema 9; no `/api/connections`; no REST v2.

The generic adapter derives **80 of the 81** curated spaces. `M1003` is suspended and has no connections, so a connection-derived inventory cannot see it. The curated `config/private/rooms.json` remains the full source when available.

## Adapter strategy

The adapter detects capabilities rather than assuming a version:

```js
const info = schemaInfo(export);
// { schema: 9|12, styleMode: 'classic'|'layered', instanceKey: 'instance_type'|'moduleId' }
```

Read paths:

1. Always: `/int/export/full?format=json`.
2. Room detail: `/api/custom-variable/<state>/value`, `/api/custom-variable/<pcu>/value`.
3. Connection health: `/api/variable/internal/connection_<label>_status/value`.
4. 5.x only: `/api/connections` for a fast status map.

## Lab findings that shaped the design

- `generic-tcp-udp` carries VS, AMP, and PCU traffic with no feedbacks and no reconnect loop. Health must come from connection status plus PCU bits.
- `generic-pjlink` exposes power, blank, freeze, lamp hours, and model as module variables. The observed names on 4.2.5 are `powerState`, `muteState`, `freezeState`, `projectorModel`, and `lamp1Hrs`. Those names are the basis for projector detail.
- The internal tRPC API (`importExport.importFull`, `importSinglePage`, `importTriggers`, `resetConfiguration`) is undocumented and version-coupled. The platform does not depend on it in v1.
- The config merger in the sibling project proves that `.companionconfig` files can be deep-merged safely; the build engine reuses that idea for diffing.
