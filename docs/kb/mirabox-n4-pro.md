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

## Icons

The icon set is Material Design, rasterized to transparent PNGs. Page 8 now
bakes these icons into the modern button images below; the mapping is:

| Button | Icon | Button | Icon |
|---|---|---|---|
| System On | `power` | System Off | `power-off` |
| TV On | `television` | TV Off | `television-off` |
| Video PC | `monitor` | Video Laptop | `laptop` |
| Light On | `lightbulb-on` | Light Off | `lightbulb-off` |
| Volume Up | `volume-high` | Volume Down | `volume-low` |
| Focus | `target` | Present | `presentation` |
| Media | `play-circle` | Lights | `lightbulb-group` |
| Off | `power-standby` | | |

Companion does not support animated GIF icons in the button renderer
(upstream issue #262 is still open), so the icons are static PNGs.

## Modern button images

Page 8 uses the **Aurora Glass** design: vibrant gradients, a translucent glass
panel, a grainy texture, and a large white icon. The button images contain
**no text**; each button has an editable Companion text layer on top. Keys use a
two-line label; the touch bar uses a single-line label to the right of the icon.

Each key image is 224×224 (2× the 112×112 key); each touch segment is 352×248
(2× the 176×124 strip). Icons are 96 px on keys and 64 px on the touch strip.

The five touch segments share one continuous gradient and a white track; the
center **MEDIA** segment carries the thumb indicator. The preview contact sheet
overlays the labels for illustration; the applied images are text-free.

```bash
node tools/mirabox-button-images.mjs --apply
```

- Artifact: `config/public/layouts/mirabox-n4-pro-modern.json`
- Preview: `out/mirabox-button-preview.png`
- The previous icon-only layout remains in
  `config/public/layouts/mirabox-n4-pro-icons.json`.

To copy the modern design to the backup page:

```bash
node tools/copy-page.mjs --from 8 --to 9 --apply
```

## Light demo

Pages 8 and 9 include a self-contained four-zone light demo. It uses no real
light connection; all state lives in custom variables.

- Variables: `demo_z1_on` … `demo_z4_on` (0/1) and
  `demo_z1_level` … `demo_z4_level` (0–100).
- Knobs **3/0–3/3**: Rotary actions enabled.
  - Press toggles the zone.
  - Rotate left/right adjusts brightness by `$(this:delta)`, clamped 0–100.
- **LIGHT ON (0/3)** mirrors Zone 1; **LIGHT OFF (1/3)** mirrors Zone 2 via
  button references.
- **LIGHTS touch segment (2/3)** is the master: it shows
  `LIGHTS n/4 · avg%` and toggles all zones on press.
- Warm hues: amber, orange, gold, warm white.
- Page 9 uses references to `9/3/0` and `9/3/1`.

Apply and test:

```bash
node tools/mirabox-light-demo.mjs --apply --test
node tools/mirabox-light-demo.mjs --test-only
```

Backup: `out/backup-before-light-demo.companionconfig`.

The physical knobs have no LCD; the effect is visible on the mirrored LIGHT
ON/OFF keys and the LIGHTS touch segment. Knob ring LEDs are not controlled by
Companion's button grid.

## Files

- `config/public/layouts/mirabox-n4-pro.json` — base layout page config.
- `config/public/layouts/mirabox-n4-pro-icons.json` — previous icon-only layout.
- `config/public/layouts/mirabox-n4-pro-modern.json` — current Aurora Glass page.
- `tools/mirabox-layout.mjs` — regenerates the base layout and optionally applies it.
- `tools/mirabox-icons.mjs` — fetches, rasterizes, and applies icons.
- `tools/mirabox-button-images.mjs` — renders and applies the modern button images.
- `tools/mirabox-light-demo.mjs` — builds and tests the four-zone light demo.

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

## Copy page

Copy all buttons from one page to another (for example page 8 to page 9):

```bash
node tools/copy-page.mjs --from 8 --to 9 --apply
```

The target page name is preserved by default. Use `--name "New name"` to rename
it, or omit `--apply` for a dry run that only writes the import file.

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
