# FAQ

## Does Queryable install my database?

No. It installs database client drivers needed by the extension. You still need a database server, local database file, or Cloudflare D1 account.

## Are passwords stored in the workspace?

No. Saved connection metadata is stored in VS Code global state. Passwords, D1 tokens, SSH passwords, and SSH key passphrases are stored separately in VS Code SecretStorage when retained.

## Can I use a Unix socket with every database?

No. PostgreSQL, CockroachDB, MySQL, and MariaDB support socket paths in the current model. SQL Server, Oracle, and Db2 require TCP. SSH tunneling also requires a TCP database endpoint.

## Why is my table read-only?

Cell editing requires primary-key metadata and a usable row identity. A keyless table, view, virtual table, or driver limitation can make a table read-only.

## Can I export a PDF?

No. PDF export was removed. Use JSON, CSV, or HTML.

## Does Run always open a new tab?

No. **Run** reuses the active query-result context where possible. Use **Run (New Tab)** when you want a separate result tab.

## Does Queryable run SQL in a transaction automatically?

No. Transaction behavior comes from the SQL and database driver. Use explicit transactions where appropriate.

## Why can I see a table but not its routine definition?

Routine visibility depends on database permissions, engine catalogs, and adapter support. SQLite and D1 do not provide stored procedures; DuckDB exposes macros instead.

## Where are the webview HTML files?

They are `webview/home.html` and `webview/workbench.html`. They are external runtime templates and must be included in the VSIX.

## What should I run before opening a pull request?

Run:

```bash
npm test
npm run package
```

Then inspect the VSIX contents and manually test the relevant UI or adapter behavior.
