/*
 * Queryable, A Newfoundcodes project.
 *
 * Copyright (C) 2026 Jonathan Eldy Baldivicio
 *
 * Author: Jonathan Eldy Baldivicio
 * Contact: jonathaneldy.baldivicio@newfoundcodes.com
 *
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Affero General Public License as published
 * by the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
 * GNU Affero General Public License for more details.
 *
 * You should have received a copy of the GNU Affero General Public License
 * along with this program. If not, see <https://www.gnu.org/licenses/>.
 */

import { Buffer } from 'node:buffer';
import type { ExportFormat, ExportTableData } from '../types';

export interface BuiltExport {
  readonly extension: ExportFormat;
  readonly bytes: Uint8Array;
}

function escapeCsv(value: string): string {
  if (!/[",\r\n]/.test(value)) {
    return value;
  }

  return `"${value.replace(/"/g, '""')}"`;
}

function escapeHtml(value: string): string {
  return value.replace(
    /[&<>"']/g,
    (character) =>
      ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#39;',
      })[character] ?? character,
  );
}

function rowValue(row: ExportTableData['rows'][number], column: string): string {
  return row[column] ?? '';
}

function buildJson(data: ExportTableData): Uint8Array {
  const rows = data.rows.map((row) => {
    const ordered: Record<string, string> = {};
    for (const column of data.columns) {
      ordered[column] = rowValue(row, column);
    }

    return ordered;
  });
  return Buffer.from(`${JSON.stringify(rows, null, 2)}\n`, 'utf8');
}

function buildCsv(data: ExportTableData): Uint8Array {
  const lines: string[] = [];
  lines.push(data.columns.map(escapeCsv).join(','));

  for (const row of data.rows) {
    lines.push(data.columns.map((column) => escapeCsv(rowValue(row, column))).join(','));
  }

  return Buffer.from(`${lines.join('\r\n')}\r\n`, 'utf8');
}

function buildHtml(data: ExportTableData): Uint8Array {
  const head = data.columns.map((column) => `<th>${escapeHtml(column)}</th>`).join('');
  const body = data.rows
    .map((row) => {
      const cells = data.columns
        .map((column) => `<td>${escapeHtml(rowValue(row, column))}</td>`)
        .join('');
      return `<tr>${cells}</tr>`;
    })
    .join('\n');
  const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${escapeHtml(data.title)}</title>
<style>
body{font-family:system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;margin:24px;color:#111;background:#fff}
h1{font-size:20px;margin:0 0 16px}table{border-collapse:collapse;width:100%;font-size:12px}th,td{border:1px solid #bbb;padding:6px 8px;text-align:left;vertical-align:top;white-space:pre-wrap;word-break:break-word}th{background:#f2f2f2;position:sticky;top:0}
</style>
</head>
<body>
<h1>${escapeHtml(data.title)}</h1>
<table><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table>
</body>
</html>
`;
  return Buffer.from(html, 'utf8');
}

export function buildTableExport(format: ExportFormat, data: ExportTableData): BuiltExport {
  switch (format) {
    case 'json':
      return { extension: 'json', bytes: buildJson(data) };

    case 'csv':
      return { extension: 'csv', bytes: buildCsv(data) };

    case 'html':
      return { extension: 'html', bytes: buildHtml(data) };
  }
}

export function safeExportFileName(title: string): string {
  const trimmed = title
    .trim()
    .replace(/[\\/:*?"<>|\u0000-\u001F]/g, '-')
    .replace(/\s+/g, ' ');
  return (trimmed || 'queryable-export').slice(0, 120);
}
