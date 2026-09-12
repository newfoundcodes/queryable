# Exports

Queryable exports the data currently visible in a table page or query-result context. It does not export an entire database automatically and it does not include PDF export.

## Available formats

| Format | Description                                                     |
| ------ | --------------------------------------------------------------- |
| JSON   | Ordered objects using the displayed column order                |
| CSV    | Delimited text with quoting for commas, quotes, and line breaks |
| HTML   | Standalone HTML table document with escaped values              |

## Export the current view

1. Open a table or query result.
2. Select its **Export** button.
3. Choose **JSON**, **CSV**, or **HTML** from the export actions.
4. Choose a destination in the VS Code save dialog.
5. Confirm the generated file.

The export target is the current page or current displayed result data. Use table pagination or query/result controls first if you need a particular subset.

## Default filenames

Queryable derives a filename from the view title and sanitizes it by removing path separators, control characters, and invalid filename characters. You can change the destination and filename in the save dialog.

## JSON details

JSON is generated as an array of row objects. Each object's keys follow the displayed column order. Display values are exported as the values present in the common table model.

## CSV details

CSV includes a header row. Values are quoted as needed so commas, double quotes, and line breaks do not corrupt the row structure. A double quote inside a value is escaped using the standard doubled-quote convention.

## HTML details

HTML export creates a standalone table document. Cell values are escaped before insertion, so database text containing `<`, `>`, `&`, or quotes is not interpreted as markup.

## Security and data handling

An export is a copy of database data. Protect exported files according to the sensitivity of the source data. Do not place exports in a shared or public directory unless the data is intended to be public. HTML files may contain sensitive content even though cell values are escaped.
