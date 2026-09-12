# Local development

## Prerequisites

- Node.js 20 or 22 is recommended.
- npm must be available.
- VS Code is recommended for launching the Extension Development Host.
- Native build tools may be required by database packages.

## Bootstrap

From the repository root:

```bash
npm run bootstrap
```

This installs dependencies with development dependencies included and approves the native install scripts configured by the project.

## Launch the extension

Open the repository in VS Code and press `F5`. A new Extension Development Host opens with Queryable loaded. Use the Queryable Activity Bar icon in that window, not the original development window.

## Watch TypeScript

In a terminal, run:

```bash
npm run watch
```

Then reload the Extension Development Host after source changes. The watch process writes compiled files to `out/`.

## Compile once

```bash
npm run compile
```

The compile script checks that required build dependencies exist, then runs TypeScript compilation. It does not install dependencies or access the network.

## Format and lint

```bash
npm run format
npm run lint
npm run lint:types
```

The type-safety script rejects explicit unsafe `any` and `unknown` tokens in source after removing comments. ESLint checks the repository's TypeScript and JavaScript code.

## Working on webview templates

Edit `webview/home.html` or `webview/workbench.html` directly. Keep:

- the existing CSP structure;
- nonce-bearing scripts;
- runtime placeholders;
- message command names;
- escaping for dynamic values;
- keyboard and focus behavior.

The TypeScript host reads these files at runtime from the extension path, so they must be included in a VSIX.

## Debugging

Use the Extension Development Host's **Developer: Toggle Developer Tools** for webview console errors. Use the original VS Code window's **Help: Toggle Developer Tools** for extension-host diagnostics. Set breakpoints in TypeScript after compilation and inspect the extension host debug console.
