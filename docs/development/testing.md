# Testing and quality

## Full test command

Run:

```bash
npm test
```

This runs the unsafe-type check, TypeScript compilation, and all `test/*.test.mjs` files using Node's built-in test runner.

## Individual quality checks

```bash
npm run lint
npm run lint:types
npm run compile
node --test test/*.test.mjs
```

The CI workflow runs the checks individually so failures identify the stage clearly.

## Test style

The repository includes source-oriented tests that inspect the generated host/template composition and behavior-sensitive source paths. This is particularly important for the external webview templates: a change in `webview/home.html` or `webview/workbench.html` can alter runtime behavior even when the TypeScript host file is unchanged.

When changing behavior:

1. Add a focused test for the new or corrected behavior.
2. Update source-loader tests when a template moves or a placeholder changes.
3. Run the full test command.
4. Manually exercise the Extension Development Host for database-driver and webview behavior that cannot be covered without live services.

## Manual test checklist

### Connections

- Open the view.
- Create each relevant connection kind.
- Validate missing required fields.
- Test a valid connection.
- Save, edit, reconnect, and delete a saved connection.
- Verify secrets are not included in saved metadata.

### Workbench

- Refresh metadata.
- Switch schemas.
- Search objects.
- Open a table, routine, and query result.
- Run a query in the current tab and a new tab.
- Paginate and search table rows.
- Edit a primary-key table cell.
- Confirm unsaved-edit protection.
- Export JSON, CSV, and HTML.
- Close the Workbench and verify cleanup.

### Network behavior

- Direct TCP connection.
- Unix socket where supported.
- TLS modes required by the environment.
- SSH password and private-key authentication.
- SSH plus a TCP database endpoint.

## CI

`.github/workflows/ci.yml` runs on Node.js 20 and 22 for pushes to `main`/`master` and pull requests. It installs with `npm ci`, runs linting, unsafe-type validation, compilation, tests, and VSIX packaging, then uploads the VSIX from the Node.js 22 job.
