# Catalog

`catalog.json` is generated for every release by `scripts/build-catalog-release.mjs` after all first-party plugin packages have been signed. `catalog/official-publisher.json` is the committed public trust metadata for Nexus first-party releases; `scripts/check.mjs` derives its Ed25519 key id from `publicKeyPem` and rejects any mismatch.

The production Nexus Host pins the same official publisher key id/public key. During release, `build-catalog-release.mjs` derives that identity from `NEXUS_AGENT_PLUGIN_SIGNING_KEY_PEM` and rejects a mismatch. Generated publishers project only `keyId`, `label`, and `publicKeyPem`; the local metadata's `schemaVersion` is not a catalog publisher field.

Package entries publish exact `sdkVersion: "1"` and `nexus.minVersion/maxVersion` from `nexus-compatibility.json` as download-time compatibility metadata. Signed manifests use the rebuilt Host's exact field set and explicit nullable `frontendEntry`/`backendEntry`; they do not repeat the catalog-only Nexus range. Package identity, size/SHA-256, Ed25519 signature, signed file list, entry paths, and Skills are checked again by the Host. Signature verification never grants execution permission. Version 1.0.1 replaces neither the content nor the trust identity of already published 1.0.0 packages.
