# IP plan

## Convention

Each floor uses one subnet. Host offsets are stable:

| Role | Offset | Example |
|---|---|---|
| Network switch | `.11` | `192.0.2.11` |
| PCU | `.31` | `192.0.2.31` |
| Controller | `.51` | `192.0.2.51` |
| Projector | `.101` | `192.0.2.101` |
| VS | `.111` | `192.0.2.111` |
| AMP | `.121` | `192.0.2.121` |

The public dataset uses RFC 5737 test ranges:

- `192.0.2.0/24`
- `198.51.100.0/24`
- `203.0.113.0/24`

Real addresses belong in `config/private/rooms.json` and must never be committed.

## Ports

| Service | Port |
|---|---|
| Companion web UI | `8000` |
| PJLink | `4352` |
| VS | `5000` |
| AMP | `5000` |
| PCU | `23` |
| Controller (example) | `3629` |

## Build engine fallback

If a device has no host, the engine derives one from the room's other devices:

- take the first three octets of any mapped device;
- apply the role offset above.

This keeps generated configs coherent for synthetic rooms and for inventory gaps.

## Validation

- Every network module instance should have a host.
- Duplicate labels are rejected.
- A host change is reported by `diffConfigs` as a changed connection.
