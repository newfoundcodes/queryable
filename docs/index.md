# Queryable

Queryable is a typed, multi-database query workbench for Visual Studio Code. It lets you manage connections, browse database objects, inspect tables, edit rows, write SQL, view routines, and export visible result data without leaving VS Code.

This documentation covers the complete product surface:

- installation and the first connection;
- every connection field, credential policy, TLS setting, and SSH option;
- the Connections view and Workbench in detail;
- SQL execution, result tabs, tables, pagination, editing, and exports;
- database-specific behavior for PostgreSQL, CockroachDB, MySQL, MariaDB, SQL Server, Oracle, Db2, SQLite, DuckDB, and Cloudflare D1;
- security, operational limitations, troubleshooting, and recovery;
- local development, testing, packaging, and adapter development.

## Start here

| Goal                                           | Recommended page                                        |
| ---------------------------------------------- | ------------------------------------------------------- |
| Install the published extension or a VSIX      | [Installation](getting-started/installation.md)         |
| Connect to a database for the first time       | [First connection](getting-started/first-connection.md) |
| Learn the complete UI flow                     | [Quick tour](getting-started/quick-tour.md)             |
| Configure saved connections                    | [Connections](manual/connections.md)                    |
| Run SQL and understand results                 | [SQL and query results](manual/sql-and-results.md)      |
| Browse and edit rows                           | [Tables, paging, and edits](manual/tables-and-edits.md) |
| Configure SSL/TLS or an SSH tunnel             | [TLS and SSH](operations/tls-and-ssh.md)                |
| Diagnose a failed connection or missing editor | [Troubleshooting](operations/troubleshooting.md)        |
| Develop or extend Queryable                    | [Developer guide](development/architecture.md)          |

## Product model

Queryable has two cooperating parts:

1. The **VS Code extension host** owns database drivers, credentials, filesystem dialogs, SSH tunnels, exports, and VS Code APIs.
2. The **webview UI** renders the Connections page and Workbench. It sends typed messages to the extension host; it does not access database drivers directly.

The separation matters operationally. Database credentials and native drivers remain in the extension host, while the browser-like UI receives only the metadata and result data required to render the current view.

## Supported database families

| Family               | Kind in Queryable | Connection style                         |
| -------------------- | ----------------- | ---------------------------------------- |
| PostgreSQL           | `postgres`        | Network host, port, or Unix socket       |
| CockroachDB          | `cockroachdb`     | PostgreSQL-compatible network connection |
| MySQL                | `mysql`           | Network host, port, or Unix socket       |
| MariaDB              | `mariadb`         | MySQL-compatible network connection      |
| Microsoft SQL Server | `mssql`           | TCP host and port                        |
| Oracle Database      | `oracle`          | TCP host and service name                |
| IBM Db2              | `db2`             | TCP host, port, and database name        |
| SQLite               | `sqlite3`         | Local database file                      |
| DuckDB               | `duckdb`          | Local database file                      |
| Cloudflare D1        | `d1`              | Cloudflare API over HTTPS                |

Capabilities differ by database. In particular, SQLite and D1 do not expose a routine browser, while DuckDB exposes macros as routines. See the [support matrix](databases/index.md) before designing a workflow around a database-specific feature.

## Important safety note

Queryable runs the SQL you submit against the selected connection. It does not automatically make `DELETE`, `UPDATE`, `DROP`, `ALTER`, or other destructive statements safe. Confirm the active connection and review SQL before running it, especially when the saved connection points to production.

PDF export is not supported. Current exports are JSON, CSV, and HTML.

## Documentation conventions

The examples use placeholders such as `<host>`, `<port>`, `<database>`, and `<user>`. Replace them with values for your environment. Values that look like secrets are examples only; never copy credentials into source control, issue reports, screenshots, or documentation.
