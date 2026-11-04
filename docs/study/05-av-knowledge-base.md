# 05 — AV knowledge base design

The knowledge base is the platform's memory. It is loaded at startup from three JSON catalogs and any Markdown under `docs/kb` and `docs/study`.

## Entities

```
Site
└─ Group (block/floor/page)
   └─ Space (room)
      ├─ Device (role: projector | vs | amp | pcu | controller | switch)
      │  └─ Connection (module, host, port, label, enabled)
      ├─ Variables (state, pcu)
      └─ Capabilities
```

## Document types

| Type | Source | Example |
|---|---|---|
| `room` | `config/public/campus.json` | `room:X101` |
| `module` | `config/public/modules.json` | `module:generic-pjlink` |
| `archetype` | `config/public/archetypes.json` | `archetype:projector+VS+AMP+PCU+switch+controller` |
| `doc` | `docs/kb/*.md`, `docs/study/*.md` | `doc:docs/kb/fault-playbook.md` |

## Search

The current implementation is dependency-free lexical search:

- tokenize on non-alphanumeric characters, drop stopwords;
- score title hits ×6, tag hits ×3, body hits ×1 (capped at 5);
- exact phrase bonus;
- return a 260-character snippet around the first match.

This is intentionally simple. The interface is stable, so a BM25 or embedding index can replace it without touching the dashboard or AI layer.

## Fault taxonomy

| Health | Meaning | Typical cause |
|---|---|---|
| `ok` | Operational | All mapped devices healthy |
| `warning` | Attention | Projector warming/cooling, blanked, frozen, volume out of range |
| `error` | Fault | Projector offline, VS/AMP/PCU offline, Extron bit off, PCU link error |
| `off` | System off | Projector off, VS and AMP offline, PCU amp/vs bits off |
| `off-hours` | Planned off-hours | Outside `07:35–00:00` campus time |
| `suspended` | Renovation | Excluded from active counts |
| `unknown` | Unknown | Missing state variable or unreadable status |

The distinction between **system off** and **fault** is the most important rule. It prevents nightly shutdown from generating a false alarm.

## Extending the KB

1. Add a room or device to the inventory (or extract a live export).
2. Add a module entry to `config/public/modules.json` if the module is new.
3. Add an archetype to `config/public/archetypes.json` if the room shape is new.
4. Add a playbook under `docs/kb/` with symptoms, checks, and actions.
5. Run `npm test` and `npm run preview`.

## Human-readable companions

- `docs/kb/fault-playbook.md` — symptom → checks → action.
- `docs/kb/ip-plan.md` — role offsets and test ranges.
- `docs/kb/room-archetypes.md` — archetype table and button layouts.
- `docs/kb/module-notes.md` — generic module behavior.
