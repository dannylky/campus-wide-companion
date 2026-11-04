# 01 — Bitfocus Companion feature inventory

This document records the Companion capabilities the platform builds on, and the read-only boundary we keep.

## Configuration model

| Area | What Companion offers | How we use it |
|---|---|---|
| Pages | Grids of buttons, page names, navigation buttons, page variables (5.1+) | Build engine emits one page per room blueprint |
| Buttons | Classic `button` (4.x) and layered `button-layered` (5.x) with canvas/box/text/image layers, steps, rotary actions, local variables | Templates produce both schemas |
| Actions | Module actions on down/up, with expression-capable options | Generated from archetype button specs |
| Feedbacks | Module feedbacks and value feedbacks that restyle buttons | Kept empty in v1; catalogued for future use |
| Variables | Custom, module, page, expression, internal | Room state and PCU custom variables are generated |
| Triggers | Time, interval, and condition triggers | Read and catalogued; not generated in v1 |
| Surfaces | Stream Deck, X-Keys, emulator, web buttons, Satellite | Read from exports; no surface writes |
| Modules | 800+ connections (882 in the public list at time of study) | Catalogued in `config/public/modules.json` |
| Image library | Reusable images across buttons | Read only |
| Import/export | Compressed, JSON, YAML; full, page, trigger subsets | Read via `/int/export/full?format=json`; generated artifacts are not imported |
| Log | Filterable runtime log | Read via `/int/export/log` when needed |

## Remote-control surface

| Protocol | Path / endpoint | Status |
|---|---|---|
| HTTP remote | `/api/location/<page>/<row>/<col>/press`, `/api/custom-variable/<name>/value`, `/api/variable/<label>/<var>/value`, `/api/connections`, `/api/surfaces/rescan` | Read endpoints used; write endpoints deliberately not used |
| REST API v2 | `/api/v2/...`, `/api/v2/docs`, `/api/v2/openapi.json` | 5.1+; disabled by default; not required |
| TCP/UDP | Configurable | Not used |
| OSC | Configurable | Not used |
| Artnet / DMX | Configurable | Not used |
| Ember+ | Configurable | Not used |
| RossTalk | Configurable | Not used |
| Satellite | Remote surfaces | Not used |
| Prometheus | `/api/metrics` | Candidate for monitoring later |

## Version differences that matter

| Capability | Companion 4.2.5 | Companion 5.1.1 |
|---|---|---|
| Export schema | 9 | 12 |
| Instance key | `instance_type` | `moduleId` |
| Button style | `type: "button"` | `type: "button-layered"` |
| `/api/connections` | absent (404) | present |
| REST API v2 | absent | present, disabled by default |
| Page variables | no | yes |
| Config import | UI / internal tRPC | UI / internal tRPC (`importExport.*`) |

## Read-only guarantees in this platform

- The adapter allowlist is `GET` only: `/int/export/`, `/api/variable/`, `/api/custom-variable/`, `/api/connections`.
- Paths containing `..`, backslashes, or control characters are rejected.
- No code path calls `/api/location/.../press`, `/api/connections/<id>/restart`, or import procedures.
- Generated `.companionconfig` files are written to `out/` and downloaded for review.

## Design implication

Because 4.2.5 has no connection-status API, the adapter reads connection status through the internal variable `connection_<label>_status` on demand. On 5.x it prefers `/api/connections`. The dashboard labels unknown states honestly rather than assuming health.
