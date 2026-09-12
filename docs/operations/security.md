# Security and credentials

## What is stored where

Queryable separates connection metadata from secrets:

- saved connection metadata is stored in VS Code global state;
- database passwords selected for `keyring` storage are stored in VS Code SecretStorage;
- Cloudflare D1 tokens are stored in SecretStorage;
- SSH passwords and private-key passphrases are stored in SecretStorage when supplied;
- private keys, client certificates, CA files, and database files remain on the filesystem at their selected paths.

Passwords and tokens are not intended to be written into the saved connection metadata.

## Recommended credential policy

Use `keyring` when you need convenient reconnects on a trusted machine and the VS Code SecretStorage provider is acceptable for your security policy. Use `ask` when you want to enter the database password interactively. Use `none` only when the target authentication flow does not require Queryable to supply a password.

Prefer short-lived or narrowly scoped tokens for D1. Use database users with only the permissions needed for the browsing, query, or editing work.

## SQL safety

Queryable sends submitted SQL to the selected adapter. It does not add a transaction, preview, approval gate, or automatic backup around arbitrary SQL. Treat every query as if it were entered directly into the database client.

For production work:

1. Use a clearly named saved connection such as `PRODUCTION - read/write`.
2. Confirm the Workbench title before running a query.
3. Test write predicates with a `SELECT`.
4. Use explicit transactions where supported.
5. Inspect affected-row counts.
6. Refresh the table after writes.

## Webview security

The Connections and Workbench UIs are VS Code webviews. Their HTML templates use a Content Security Policy and nonce placeholders. Preserve the nonce attributes and CSP placeholders when changing the templates. Do not add arbitrary remote script sources.

The workbench reads Monaco from the packaged extension resources. Keep resource roots and CSP changes narrowly scoped to the required files.

## Export security

JSON, CSV, and HTML files are copies of database data. Protect them as sensitive records. HTML values are escaped, but the file can still reveal confidential information to anyone who opens it.

## Reporting a security issue

Do not include real credentials, tokens, private keys, or unrestricted database exports in an issue or support request. Redact hostnames, usernames, account IDs, query text, object names, and error payloads when they are sensitive.
