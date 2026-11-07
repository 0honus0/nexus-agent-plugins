# Agent tools

This independent SDK 4 package owns twenty-two model tools for discovery, skills, images, collaboration, checkpoints, artifacts, memory and captured result pages.

`src/input.mjs` and `input-definitions.json` own model schemas, validation and defaults. `perform.mjs` adapts those inputs to finite typed Host operations. `discovery-read.mjs` reads the complete coherent live catalog before `discovery.mjs` applies exact-name/keyword matching and multilingual Fuse search, followed by Host activation. `content.mjs` owns image catalog pagination and bounded single-item artifact/result aggregation. `retrieval.mjs` owns Skill term matching and Memory relevance scoring/ranking. Skill metadata is read from bounded `skills.catalog` pages. Memory reads coherent `memory.retrieve` candidate pages, retains only ranking metadata, and submits ordered versioned references for Host selection; the Host rechecks the original candidate fingerprint and enforces the frozen model-result budget. Text artifact creation encodes UTF-8 to Base64 in the package and invokes one atomic artifact import.

The Host owns current authorization, independent domain approval, App resources, model budgets, actual Run and Child identities, captured-result provenance and cleanup. Model output cannot declare trusted artifacts, loaded tools, targets or Child lifecycle state. The package does not invoke another model tool by name.

Build with `node plugins/nexus.tools.agent/build.mjs` from the repository root. Run the package algorithm checks with `node --test plugins/nexus.tools.agent/src/algorithms.test.mjs`. The backend bundle includes the public SDK decoder and the package-owned algorithms; it does not import the Nexus application workspace.

Signing, catalog assembly and releases belong to the repository release workflow and are separate from this package build.
