export interface ExportTable {
  title: string;
  headers: string[];
  rows: Array<Array<string | number>>;
}

function csvEscape(value: string | number): string {
  const text = String(value);
  if (/[",\n\r]/.test(text)) return `"${text.replaceAll('"', '""')}"`;
  return text;
}

export function buildCsv(table: ExportTable): Buffer {
  const lines = [
    table.headers.map(csvEscape).join(","),
    ...table.rows.map((row) => row.map(csvEscape).join(",")),
  ];
  return Buffer.from(`\uFEFF${lines.join("\r\n")}\r\n`, "utf8");
}

function xmlEscape(value: string | number): string {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

export function buildExcelXml(table: ExportTable): Buffer {
  const rows = [table.headers, ...table.rows]
    .map((row) => `<Row>${row.map((cell) => `<Cell><Data ss:Type="${typeof cell === "number" ? "Number" : "String"}">${xmlEscape(cell)}</Data></Cell>`).join("")}</Row>`)
    .join("");
  const xml = `<?xml version="1.0"?>\n<?mso-application progid="Excel.Sheet"?>\n<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet" xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet"><Worksheet ss:Name="Report"><Table>${rows}</Table></Worksheet></Workbook>`;
  return Buffer.from(xml, "utf8");
}

function pdfText(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/[^\x20-\x7E]/g, "?")
    .replaceAll("\\", "\\\\")
    .replaceAll("(", "\\(")
    .replaceAll(")", "\\)");
}

function truncate(value: string, max = 130): string {
  return value.length <= max ? value : `${value.slice(0, max - 3)}...`;
}

export function buildPdf(table: ExportTable): Buffer {
  const textLines = [
    table.title,
    "",
    table.headers.join(" | "),
    "-".repeat(110),
    ...table.rows.map((row) => row.map((cell) => String(cell)).join(" | ")),
  ].map((line) => truncate(line));

  const pageChunks: string[][] = [];
  for (let index = 0; index < textLines.length; index += 48) {
    pageChunks.push(textLines.slice(index, index + 48));
  }
  if (pageChunks.length === 0) pageChunks.push([table.title]);

  const pageIds = pageChunks.map((_, index) => 4 + index * 2);
  const contentIds = pageChunks.map((_, index) => 5 + index * 2);
  const objects: string[] = [];
  objects[1] = "<< /Type /Catalog /Pages 2 0 R >>";
  objects[2] = `<< /Type /Pages /Kids [${pageIds.map((id) => `${id} 0 R`).join(" ")}] /Count ${pageIds.length} >>`;
  objects[3] = "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>";

  pageChunks.forEach((lines, index) => {
    const pageId = pageIds[index];
    const contentId = contentIds[index];
    if (pageId === undefined || contentId === undefined) return;
    objects[pageId] = `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 3 0 R >> >> /Contents ${contentId} 0 R >>`;
    const commands = ["BT", "/F1 8 Tf", "36 756 Td", "11 TL"];
    lines.forEach((line, lineIndex) => {
      if (lineIndex > 0) commands.push("T*");
      commands.push(`(${pdfText(line)}) Tj`);
    });
    commands.push("ET");
    const stream = commands.join("\n");
    objects[contentId] = `<< /Length ${Buffer.byteLength(stream, "utf8")} >>\nstream\n${stream}\nendstream`;
  });

  let output = "%PDF-1.4\n";
  const offsets: number[] = [0];
  const maxId = objects.length - 1;
  for (let id = 1; id <= maxId; id += 1) {
    const body = objects[id] ?? "<< >>";
    offsets[id] = Buffer.byteLength(output, "utf8");
    output += `${id} 0 obj\n${body}\nendobj\n`;
  }
  const xrefOffset = Buffer.byteLength(output, "utf8");
  output += `xref\n0 ${maxId + 1}\n0000000000 65535 f \n`;
  for (let id = 1; id <= maxId; id += 1) {
    output += `${String(offsets[id] ?? 0).padStart(10, "0")} 00000 n \n`;
  }
  output += `trailer\n<< /Size ${maxId + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`;
  return Buffer.from(output, "utf8");
}
