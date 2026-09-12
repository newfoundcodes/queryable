# Tables, paging, and edits

## Open a table

Select a table or view in the explorer. Queryable requests a page of rows from the active adapter and opens a table tab.

The table request contains the schema, table name, page number, page size, and search text. The adapter translates that request into engine-specific SQL.

## Page navigation

The table toolbar provides:

- page-size selection;
- previous-page and next-page controls;
- current page information;
- a refresh action.

Changing the page size or search text resets the relevant page request. The adapter returns the total row count when it can determine it, allowing the UI to disable navigation at the end.

## Search table rows

The table search field filters rows through the adapter. Search behavior is database-specific because each adapter constructs its own query. It may search supported text-compatible columns rather than every database type.

Search is scoped to the open table. It does not search all tables, schemas, or routines.

## Refresh rows

Use the table refresh control after an external write, a query-based write, or a cell update. Refreshing requests the current page again with the current page size and search value.

## Cell editing

Double-click a cell to open the cell editor when the table is editable. The editor provides a text value and **Cancel** / **Save** actions.

Queryable only enables safe row targeting when the adapter reports usable primary-key columns and a row identity. The generated update uses the row identity to identify the target row; it does not update every row matching a non-unique display value.

After a successful save, Queryable refreshes the page. If the update fails, the original table view remains available and the error is displayed.

## Unsaved edit protection

If a cell editor has unsaved changes and you try to close it, Queryable asks whether to:

- **Save** the cell changes;
- **Discard** the changes;
- **Keep Editing**.

This confirmation protects against accidental loss during tab changes or session closure.

## Why a table is read-only

A table can be read-only when:

- it has no primary key;
- the adapter cannot determine a primary-key identity;
- the object is a view without an updateable identity;
- the database user lacks update permission;
- the selected adapter does not implement the required update behavior;
- the connection is no longer usable.

Read-only display does not prevent you from running an explicit SQL `UPDATE`; it only disables the safe cell-edit workflow.

## Data interpretation

The common display model represents row values as strings. Null, date, binary, JSON, and engine-specific values may therefore be formatted for display by the adapter. Use SQL or an export when you need a database-specific representation.
