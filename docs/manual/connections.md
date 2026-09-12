# Connections

The Connections view manages the connection lifecycle without exposing database-driver details in the UI. It supports temporary drafts, saved connections, edited saved connections, connection testing, and deletion.

## Connection lifecycle

There are four useful states:

1. **Draft**: fields currently entered in the form; not stored.
2. **Tested draft**: a draft that successfully opened and closed a temporary session.
3. **Saved connection**: metadata stored in VS Code global state, with secrets stored separately when applicable.
4. **Open session**: a live Workbench backed by a database adapter and, optionally, an SSH tunnel.

Testing does not imply saving. Connecting a draft opens a session; depending on the current flow, Queryable can ask whether unsaved configuration should be retained when the session closes.

## Common fields

### Connection name

This is a local label. It is used in the Saved Connections list and Workbench title. It is not sent to the database.

### Database host or socket

Use a DNS name or IP address for TCP connections. PostgreSQL, CockroachDB, MySQL, and MariaDB can also use supported Unix socket paths. SQL Server, Oracle, and Db2 require a TCP host in the current implementation.

### Port

TCP ports must be whole numbers from `1` through `65535`. A port is not used when a supported Unix socket path is selected, although the form may retain a value for later switching to TCP.

### Username

Network adapters require a non-empty username. File connections and D1 use different authentication models.

### Database or service name

The field is interpreted by the selected driver. Oracle uses it as the service name. Db2 requires a database name. Other network engines use their driver-specific database/catalog behavior.

## Password policies

Network forms provide three database password policies:

| Policy    | Behavior                                              | Use when                                                                                                             |
| --------- | ----------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| `keyring` | Store and reuse the password in VS Code SecretStorage | You want convenient reconnects on a trusted workstation                                                              |
| `ask`     | Prompt when a password is needed                      | You do not want Queryable to retain the password                                                                     |
| `none`    | Do not store or reuse a database password             | The driver/server handles authentication another way, or you want every connection to fail without another mechanism |

The policy controls storage, not authorization. The database still decides whether the supplied credential can connect.

SSH passwords and private-key passphrases also use SecretStorage when supplied. Cloudflare D1 tokens are stored in SecretStorage because they are needed for API calls.

## Advanced fields

The Advanced section may include:

- password policy;
- TLS mode;
- client key path;
- client certificate path;
- CA or server certificate path;
- SSH tunnel toggle and tunnel credentials.

Client key and certificate files must be supplied together for engines that support them. Oracle and Db2 currently reject client key/certificate paths through the Queryable configuration.

## Edit a saved connection

Use the saved connection context menu and select **Edit**. Queryable loads saved metadata into the form. Secret fields may appear blank; a blank secret means “keep the saved value” when editing, not “replace it with an empty value.” To replace a saved secret, enter a new value explicitly.

You can test the edited values, save the update, or connect with the edited configuration. If you close an open session with unsaved connection changes, Queryable prompts before discarding them.

## Delete a saved connection

Delete removes the saved metadata and associated stored secrets for that connection. It does not delete the remote database, local database file, or data. It does not undo SQL changes already sent to a database.

## File selection

Use **Browse** for database files, client key/certificate files, CA files, and SSH private keys. File dialogs run in the extension host, and the chosen path is returned to the webview as a form value.

## Validation rules

Queryable rejects a draft before connecting when:

- the connection name is empty;
- a file connection has no database file;
- a D1 connection has no account ID, database ID, or token;
- a network connection has no host/socket or username;
- a TCP port is outside `1..65535`;
- SQL Server, Oracle, or Db2 uses a Unix socket;
- Oracle has no service name;
- Db2 has no database name;
- only one of a client key and certificate is provided;
- SSH is enabled without a TCP database host;
- required SSH host, port, username, password, or private key is missing.

Validation prevents malformed requests but cannot prove that the endpoint exists or that the credential is correct. Use **Test** for that.
