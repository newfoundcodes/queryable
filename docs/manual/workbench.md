# Workbench

The Workbench is the live database workspace opened from a saved or temporary connection. It combines an object explorer, schema selector, object search, tabs, table views, routine definitions, and the SQL query panel.

## Workbench layout

The layout has three conceptual areas:

1. **Explorer**: schema selector, refresh control, object search, and object groups.
2. **Tabs**: the objects and query results currently open.
3. **Content area**: table, routine, or query content for the active tab.

The Workbench title identifies the connection. Treat the title as the active target when reviewing SQL or making edits.

## Refresh metadata

Use the refresh control to request fresh metadata from the database. Refreshing updates the schema and object lists; it does not automatically discard or rewrite open tabs.

Metadata includes:

- schemas;
- tables and views;
- procedures and functions where the adapter supports them;
- DuckDB macros.

## Select a schema

The schema selector is populated from adapter metadata. Selecting a schema requests metadata with that schema as the preferred selection. The exact default schema is database-specific and may be the current user schema, the first available schema, or the adapter's fallback.

## Search objects

The explorer search filters the displayed object groups by name. It is intended for locating objects in the already loaded metadata set. It is not a SQL search and does not scan arbitrary column values.

## Open objects

Select a table or view to open a table tab. Select a procedure, function, or macro to open a routine-definition tab. A routine definition may be unavailable because of database permissions, engine behavior, or object type limitations.

## Tabs

Every opened object or query result has a tab title. Select a tab to make it active and use its content controls. Close a tab using its close control. Closing a tab only removes the view from the Workbench; it does not drop the object or modify database data.

Query results can be reused in the active result tab or opened in a new tab. This allows a working result to remain visible while comparing another statement.

## Busy and error states

The Workbench displays a busy state while metadata, pages, definitions, queries, exports, or cell writes are being processed. Errors from the extension host are shown in the Workbench status area. If a request fails, first verify that the session is still connected and that the SQL or object name is valid.

## Close the Workbench

Closing the Workbench asks the active adapter session to close. The same cleanup path closes an SSH tunnel when one was created. If the connection configuration was changed but not saved, Queryable presents a save/discard decision before completing the close flow.
