<div align="center">
  <img src="https://github.com/newfoundcodes/queryable/blob/main/media/queryable.png?raw=true" width="128" />
  <h1>Queryable</h1>
  <p>
    <a href="https://github.com/newfoundcodes/queryable/actions"><img src="https://github.com/newfoundcodes/queryable/actions/workflows/ci.yml/badge.svg" alt="Build Status"></a>
  </p>
</div>

Queryable is a typed, multi-database query workbench for Visual Studio Code. It provides a connection manager, database object browser, SQL editor, table viewer, row editing, routine definitions, query-result tabs, and data export from one VS Code activity-bar view.

The extension is designed for developers who want database access beside their source code without switching to a separate desktop client.

## Features

- Manage multiple saved database connections from the Queryable activity-bar view.
- Test a connection before opening a workbench.
- Edit, update, delete, and reconnect saved connections.
- Browse schemas, tables, views, procedures, functions, and DuckDB macros where supported.
- Search database objects by name.
- Open tables with paginated results and text search.
- Run SQL in a Monaco-powered SQL editor.
- Reuse the active query-result tab or open each query result in a new tab.
- View procedure, function, and macro definitions in Monaco.
- Edit table cells when the table has a usable primary-key identity.
- Protect unsaved cell changes with a confirmation dialog.
- Export table pages and query-result pages as JSON, CSV, or HTML.
- Connect through SSH tunnels for supported network databases.
- Configure TLS behavior and certificate paths for supported network databases.
- Store credentials using VS Code SecretStorage when the selected policy requires it.
- Support VS Code light, dark, and high-contrast themes through VS Code theme variables.

PDF export is intentionally not supported.

## Supported databases

| Database             | Connection mode             | Notes                                                    |
| -------------------- | --------------------------- | -------------------------------------------------------- |
| PostgreSQL           | Network host or Unix socket | Uses the `pg` driver.                                    |
| CockroachDB          | Network host or Unix socket | Uses the PostgreSQL adapter and protocol.                |
| MySQL                | Network host or Unix socket | Uses `mysql2`.                                           |
| MariaDB              | Network host or Unix socket | Uses the MySQL adapter and protocol.                     |
| Microsoft SQL Server | TCP host                    | Uses `mssql`; TCP is required by the current adapter.    |
| Oracle Database      | TCP host                    | Uses `oracledb`; service name is required.               |
| IBM Db2              | TCP host                    | Uses `ibm_db`; database name is required.                |
| SQLite               | Local database file         | Uses `sqlite3`.                                          |
| DuckDB               | Local database file         | Uses `@duckdb/node-api`; macros are exposed as routines. |
| Cloudflare D1        | Cloudflare HTTP API         | Requires an account ID, database ID, and API token.      |

Database support is implemented through the common `DatabaseAdapter` interface. Capabilities vary by engine. For example, D1 uses SQLite semantics and does not provide stored procedures, while SQLite and D1 do not expose a routine browser in the workbench.

## Requirements

For using the published extension:

- Visual Studio Code `1.96.0` or newer.
- Access to the target database or Cloudflare API.
- Appropriate database client libraries and permissions for the target system.

For developing Queryable:

- Node.js compatible with the project dependencies. Node.js 20 or 22 is recommended and used by CI.
- npm.
- Visual Studio Code is recommended for extension development.
- Native build tooling may be required by database packages such as `ibm_db`, `sqlite3`, and `ssh2` on some operating systems.

## Installation

### From a VSIX

Build a VSIX from the repository:

```bash
npm install
npm run package
```

Then install the generated `.vsix` file in VS Code using **Extensions: Install from VSIX...**.

### From source during development

Install dependencies and launch the extension host:

```bash
npm run bootstrap
```

Open the repository in VS Code and press `F5`. The extension development host will launch with Queryable loaded.

The `bootstrap` script installs development dependencies and approves the native install scripts configured by this project. If your npm version does not provide `npm approve-scripts`, install dependencies with the equivalent npm configuration for your environment and make sure the required native packages build successfully.

## Using Queryable

### Open the Queryable view

After activation, select the Queryable icon in the VS Code activity bar. The home view contains two tabs:

- **Saved Connections** lists existing connections.
- **New Connections** displays the supported database types.

Select a database type to open the connection form. A connection can be tested without saving it, saved for later, or opened immediately.

### Network connection fields

Network databases generally use these fields:

- Connection name.
- Database host or Unix socket path.
- Port.
- Username.
- Database or service name.
- Password storage policy.
- TLS mode.
- Optional client key, client certificate, or CA path where supported.
- Optional SSH tunnel settings.

The form validates required values before a connection is saved or tested. Oracle and Db2 require TCP hosts and do not support client key/certificate files through the current configuration. SQL Server, Oracle, and Db2 also require TCP hosts rather than Unix sockets.

### Password policies

Network connections expose three password policies:

- `keyring`: store the database password in VS Code SecretStorage.
- `ask`: prompt for the password when it is needed.
- `none`: do not store or reuse a database password.

SSH passwords and private-key passphrases are also stored through VS Code SecretStorage when supplied. Cloudflare D1 tokens are stored in SecretStorage because they are required for API requests.

Connection metadata is stored in VS Code global state. Secrets are kept separately in VS Code SecretStorage and are not written into the saved connection metadata.

### TLS modes

The network connection form supports:

- `preferred`: attempt TLS and fall back when the driver reports that TLS is unavailable.
- `disabled`: connect without TLS.
- `required`: require TLS.
- `verify-ca`: require TLS with certificate verification settings appropriate to the driver.
- `verify-identity`: require TLS and validate the endpoint identity where supported.

The built-in SSH tunnel forwards the database connection to a local endpoint. Because the database driver sees a local tunnel endpoint, Verify Identity cannot be combined with Queryable's built-in SSH tunnel for Oracle and Db2.

### Browse and query data

When a connection opens, Queryable loads database metadata into the explorer. Select a schema, search for an object, and open a table or routine.

Table views provide:

- Page navigation.
- Page-size selection.
- Text search across supported columns.
- Row refresh.
- Export of the current table page.
- Double-click cell editing when a primary-key row identity is available.

The Query panel supports Monaco SQL editing when Monaco loads successfully. A plain-text fallback editor remains available if Monaco cannot be initialized. Use `Ctrl+Enter` on Windows/Linux or `Cmd+Enter` on macOS to run a query in the active result tab. Use the adjacent **Run (New Tab)** action, or the corresponding shortcut, to open a separate result tab.

Query results retain result-set metadata, affected-row counts, duration, pagination, and export controls.

### Edit cells safely

Cell updates require a row identity based on primary-key columns. Tables without a usable primary key are displayed as read-only for cell editing. Queryable asks for confirmation before closing a cell editor with unsaved changes.

The update is sent through the active database adapter and the table page is refreshed after a successful write.

### Export data

Export controls are available from table pages and query-result pages. The current export formats are:

- JSON: ordered objects using the displayed column order.
- CSV: RFC-style quoting for commas, quotes, and line breaks.
- HTML: a standalone table document with escaped values.

Exports are written using the VS Code save dialog. The default filename is sanitized to remove path separators, control characters, and other invalid filename characters.

## Project architecture

Queryable has two main execution environments: the VS Code extension host and browser-like VS Code webviews.

```text
src/extension.ts
  ├─ HomeViewProvider
  │    ├─ connection lifecycle
  │    ├─ ConnectionStore
  │    └─ database session creation
  └─ WorkbenchManager
       ├─ webview panel lifecycle
       ├─ metadata and query messages
       └─ export and session cleanup

src/adapters/
  ├─ DatabaseAdapter contract
  ├─ database-specific adapters
  └─ adapter factory and SSH session wrapper

webview/
  ├─ home.html
  └─ workbench.html
```

### Extension host

The extension host owns credentials, database connections, filesystem dialogs, SSH tunnels, exports, and VS Code APIs. It communicates with the webviews using typed message unions in `src/types.ts`.

### Webview templates

The long Home View and Workbench documents are kept as external HTML templates in `webview/home.html` and `webview/workbench.html`. Each template contains its HTML, inline CSS, and inline browser JavaScript. The host loads the template and replaces a small set of runtime placeholders:

- `{{NONCE}}` for the Content Security Policy nonce.
- `{{CSP_SOURCE}}` for the VS Code webview resource source.
- `{{MONACO_ROOT}}` for the Monaco loader path.
- `{{TITLE}}` for the escaped connection title.
- Routine and search-label placeholders based on database capabilities.

This keeps the webview code in a reviewable HTML document while preserving the current runtime behavior and CSP model.

### Database adapters

Every adapter implements the operations needed by the workbench:

- Connect and close.
- Read database metadata.
- Fetch a table page.
- Read a procedure, function, or macro definition where supported.
- Execute SQL.
- Update a cell.

The factory selects an adapter from the saved connection kind and wraps network adapters with an optional SSH tunnel session.

## Repository layout

```text
.
├── media/                 Extension icons and media assets
├── scripts/               Build and type-safety checks
├── src/
│   ├── adapters/          Database adapter implementations
│   ├── export/            JSON, CSV, and HTML export builders
│   ├── ssh/               SSH tunnel implementation
│   ├── storage/           Saved connections and SecretStorage access
│   ├── ui/                VS Code providers and workbench host logic
│   ├── types.ts           Shared message and domain types
│   └── util/              Validation, SQL, and formatting helpers
├── test/                  Node-based source and toolchain tests
├── webview/               External Home and Workbench HTML templates
├── package.json           Extension manifest and npm scripts
├── tsconfig.json          Strict TypeScript configuration
└── .vscodeignore         Files excluded from the VSIX package
```

## Development commands

Install dependencies:

```bash
npm run bootstrap
```

Run ESLint:

```bash
npm run lint
```

Run the source type-safety check:

```bash
npm run lint:types
```

Compile the extension to `out/`:

```bash
npm run compile
```

Run the complete validation check:

```bash
npm run check
```

Run tests:

```bash
npm test
```

The test command runs the checks and then executes every `test/*.test.mjs` file with Node's built-in test runner.

Start TypeScript watch mode:

```bash
npm run watch
```

Format the repository:

```bash
npm run format
```

Create a VSIX package:

```bash
npm run package
```

Audit runtime dependencies:

```bash
npm run audit:runtime
```

Audit all dependencies, including development dependencies:

```bash
npm run audit:all
```

## Continuous integration

The GitHub Actions workflow validates pushes and pull requests. It runs on Node.js 20 and 22 and performs:

1. `npm ci` installation.
2. ESLint.
3. Unsafe-type validation.
4. TypeScript compilation.
5. The test suite.
6. VSIX packaging.
7. VSIX artifact upload from the Node.js 22 job.

The workflow is defined in `.github/workflows/ci.yml`.

## Packaging notes

The VSIX includes the compiled extension in `out/`, runtime dependencies from `node_modules/`, media assets, and the external templates under `webview/`. Development sources, tests, scripts, `.github`, `.vscode`, and TypeScript configuration are excluded through `.vscodeignore`.

The native database dependencies are intentionally retained in the package because the extension loads them at runtime. Do not add `node_modules/**` to `.vscodeignore` without first replacing the runtime dependencies with a compatible bundling strategy.

## Security considerations

- Never commit database passwords, Cloudflare API tokens, SSH passwords, or SSH private-key passphrases.
- Prefer the `keyring` or `ask` password policy over storing credentials in project files.
- Verify hostnames, ports, TLS modes, certificate paths, and SSH tunnel destinations before connecting.
- Treat SQL entered into Queryable as production SQL. The extension does not automatically make destructive statements safe.
- Query results and database metadata are displayed in a VS Code webview. Avoid opening untrusted content in contexts where it could be mistaken for trusted application UI.
- Webviews use Content Security Policy nonces. If the templates are modified, preserve the CSP placeholders and nonce attributes.
- The D1 adapter sends API requests to Cloudflare using the stored bearer token. Ensure that the configured account and database IDs are correct.

## Adding a database adapter

To add a database type:

1. Add the new `DatabaseKind` and connection configuration types in `src/types.ts`.
2. Add the corresponding draft type and message-compatible form fields.
3. Implement `DatabaseAdapter` in `src/adapters/`.
4. Add adapter selection in `src/adapters/factory.ts`.
5. Add validation rules in `src/util/validate.ts`.
6. Add saved-connection and SecretStorage handling in `src/storage/connectionStore.ts`.
7. Add the database card and dynamic form behavior in `webview/home.html`.
8. Add routine capability and label behavior in `webview/workbench.html`.
9. Add source tests for the adapter and connection form.
10. Run `npm test` and manually exercise connection, metadata, table, query, edit, and close flows.

Keep adapter-specific SQL in the adapter. Shared UI and host code should use the common adapter and message interfaces rather than branching on driver internals wherever possible.

## Troubleshooting

### Native dependency installation fails

Some dependencies include native components. Check the package's system prerequisites, confirm that the Node.js version is supported, and rerun:

```bash
npm run bootstrap
```

The compile script intentionally does not install dependencies or access the network. It reports missing build dependencies instead.

### Monaco does not load

Queryable provides a plain-text fallback editor. If Monaco is unavailable, check that:

- `monaco-editor` is installed.
- The `node_modules/monaco-editor/min` directory is present in the extension package.
- The Workbench template still contains the `{{MONACO_ROOT}}` placeholders.
- The webview Content Security Policy has not been weakened or malformed.

### A saved password is missing

Passwords and tokens are stored in VS Code SecretStorage, not in the saved connection metadata. If the secret was deleted, the connection must be edited or re-entered. D1 connections fail clearly when their stored API token is unavailable.

### SSH connections fail

Confirm the SSH host, port, username, authentication mode, private-key path, and passphrase. Queryable currently requires a TCP database host for SSH tunneling and does not tunnel database Unix sockets.

### A table cannot be edited

Cell editing requires primary-key information from the adapter. If a table has no primary key, or the driver cannot determine a usable row identity, Queryable keeps the table read-only.

## Contributing

Before submitting a change:

```bash
npm test
```

Keep changes focused, preserve the typed host/webview message protocol, add or update tests for behavior changes, and update this README when user-visible capabilities or development commands change.

Use conventional commit types where appropriate:

- `feat`: new functionality.
- `fix`: bug fixes.
- `refactor`: behavior-preserving code changes.
- `style`: formatting-only changes.
- `perf`: performance improvements.
- `docs`: documentation changes.
- `build`: dependency or packaging changes.
- `ci`: CI workflow changes.
- `test`: test changes.

## License

Queryable is licensed under the GNU Affero General Public License, version 3.0 or later, as identified by the project license metadata. See [`LICENSE`](LICENSE) for the complete license text.
