# Default Agent App

This package owns the complete default Agent algorithm. `src/run.mjs` is the SDK4 `run(input, context)` handler; `src/run-state.mjs` strictly decodes its private checkpoint state. No fixed Host phases, copied Backend source or global Run state are used.

The loop handles chat and image models, reasoning selection, selected SSH/Skill metadata, attachments, prior conversation, lazy tool exposure, tool results, title generation and context compaction. Checkpoints retain exact pending requests and bindings. Resume reuses original operation keys and receipts; it never restarts the whole task or automatically repeats an unknown effect. A definite predispatch cancellation remains cancellation.

The Host independently validates current grants, model requests, targets, approvals, budgets and actual effect receipts. Signed package instructions and retrieved content never grant permission. UI and optional tools/services are selected providers rather than signed mandatory dependencies. Settings use the same Host configuration owner for users and authorized Agent writes.

Build from the repository root with `pnpm run build:app`. The output includes backend runtime, plugin settings assets, manifest, documentation and Skills. Signing and independent publication use the repository pipeline. Host/browser acceptance is required separately from source builds and package tests.
