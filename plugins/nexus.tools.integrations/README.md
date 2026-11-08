# Integration tools

This SDK 2 package contributes seven MCP/ACP model tools. Its signed manifest owns model descriptions, input schemas,
discovery metadata and exact Host operation allowlists. Local decoders validate model arguments, convert `integrationId`
to the canonical domain `id` and materialize complete typed requests. Each tool uses a fixed `mcp.*` or `acp.*` operation.

MCP catalog and invocation responses are projected field by field and marked as untrusted model content. An
`input_required` response exposes only the Host-issued opaque continuation state and input request JSON; the package
preserves that state unchanged on the next invocation. It never retries a refused, failed or unknown invocation.

The Host owns authorization, approval, exact configuration versions, credentials, continuation ownership and consumption,
remote processes, resources and the operation journal. The package receives no endpoint credential or process handle.
Ordinary model result text cannot declare trusted effects or loaded tools.

From the repository root:

```sh
node plugins/nexus.tools.integrations/build.mjs
node --test plugins/nexus.tools.integrations/tests/logic/integrations.native.test.mjs
```

The logic suite covers all seven canonical requests, catalog projection, MCP continuation, ACP argument validation,
failure and cancellation. It also runs the package entry with the published SDK manifest/RPC readers and checks that
malformed Host replies and mismatched operations are rejected. It uses synthetic typed Host responses and does not
establish real provider, remote execution or approval behavior. `backend/index.mjs` is a bundled build artifact containing
only this package and its published SDK dependencies.
