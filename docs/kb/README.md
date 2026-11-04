# Campus AV knowledge base

Human-readable companion to the machine catalogs in `config/public/`.

## Start here

- [Fault playbook](fault-playbook.md) — symptom, checks, action.
- [IP plan](ip-plan.md) — role offsets and addressing.
- [Room archetypes](room-archetypes.md) — shapes and button layouts.
- [Module notes](module-notes.md) — generic module behavior.

## Core rules

1. **System off is not a fault.** Projector off + VS/AMP offline + PCU amp/vs bits off = planned or normal shutdown.
2. **A ping is not health.** Controller and switch reachability prove the host is up, not that the AV application works.
3. **The PCU Extron bit is a real fault signal.** If Extron is off, the room cannot process AV.
4. **Blank and freeze are warnings, not faults.** They are operator actions and should be surfaced, not alarmed.
5. **Off-hours are planned.** Connections drop at `00:00` and return at `07:35` campus time.
6. **Suspended rooms are excluded.** Renovation rooms do not count toward active totals or alerts.

## How to add knowledge

1. Add the room or device to `config/public/campus.json` (or extract a live export).
2. Add a module to `config/public/modules.json` if needed.
3. Add an archetype to `config/public/archetypes.json` if the room shape is new.
4. Add a playbook page here.
5. Run `npm test` and `npm run preview`.
