# Fault playbook

## Room shows Fault

1. Open the room detail.
2. Read the alert list. Errors are listed first.
3. Check each connection state:
   - `VS offline` → video switcher unreachable.
   - `AMP offline` → amplifier unreachable.
   - `PCU offline` → power control unit unreachable.
   - `Controller offline` → room controller unreachable.
   - `Switch offline` → network switch unreachable.
4. Check the PCU bits:
   - `Extron = 0` → AV processor is off. This is a real fault.
   - `Amp = 0` and `VS = 0` with the projector off → **system off**, not a fault.
5. Check the projector state:
   - `Offline` → PJLink connection failed.
   - `Warming up` / `Cooling down` → wait 60–120 seconds.
   - `Error` → projector reports a fault.

## Room shows Attention

- Projector blanked → operator pressed Blank.
- Projector frozen → operator pressed Freeze.
- Volume too high or too low → check the AMP state.
- Projector warming/cooling → transient; recheck in two minutes.

## Room shows System off

- Projector is off.
- VS and AMP are offline.
- PCU amp and vs bits are off.
- This is normal outside scheduled use. Do not raise an incident.

## Room shows Planned off-hours

- The campus schedule has connections down.
- Confirm the current time in the campus timezone.
- Do not treat as a fault.

## Room shows Suspended

- The room is in renovation.
- No status page or connection is expected.
- Exclude from active counts.

## PCU raw value `$$$$`

- The dashboard link failed.
- Check the PCU connection and the controller.
- Treat as a fault until the raw value returns to four bits.

## Projector offline but ping works

- PJLink may be disabled or on a different port.
- Check the projector network settings and the PJLink password.
- Verify the connection label and host in Companion.

## VS/AMP offline but PCU bits on

- The device is powered but the TCP connection failed.
- Check the TCP port (default 5000).
- Check for a stale connection or a device reboot.
- Restart the connection in Companion only after confirming the device is reachable.

## No source

- The VS reports source `0`.
- Ask the operator to select PC, Laptop, or VGA.
- If the button does nothing, check the VS connection state.
