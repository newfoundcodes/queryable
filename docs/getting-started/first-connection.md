# First connection

This walkthrough creates, tests, saves, and opens a connection. It uses a network database because that exposes the full form. For SQLite and DuckDB, use the [local-file guide](../databases/local-files.md); for D1, use the [Cloudflare D1 guide](../databases/cloudflare-d1.md).

## Open Queryable

1. Open VS Code.
2. Select the Queryable icon in the Activity Bar.
3. Select the **New Connections** tab.
4. Select the card for your database engine.

The form is engine-aware. Fields that do not apply to the selected engine are hidden or disabled.

## Fill in the connection

At minimum, provide:

- **Connection name**: a local label such as `Development PostgreSQL`;
- **Database host or socket**: a hostname, IP address, or supported Unix socket path;
- **Port**: the database listener port when using a TCP host;
- **Username**: the database user;
- **Database** or **service name** where the selected driver requires it.

The password field is controlled by the selected password policy. See [Connections](../manual/connections.md#password-policies).

## Test before saving

Select **Test** to validate the form, create a temporary adapter session, connect, and close the session. A successful test does not save the connection. This is the safest way to catch a host, port, authentication, TLS, or driver problem before creating saved metadata.

If the test fails, read the message literally first. Common causes are:

- the host or port is unreachable;
- the username or password is incorrect;
- the database or Oracle service name is wrong;
- a Unix socket path was entered for a TCP-only driver;
- TLS settings do not match the server;
- an SSH tunnel points to the wrong destination;
- the native driver is unavailable in the installation.

## Save and connect

Select **Save** to store the connection for later use. Saving stores connection metadata in VS Code global state. Secrets are stored separately in VS Code SecretStorage when the selected policy requires it.

Select **Connect** to save and open the connection in the Workbench. A connection can also be opened temporarily without saving it; the form asks whether to save when a workflow would otherwise discard unsaved configuration.

## Open a saved connection

Return to **Saved Connections** and select a saved item. Use the main connection action to open it. The menu on a saved item provides **Edit** and delete actions.

## Confirm the first Workbench load

After a successful connection:

1. The Workbench loads schemas and database objects.
2. Select a schema if more than one is available.
3. Search or choose a table.
4. Open the table and confirm that rows load.
5. Select the Query panel, enter a harmless statement such as `SELECT 1`, and run it.

The editor uses Monaco when its packaged assets load. If Monaco cannot initialize, Queryable presents a plain-text fallback editor so the query workflow remains available.
