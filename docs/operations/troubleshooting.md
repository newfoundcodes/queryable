# Troubleshooting

## Queryable does not appear in the Activity Bar

Try **Developer: Reload Window**. Confirm the extension is enabled and that the installed VSIX is the expected version. If it remains absent, inspect **Help: Toggle Developer Tools** for activation or webview errors.

## The connection form rejects my values

Read the validation message and check the matching rule:

- network connection: name, host/socket, username, and valid port;
- SQL Server, Oracle, Db2: TCP host, not a Unix socket;
- Oracle: service name is required;
- Db2: database name is required;
- key/certificate TLS: both client key and client certificate;
- SSH: TCP database endpoint plus complete SSH credentials;
- D1: Account ID, Database ID, and token;
- SQLite/DuckDB: database file.

## Connection test fails

Separate the problem into layers:

1. **Reachability**: can the VS Code machine or SSH host reach the target host and port?
2. **Protocol**: does the selected Queryable kind match the server?
3. **Authentication**: is the username/password or token valid?
4. **Database identity**: is the database, catalog, service name, or D1 ID correct?
5. **TLS**: does the mode and certificate material match the server?
6. **Permissions**: can the user read metadata and the requested table?

## Monaco editor is blank or missing

Queryable provides a plain-text fallback. If Monaco should be available, verify that:

- `monaco-editor` is installed;
- the packaged VSIX contains `node_modules/monaco-editor/min`;
- `webview/workbench.html` is included in the VSIX;
- the template still contains the `{{MONACO_ROOT}}` placeholders;
- the webview CSP has not blocked the Monaco loader;
- the extension host console does not report a resource-root or URI error.

When testing a local checkout, run `npm run compile` or `npm run watch` before launching the Extension Development Host.

## Object explorer is empty

Refresh metadata and select another schema. If it remains empty, check database permissions for schema and table catalog queries. Some engines return only objects visible to the current user.

## A routine definition is unavailable

The object may not be a supported routine type, the current user may lack definition privileges, or the database may not expose source text through the adapter. SQLite and D1 do not provide stored procedures; DuckDB uses macros instead.

## A table is read-only

Queryable needs usable primary-key metadata and a row identity for safe cell editing. Views, keyless tables, virtual tables, and driver-limited metadata can remain read-only. Use an explicit SQL statement if your database supports a safe update path, and verify its predicate first.

## A cell update fails

Check that:

- the row still exists;
- the primary-key values have not changed;
- the user has update permission;
- the table is not read-only or a non-updatable view;
- the connection session is still active;
- the new value has the correct database representation.

Refresh the table after resolving the issue.

## Export does not start

Select the Export button attached to the table page or query result you intend to export, then choose a format. Queryable exports JSON, CSV, and HTML only. Check the VS Code save dialog and filesystem permissions if the file cannot be written.

## Saved password or D1 token is missing

Saved metadata and secrets are separate. If VS Code SecretStorage was cleared, moved, disabled, or restored from a different profile, edit the connection and enter the secret again. Do not place the secret in the connection name or database field.

## Native module installation fails

Run:

```bash
npm run bootstrap
```

Use a supported Node.js version, install the system build prerequisites required by the failing package, and inspect the first native compilation error. The compile script intentionally does not silently install dependencies or access the network.

## VSIX works locally but not after installation

Inspect the package contents:

```bash
npx --yes @vscode/vsce@3.9.2 ls
```

Confirm that the VSIX contains `out/`, runtime `node_modules/`, `media/`, and both files under `webview/`. The `.vscodeignore` intentionally excludes source, tests, scripts, CI files, and TypeScript configuration, but not runtime dependencies or webview templates.
