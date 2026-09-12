# SQLite and DuckDB

SQLite and DuckDB use local files rather than network connection fields.

## Create a local-file connection

1. Open the Queryable Activity Bar view.
2. Select **New Connections**.
3. Select **SQLite** or **DuckDB**.
4. Enter a connection name.
5. Use **Browse** to select the database file.
6. Test the draft.
7. Save and connect when the test succeeds.

The file path is stored as connection metadata. The file itself is not copied into the VS Code workspace or into the extension.

## SQLite

SQLite databases are opened through the SQLite driver. SQLite does not provide stored procedures, so its routine area does not expose procedures or functions. Tables and views remain available through the object explorer.

Whether a table can be edited depends on whether the adapter can identify a primary-key row and whether the file is writable by the operating system process running VS Code.

## DuckDB

DuckDB databases are opened through the DuckDB Node API. DuckDB macros are represented as routines in the explorer. Select a macro to request its definition.

DuckDB files can be read-only because of filesystem permissions, another process holding a lock, or how the file was opened. A successful connection test does not guarantee that an update will succeed.

## File and native-driver considerations

- Use an absolute path when the database is outside the workspace or when the VS Code launch context is ambiguous.
- Keep the file accessible for the lifetime of the Workbench session.
- Back up the file before running destructive SQL.
- Native driver installation can fail if platform build prerequisites are missing.
- A local file connection does not use the network TLS or SSH fields.
