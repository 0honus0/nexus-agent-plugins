# Public SDK distribution

This SDK4 release pins `nexus-terminal-shared-4.0.5.tgz`, `backend-v4.mjs` and the Host-served `/sdk/frontend-v4.mjs`. Shared owns public contracts and strict codecs; backend/frontend adapters expose only scoped protocol capabilities. Earlier SDK archives remain immutable historical inputs and are not runtime fallbacks. The workspace override, consumer dependencies and lockfile must select the same archive; changing only a dependency does not override pnpm's workspace policy.

The backend asset is built from `packages/backend/src/modules/agent/plugins/sdk/index.ts` by its public SDK build. The frontend asset is built from `packages/frontend/src/features/agent/plugins/sdk/index.ts`. Plugin builds bundle the pinned backend adapter and keep `nexus:frontend-sdk` external. No Host private import, source copy or runtime npm installation is required.

After building public Shared, run `node scripts/export-sdk.mjs /path/to/built/public-package /path/to/LICENSE [--candidate-version sourceVersion-prerelease] [public-dependency-package]...`. The exporter records per-archive origin and rejects different bytes for an existing package/version. Copy only the matching public backend asset when releasing its SDK; update consumer dependencies and lockfile together. Ordinary plugin CI never builds the Host or exports an SDK.

App handlers receive directory, model, content, storage, configuration, checkpoint, transport and governed Host-operation capabilities. Identity, authority ceilings and lifecycle belong to the Host. Backend entry points use `definePlugin`; there are no fixed App phases or legacy `agent`/`execution` exports. Frontend clients use a scoped MessagePort and the same public runtime/decoders for App and Settings surfaces.

Shared 4.0.5 adds optional signed/catalog `requiredOnEnable` metadata and the transient `plugins/onboarding` enable-plan protocol. The former single recommended-App API is removed. SDK runtime API remains 4; new archives/descriptors require the Host codec that recognizes this metadata. Existing published archives remain immutable; do not patch their manifests in place.
