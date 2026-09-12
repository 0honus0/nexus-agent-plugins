# Nexus Agent Plugins

First-party installable Agent Apps for [Nexus Terminal](https://github.com/0honus0/nexus-terminal).

This repository owns distributable plugin source and release metadata. Nexus Terminal owns the Plugin SDK/protocol, package verification, App capability policy, Agent Runtime, Host UI, and target runtime implementation.

## App composition

An Agent App is composed only from the parts it actually needs:

- `manifest.json` — App identity, declared capabilities, optional AgentDefinitions, optional target entries.
- `skills/` — optional model-facing Skills.
- `frontend/` — optional **full custom App surface**. When absent and the manifest declares AgentDefinitions, Nexus uses its built-in Agent conversation surface.
- `backend/` — optional sandboxed Backend target for App-owned background/state logic.
- `runner/` — optional trusted native Runner target for Workspace-local logic.

Targets are not a checklist. A complete App may intentionally contain only an AgentDefinition plus Skills. `nexus.developer` follows that model: Nexus already owns the conversation, Run, approval, Artifact, Browser, and Workspace UI/runtime, so duplicating empty frontend/backend/runner targets would add coupling without product value.

A future App that needs a completely different product experience can declare `targets.frontend`. Nexus then gives the whole App content area to that isolated iframe. Custom frontends import the Nexus-hosted SDK from the isolated Plugin origin:

```js
import { connectNexusPlugin } from '/sdk/frontend-v1.mjs';

const nexus = await connectNexusPlugin();
const definitions = await nexus.agent.definitions.list();
const providers = await nexus.agent.providers.list();
```

The SDK proxies only explicit App-scoped operations. Plugin frontend code never receives Nexus session cookies, CSRF credentials, raw HTTP clients, database handles, or internal service objects. Run streaming is available through `nexus.agent.runs.subscribe(...)` over the same bounded MessagePort bridge.

## Layout

- `plugins/` — first-party App source; each App contains its versioned `manifest.json` and only the optional targets/Skills it uses.
- `scripts/build-package.mjs` — reproducibly builds and Ed25519-signs one App package.
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
pnpm build:release plugins/nexus.developer /tmp/nexus-plugin-key.pem .dist https://example.invalid/releases/v1.1.0
```
