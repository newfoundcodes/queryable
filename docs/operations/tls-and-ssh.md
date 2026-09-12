# TLS and SSH

## TLS modes

Network connection forms expose these modes:

| Mode              | Meaning                                                                                      |
| ----------------- | -------------------------------------------------------------------------------------------- |
| `preferred`       | Attempt TLS and fall back when the driver reports that TLS is unavailable                    |
| `disabled`        | Connect without TLS                                                                          |
| `required`        | Require TLS                                                                                  |
| `verify-ca`       | Require TLS and verify the server certificate against configured CA material where supported |
| `verify-identity` | Require TLS and validate the endpoint identity where supported                               |

Driver support is not identical across database engines. A mode that is accepted by the form can still fail if the server, certificate, or native driver does not support the requested behavior.

## Certificate paths

Depending on the selected engine, the Advanced section can accept:

- a client private key;
- a client certificate;
- a CA or server certificate path.

Provide client key and client certificate together. Oracle and Db2 reject client key/certificate paths in the current configuration. Use absolute paths when the selected files are outside the workspace.

## SSH tunnel

Enable **SSH tunnel** for a network database reachable through an SSH server. Queryable connects to the SSH host, creates local forwarding, and gives the database adapter a local endpoint that forwards to the configured database host and port.

SSH fields include:

- SSH host;
- SSH port, from `1` through `65535`;
- SSH username;
- authentication mode: password or private key;
- private key path for private-key authentication;
- password or private-key passphrase as applicable.

The database endpoint must be TCP. SSH tunneling cannot forward a database Unix socket through the current workflow.

## SSH authentication

For password authentication, provide an SSH password. For private-key authentication, select a private key file and provide a passphrase if the key requires one. Stored SSH passwords and passphrases are kept in SecretStorage rather than saved connection metadata.

## TLS identity through SSH

The database driver sees the local forwarded endpoint when using the built-in tunnel. For Oracle and Db2, Queryable therefore rejects `verify-identity` together with the built-in tunnel. Use `verify-ca` through the tunnel, or connect directly when endpoint identity verification is required.

## Troubleshooting order

When a tunneled TLS connection fails, test in this order:

1. Test SSH authentication independently.
2. Confirm the SSH server can reach the database host and port.
3. Test a direct database connection from the SSH server if possible.
4. Use `disabled` or `preferred` temporarily only for diagnosis, not as a permanent security decision.
5. Confirm CA and client-certificate paths exist on the machine running VS Code.
6. Re-enable the intended TLS verification mode.
