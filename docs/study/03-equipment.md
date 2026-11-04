# 03 — Equipment and device roles

## Observed room archetypes

| Archetype | Spaces (synthetic) | Roles |
|---|---|---|
| `projector+VS+AMP+PCU+switch+controller` | 1 | Full AV room |
| `projector` | 1 | Projector only |
| `projector+VS+switch` | 1 | Projector, video switcher, network switch |
| `projector+VS+PCU+switch` | 1 | Projector, VS, PCU, switch |
| `projector+VS+AMP+PCU+controller` | 1 | Projector, VS, AMP, PCU, controller |
| `projector+switch` | 1 | Projector and switch |
| `projector+PCU+controller` | 1 | Projector, PCU, controller |
| `suspended` | 1 | Renovation placeholder |

The production estate is dominated by the full archetype (35 of 81) and projector-only rooms (24 of 81).

## Device roles

| Role | Typical module | Protocol | Purpose |
|---|---|---|---|
| `projector` | `generic-pjlink` | PJLink over TCP | Power, blank, freeze, input, lamp hours, model |
| `vs` | `generic-tcp-udp` | TCP 5000 | Video switching / scaling |
| `amp` | `generic-tcp-udp` | TCP 5000 | Audio amplification and volume |
| `pcu` | `generic-tcp-udp` | TCP 23 | Power control unit; reports four status bits |
| `controller` | `generic-ping` | ICMP / TCP | Room controller reachability |
| `switch` | `generic-ping` | ICMP | Network switch reachability |

## Addressing convention

The campus uses a per-floor subnet and fixed host offsets:

| Role | Offset | Example (TEST-NET) |
|---|---|---|
| Switch | `.11` | `192.0.2.11` |
| PCU | `.31` | `192.0.2.31` |
| Controller | `.51` | `192.0.2.51` |
| Projector | `.101` | `192.0.2.101` |
| VS | `.111` | `192.0.2.111` |
| AMP | `.121` | `192.0.2.121` |

This convention is documented in `docs/kb/ip-plan.md` and used by the build engine when a device host is missing.

## PCU bits

The PCU status string is four characters, ordered:

| Index | Bit | Meaning |
|---|---|---|
| 0 | `extron` | AV processor is powered |
| 1 | `spare` | Reserved |
| 2 | `amp` | Amplifier is powered |
| 3 | `vs` | Video switcher is powered |

`1111` is healthy. `$$$$` means the dashboard link failed. A zero on `extron` is a real fault; zeros on `amp` and `vs` with the projector off are classified as **system off**, not fault.

## Lifecycle states

- `active` — normal operation.
- `suspended` — renovation; excluded from active counts and alerts.
- Off-hours — connections are expected down between `00:00` and `07:35` (campus timezone). The dashboard labels this separately from faults.

## Dual-projector spaces

Rooms such as `X205-L` / `X205-R` and `Z219-L` / `Z219-R` share VS/AMP/PCU but have separate projector connections. The build engine treats each space as its own page and keeps the shared device labels stable.
