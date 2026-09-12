# Catalog

`catalog.json` is generated per release by `scripts/build-release.mjs` after the plugin package has been signed. The catalog is a discovery document only; Nexus Terminal still requires the publisher key to be explicitly trusted and verifies package SHA-256, size, Ed25519 signature, and file hashes during installation.
