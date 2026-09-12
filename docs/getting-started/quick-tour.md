# Quick tour

## 1. Connections view

The Connections view is the entry point. It has two tabs:

### Saved Connections

Saved connections show the local name and database type. Selecting the primary area opens the Workbench. The context actions allow you to edit or delete the saved item.

### New Connections

New connection cards are available for:

- PostgreSQL;
- CockroachDB;
- MySQL;
- MariaDB;
- Microsoft SQL Server;
- Oracle Database;
- IBM Db2;
- SQLite;
- DuckDB;
- Cloudflare D1.

Selecting a card opens the correct form. The form changes when you select a different database kind; do not assume that fields from one driver apply to another.

## 2. Connection form

The form has a compact basic section and an **Advanced** section. Basic fields identify the database. Advanced fields configure password storage, TLS, certificate paths, and SSH tunneling where the selected engine supports them.

Every save, test, or connect operation validates the draft before a driver is created. Validation errors are shown as status messages; no connection attempt is made until required values are present.

## 3. Object explorer

The Workbench explorer displays the selected schema and searchable database objects. Depending on the adapter, object groups include:

- tables;
- views;
- procedures;
- functions;
- DuckDB macros.

Use the refresh control to reload metadata. Change the schema selector to inspect another schema.

## 4. Workbench tabs

Opening an object creates a tab. Table tabs contain a paginated data view. Routine tabs contain the definition in the Monaco editor. Query tabs contain SQL results and their controls.

Tabs are independent views of the active connection. Closing a tab does not close the database session. Closing the Workbench does close the session and the optional SSH tunnel.

## 5. Table view

The table view provides:

- a table search field;
- a page-size selector;
- previous and next page controls;
- a row refresh control;
- an Export control;
- visible cells that can be opened for editing when row identity is available.

Search is sent to the active adapter as a table-page request. It is not a global database search.

## 6. Query view

The query panel provides a SQL editor and two run actions:

- **Run** reuses the active query-result tab where applicable;
- **Run (New Tab)** creates a separate result tab.

`Ctrl+Enter` on Windows/Linux or `Cmd+Enter` on macOS runs the active query. Query results include result-set tabs or sections, columns, rows, affected-row counts where available, duration, pagination, and export controls.

## 7. Routine definition view

Select a procedure, function, or DuckDB macro to request its definition from the adapter. Some engines or database users cannot provide definitions for every object. In that case the tab displays the adapter's explanatory placeholder or an unavailable-definition message.

## 8. Session close

Closing the Workbench releases the database adapter and any SSH forwarding session. If a connection configuration was edited without being saved, Queryable asks whether to save, discard, or continue working before closing the session.
