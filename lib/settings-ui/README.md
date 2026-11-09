# Settings UI components

This source belongs to the independent plugin repository. MCP and ACP settings bundle these controls and theme styles into their own signed frontend assets. These are static Vue components, reused from the repository-owned chat UI; no Host source, generated Host snapshot, or second browser SDK is imported.

Each settings entry owns its form and its versioned data decoder. The Host owns authentication, App/package scope, credentials, resources and the outer settings dialog. This directory does not interpret configuration schemas or generate forms.

SettingsPage keeps the form inset at the shared select's 12 px collision padding so a full-width dropdown stays aligned inside narrow, scrollable Host frames. Its reload/save action group is right aligned, with Save last. The Host connection editor is separate from ordinary plugin configuration; an App-only manifest's transport capability ceiling does not create connection fields.
