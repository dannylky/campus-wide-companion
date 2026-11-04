# 04 — Companion module mapping

The public catalog in `config/public/modules.json` is the machine-readable version of this table.

## Campus core

| Module | Category | Protocol | Config | Actions | Feedbacks | Variables |
|---|---|---|---|---|---|---|
| `generic-pjlink` | Projector | PJLink TCP 4352 | host, port | power on/off, blank on/off, freeze on/off, input | power, mute, freeze | power, mute, freeze, lamp hours, model |
| `generic-tcp-udp` | Protocol | Raw TCP/UDP | host, port, protocol, save response, convert response | send, send HEX | none | `tcp_response` |
| `generic-ping` | Network | ICMP | host, interval | none | reachable | status, latency |
| `generic-pingandwake` | Network | ICMP + WoL | host, MAC | wake | reachable | status |

## Lab and expansion modules

| Module | Category | Protocol | Notes |
|---|---|---|---|
| `aver-ptz` | Camera / PTZ | VISCA over IP (UDP 52381) | Presets, pan/tilt, zoom, custom hex |
| `obs-studio` | Video / streaming | obs-websocket | Scenes, stream, record |
| `extron-ipl-t-pcs4` | Power / control | Extron SIS | Outlet control; often behind a PCU bit |
| `behringer-wing` | Audio | OSC / TCP | Mute and fader control |
| `lgtv-display` | Display | LG webOS / serial | Power and input |
| `kramer-matrix` | Router / matrix | Kramer Protocol 2000 | Routing |
| `vicreo-hotkey` | Software | VICREO Listener | Keyboard automation |
| `tplink-taposmartplug` | Power | Tapo local API | Remote power cycling |
| `novastar-controller` | LED / video | NovaStar TCP | Presets and brightness |
| `audinate-dantecontroller` | Audio / Dante | Dante | Subscription routing |
| `obsbot-osc` | Camera / PTZ | OSC over UDP | Gimbal and presets |
| `generic-smtp` | Notification | SMTP | Alert email |

## Design notes

- `generic-tcp-udp` is the workhorse for VS, AMP, and PCU. It has **no feedbacks** and no automatic reconnect, so connection status and PCU bits are the only health signals.
- `generic-pjlink` is the richest health source: power, blank, freeze, lamp hours, and model.
- `generic-ping` proves reachability, not application health. A pingable controller can still have a failed AV application.
- Module versions differ between hosts. The build engine stamps a module version but treats it as advisory; the live export remains authoritative.
- The module catalog is deliberately small. Extend it by adding entries to `config/public/modules.json`; the KB and validator pick them up automatically.
