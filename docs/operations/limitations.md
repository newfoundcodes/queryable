# Limitations and behavior

This page records behavior that is easy to misinterpret as a bug.

## No PDF export

PDF export is intentionally removed. The supported formats are JSON, CSV, and HTML.

## Display values are strings

The shared UI model represents displayed cell values as strings. This keeps rendering and export consistent, but type-specific details such as binary encodings, date formatting, and null representation depend on the adapter.

## Table editing requires row identity

Queryable does not guess a row identity from arbitrary column values. Without primary-key information, the table remains read-only through the cell editor.

## Routine support differs by engine

SQLite and D1 do not expose stored procedures. DuckDB macros are treated as routines. Other engines depend on catalog visibility and permissions.

## Query execution is driver-specific

Queryable provides one editor, but SQL grammar, multiple-statement behavior, transaction behavior, result-set behavior, and error text are determined by the selected database and driver.

## SSH requires TCP

The built-in tunnel forwards TCP. It cannot tunnel a database Unix socket through the current connection model.

## Oracle and Db2 certificate limitations

The current form rejects client key and client certificate paths for Oracle and Db2. Their TLS configuration is passed through driver-specific connection properties instead.

## Verify Identity through SSH

Oracle and Db2 cannot combine `verify-identity` with Queryable's built-in SSH tunnel because the TLS endpoint is local from the driver's perspective. Use direct connectivity or `verify-ca` through the tunnel.

## Metadata is permission-sensitive

The Workbench can show only schemas and objects returned to the current database user. An empty or incomplete explorer may be a permissions result, not missing data.

## Local files remain external

SQLite and DuckDB files are referenced by path. Queryable does not copy, back up, synchronize, or include those files in a VSIX.
