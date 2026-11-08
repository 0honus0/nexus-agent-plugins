# Browser tools

This SDK 4 package contributes sixteen model tools. Its signed manifest owns the model descriptions, input schemas,
discovery metadata and exact Host operation allowlists. Local inputs validate model arguments and materialize defaults;
`src/operations.mjs` converts each tool into a fixed, typed `browser.*` domain operation and projects its model result.

`browser_snapshot` composes semantic snapshot, optional screenshot and optional console observations in that order. Each
observation has its own capture time. A failed or cancelled observation stops the sequence without retrying earlier
operations. Snapshot node references remain Host-issued values.

The Host owns current authorization, approval, target versions, browser sessions, URL policy, artifacts, resource lifetime
and the operation journal. The package receives no browser connection, credential or technical handle. Browser content
remains untrusted; package metadata and ordinary result text cannot grant authority or declare trusted artifact effects.

From the repository root:

```sh
node plugins/nexus.tools.browser/build.mjs
node --test plugins/nexus.tools.browser/tests/contract/browser.native.test.mjs
```

The logic suite covers all sixteen canonical requests, defaults, explicit result projection, snapshot sequencing,
cancellation and model validation. It also runs the package entry with the published SDK manifest/RPC readers and checks
that malformed Host replies and mismatched operations are rejected. It uses synthetic typed Host responses and does not
establish real browser or approval behavior. `backend/index.mjs` is a bundled build artifact containing only this package
and its published SDK dependencies.

CDP targets are configured per plugin instance using the installed package’s Settings button. The settings page follows the Host language and theme; only administrators can change endpoint trust and URL allowlists. Saving retires the exact instance’s existing sessions.
