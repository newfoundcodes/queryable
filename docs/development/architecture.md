# Architecture

Queryable is a VS Code extension written in strict TypeScript. It separates extension-host responsibilities from webview rendering and database-specific behavior.

## Runtime layers

```text
VS Code extension host
├── extension activation and command registration
├── HomeViewProvider
│   ├── connection validation
│   ├── ConnectionStore
│   └── adapter/session creation
├── WorkbenchManager
│   ├── metadata and table requests
│   ├── query execution
│   ├── exports
│   └── session/tunnel cleanup
└── database adapters

VS Code webviews
├── webview/home.html
└── webview/workbench.html
```

## Activation and commands

`src/extension.ts` creates the connection store, registers the home view provider, registers the Workbench manager, and exposes the Open Queryable and export commands declared in `package.json`.

The extension activates for the Queryable view and for the `queryable.openHome` command.

## Home view

`src/ui/homeView.ts` hosts the Connections view. The long HTML, CSS, and browser JavaScript live in `webview/home.html`. The extension host reads the template from the packaged extension and replaces runtime placeholders such as the CSP nonce.

The webview sends typed `HomeMessage` values. The host validates drafts, stores saved connections, opens temporary or saved sessions, launches file dialogs, and sends typed status and connection-list messages back.

## Workbench

`src/ui/workbench.ts` manages a WebviewPanel for a live connection. The UI template lives in `webview/workbench.html`. The host handles metadata, table pages, routine definitions, query execution, cell updates, exports, and session closure.

## Adapter contract

`src/adapters/base.ts` defines the common adapter operations:

- `connect()`;
- `close()`;
- `getMetadata()`;
- `fetchTablePage()`;
- `getProcedureDefinition()`;
- `execute()`;
- `updateCell()`.

Each database adapter translates these operations into engine-specific driver calls and SQL. Shared host/UI code should depend on the contract instead of database-driver details.

## Adapter factory and sessions

`src/adapters/factory.ts` selects an adapter based on the saved connection kind. Network adapters can be wrapped with an SSH forwarding session. The wrapper presents the same common interface while ensuring tunnel cleanup when the session closes.

## Storage

`src/storage/connectionStore.ts` stores saved metadata in VS Code global state and secrets in SecretStorage. It also converts drafts into saved configurations and resolves runtime secrets before adapter creation.

## Templates and CSP

The external templates intentionally keep their inline CSS and browser JavaScript together with the HTML. This makes a webview page reviewable as a complete document while avoiding large template literals in TypeScript.

The host injects:

- a nonce for inline scripts;
- the webview CSP source;
- the Monaco resource path;
- escaped dynamic titles and labels;
- routine/search capability labels.

Do not remove or bypass the CSP when changing the templates.

## Message protocol

`src/types.ts` contains the discriminated unions used between host and webview. Adding a message should update both the sender and receiver, then add a source test or integration-level assertion where practical.
