# 07 — GitHub and release plan

## Repository

- Public: `dannylky/campus-wide-companion`.
- Code license: MIT.
- Documentation: CC BY 4.0.
- Default branch: `main`.

## What is public and what is not

| Path | Committed | Content |
|---|---|---|
| `config/public/` | yes | Synthetic campus, module catalog, archetypes |
| `config/private/` | no (gitignored) | Real inventory, hosts, room names |
| `out/` | no | Generated `.companionconfig` previews |
| `.env` | no | API keys, tokens, real hosts |
| `docs/` | yes | Study and knowledge base |

The public dataset uses RFC 5737 addresses (`192.0.2.0/24`, `198.51.100.0/24`, `203.0.113.0/24`) and synthetic room IDs (`X101`, `Y201`, `Z302`).

## Leak check

`tools/verify.mjs` scans the tree for:

- private `10/8`, `172.16/12`, and `192.168/16` addresses;
- API keys (`sk-`, `ghp_`, `AKIA`);
- private key blocks.

CI runs it on every push. It exits non-zero on any finding.

## Workflows

### `ci.yml`

- Node 20.
- `npm test` (`node --test`).
- `node tools/build-preview.mjs X101` to prove the build engine runs.
- `node tools/verify.mjs` to prove no private data leaked.

### `pages.yml`

Deploys the static `site/` folder to GitHub Pages on `main`. The dashboard itself is dynamic and runs locally or on a server; Pages hosts the project overview and study index.

## Branches and commits

- `main` is protected; work lands through pull requests.
- Feature branches: `feat/...`, `fix/...`, `docs/...`.
- Conventional commits: `feat:`, `fix:`, `docs:`, `test:`, `chore:`.

## Secrets

Never commit:

- `OPENAI_API_KEY`
- `DASHBOARD_TOKEN`
- Companion host credentials
- TLS keys
- real exports

Use repository secrets only if a workflow genuinely needs them. The current workflows need none.

## Release checklist

1. `npm test` passes.
2. `npm run preview` validates.
3. `node tools/verify.mjs` is clean.
4. Update `CHANGELOG.md` (when added).
5. Tag `v0.x.y` and publish release notes.
6. Confirm Pages deployed.

## Local publish commands

```bash
gh repo create dannylky/campus-wide-companion --public --source=. --remote=origin --push
git add -A
git commit -m "feat: initial read-only campus companion platform"
git push -u origin main
```
