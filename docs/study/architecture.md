# Architecture

## Planes

```
Companion hosts
  ├─ production 4.2.5   (read-only export + variables)
  ├─ lab 5.1.1          (read-only export + connections)
  └─ 8 Pi hosts         (backup / upgrade targets, future)
        │
        ▼
companion-adapter  ── GET-only allowlist, capability matrix, cache
        │
        ├──────────────► av-kb  (rooms, modules, archetypes, docs, search)
        │
        └──────────────► build-engine  (blueprint → connections/buttons/functions)
                              │
                              ▼
                     dashboard API (Node, zero deps)
                              │
                     vanilla UI + advisory copilot
```

## Read-only contract

1. The adapter only issues `GET`.
2. Allowed prefixes: `/int/export/`, `/api/variable/`, `/api/custom-variable/`, `/api/connections`.
3. Path traversal and control characters are rejected.
4. There is no write tool in the AI layer.
5. Generated configs are artifacts, not deployments.

## Data flow

1. **Observe** — export a Companion config, or load the synthetic campus.
2. **Normalize** — `deriveRoomsFromExport` groups instances by label into rooms and roles; `schemaInfo` records schema, style mode, and instance key.
3. **Classify** — `deriveSpaceState` produces health, projector state, connection state, PCU bits, volume, source, and alerts.
4. **Explain** — the KB indexes rooms, modules, archetypes, and Markdown; the copilot retrieves and cites.
5. **Build** — `buildConfig` turns a room + archetype into a Companion config; `validateConfig` checks references; `diffConfigs` compares against a live export.
6. **Review** — the dashboard shows validation, warnings, diff, and a download.

## Build engine

Inputs: `room`, `archetype`, `schema`, `page`, `modules`.

Outputs: a full Companion config with:

- `instances` — one per mapped device, using `moduleId` (schema 12) or `instance_type` (schema 9);
- `pages.<n>.controls` — navigation plus archetype buttons;
- `custom_variables` — room state and PCU;
- `steps[0].action_sets.down` — module actions with typed options.

Validation checks:

- schema 9 or 12;
- unique instance labels;
- host present for network modules;
- every action references a real connection;
- action IDs exist in the module catalog;
- variable references resolve to a label or custom variable.

## AI guardrails

- The copilot receives KB snippets and a snapshot summary, not raw credentials.
- The system prompt forbids writes.
- The client has no write tools registered.
- Without an API key, the copilot falls back to a deterministic KB answer.
- Answers include citations; the UI shows the mode (`offline` or `cloud`).

## Phases

| Phase | Scope | Status |
|---|---|---|
| P0 Study | Docs, inventory, schema, ADRs | done |
| P1 Read-only MVP | Adapter, dashboard, KB, build preview | done |
| P2 AI advisory | OpenAI-compatible RAG, citations | done (offline fallback) |
| P3 Guarded actions | Restart/enable/press with approval | out of scope v1 |
| P4 Deployment | Import/rollback across hosts | out of scope v1 |
| P5 Rollout | Observability, hardening | future |

## ADRs

### ADR-001: Read-only first

Live AV systems are high-consequence. v1 proves inventory, diagnosis, and config generation before any write path exists.

### ADR-002: Zero-dependency Node

The campus runs Windows Server and Raspberry Pi. Zero dependencies mean no native builds, no supply-chain churn, and a single `node server.js`.

### ADR-003: Synthetic public dataset

The repository is public, but room names, IPs, and topology are sensitive. Real inventory lives in `config/private/`; the public dataset is synthetic and leak-checked.

### ADR-004: Version adapter, not version fork

4.2.5 and 5.1.1 differ in schema, instance key, and API surface. One adapter with a capability matrix avoids two codebases.

### ADR-005: Build, don't import

Config import is an undocumented, version-coupled tRPC surface. v1 generates artifacts for review; import is a later, guarded feature.
