# Packaging and release

## Build a VSIX

Run:

```bash
npm run package
```

The script invokes `@vscode/vsce` and packages the extension according to `package.json` and `.vscodeignore`.

## Files required at runtime

The VSIX must contain:

- `out/` compiled extension JavaScript;
- runtime dependencies from `node_modules/`;
- `media/` icons;
- `webview/home.html`;
- `webview/workbench.html`;
- package metadata and license files as required by VS Code packaging.

The external HTML templates are runtime assets. Excluding `webview/` produces an installed extension that cannot render its pages.

## Files intentionally ignored

`.vscodeignore` excludes development-only content including:

- `.vscode/`;
- `.git/`;
- `.github/`;
- `test/`;
- `scripts/`;
- `src/`;
- `tsconfig.json`;
- generated `*.vsix` files.

Do not exclude `node_modules/` wholesale: native database drivers are loaded at runtime by the extension.

## Release checklist

1. Update the version in `package.json`.
2. Update user-facing documentation and changelog material if maintained externally.
3. Run `npm run lint`.
4. Run `npm run lint:types`.
5. Run `npm run compile`.
6. Run `node --test test/*.test.mjs` or `npm test`.
7. Run `npm run audit:runtime` and review advisories.
8. Build the VSIX with `npm run package`.
9. Inspect package contents with `npx --yes @vscode/vsce@3.9.2 ls`.
10. Install the VSIX in a clean VS Code profile and test the first-connection workflow.

## Versioning

The VS Code extension version comes from `package.json`. The VSIX filename and marketplace metadata follow that version. Keep version changes synchronized with release notes and documentation.
