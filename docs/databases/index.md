# Database support matrix

Queryable exposes one common workflow, but database engines differ in authentication, metadata, SQL dialect, TLS, routines, and update behavior.

| Database      | Kind          | Driver              | Host/socket        | Database field | Routines                                 | Cell edits                           |
| ------------- | ------------- | ------------------- | ------------------ | -------------- | ---------------------------------------- | ------------------------------------ |
| PostgreSQL    | `postgres`    | `pg`                | TCP or Unix socket | Database       | Procedures/functions where available     | Adapter-supported primary-key tables |
| CockroachDB   | `cockroachdb` | PostgreSQL adapter  | TCP or Unix socket | Database       | PostgreSQL-compatible metadata behavior  | Adapter-supported primary-key tables |
| MySQL         | `mysql`       | `mysql2`            | TCP or Unix socket | Database       | Definitions depend on permissions/driver | Adapter-supported primary-key tables |
| MariaDB       | `mariadb`     | `mysql2`            | TCP or Unix socket | Database       | Definitions depend on permissions/driver | Adapter-supported primary-key tables |
| SQL Server    | `mssql`       | `mssql`             | TCP only           | Database       | Procedures/functions where available     | Adapter-supported primary-key tables |
| Oracle        | `oracle`      | `oracledb`          | TCP only           | Service name   | Procedures/functions where available     | Adapter-supported primary-key tables |
| Db2           | `db2`         | `ibm_db`            | TCP only           | Database name  | Procedures/functions where available     | Adapter-supported primary-key tables |
| SQLite        | `sqlite3`     | `sqlite3`           | Local file         | Not applicable | No stored procedures                     | Adapter-supported primary-key tables |
| DuckDB        | `duckdb`      | `@duckdb/node-api`  | Local file         | Not applicable | Macros are exposed as routines           | Adapter-supported primary-key tables |
| Cloudflare D1 | `d1`          | Cloudflare HTTP API | HTTPS API          | Database ID    | No stored procedures                     | Adapter-supported primary-key tables |

“Adapter-supported” means the table must provide a usable primary-key identity and the current user must have update permission. It is not a promise that every view or virtual table is editable.

## Choosing a database kind

Choose the kind matching the protocol and server, not merely a similar SQL dialect. For example, CockroachDB uses the PostgreSQL adapter because it speaks the PostgreSQL protocol; MariaDB uses the MySQL adapter because it uses the MySQL protocol.

## Capability differences

- SQLite and D1 use SQLite-like semantics but do not expose stored procedures.
- DuckDB macros are displayed in the routine area.
- Oracle and Db2 require TCP hosts and database/service identifiers.
- SSH tunneling is intended for network databases and requires a TCP database endpoint.
- TLS options are interpreted by each driver; `verify-identity` has special restrictions when the database connection is reached through Queryable's local SSH forwarding endpoint.
