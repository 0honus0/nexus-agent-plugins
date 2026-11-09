# Nexus Agent Plugins

Independent signed packages for [Nexus Terminal](https://github.com/0honus0/nexus-terminal). This repository owns App algorithms, tools, protocol services, settings pages and Chat UI. The Host owns authentication, current authority, approvals, durable Operations, model/network/SSH I/O and resource cleanup.

## SDK and composition

Packages use manifest 4 and public SDK 4. `sdk/nexus-terminal-shared-4.0.5.tgz` supplies compiled contracts, `sdk/backend-v4.mjs` supplies the standalone backend adapter, and UI imports the Host runtime `/sdk/frontend-v4.mjs`. No private Host source or checkout participates in plugin builds. See [SDK distribution](sdk/README.md).

An App registers one complete asynchronous `run(input, context)` handler through `definePlugin`. It owns model calls, tool discovery, parallelism, context, checkpoints, suspension and completion. The Host does not run fixed phases or assume every App needs a model. `nexus.agent` owns the default chat/image algorithm; its optional tools and UI are selected by the user, rather than frozen into App code dependencies.

Manifest `contributions` declares App entry/UI contract, boolean tool/service availability, an optional UI contract, settings schema and Skills. Callable definitions and handlers are registered at activation. Registry discovery returns summaries; describe/bind/invoke retain exact instance, schema and generation identity. Tools, services and App calls share this registry and the Operation owner. Runtime dependency scopes can react to provider readiness without business polling. Installation, instance selection, configuration, activation and grants are separate facts.

## Packages

| Package                    | Responsibility                                                                          |
| -------------------------- | --------------------------------------------------------------------------------------- |
| `nexus.agent`              | Complete default App loop, chat/images, model reasoning, history, titles and compaction |
| `nexus.ui.chat`            | Chat UI, virtual history, files/GIF, tools, Memory and resource controls                |
| `nexus.tools.remote`       | Remote shell/jobs, files, projects, Docker and diagnostics                              |
| `nexus.tools.browser`      | Browser tool definitions and observation composition                                    |
| `nexus.tools.agent`        | Discovery, Skills, Memory, artifacts, context and collaboration tools                   |
| `nexus.tools.integrations` | Model-facing adapters consuming selected MCP/ACP services                               |
| `nexus.services.mcp`       | Official MCP SDK, per-Run protocol state, inventory, continuations and settings         |
| `nexus.services.acp`       | Official ACP SDK, remote process, inner approvals and settings                          |

Each package may contribute multiple purposes. Connection destinations and secrets remain separate Host-managed bindings. A service rebinds I/O to the current invocation; it cannot retain an old caller's authority. Schema replacement invalidates old bindings, never silently reroutes them. Resources belong to the actual Run/instance; definite cancellation before dispatch differs from an unknown external effect.

## Validate and build

Local development, Validate and publication use the exact Node version in `.node-version`. Interoperability verifies that the selected Host uses the same Node version.

```sh
pnpm install --frozen-lockfile
pnpm run build
pnpm run check
pnpm test
node scripts/check.mjs /path/to/third-party-package
```

Each directory under `plugins/` owns its `test` command. `pnpm test` runs repository/signature/composition tests and then every workspace plugin's behavior suite, including Chat UI history and its actual SDK request adapter. The repository check rejects an official plugin without a test entry, and an independent package release reruns that package's tests. Add behavior tests alongside every new plugin; Full Agent interoperability and plugin business browser tests belong to this repository and consume the exact successful Nexus Terminal Host test artifact; generic Host safety remains in Nexus Terminal. See [test ownership and execution](tests/README.md).

`templates/fullstack` demonstrates a model-free App with its own UI and private storage. `templates/project-inspection` demonstrates a workflow App calling selected remote tools. Both build from the same public SDK and remain outside the default product catalog. Copy a template, assign its own package ID and publisher, and use the ordinary validation/signing pipeline.

## Independent publication

```sh
node scripts/build-release.mjs plugins/nexus.tools.remote /secure/key.pem .dist/remote https://example.invalid/remote-v2.0.0
node scripts/verify-package.mjs .dist/remote/nexus.tools.remote-2.0.0.tar /secure/public-key.pem
node scripts/build-catalog-release.mjs .dist/catalog.json .dist/remote/nexus.tools.remote-2.0.0.release.json
```

Archives sign the original manifest and file hashes under `NEXUS_AGENT_PLUGIN_V4` using Ed25519. Only declared runtime assets, documentation and Skills enter the archive. Different content requires a new package version; existing archives/descriptors cannot be overwritten. Publisher secrets are external to the repository.

1. Change a package, bump its manifest version, and verify compatibility and any true code dependencies.
2. Push and wait for the complete `Validate` workflow on the exact source SHA: package quality and all eight Host interoperability/browser shards must succeed. Release checks this workflow result; there is no legacy single-job gate.
3. Create a draft release. Run `Release package` for each changed package and that release tag. It verifies repository-wide immutable identities and uploads only missing matching assets; it does not publish the draft.
4. Publish the package assets. Run `Aggregate catalog` with existing catalog URLs, the new descriptor URLs, and the recommended App IDs. Aggregation verifies original signed archives and retains prior versions/URLs; it never rebuilds packages.
5. Publish the new catalog after verification. A compatible tool, service or UI update does not require a new App or Host build. New privileged Host capabilities still require Host support.

For local acceptance, `node scripts/build-staging.mjs <artifact-directory> <development-private-key.pem> --include-inspection --base-url http://127.0.0.1:3003/` creates a new, explicitly unofficial staging generation with immutable prerelease archives. Do not publish a development key or describe this as an official release. Source/build, package tests, actual Host installation and browser acceptance are separate evidence.

## Required plugins on Agent enable

A signed manifest may opt in with `requiredOnEnable: true`; absence or false means optional. Catalog generation copies this field from the verified archive and rejects descriptor tampering. Nexus Agent and Nexus Chat UI opt in; tools and protocol providers remain optional. The Host discovers the complete trusted required set without package-ID rules, prepares all packages, reuses existing installations and composes Apps/UI before enabling Agent. Existing App grants and enabled states are preserved. Required metadata is not a code dependency or execution authorization; use contribution contracts and real dependency declarations for those relationships.
