# Cloudflare D1

Cloudflare D1 is accessed through the Cloudflare HTTP API rather than a local SQLite file or a direct database socket.

## Required fields

A D1 connection requires:

- a local connection name;
- a Cloudflare Account ID;
- a D1 Database ID;
- a Cloudflare API token.

The Account ID is limited to 32 characters by Queryable's validation. The token is required for a connection draft and is stored in VS Code SecretStorage for saved connections.

## Create a D1 connection

1. Select the Queryable Activity Bar view.
2. Select **New Connections**.
3. Select **Cloudflare D1**.
4. Enter the Account ID and Database ID.
5. Enter the API token.
6. Select **Test**.
7. Save and connect after the request succeeds.

The adapter sends SQL through Cloudflare's D1 API using the stored bearer token. Make sure the token has permission to access the account and database.

## D1 behavior

D1 uses SQLite semantics. The adapter supports metadata, table pages, SQL execution, and cell updates where the target has a usable primary-key identity. D1 does not expose stored procedures, so the routine area is not available for D1.

Network TLS and SSH fields do not apply because the connection is an HTTPS API request handled by the adapter.

## Missing-token behavior

Saved D1 metadata does not contain the token. If the SecretStorage entry is removed or unavailable, opening the saved connection fails with a missing-token error. Edit the connection and enter the token again, then save it.

## D1 safety

API access does not make SQL read-only. Confirm the Account ID and Database ID before executing writes. Use a least-privileged API token and avoid sharing exported data or error messages that identify the account or database.
