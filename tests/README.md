# Plugin tests

Each package owns `plugins/<id>/tests/` and its behavior index, `cases.json`. Use the package's `test` script for local checks. The repository root `pnpm test` runs Vitest package logic/UI state and Node package, repository and template tests once. It does not rebuild packages; run `pnpm build` first when changing distributed code. CI builds once before checking and testing.

- `logic/`: source algorithms, App scheduling and controlled frontend state.
- `contract/`: actual distributed SDK/package contracts, with privileged Host I/O substituted.
- `integration/`: real protocol SDK behavior against a controlled endpoint.
- Root `tests/repository/`: composition, signatures, immutable releases, localization and download behavior.
- Root `tests/templates/`: third-party template behavior.
- Root `tests/support/`: narrow shared fixtures; no second implementation of the Host.

Use `pnpm test:plugins`, `pnpm test:repository`, `pnpm test:tools`, `pnpm test:services` or `pnpm test:templates` for a selected layer. These are alternative selections; do not run all selections and the root suite in the same gate. `*.native.test.mjs` is the native runner suffix. Fixtures never enter automatic discovery.

`tests/cases/migration.json` records the old file hashes and new owners. Moving a test does not prove it passed. Full Agent interoperability and plugin business browser scenarios are owned here; nexus-terminal retains generic Host safety and lifecycle tests. Package-level tests use narrow controlled Host ports; the separate interoperability layer uses the real built Host and exact candidate archives. The interoperability layer currently discovers 54 testcases across Agent scheduling, tools, services and UI contracts. Browser coverage contains 70 scenarios under `tests/e2e/specs/<packageId>/`. Discovery counts describe scope, not a passing gate.

Retry and handshake policy tests use Node's native mock clock, preserving the actual threshold and call-count assertions. Real network, idle, backpressure and process-exit cases must retain their actual protocol conditions. No production timeout is shortened for test speed. Test reports and first failures belong to the invoking task's artifact directory; do not commit generated reports or packages.

The MCP service package owns the full tool/resource/prompt input-required map matrix, including all normalized state-only forms and malformed embedded request schemas. These execute the official protocol SDK directly. The Host keeps representative real governed transport and continuation round-trips; ordinary protocol input combinations do not create model Runs.

## Exact candidate Host interoperability

Build the plugin packages once with `pnpm build`, then run `pnpm prepare:interop <new-artifact-directory>` to sign a staging generation with a newly generated development key. This reuses the production package/release builders and never uses the official signing key.

Set `NEXUS_TEST_HOST_ROOT` to the built Host checkout/test artifact (with dependencies and its `tests/support/plugins/host-harness.mjs` API), `NEXUS_TEST_PLUGIN_SET` to the generated `staging-N` directory, and `NEXUS_TEST_ARTIFACT_DIR` to a fresh run directory. Execute `pnpm test:interop`. Missing artifacts fail immediately; no fallback to pinned releases and no silent skip. `pnpm test:browser` runs real plugin UI scenarios through the exact Host artifact's Playwright configuration and controlled fixtures; `pnpm check:browser` checks discovery and browser source types. `pnpm test:all` runs the ordinary suite, interoperability, browser checks and browsers. Build artifacts must be prepared beforehand. Validate pins a successful Host E2E source SHA and immutable application artifact, signs this plugin revision once, then runs every layer. A missing new Host harness fails explicitly; initial cross-repository rollout needs a successful new Host gate before plugin Validate can complete.

The plugin tests consume the Host's test-artifact entry point instead of importing implementation modules. It uses the ordinary publisher trust, repository, package validation, installation, composition, grants and isolated execution paths. Archives are served byte-for-byte; the candidate App is never copied into a re-signed fixture. `combination.json` records both source fingerprints (including uncommitted changes), Host compiled-output fingerprints, SDK/archive digests and exact package identities. Each scenario keeps its database and setup/execute/drain timings; failures and cleanup errors remain failures. UI installation is covered here, while iframe rendering/approval interaction remains a browser responsibility.

Use a distinct artifact directory per run. The Host and candidate fingerprints in `combination.json` are part of the result; a previous Host PASS does not validate a new combination. `tests/e2e/fixtures/task-projects/` is the sole owner of real task projects. Browser helpers are imported from the Host test artifact's `e2e/support/agent-host/`, not copied into this repository. No Playwright-to-Node test wrappers remain.
