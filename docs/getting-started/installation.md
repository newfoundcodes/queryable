# Installation

## Requirements

The published extension requires:

- Visual Studio Code `1.96.0` or newer;
- network access to the target database, or HTTPS access to Cloudflare for D1;
- permission to read the requested schemas and tables;
- permission to write rows if you intend to use cell editing;
- a supported operating system and runtime for the selected database driver.

Some database packages contain native components. Local SQLite, Db2, and SSH-related installation can require a compiler, Python, system headers, or platform-specific libraries. The required prerequisites depend on your operating system and the driver version.

## Install from the Marketplace

When a Marketplace publication is available, install **Queryable** from the VS Code Extensions view, or use the command palette action **Extensions: Install Extensions** and search for `Queryable`.

After installation, reload VS Code if prompted. The Queryable icon appears in the Activity Bar when the extension activates.

## Install from a VSIX

A VSIX is the self-contained VS Code extension package. To build one from a checkout:

```bash
npm install
npm run package
```

The package command produces a file named similar to `queryable-0.1.15.vsix` in the repository root. Install it in VS Code with **Extensions: Install from VSIX...**, select the file, and reload when prompted.

You can also install from a terminal:

```bash
code --install-extension queryable-0.1.15.vsix
```

The exact filename is version-dependent. Use `ls *.vsix` or your file manager to select the generated artifact.

## Verify the installation

1. Open VS Code.
2. Look for the Queryable icon in the Activity Bar.
3. Select the icon.
4. Confirm that the **Saved Connections** and **New Connections** tabs appear.
5. Select a database card. The connection form should open without a webview error.

If the icon is missing, run **Developer: Reload Window**. If the view is still missing, open **Help: Toggle Developer Tools**, inspect the Console, and see [Troubleshooting](../operations/troubleshooting.md).

## Install from source

Clone the repository, open it in VS Code, and install development dependencies:

```bash
git clone https://github.com/newfoundcodes/queryable.git
cd queryable
npm run bootstrap
```

`bootstrap` installs development dependencies and permits the native install scripts configured by the project. If your npm version does not provide `npm approve-scripts`, use the equivalent npm configuration supported by your npm version and verify that native modules build successfully.

Press `F5` in VS Code to launch an Extension Development Host with Queryable loaded. Source changes to TypeScript require recompilation; use `npm run watch` in another terminal while developing.

## Installation boundaries

Queryable is an extension, not a database server. Installing it does not install PostgreSQL, MySQL, SQL Server, Oracle, Db2, DuckDB, SQLite databases, or Cloudflare accounts. You must provide access to the target system and a user with appropriate permissions.
