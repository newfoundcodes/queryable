# Commands and keyboard shortcuts

## Command Palette commands

| Command                     | Purpose                                                                                |
| --------------------------- | -------------------------------------------------------------------------------------- |
| `Queryable: Open Queryable` | Reveal the Queryable Connections view                                                  |
| `Queryable: JSON`           | Export the selected table/query target as JSON when invoked from the Workbench context |
| `Queryable: CSV`            | Export the selected table/query target as CSV                                          |
| `Queryable: HTML`           | Export the selected table/query target as HTML                                         |

Export commands are context-sensitive. In normal use, select the Export control on the table or query-result view first, then choose the format. PDF is not available.

## Activity Bar

Select the Queryable icon to reveal the Connections view. The view is contributed as `queryable.home` and is activated when it is opened.

## Workbench shortcuts

| Shortcut     | Action                                    |
| ------------ | ----------------------------------------- |
| `Ctrl+Enter` | Run the active SQL query on Windows/Linux |
| `Cmd+Enter`  | Run the active SQL query on macOS         |

The editor also exposes explicit **Run** and **Run (New Tab)** buttons. Use the buttons if the platform shortcut is intercepted by another keybinding.

## Context actions

| Action                   | Scope                                             |
| ------------------------ | ------------------------------------------------- |
| Edit                     | Saved connection item                             |
| Delete                   | Saved connection item                             |
| Browse                   | File-backed connection and certificate/key fields |
| Refresh database objects | Workbench explorer                                |
| Refresh rows             | Open table                                        |
| Export                   | Open table page or query result                   |
