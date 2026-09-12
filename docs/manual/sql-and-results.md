# SQL and query results

## Open the SQL editor

The Query panel is available in the Workbench. It uses the packaged Monaco editor when available and falls back to a plain-text editor if Monaco cannot initialize.

The editor is a SQL text editor, not a database-aware migration runner. Queryable sends the text you execute to the selected adapter.

## Execute a query

1. Confirm the connection title and schema context.
2. Enter SQL in the editor.
3. Select **Run**, or press `Ctrl+Enter` on Windows/Linux or `Cmd+Enter` on macOS.
4. Wait for the busy state to finish.
5. Review the result tab, row data, affected-row count, and duration.

Use **Run (New Tab)** to preserve the active query result and open the next result separately.

The exact behavior for multiple statements and multiple result sets depends on the database driver. Queryable preserves the result-set structure returned by the adapter; it does not normalize database-specific SQL grammar.

## Query results

A query result can include:

- one or more result sets;
- ordered column names;
- displayed rows;
- affected-row count when reported by the driver;
- execution duration;
- pagination controls for large result sets where the UI presents them;
- an Export control for the currently displayed result data.

Values are displayed as strings in the common UI model. This provides consistent rendering and export behavior, but it means a display value should not be treated as a typed value when designing application logic.

## Result tabs and reuse

**Run** targets the active query-result context where possible. **Run (New Tab)** creates a new result identity. Use a new tab when comparing before/after results, keeping a reference result visible, or testing variations of a query.

## Safe query practice

Queryable does not provide an automatic transaction wrapper for every query. Follow the transaction semantics of the selected database and driver. For writes:

1. Confirm the active connection.
2. Test the predicate with a `SELECT` first.
3. Use a transaction when supported and appropriate.
4. Check the affected-row count.
5. Refresh the relevant table view afterward.

Do not paste secrets into SQL or save them in the query text. Treat the query editor as sensitive content.

## Query failures

When a query fails, inspect:

- the database-specific syntax;
- the selected schema and object qualification;
- permissions for the current user;
- parameter or literal formatting;
- TLS or connection state;
- whether the driver supports the requested statement or result shape.

Queryable surfaces the adapter error, but the original database error may contain the most useful detail. Avoid sharing unredacted errors if they include hostnames, usernames, query text, or object names.
