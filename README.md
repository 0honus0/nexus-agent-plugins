# Nexus Agent Plugins

First-party installable Agent Apps for [Nexus Terminal](https://github.com/0honus0/nexus-terminal).

This repository owns distributable plugin source and release metadata. Nexus Terminal owns the Plugin SDK/protocol, package verification, App capability policy, Agent Runtime, Host UI, and target runtime implementation.

Permissions use the current Host capability contract only: `file.read/write/delete` and `shell.execute` are scoped to explicitly authorized SSH targets. Host grants use typed target selections; Plugin manifests continue to use manifest schema v1 and declare capability names, not persisted grants. No legacy permission aliases or grant conversion belongs in Plugin code. Approval mode does not override grants, target restrictions, hard-deny policy, or read-only authorization.

Capability declarations use the current Host's explicit grants for SSH files/commands, machine and Host inspection, Browser, integrations, Artifacts, context, memory, and cross-App intents. Skills require `context.read`; memory recall/proposal require `memory.read`/`memory.propose`. App-owned isolated storage does not require a separate resource grant. Declaring a capability never grants it. Ordinary marketplace installs start disabled with empty grants. On current Nexus hosts, confirming the Nexus Agent enablement guide explicitly installs, enables, and grants its declared capabilities; reusing an existing installation does not reset its permissions. Target restrictions and Run approval policy still apply.

## App composition

An Agent App is composed only from the parts it actually needs:

- `manifest.json` — exact current fields: `schemaVersion`, `id`, `version`, `displayName`, `sdkVersion`, `capabilities`, `intents`, `frontendEntry`, and `backendEntry`. SDK version is the literal string `"1"`; entry fields are explicit paths or `null`.
- `agent.json` — optional signed Agent contribution: `{ schemaVersion: 1, role, toolNames, beforeStep, tools }`. `toolNames: null` retains the granted Host catalog; an array narrows it. It never grants capabilities.
- `skills/` — optional model-facing Skills.
- `frontend/` — optional **full custom App surface**. A `null` frontend entry uses the Host's native Agent conversation surface.
- `backend/` — optional native Backend child target for App-owned background/state logic; it runs outside the Nexus Backend process through the bounded Backend Plugin protocol.

Targets are not a checklist. `nexus.agent` contains a concise signed role and exactly two signed Skills, `operations` and `developer`, and both entry fields are `null`. Nexus owns the conversation, Run, approval, Artifact, Browser, and SSH runtime. Obsolete `agents`, `agentSurface`, `targets`, and manifest-level `nexus` fields are not emitted or converted. Cross-App memory import is not advertised as a plugin intent.

Skill layout is single-source: every Skill is `skills/<slug>/SKILL.md`, with required `name` and `description`, and optional `license`, `compatibility`, `metadata`, and `allowed-tools`. The Skill version comes from the installed Plugin. The two Nexus Agent Skills use a short workflow: confirm the target, inspect, change within authorization, verify, and report evidence. Runtime enforcement remains in the Host. Full instructions are not injected automatically: the Host supplies current Skill metadata with every request; the model calls `skill_read` with its exact name/version/SHA-256 (`skill_search` remains available). Nexus rechecks the installed package and authorization. All Skills share the package-level Ed25519 signature and signed file list; they are not separately signed packages or capability grants.

`nexus.fullstack` is the first-party target-composition reference App. It declares both supported target classes: an isolated custom frontend and a native Backend child lifecycle target using only the bounded Backend Plugin protocol/App Storage SDK. Its signed contribution narrows model tools to `plugin_tool_call`, supplies a `beforeStep` context hook, and declares `backend_status`. The backend exports `agent(input, signal)` returning `{ text }`; context input has `kind/runId/stepIndex/prompt`, tool input has `kind/runId/stepIndex/operationId/name/argumentsJson`. `backend_status` accepts `{}` and reads only the App-owned status record. Hooks require `context.read`; tools require `plugin.invoke`, current grants, and per-call approval. Calls share the isolated instance lifecycle and are serialized; cancellation, timeout, upgrade, disable, or uninstall revoke the bound invocation. Unknown effects are fenced and never replayed.

An App needing a custom product experience sets `frontendEntry` to a path under `frontend/`. Nexus gives the App content area to an isolated iframe. Custom frontends import the Nexus-hosted SDK:

```js
import { connectNexusPlugin } from '/sdk/frontend-v1.mjs';

const nexus = await connectNexusPlugin();
const app = await nexus.request({ method: 'host.appInfo', params: {} });
const providers = await nexus.request({ method: 'agent.providers.list', params: {} });
```

The SDK proxies explicit App-scoped operations through `request`. Storage uses `valueJson`, `expectedVersion` (zero for an absent key), and a UUID `operationId`; failed/unknown writes are not replayed automatically. Backend activation receives `{ context, request }`, host replies are `{ ok, result/error }`, and `health` returns a boolean. Plugin code does not receive Nexus cookies, CSRF credentials, raw HTTP clients, database handles, or internal service objects. Run streaming remains available through `nexus.agent.runs.subscribe(...)`.

## Layout

- `plugins/` — first-party App source; each App contains its versioned `manifest.json` and only the optional targets/Skills it uses.
- `scripts/build-package.mjs` — reproducibly builds and Ed25519-signs one App package.
- `scripts/build-release.mjs` — convenience builder for one signed App package plus a single-package catalog.
- `scripts/build-catalog-release.mjs` — official release builder; signs every first-party App under `plugins/` with the same publisher identity and emits one multi-package `catalog.json`.
- `catalog/` — official publisher metadata and release/catalog documentation; generated release output is written to `.dist/`.
- `catalog/nexus-compatibility.json` — the single release-time Nexus compatibility range, included in catalog entries rather than signed manifests.

Private signing keys are never committed. Release automation expects `NEXUS_AGENT_PLUGIN_SIGNING_KEY_PEM` as a GitHub Actions secret.

## Local validation

```bash
corepack enable
pnpm install --frozen-lockfile
pnpm run check
```

Code follows the Nexus Backend formatting standard: tabs, single quotes, semicolons, 120-column wrapping, braces for control flow, and blank lines around functions/methods. JSON and YAML use two spaces. Run `pnpm run format` to apply it; `pnpm run check` enforces formatting, lint, and package validation in CI and before release.

To build the same multi-plugin catalog used by the official release workflow:

```bash
printf "%s" "$NEXUS_AGENT_PLUGIN_SIGNING_KEY_PEM" > /tmp/nexus-plugin-key.pem
pnpm build:catalog-release /tmp/nexus-plugin-key.pem .dist https://example.invalid/releases/v1.0.3
```

The command fails unless the private key derives the exact publisher identity committed in `catalog/official-publisher.json`.

Generated catalog entries include package version, exact SDK `"1"`, and the supported Nexus version range (currently 1.0.3–1.99.99). This range is a download-time preflight; the signed manifest identity, SDK, entries, capabilities, file hashes, and signature remain authoritative. The catalog's publisher objects contain only `keyId`, `label`, and `publicKeyPem`, not the local metadata's `schemaVersion`. Version 1.0.3 requires the updated Nexus 1.0.3 Host. Both Apps publish new immutable packages; older hosts cannot install this catalog version. Existing installations require explicit plugin upgrade. No conversion of older SDK or manifest formats is provided.

For a production publication, create a **draft GitHub Release** whose target is the current validated `main` commit, then run the `Release plugins` workflow with that draft release tag. A draft release does not create the Git tag yet, so manual `workflow_dispatch` releases intentionally check out `main`; the workflow then verifies that the checked-out SHA is still the current `main` commit and already has a successful `Plugin validation gate`. Verify `catalog.json` and both signed plugin tar assets on the draft, and only then publish the Release (which creates the tag when it does not already exist). Publish the Nexus production image after this catalog is live because the default official source resolves `releases/latest/download/catalog.json`.
