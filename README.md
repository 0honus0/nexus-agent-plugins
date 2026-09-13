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

Targets are not a checklist. `nexus.agent` intentionally contains one generic `agent.default` AgentDefinition plus exactly two signed Skills: `nexus.operations` and `nexus.developer`. Nexus already owns the conversation, Run, approval, Artifact, Browser, and Workspace UI/runtime, so Operations and Developer do not need duplicate App shells or empty target directories.

Skill layout is intentionally single-source: every Skill is exactly `skills/<slug>/SKILL.md`. The same Markdown file owns its frontmatter (`id`, `name`, `version`, `description`, `requiredCapabilities`) and its instruction body; there is no separate `skills/index.json`, metadata file, or split body file. Skill discovery is progressive. The base model context receives only each installed Skill's `id`, human-readable `name`, and `description` from that frontmatter. Full `SKILL.md` instructions are not injected automatically; the model explicitly calls the Host-owned read-only `skill_read(id)` tool when it needs one Skill, and Nexus rechecks the installed package file hash before returning that body. All Skills in a Plugin version remain covered by the single package-level Ed25519 signature plus the signed file hash list; Skills are not separately signed packages.

`nexus.fullstack` is the first-party target-composition reference App. It deliberately declares all three optional target classes: an isolated custom frontend, a sandboxed Backend lifecycle target using only App Storage, and a Workspace-local Runner target. It exists to keep the full target lifecycle continuously exercised without moving Host security primitives into plugin code.

An App that needs a completely different product experience can declare `targets.frontend`. Nexus then gives the whole App content area to that isolated iframe. Custom frontends import the Nexus-hosted SDK from the isolated Plugin origin:

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
pnpm build:release plugins/nexus.agent /tmp/nexus-plugin-key.pem .dist https://example.invalid/releases/v1.0.0
```
