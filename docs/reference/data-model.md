# Data model and terminology

## Connection kinds

The internal connection kind values are:

`postgres`, `cockroachdb`, `mysql`, `mariadb`, `mssql`, `oracle`, `db2`, `sqlite3`, `duckdb`, and `d1`.

These values are implementation identifiers. The UI presents human-readable database names.

## Draft versus saved connection

A **draft** contains form values, including secret fields while the form is active. A **saved connection** contains stable metadata and an ID. Runtime secrets are resolved separately before creating an adapter.

## Session

A **session** is a connected adapter associated with a Workbench. It may also own an SSH tunnel. Closing the session closes the adapter and tunnel resources.

## Metadata

Metadata is the object-explorer model:

- `schemas`: available schemas;
- `tables`: tables and views;
- `procedures`: procedures, functions, or macros;
- `selectedSchema`: the active schema.

## Table page

A table page contains:

- displayed columns;
- displayed rows;
- row identities;
- primary-key column names;
- an `editable` flag;
- page and page-size values;
- total row count.

The `editable` flag represents the adapter's ability to target rows safely, not merely whether the database user has write permission.

## Query result

A query result contains one or more result sets, a message, and duration. Each result set contains columns, rows, and an optional affected-row count.

## Export target

An export target has a title, ordered columns, and rows. Exports operate on this already-materialized display data, not on an implicit second database query.
