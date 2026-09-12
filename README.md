# Nexus Agent Plugins

First-party Agent plugins for [Nexus Terminal](https://github.com/0honus0/nexus-terminal).

This repository owns distributable plugin source and release metadata. Nexus Terminal owns the plugin protocol, trust/signature verification, installation, permissions, host UI, and sandbox/runtime implementation.

## Layout

- `plugins/` — first-party plugin source; each plugin contains its versioned `manifest.json` and optional `frontend/`, `backend/`, `runner/`, and `skills/` targets.
- `scripts/build-package.mjs` — reproducibly builds and Ed25519-signs one plugin package.
- `scripts/build-release.mjs` — builds a signed package plus release `catalog.json`.
- `catalog/` — release/catalog documentation; generated release output is written to `.dist/`.

Private signing keys are never committed. Release automation expects `NEXUS_AGENT_PLUGIN_SIGNING_KEY_PEM` as a GitHub Actions secret.

## Local validation

```bash
corepack enable
pnpm run check
```

To build a release locally:

```bash
printf "%s" "$NEXUS_AGENT_PLUGIN_SIGNING_KEY_PEM" > /tmp/nexus-plugin-key.pem
pnpm build:release plugins/nexus.developer /tmp/nexus-plugin-key.pem .dist https://example.invalid/releases/v1.0.0
```
