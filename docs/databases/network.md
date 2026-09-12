# Network databases

This page covers PostgreSQL, CockroachDB, MySQL, MariaDB, Microsoft SQL Server, Oracle, and IBM Db2.

## Required information

Most network connections need:

- a connection name;
- a host or supported Unix socket path;
- a TCP port unless using a Unix socket;
- a username;
- a database name, catalog, or service name as required by the engine;
- a password policy and optional password;
- TLS and optional SSH settings when required by the environment.

## TCP versus Unix sockets

PostgreSQL, CockroachDB, MySQL, and MariaDB can use supported Unix socket paths. SQL Server, Oracle, and Db2 require TCP in the current implementation. SSH tunneling also requires a TCP database host because the tunnel forwards a TCP destination.

If a socket path is selected, the database port validation is skipped for the database endpoint. This does not make a socket valid for a driver that requires TCP.

## PostgreSQL and CockroachDB

Use **PostgreSQL** for PostgreSQL servers and **CockroachDB** for CockroachDB servers. CockroachDB uses the PostgreSQL-compatible adapter and protocol, but selecting its explicit kind preserves the correct connection identity and user-facing behavior.

Use the database field for the target database. For TLS, choose a mode appropriate for the server certificate and provide key, certificate, or CA paths when required by the deployment.

## MySQL and MariaDB

Use **MySQL** for MySQL protocol endpoints and **MariaDB** for MariaDB endpoints. Both are implemented through the MySQL driver family. The database field identifies the initial database/catalog.

If client certificate authentication is used, provide both the client key and client certificate. The CA path is separate and depends on the server trust configuration.

## Microsoft SQL Server

SQL Server uses a TCP host and port. Unix socket paths are rejected. TLS settings are translated to the SQL Server driver's encryption and certificate options. If the server requires encryption or a trusted certificate, configure the corresponding TLS mode and CA material before testing.

## Oracle

Oracle requires a TCP host and a non-empty **service name** in the database field. Unix sockets and client key/certificate paths are rejected by the current Queryable configuration.

Oracle's TLS fallback behavior is driver-dependent. `verify-identity` cannot be combined with Queryable's built-in SSH tunnel because the database driver sees the tunnel's local endpoint instead of the original TLS hostname. Use `verify-ca` through the tunnel or connect directly when identity verification is required.

## IBM Db2

Db2 requires a TCP host and a non-empty database name. Unix sockets and client key/certificate paths are rejected by the current configuration.

Db2's TLS settings are passed through the driver connection properties. As with Oracle, `verify-identity` cannot be combined with the built-in SSH tunnel; use `verify-ca` through the tunnel or connect directly.

## Network connection checklist

Before testing, confirm:

1. DNS resolves the host from the machine running VS Code.
2. The port is reachable from that machine, or an SSH tunnel is configured.
3. The database accepts the selected user from that source.
4. The database/service name is correct.
5. TLS mode and certificate paths match the server.
6. The selected database kind matches the actual wire protocol.
