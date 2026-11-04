# 06 — Interface and layout design

## Design language

The dashboard borrows the Companion operational language without copying its configuration UI:

- Dark surface (`#0b1117`) with layered panels.
- Monospace for identifiers, IPs, labels, and raw values.
- Status is never conveyed by color alone: every state has a label and a dot.
- Buttons are compact, rectangular, and clearly interactive; the build studio uses the same grid metaphor as Companion.

## Status colors

| Tone | Color | Use |
|---|---|---|
| `ok` | `#2ea043` | Operational |
| `warning` | `#d29922` | Attention |
| `error` | `#f85149` | Fault |
| `off` | `#6e7681` | System off / disabled |
| `off-hours` | `#1f6feb` | Planned downtime |
| `suspended` | `#8957e5` | Renovation |

## Layout

1. **Top bar** — brand, host selector, refresh, AI mode.
2. **Tabs** — Overview, Rooms, Build studio, Knowledge, Copilot.
3. **Overview** — count cards, room matrix by group, alert feed.
4. **Rooms** — filterable list; selecting a room opens a detail panel with projectors, connections, PCU bits, audio/source, and alerts.
5. **Build studio** — room, schema, page, generate, validation, diff, download.
6. **Knowledge** — search results plus module catalog cards.
7. **Copilot** — question, grounded answer, citations.

## Companion button language

The build engine emits two styles:

- **Classic (schema 9)** — `type: "button"` with `text`, `bgcolor`, `color`, `size`.
- **Layered (schema 12)** — `type: "button-layered"` with canvas, box, and text layers. The text layer uses `halign`, `valign`, `fontsize`, and `fontsizeAllowShrink`, matching the observed 5.x shape.

Buttons are arranged in a 3×5 grid. Column 0 is reserved for navigation (`pageup`, `pagenum`, `pagedown`); content starts at column 1.

## Accessibility

- Semantic headings and labels on every form control.
- `aria-label` on the host picker, room filter, knowledge search, and copilot input.
- Focus-visible outlines via the global `:focus` style.
- Responsive down to 620 px: the split view collapses, the room table drops non-essential columns.
- No color-only meaning; badges include text.

## Future studio work

- Drag-and-drop button placement with a live 3×5 preview.
- Side-by-side diff highlighting instead of a summary list.
- Preset library and linked presets.
- Surface-aware previews (Stream Deck MK.2, Stream Deck +, Studio).
