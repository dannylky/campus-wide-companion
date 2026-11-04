# Room archetypes

| Archetype | Roles | Buttons |
|---|---|---|
| `projector` | projector | power on/off, blank/clear, freeze/unfreeze |
| `projector+switch` | projector, switch | power, blank/clear, switch status |
| `projector+VS+switch` | projector, VS, switch | power, PC/Laptop/VGA, blank/clear |
| `projector+VS+PCU+switch` | projector, VS, PCU, switch | power, sources, PCU status, blank/clear |
| `projector+VS+AMP+PCU+controller` | projector, VS, AMP, PCU, controller | power, sources, volume, mute |
| `projector+VS+AMP+PCU+switch+controller` | full AV | power, sources, volume, mute, PCU |
| `projector+PCU+controller` | projector, PCU, controller | power, PCU status, controller status |
| `suspended` | none | none |

## Grid convention

A Stream Deck MK.2 is 3 rows × 5 columns.

- Column 0: `pageup`, `pagenum`, `pagedown`.
- Columns 1–4: room functions.
- Row 0: power.
- Row 1: source selection.
- Row 2: volume, mute, status.

The build engine places buttons from the archetype spec and skips any cell that is already occupied.

## Adding an archetype

1. Add an entry to `config/public/archetypes.json` with `id`, `roles`, `capabilities`, and `buttons`.
2. Use `role` values that exist in the room devices.
3. For `generic-tcp-udp`, set `action: "send"` and a `command`.
4. For `generic-pjlink`, use `powerOn`, `powerOff`, `muteOn`, `muteOff`, `freezeOn`, `freezeOff`.
5. For status-only buttons, set `kind: "status"`.

## Notes

- The archetype ID must equal the room `roomType` string exactly.
- The adapter normalizes role names to the same case (`VS`, `AMP`, `PCU`) so live exports match the catalog.
- The engine does not invent device roles; a missing role simply skips its buttons.
