# Adding a database adapter

Adding a database is a cross-layer change. Follow this order to keep the UI, storage, validation, adapter factory, and tests consistent.

## 1. Define the kind and configuration

Add the database kind and saved/draft configuration types in `src/types.ts`. Decide whether it is a network, file, or API connection. Add runtime secret fields only when the adapter needs them.

## 2. Add validation

Update `src/util/validate.ts` with required fields, port rules, socket rules, certificate rules, and any engine-specific constraints. Validation should reject malformed drafts before a driver is created.

## 3. Implement the common adapter

Create `src/adapters/<database>.ts` implementing:

- `connect`;
- `close`;
- `getMetadata`;
- `fetchTablePage`;
- `getProcedureDefinition`;
- `execute`;
- `updateCell`.

Keep engine-specific SQL inside the adapter. Normalize rows into the common types without leaking driver objects to the webview.

## 4. Register the factory

Add the kind to `src/adapters/factory.ts`. If the engine is network-based, ensure the optional SSH wrapper receives a valid TCP endpoint and that close behavior releases both adapter and tunnel resources.

## 5. Update storage

Teach `src/storage/connectionStore.ts` how to turn the draft into saved metadata and how to resolve runtime secrets. Do not put passwords or tokens into saved metadata.

## 6. Add the connection form

Update `webview/home.html` with the database card, fields, dynamic form behavior, and draft serialization. Preserve accessible labels, focus behavior, file-picker targets, and the existing message names.

## 7. Add Workbench capabilities

Update `webview/workbench.html` if the database has different routine labels, object groups, or search behavior. The adapter metadata should drive capability labels where possible.

## 8. Add tests

Add tests for validation, source composition, adapter selection, export/query behavior, and any database-specific limitations. Tests should cover both successful and rejected drafts.

## 9. Manually test

Use a disposable database or test account. Exercise connection, metadata, table paging, query execution, editing, exports, routine definitions, reconnect, and close cleanup.

## Adapter quality rules

- Never interpolate untrusted table, schema, or column names without the adapter's identifier-quoting strategy.
- Use parameterized values for cell updates and user-provided data.
- Return useful errors while avoiding secret leakage.
- Close connections on all failure paths.
- Preserve deterministic column ordering for display and exports.
- Report whether a page has a usable row identity before enabling cell editing.
