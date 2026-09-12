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

function asciiPdfText(value: string): string {
  let result = '';
  for (const character of value) {
    const code = character.codePointAt(0) ?? 63;

    if (character === '\n' || character === '\r' || character === '\t') {
      result += ' ';
    } else if (code >= 32 && code <= 126) {
      result += character;
    } else {
      result += '?';
    }
  }

  return result;
}

function escapePdfText(value: string): string {
  return asciiPdfText(value).replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)');
}

function truncate(value: string, width: number): string {
  const normalized = asciiPdfText(value).replace(/\s+/g, ' ').trim();
  if (normalized.length <= width) {
    return normalized;
  }

  if (width <= 3) {
    return normalized.slice(0, width);
  }

  return `${normalized.slice(0, width - 3)}...`;
}

function tableLines(data: ExportTableData): readonly string[] {
  const maxWidth = 118;
  if (data.columns.length === 0) {
    return ['No columns.'];
  }

  const separatorWidth = Math.max(1, (data.columns.length - 1) * 3);
  const columnWidth = Math.max(6, Math.floor((maxWidth - separatorWidth) / data.columns.length));
  const lineFor = (values: readonly string[]): string =>
    values.map((value) => truncate(value, columnWidth).padEnd(columnWidth)).join(' | ');

  const header = lineFor(data.columns);
  const separator = data.columns.map(() => '-'.repeat(columnWidth)).join('-+-');
  const lines: string[] = [asciiPdfText(data.title), '', header, separator];

  for (const row of data.rows) {
    lines.push(lineFor(data.columns.map((column) => rowValue(row, column))));
  }

  if (data.rows.length === 0) {
    lines.push('No rows.');
  }

  return lines;
}

function buildPdf(data: ExportTableData): Uint8Array {
  const lines = tableLines(data);
  const linesPerPage = 62;
  const pages: readonly string[][] = Array.from(
    { length: Math.max(1, Math.ceil(lines.length / linesPerPage)) },
    (_, index) => lines.slice(index * linesPerPage, (index + 1) * linesPerPage),
  );

  const catalogId = 1;
  const pagesId = 2;
  const fontId = 3;

  const pageIds = pages.map((_, index) => 4 + index * 2);
  const contentIds = pages.map((_, index) => 5 + index * 2);
  const maxObjectId = contentIds.at(-1) ?? fontId;
  const objects = new Map<number, string>();

  objects.set(catalogId, `<< /Type /Catalog /Pages ${pagesId} 0 R >>`);
  objects.set(
    pagesId,
    `<< /Type /Pages /Count ${pages.length} /Kids [${pageIds.map((id) => `${id} 0 R`).join(' ')}] >>`,
  );

  objects.set(fontId, '<< /Type /Font /Subtype /Type1 /BaseFont /Courier >>');

  pages.forEach((pageLines, index) => {
    const pageId = pageIds[index];
    const contentId = contentIds[index];

    if (pageId === undefined || contentId === undefined) {
      return;
    }

    const commands: string[] = ['BT', '/F1 7 Tf', '30 560 Td', '8 TL'];
    for (const line of pageLines) {
      commands.push(`(${escapePdfText(line)}) Tj`);
      commands.push('T*');
    }

    commands.push('ET');

    const stream = `${commands.join('\n')}\n`;
    const length = Buffer.byteLength(stream, 'ascii');

    objects.set(contentId, `<< /Length ${length} >>\nstream\n${stream}endstream`);
    objects.set(
      pageId,
      `<< /Type /Page /Parent ${pagesId} 0 R /MediaBox [0 0 842 595] /Resources << /Font << /F1 ${fontId} 0 R >> >> /Contents ${contentId} 0 R >>`,
    );
  });

  let document = '%PDF-1.4\n';
  const offsets: number[] = new Array(maxObjectId + 1).fill(0);

  for (let id = 1; id <= maxObjectId; id += 1) {
    const body = objects.get(id);

    if (!body) {
      continue;
    }

    offsets[id] = Buffer.byteLength(document, 'ascii');
    document += `${id} 0 obj\n${body}\nendobj\n`;
  }

  const xrefOffset = Buffer.byteLength(document, 'ascii');
  document += `xref\n0 ${maxObjectId + 1}\n`;
  document += '0000000000 65535 f \n';

  for (let id = 1; id <= maxObjectId; id += 1) {
    document += `${String(offsets[id] ?? 0).padStart(10, '0')} 00000 n \n`;
  }

  document += `trailer\n<< /Size ${maxObjectId + 1} /Root ${catalogId} 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`;
  return Buffer.from(document, 'ascii');
}

export function buildTableExport(format: ExportFormat, data: ExportTableData): BuiltExport {
  switch (format) {
    case 'json':
      return { extension: 'json', bytes: buildJson(data) };

    case 'csv':
      return { extension: 'csv', bytes: buildCsv(data) };

    case 'html':
      return { extension: 'html', bytes: buildHtml(data) };

    case 'pdf':
      return { extension: 'pdf', bytes: buildPdf(data) };
  }
}

export function safeExportFileName(title: string): string {
  const trimmed = title
    .trim()
    .replace(/[\\/:*?"<>|\u0000-\u001F]/g, '-')
    .replace(/\s+/g, ' ');
  return (trimmed || 'queryable-export').slice(0, 120);
}
