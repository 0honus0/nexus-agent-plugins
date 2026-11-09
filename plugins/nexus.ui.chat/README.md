# Nexus Chat UI

This directory is the source owner of the complete official chat interface. Edit `src/` here, then build and release this UI package independently of Nexus Terminal. No Host checkout, source snapshot, copy command or private Host import participates in the build.

`src/features/agent` owns conversation history, model and reasoning controls, tool and approval presentation, Memory review, attachments, resource panels and artifact previews. The UI components, preview implementations, theme styles and translations used by this package are local build dependencies under `src/` and change with this UI release. They keep the original interface and styles.

Authentication, trusted approval confirmation, cross-App file selection, transport, resources and package lifecycle remain in the Host. This interface consumes typed `@nexus-terminal/shared` contracts and the Host's public `/sdk/frontend-v4.mjs` runtime. Vite keeps `nexus:frontend-sdk` external and emits that URL; the ambient declaration refers to the module factory and error constructor types owned by Shared. There is no frontend runtime npm package, runtime archive or Host source import in this build. Its version 1 checkpoint is strictly decoded by `src/features/agent/chat-ui/checkpoint.ts`; the Host only stores the opaque versioned payload in this App/UI scope.

After installing the repository's pinned Shared archive and dependencies, run:

```sh
pnpm --dir plugins/nexus.ui.chat test
pnpm --dir plugins/nexus.ui.chat check
pnpm --dir plugins/nexus.ui.chat build
```

The build writes UI assets to `frontend/` and provenance to `SOURCE-MANIFEST.json` from current local sources and the Shared archive, with the external Host runtime URL recorded separately. The manifest records what was built; it is generated output, not a frozen source input. Signing and catalog release use the repository release commands.

The `tests/` suites exercise transcript identity, paged history, malformed-page atomicity, request failure outcomes and subscription cleanup against the actual UI modules. The repository-wide test command includes them; signed installation and browser interaction are verified by Host E2E.

Automatic conversation restoration preserves an already opened narrow-screen drawer. Explicit thread selection still dismisses the drawer.

Tool summaries refresh with the final durable Run snapshot. Stopping a completed Run subscription preserves same-thread reads; switching or removing a thread still rejects late snapshots. This is covered by deterministic composable tests with virtual timers.
