# MiraBox N4 Pro layout

Page 8 in the local Companion is named **MiraBox N4 Pro** and is mapped to the
`Mirabox Mirabox Stream Dock N4 Pro` surface (5×4 grid in Companion).

## Device

| Item | Value |
|---|---|
| Device | MiraBox N4 Pro |
| Physical controls | 10 LCD keys, 4 metal knobs, 1 touch bar |
| Companion surface | `streamdock:...` — grid 5×4 |
| Page grid | 10×7 (`minColumn 0`, `maxColumn 9`, `minRow 0`, `maxRow 6`) |
| Visible viewport | columns 0–4, rows 0–3 |

The 10 LCD keys occupy the top two rows (5×2). The two lower rows represent the
four knobs and the touch bar.

## Layout

The controls are split into ten single-purpose buttons and fill the 10-key area
(5×2). Each on/off pair has its own key:

| | col 0 | col 1 | col 2 | col 3 | col 4 |
|---|---|---|---|---|---|
| row 0 | **System On** | **System Off** | **Video: PC** | **Video: Laptop** | **Volume Up** |
| row 1 | **TV On** | **TV Off** | **Light On** | **Light Off** | **Volume Down** |
| row 2 | **FOCUS** | **PRESENT** | **MEDIA** | **LIGHTS** | **OFF** |
| row 3 | — | — | — | — | — |

### Touch bar (row 2)

Row 2 is designed as a five-segment scene slider for the N4 Pro touch/slide area:

- A continuous white track line runs across the top of all five segments.
- The background is a gradient: deep blue → blue → violet → light violet → dark magenta.
- The center **MEDIA** segment carries a white thumb indicator at the bottom, so the strip reads as a slider.
- Labels are single-line scene names: `FOCUS`, `PRESENT`, `MEDIA`, `LIGHTS`, `OFF`.
- No actions, feedbacks, or commands — visual design only.

Colors:

| Button | Color |
|---|---|
| System On | `#238636` green |
| System Off | `#b62324` red |
| Video: PC | `#1f6feb` blue |
| Video: Laptop | `#1f6feb` blue |
| Volume Up | `#0e7490` teal |
| TV On | `#8957e5` purple |
| TV Off | `#6e40c9` dark purple |
| Light On | `#d29922` amber |
| Light Off | `#9e6a03` dark amber |
| Volume Down | `#155e75` dark teal |
| Touch: FOCUS | `#0b3d91` deep blue |
| Touch: PRESENT | `#1f6feb` blue |
| Touch: MEDIA | `#6e40c9` violet |
| Touch: LIGHTS | `#a371f7` light violet |
| Touch: OFF | `#8b2f5f` dark magenta |

Buttons are `button-layered` with a canvas, a background box, and a two-line
text layer at 70% font size with shrink enabled. There are **no actions,
feedbacks, or commands** — this is layout only.

## Files

- `config/public/layouts/mirabox-n4-pro.json` — importable page config.
- `tools/mirabox-layout.mjs` — regenerates the layout and optionally applies it.

## Re-apply

The Companion import API is internal tRPC over `ws://127.0.0.1:8000/trpc`.
Back up first:

```bash
curl -s http://127.0.0.1:8000/int/export/full?format=json -o out/backup.companionconfig
```

Generate only:

```bash
node tools/mirabox-layout.mjs --out config/public/layouts/mirabox-n4-pro.json
```

Apply to page 8:

```bash
node tools/mirabox-layout.mjs --apply
```

The script uploads the config through `importExport.prepareImport.*` and calls
`importExport.importSinglePage` with source page 1 and target page 8.

## Notes

- The import replaces the buttons on page 8; the page name and grid size stay.
- Rows 0–1 are the 10 LCD keys, row 2 is the LCD strip/touch bar, row 3 is unused.
- If the device shows fewer buttons, check that the surface is using page 8 and
  that the page viewport is at column 0, row 0.

## Disable vibration

The N4 Pro vibrates on key press. Companion's MiraBox surface module does not
expose this setting.

- Official method: StreamDock software → Settings → Device → clear
  **Activate vibration**. Requires firmware 02.006 or later.
- Script method:

```bash
node tools/disable-mirabox-vibration.mjs
```

The script finds the installed MiraBox surface module's HID addon, opens the
N4 Pro, and sends the firmware `QUCMD` config command with `0xFF` (disable).
Use `--enable` to restore vibration, or `--dry-run` to preview.

The setting is applied to the device; the Companion surface module does not
re-enable it on connect.
