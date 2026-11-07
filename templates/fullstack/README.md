# Full-stack SDK template

This template provides a model-free SDK4 App, a private data namespace and its own UI contract. Its runtime is built using `scripts/build-templates.mjs` and the public `sdk/backend-v4.mjs`; the isolated UI imports `/sdk/frontend-v4.mjs` from the Host. No private Host source or default Agent dependency is required.

Assign a new package ID, namespaces, entry/contract names and publisher before using the ordinary check, build-release and verify-package commands. App composition, UI selection and grants are separate Host steps. Storage uses explicit CAS and operation keys; a lost response does not authorize replay with a new key. Source closure and package verification do not replace actual Host installation and browser acceptance.
