# Settings UI components

This source belongs to the independent plugin repository. MCP and ACP settings bundle these controls and theme styles into their own signed frontend assets. These are static Vue components, reused from the repository-owned chat UI; no Host source, generated Host snapshot, or second browser SDK is imported.

Each settings entry owns its form and its versioned data decoder. The Host owns authentication, App/package scope, credentials, resources and the outer settings dialog. This directory does not interpret configuration schemas or generate forms.
