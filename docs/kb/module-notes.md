# Module notes

## `generic-pjlink`

- Connects over TCP, default port 4352.
- Useful variables: `powerState`, `muteState` (blank), `freezeState`, `lamp1Hrs`, `projectorModel`.
- Power states can be `on`, `off`, `warming`, `cooling`, `error`.
- Some projectors need a PJLink password; store it in the connection secrets, never in the repository.
- Lamp hours are a maintenance signal, not a health signal. Track trends separately.

## `generic-tcp-udp`

- The workhorse for VS, AMP, and PCU.
- No feedbacks, no automatic reconnect, no protocol parsing.
- TCP response is exposed as `$(<label>:tcp_response)` when Save TCP Response is on.
- VS and AMP use TCP 5000; PCU uses TCP 23.
- A failed TCP connection shows up in `connection_<label>_status`, not as a module feedback.
- Commands are site-specific. The build engine uses placeholders (`#SRC1`, `#VOL+`, `#MUTE`, `#STATUS`) that must be replaced with the real protocol strings.

## `generic-ping`

- ICMP echo only.
- Use for controller and switch reachability.
- A successful ping does not prove the AV application is healthy.
- Combine with PCU bits and projector state before declaring a room healthy.

## `generic-pingandwake`

- Adds Wake-on-LAN to ping.
- Useful for control PCs and media players.
- The MAC address is not a secret, but it is site-specific; keep it in the private inventory.

## `aver-ptz`

- VISCA over IP, UDP 52381.
- Support varies by camera model and firmware.
- The custom command action accepts hex without `0x`, with or without spaces.
- Example preset recall: `81 01 04 3F 02 01 FF`.

## `obs-studio`

- Requires OBS 28+ and obs-websocket.
- Scenes, streaming, and recording are the common actions.
- Keep the websocket password in secrets.

## `generic-smtp`

- Alert delivery only.
- Use an application-specific account with a narrow scope.
- Never commit credentials; use environment variables or Companion secrets.

## Module catalog maintenance

`config/public/modules.json` is the source for the KB and the validator. Each entry should include:

- `id`, `name`, `category`, `protocol`;
- `config` fields with type and required flag;
- `actions`, `feedbacks`, `variables`;
- `notes` and an optional `docs` URL.

The build engine warns when an action is not present in the catalog, but it does not block generation. Treat warnings as a prompt to update the catalog or the archetype.
