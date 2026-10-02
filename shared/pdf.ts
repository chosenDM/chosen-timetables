/**
 * Professional landscape A4 timetable PDF — plain white, large bold fonts.
 * Title centred huge; school / term small on the right.
 * Break columns: full-height vertical bold labels (no fill colour).
 * Double lessons: merged cell (no divider, no "Double" text).
 */

function esc(s: string): string {
  return String(s ?? "")
    .replace(/\\/g, "\\\\")
    .replace(/\(/g, "\\(")
    .replace(/\)/g, "\\)");
}

function toBytes(str: string): Uint8Array {
  if (typeof TextEncoder !== "undefined") {
    return new TextEncoder().encode(str);
  }
  const arr = new Uint8Array(str.length);
  for (let i = 0; i < str.length; i++) arr[i] = str.charCodeAt(i) & 0xff;
  return arr;
}

export type PdfPeriod = {
  number: number;
  time: string;
  kind: string;
  label?: string;
};

export const SPAN_CONT = "__SPAN_CONT__";

function isBreakKind(k: string): boolean {
  return ["short_break", "long_break", "lunch", "assembly", "games", "break"].includes(
    (k || "").toLowerCase()
  );
}

function dayShort(day: string): string {
  const d = (day || "").trim();
  if (d.length <= 3) return d.toUpperCase();
  return d.slice(0, 3).toUpperCase();
}

function breakTitle(kind: string, label?: string): string {
  if (label && label.trim()) return label.trim().toUpperCase();
  const k = (kind || "").toLowerCase();
  if (k === "short_break") return "BREAK";
  if (k === "long_break") return "LONG BREAK";
  if (k === "lunch") return "LUNCH";
  if (k === "assembly") return "ASSEMBLY";
  if (k === "games") return "GAMES";
  return "BREAK";
}

export function buildTimetablePdf(opts: {
  title: string;
  subtitle?: string;
  schoolName: string;
  days: string[];
  periods: PdfPeriod[];
  grid: string[][];
  footer?: string;
  /** Master: smaller text, never merge doubles */
  compactCells?: boolean;
}): Uint8Array {
  const pageW = 842;
  const pageH = 595;
  const marginL = 20;
  const marginR = 20;
  const marginT = 22;
  const marginB = 18;

  const objects: string[] = [];
  let objId = 1;
  const addObj = (content: string) => {
    const id = objId++;
    objects.push(`${id} 0 obj\n${content}\nendobj`);
    return id;
  };

  const ops: string[] = [];

  const textAt = (x: number, y: number, size: number, t: string, bold = false) => {
    ops.push("BT");
    ops.push(`/${bold ? "F2" : "F1"} ${size} Tf`);
    ops.push(`${x.toFixed(1)} ${y.toFixed(1)} Td`);
    ops.push(`(${esc(t)}) Tj`);
    ops.push("ET");
  };

  const textCentered = (
    cx: number,
    y: number,
    size: number,
    t: string,
    bold = false
  ) => {
    // Helvetica-Bold capitals are wider than 0.5em — use better estimate so
    // single vertical letters sit in the true centre of the break column.
    const factor = bold ? 0.62 : 0.5;
    const w = String(t).length * size * factor;
    textAt(cx - w / 2, y, size, t, bold);
  };

  const strokeRect = (x: number, y: number, w: number, h: number) => {
    ops.push("1.2 w");
    ops.push("0 0 0 RG");
    ops.push(`${x.toFixed(1)} ${y.toFixed(1)} ${w.toFixed(1)} ${h.toFixed(1)} re S`);
  };

  // ── Header: huge centred title · school/term small on the right ─────────
  const title = (opts.title || "TIMETABLE").toUpperCase();
  const rightBits = [opts.schoolName || "", opts.subtitle || ""]
    .filter(Boolean)
    .join("  ·  ");

  let titleSize = 22;
  if (title.length > 22) titleSize = 18;
  if (title.length > 32) titleSize = 15;

  const titleY = pageH - marginT - 4;
  textCentered(pageW / 2, titleY, titleSize, title, true);

  if (rightBits) {
    const metaSize = 8;
    const metaW = rightBits.length * metaSize * 0.48;
    textAt(pageW - marginR - metaW, titleY + 2, metaSize, rightBits, false);
  }

  const periods = opts.periods;
  const days = opts.days;

  const tableLeft = marginL;
  const tableRight = pageW - marginR;
  const tableWidth = tableRight - tableLeft;
  const tableTop = titleY - 18;
  const tableBottom = marginB + 12;
  const tableHeight = Math.max(120, tableTop - tableBottom);

  const dayColW = 48;
  const periodColW = (tableWidth - dayColW) / Math.max(periods.length, 1);
  const headerRowH = Math.min(40, tableHeight * 0.13);
  const bodyH = tableHeight - headerRowH;
  const rowH = bodyH / Math.max(days.length, 1);

  const isCont = (di: number, pi: number) =>
    !opts.compactCells && (opts.grid[di]?.[pi] || "") === SPAN_CONT;

  const colX = (pi: number) => tableLeft + dayColW + pi * periodColW;

  // Which period indexes are break columns?
  const breakSet = new Set<number>();
  periods.forEach((p, pi) => {
    if (isBreakKind(p.kind)) breakSet.add(pi);
  });

  // Break spans (consecutive same-kind break columns)
  type Span = { start: number; end: number; label: string };
  const spans: Span[] = [];
  let si = 0;
  while (si < periods.length) {
    if (isBreakKind(periods[si].kind)) {
      const start = si;
      const label = breakTitle(periods[si].kind, periods[si].label);
      while (
        si + 1 < periods.length &&
        periods[si + 1].kind === periods[si].kind
      ) {
        si++;
      }
      spans.push({ start, end: si, label });
    }
    si++;
  }

  const isInBreakSpan = (pi: number) => breakSet.has(pi);

  // Outer border
  strokeRect(tableLeft, tableBottom, tableWidth, tableHeight);

  // Vertical line after day column
  ops.push("1.1 w 0 0 0 RG");
  ops.push(
    `${(tableLeft + dayColW).toFixed(1)} ${tableBottom.toFixed(1)} m ${(tableLeft + dayColW).toFixed(1)} ${tableTop.toFixed(1)} l S`
  );

  // Header verticals (all columns)
  for (let pi = 1; pi < periods.length; pi++) {
    const x = colX(pi);
    ops.push(
      `${x.toFixed(1)} ${(tableTop - headerRowH).toFixed(1)} m ${x.toFixed(1)} ${tableTop.toFixed(1)} l S`
    );
  }

  // Header bottom line
  ops.push(
    `${tableLeft.toFixed(1)} ${(tableTop - headerRowH).toFixed(1)} m ${tableRight.toFixed(1)} ${(tableTop - headerRowH).toFixed(1)} l S`
  );

  // Horizontal day separators — ONLY through day column + lesson columns
  // NEVER draw horizontal lines through break columns (so break is one empty tall cell)
  for (let di = 1; di < days.length; di++) {
    const yy = tableTop - headerRowH - di * rowH;
    // Day column segment
    ops.push(
      `${tableLeft.toFixed(1)} ${yy.toFixed(1)} m ${(tableLeft + dayColW).toFixed(1)} ${yy.toFixed(1)} l S`
    );
    // Lesson column segments only
    for (let pi = 0; pi < periods.length; pi++) {
      if (isInBreakSpan(pi)) continue;
      const x0 = colX(pi);
      const x1 = x0 + periodColW;
      ops.push(
        `${x0.toFixed(1)} ${yy.toFixed(1)} m ${x1.toFixed(1)} ${yy.toFixed(1)} l S`
      );
    }
  }

  // Body verticals — skip mid-double; always draw edges of break spans
  for (let di = 0; di < days.length; di++) {
    const yTop = tableTop - headerRowH - di * rowH;
    const yBot = yTop - rowH;
    for (let pi = 1; pi < periods.length; pi++) {
      // Skip divider inside a double merge
      if (isCont(di, pi)) continue;
      // Skip verticals that are interior of a multi-column break span
      const insideBreakInterior = spans.some(
        (sp) => pi > sp.start && pi <= sp.end
      );
      if (insideBreakInterior) continue;
      const x = colX(pi);
      ops.push(
        `${x.toFixed(1)} ${yBot.toFixed(1)} m ${x.toFixed(1)} ${yTop.toFixed(1)} l S`
      );
    }
  }

  // Draw full-height left/right edges of each break span (one tall empty cell)
  const bodyTop = tableTop - headerRowH;
  for (const span of spans) {
    const x0 = colX(span.start);
    const x1 = colX(span.end) + periodColW;
    // left edge (if not already table edge)
    ops.push(
      `${x0.toFixed(1)} ${tableBottom.toFixed(1)} m ${x0.toFixed(1)} ${bodyTop.toFixed(1)} l S`
    );
    // right edge
    ops.push(
      `${x1.toFixed(1)} ${tableBottom.toFixed(1)} m ${x1.toFixed(1)} ${bodyTop.toFixed(1)} l S`
    );
  }

  // ── Header labels ───────────────────────────────────────────────────────
  const headerMidY = tableTop - headerRowH / 2 - 2;
  textCentered(tableLeft + dayColW / 2, headerMidY, 11, "DAY", true);

  periods.forEach((p, pi) => {
    const cx = colX(pi) + periodColW / 2;
    if (isBreakKind(p.kind)) {
      const short =
        p.kind === "long_break"
          ? "L.BRK"
          : p.kind === "short_break"
            ? "BRK"
            : p.kind === "lunch"
              ? "LUNCH"
              : p.kind === "assembly"
                ? "ASSY"
                : p.kind === "games"
                  ? "GAMES"
                  : "BRK";
      textCentered(cx, headerMidY + 5, 8, short, true);
    } else {
      textCentered(cx, headerMidY + 5, 12, String(p.number), true);
    }
    if (p.time) {
      textCentered(cx, headerMidY - 9, 6.5, p.time.replace(/\s/g, ""), false);
    }
  });

  // ── ONE vertical bold label per break column — full body height ─────────
  // Column is otherwise EMPTY (no subject text, no horizontal cuts)
  for (const span of spans) {
    const x0 = colX(span.start);
    const w = (span.end - span.start + 1) * periodColW;
    const cx = x0 + w / 2;
    const chars = span.label.replace(/\s+/g, "").split(""); // no gaps between letters
    const fontSize = 35; // bold break labels (user-tuned)
    // PDF y is glyph baseline — leave top pad so first letter does not touch header line
    const topPad = 16;
    const bottomPad = 16;
    const usable = bodyH - topPad - bottomPad;
    const step = Math.min(40, usable / Math.max(chars.length, 1));
    // Start baseline low enough that the top of the first capital sits under the header
    let cy = bodyTop - topPad - fontSize * 0.72;
    for (const ch of chars) {
      textCentered(cx, cy, fontSize, ch, true);
      cy -= step;
    }
  }

  // ── Day labels + lesson cells only (never write into break columns) ─────
  days.forEach((day, di) => {
    const yTop = tableTop - headerRowH - di * rowH;
    const yMid = yTop - rowH / 2 - 4;

    textCentered(tableLeft + dayColW / 2, yMid, 15, dayShort(day), true); // days bold

    let pi = 0;
    while (pi < periods.length) {
      const p = periods[pi];
      if (isBreakKind(p.kind)) {
        pi++;
        continue; // leave break column empty of lesson text
      }
      if (isCont(di, pi)) {
        pi++;
        continue;
      }

      let spanCols = 1;
      if (pi + 1 < periods.length && isCont(di, pi + 1)) {
        spanCols = 2;
      }

      const cell = (opts.grid[di]?.[pi] || "").trim();
      if (cell && cell !== SPAN_CONT) {
        const x0 = colX(pi);
        const w = spanCols * periodColW;
        const cx = x0 + w / 2;
        // Class/teacher: larger subject; Master (compactCells): small one-line entries
        const compact = !!opts.compactCells;
        const subjSize = compact ? 7 : spanCols > 1 ? 16 : 15;
        const metaSize = compact ? 7 : 9;
        const maxChars = Math.max(3, Math.floor(w / (subjSize * 0.52)));
        const maxMeta = Math.max(3, Math.floor(w / (metaSize * 0.52)));
        const maxLines = compact ? 12 : 6;

        const lines: { text: string; bold: boolean; size: number }[] = [];
        const parts = cell.split("\n");
        parts.forEach((part, idx) => {
          // master lines are full "Class - SUBJ - code" — all same small size, not bold
          const bold = compact ? false : idx % 2 === 0;
          const size = bold ? subjSize : metaSize;
          const limit = bold ? maxChars : maxMeta;
          let rest = part.trim();
          if (!rest) return;
          while (rest.length > 0 && lines.length < maxLines) {
            lines.push({
              text: rest.slice(0, limit),
              bold,
              size,
            });
            rest = rest.slice(limit);
          }
        });

        const lineH = compact ? 8 : 11;
        const blockH = lines.length * lineH;
        let ly = yMid + blockH / 2 - lineH * 0.4;
        for (const ln of lines) {
          textCentered(cx, ly, ln.size, ln.text, ln.bold);
          ly -= lineH;
        }
      }
      pi += spanCols;
    }
  });

  if (opts.footer) {
    textAt(marginL, 8, 7, opts.footer, false);
  }

  const stream = ops.join("\n");
  const streamId = addObj(
    "<< /Length " + stream.length + " >>\nstream\n" + stream + "\nendstream"
  );
  const fontId = addObj(
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>"
  );
  const fontBoldId = addObj(
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>"
  );
  const pageId = addObj(
    "<< /Type /Page /Parent 0 0 R /MediaBox [0 0 " +
      pageW +
      " " +
      pageH +
      "] /Contents " +
      streamId +
      " 0 R /Resources << /Font << /F1 " +
      fontId +
      " 0 R /F2 " +
      fontBoldId +
      " 0 R >> >> >>"
  );
  const pagesId = addObj(
    "<< /Type /Pages /Kids [" + pageId + " 0 R] /Count 1 >>"
  );
  objects[pageId - 1] =
    pageId +
    " 0 obj\n<< /Type /Page /Parent " +
    pagesId +
    " 0 R /MediaBox [0 0 " +
    pageW +
    " " +
    pageH +
    "] /Contents " +
    streamId +
    " 0 R /Resources << /Font << /F1 " +
    fontId +
    " 0 R /F2 " +
    fontBoldId +
    " 0 R >> >> >>\nendobj";
  const catalogId = addObj(
    "<< /Type /Catalog /Pages " + pagesId + " 0 R >>"
  );

  let pdf = "%PDF-1.4\n";
  const offsets: number[] = [0];
  for (const obj of objects) {
    offsets.push(pdf.length);
    pdf += obj + "\n";
  }
  const xrefPos = pdf.length;
  pdf += "xref\n0 " + (objects.length + 1) + "\n";
  pdf += "0000000000 65535 f \n";
  for (let j = 1; j <= objects.length; j++) {
    pdf += String(offsets[j]).padStart(10, "0") + " 00000 n \n";
  }
  pdf +=
    "trailer\n<< /Size " +
    (objects.length + 1) +
    " /Root " +
    catalogId +
    " 0 R >>\nstartxref\n" +
    xrefPos +
    "\n%%EOF";
  return toBytes(pdf);
}


/** Master PDF: may span several landscape pages by splitting period columns. */
export function buildTimetablePdfMultiPage(opts: {
  title: string;
  subtitle?: string;
  schoolName: string;
  days: string[];
  periods: PdfPeriod[];
  grid: string[][];
  footer?: string;
  periodsPerPage?: number;
  compactCells?: boolean;
}): Uint8Array {
  const per = opts.periodsPerPage ?? 9;
  if (opts.periods.length <= per) {
    return buildTimetablePdf({ ...opts, compactCells: opts.compactCells ?? true });
  }

  const pageW = 842;
  const pageH = 595;
  const objects: string[] = [];
  let objId = 1;
  const addObj = (content: string) => {
    const id = objId++;
    objects.push(`${id} 0 obj\n${content}\nendobj`);
    return id;
  };

  const pageIds: number[] = [];
  const numPages = Math.ceil(opts.periods.length / per);

  for (let p = 0; p < numPages; p++) {
    const start = p * per;
    const slicePeriods = opts.periods.slice(start, start + per);
    const sliceGrid = opts.grid.map((row) => row.slice(start, start + per));
    // Build a full single-page PDF and extract is hard — instead inline call
    // Use temporary single page bytes and... 
    // Practical: recurse by calling buildTimetablePdf and store; merge catalogs later.
    void slicePeriods;
    void sliceGrid;
  }

  // Reliable approach: generate each page PDF and concatenate using a simple page-merge
  // of our known structure. For now generate sequential pages into one file:

  // Rebuild by calling single-page builder for each slice and merging with pdf page array
  const pagePdfs: Uint8Array[] = [];
  for (let p = 0; p < numPages; p++) {
    const start = p * per;
    pagePdfs.push(
      buildTimetablePdf({
        title: opts.title,
        subtitle:
          (opts.subtitle || "") +
          ` · periods ${start + 1}-${Math.min(start + per, opts.periods.length)} · p.${p + 1}/${numPages}`,
        schoolName: opts.schoolName,
        days: opts.days,
        periods: opts.periods.slice(start, start + per),
        grid: opts.grid.map((row) => row.slice(start, start + per)),
        footer: opts.footer,
        compactCells: opts.compactCells ?? true,
      })
    );
  }

  if (pagePdfs.length === 1) return pagePdfs[0];
  return mergeSimplePdfs(pagePdfs);
}

/** Merge single-page PDFs produced by buildTimetablePdf into one multi-page PDF. */
function mergeSimplePdfs(pages: Uint8Array[]): Uint8Array {
  // Decode as latin1 strings
  const decoder = typeof TextDecoder !== "undefined" ? new TextDecoder("latin1") : null;
  const toStr = (u: Uint8Array) => {
    if (decoder) return decoder.decode(u);
    let s = "";
    for (let i = 0; i < u.length; i++) s += String.fromCharCode(u[i]);
    return s;
  };

  // Extract body content streams between "stream\\n" and "\\nendstream" and fonts
  // Our PDFs have predictable structure — extract stream payloads
  const streams: string[] = [];
  for (const page of pages) {
    const s = toStr(page);
    const a = s.indexOf("stream\n");
    const b = s.indexOf("\nendstream", a);
    if (a >= 0 && b >= 0) streams.push(s.slice(a + 7, b));
  }
  if (!streams.length) return pages[0];

  const objects: string[] = [];
  let objId = 1;
  const addObj = (content: string) => {
    const id = objId++;
    objects.push(`${id} 0 obj\n${content}\nendobj`);
    return id;
  };

  const fontId = addObj("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>");
  const fontBoldId = addObj("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>");
  const pageIds: number[] = [];
  const pageW = 842;
  const pageH = 595;

  for (const stream of streams) {
    const streamId = addObj("<< /Length " + stream.length + " >>\nstream\n" + stream + "\nendstream");
    const pageId = addObj(
      "<< /Type /Page /Parent 0 0 R /MediaBox [0 0 " +
        pageW +
        " " +
        pageH +
        "] /Contents " +
        streamId +
        " 0 R /Resources << /Font << /F1 " +
        fontId +
        " 0 R /F2 " +
        fontBoldId +
        " 0 R >> >> >>"
    );
    pageIds.push(pageId);
  }

  const kids = pageIds.map((id) => id + " 0 R").join(" ");
  const pagesId = addObj("<< /Type /Pages /Kids [" + kids + "] /Count " + pageIds.length + " >>");
  // Fix parent refs
  for (const pid of pageIds) {
    objects[pid - 1] = objects[pid - 1].replace("/Parent 0 0 R", "/Parent " + pagesId + " 0 R");
  }
  const catalogId = addObj("<< /Type /Catalog /Pages " + pagesId + " 0 R >>");

  let pdf = "%PDF-1.4\n";
  const offsets = [0];
  for (const obj of objects) {
    offsets.push(pdf.length);
    pdf += obj + "\n";
  }
  const xrefPos = pdf.length;
  pdf += "xref\n0 " + (objects.length + 1) + "\n0000000000 65535 f \n";
  for (let i = 1; i <= objects.length; i++)
    pdf += String(offsets[i]).padStart(10, "0") + " 00000 n \n";
  pdf +=
    "trailer\n<< /Size " +
    (objects.length + 1) +
    " /Root " +
    catalogId +
    " 0 R >>\nstartxref\n" +
    xrefPos +
    "\n%%EOF";
  return toBytes(pdf);
}

/** Landscape list PDF (exam / remedial — unchanged API) */
export function buildListPdf(opts: {
  title: string;
  schoolName: string;
  rows: string[][];
  footer?: string;
  landscape?: boolean;
}): Uint8Array {
  const landscape = opts.landscape !== false;
  const pageW = landscape ? 842 : 595;
  const pageH = landscape ? 595 : 842;
  const objects: string[] = [];
  let objId = 1;
  const addObj = (content: string) => {
    const id = objId++;
    objects.push(id + " 0 obj\n" + content + "\nendobj");
    return id;
  };
  const lines: string[] = [];
  const text = (x: number, y: number, size: number, t: string, bold = false) => {
    lines.push(
      "BT /" +
        (bold ? "F2" : "F1") +
        " " +
        size +
        " Tf " +
        x +
        " " +
        y +
        " Td (" +
        esc(t) +
        ") Tj ET"
    );
  };
  let y = pageH - 40;
  const title = opts.title || "";
  text(pageW / 2 - title.length * 4, y, 16, title, true);
  y -= 14;
  text(40, y, 10, opts.schoolName || "", false);
  y -= 22;
  const colCount = Math.max(1, opts.rows[0]?.length || 1);
  const usableW = pageW - 80;
  const colW = usableW / colCount;
  opts.rows.forEach((row, ri) => {
    if (y < 36) return;
    let x = 40;
    const bold = ri === 0;
    for (const cell of row) {
      text(x, y, bold ? 9 : 8, String(cell).slice(0, 40), bold);
      x += colW;
    }
    y -= bold ? 16 : 13;
  });
  if (opts.footer) text(40, 16, 7, opts.footer, false);
  const stream = lines.join("\n");
  const streamId = addObj(
    "<< /Length " + stream.length + " >>\nstream\n" + stream + "\nendstream"
  );
  const fontId = addObj(
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>"
  );
  const fontBoldId = addObj(
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>"
  );
  const pageId = addObj(
    "<< /Type /Page /Parent 0 0 R /MediaBox [0 0 " +
      pageW +
      " " +
      pageH +
      "] /Contents " +
      streamId +
      " 0 R /Resources << /Font << /F1 " +
      fontId +
      " 0 R /F2 " +
      fontBoldId +
      " 0 R >> >> >>"
  );
  const pagesId = addObj(
    "<< /Type /Pages /Kids [" + pageId + " 0 R] /Count 1 >>"
  );
  objects[pageId - 1] =
    pageId +
    " 0 obj\n<< /Type /Page /Parent " +
    pagesId +
    " 0 R /MediaBox [0 0 " +
    pageW +
    " " +
    pageH +
    "] /Contents " +
    streamId +
    " 0 R /Resources << /Font << /F1 " +
    fontId +
    " 0 R /F2 " +
    fontBoldId +
    " 0 R >> >> >>\nendobj";
  const catalogId = addObj(
    "<< /Type /Catalog /Pages " + pagesId + " 0 R >>"
  );
  let pdf = "%PDF-1.4\n";
  const offsets = [0];
  for (const obj of objects) {
    offsets.push(pdf.length);
    pdf += obj + "\n";
  }
  const xrefPos = pdf.length;
  pdf += "xref\n0 " + (objects.length + 1) + "\n0000000000 65535 f \n";
  for (let i = 1; i <= objects.length; i++)
    pdf += String(offsets[i]).padStart(10, "0") + " 00000 n \n";
  pdf +=
    "trailer\n<< /Size " +
    (objects.length + 1) +
    " /Root " +
    catalogId +
    " 0 R >>\nstartxref\n" +
    xrefPos +
    "\n%%EOF";
  return toBytes(pdf);
}

/** Exam matrix PDF (kept for exam module) */
/**
 * Exam timetable PDF — Kakamega-style layout:
 * | DAY & DATE | SESSION | FORM 3 | FORM 4 | ... |
 * Day cell spans all sessions that day.
 * Cell: SUBJECT + invigilator codes.
 */

/**
 * Professional landscape exam timetable.
 * For each day: table with Class | Session1 | Session2 | ...
 * Cell: SUBJECT (bold) + teacher codes under.
 */
export function buildExamMatrixPdf(opts: {
  schoolName: string;
  title: string;
  subtitle?: string;
  sessionColumns: { key: string; label: string }[];
  rows: {
    date: string;
    dayLabel: string;
    className: string;
    cells: Record<string, string>;
  }[];
  footer?: string;
  formColumns?: string[];
  examRows?: {
    date: string;
    dayLabel: string;
    sessionLabel: string;
    sessionTime: string;
    byForm: Record<string, string>;
  }[];
  /** Preferred structured input: one block per day */
  dayBlocks?: {
    dayLabel: string;
    date: string;
    /** classLevel -> sessionKey -> "SUBJECT\\ncodes" */
    matrix: Record<string, Record<string, string>>;
  }[];
  /** Session defs for columns */
  sessions?: { key: string; label: string; startTime: string; endTime: string }[];
}): Uint8Array {
  const pageW = 842;
  const pageH = 595;
  const marginL = 28;
  const marginR = 28;
  const marginT = 30;
  const marginB = 24;

  const objects: string[] = [];
  let objId = 1;
  const addObj = (content: string) => {
    const id = objId++;
    objects.push(`${id} 0 obj\n${content}\nendobj`);
    return id;
  };

  const ops: string[] = [];
  const textAt = (x: number, y: number, size: number, t: string, bold = false) => {
    ops.push("BT");
    ops.push(`/${bold ? "F2" : "F1"} ${size} Tf`);
    ops.push(`${x.toFixed(1)} ${y.toFixed(1)} Td`);
    ops.push(`(${esc(t)}) Tj`);
    ops.push("ET");
  };
  const textCentered = (cx: number, y: number, size: number, t: string, bold = false) => {
    const w = String(t).length * size * (bold ? 0.52 : 0.48);
    textAt(cx - w / 2, y, size, t, bold);
  };
  const strokeRect = (x: number, y: number, w: number, h: number) => {
    ops.push("0.9 w 0 0 0 RG");
    ops.push(`${x.toFixed(1)} ${y.toFixed(1)} ${w.toFixed(1)} ${h.toFixed(1)} re S`);
  };

  // Normalize to dayBlocks
  let dayBlocks = opts.dayBlocks;
  let sessions = opts.sessions;

  if (!sessions || !sessions.length) {
    if (opts.sessionColumns?.length) {
      sessions = opts.sessionColumns.map((c, i) => ({
        key: c.key,
        label: c.label.split(/\s+/)[0] || `Session ${i + 1}`,
        startTime: "",
        endTime: "",
      }));
    } else if (opts.examRows?.length) {
      const seen = new Map<string, { key: string; label: string; startTime: string; endTime: string }>();
      for (const r of opts.examRows) {
        const key = `${r.sessionLabel}|${r.sessionTime}`;
        if (!seen.has(key)) {
          seen.set(key, {
            key,
            label: r.sessionLabel,
            startTime: r.sessionTime,
            endTime: "",
          });
        }
      }
      sessions = Array.from(seen.values());
    } else {
      sessions = [];
    }
  }

  if (!dayBlocks || !dayBlocks.length) {
    // Build from examRows (session-centric) or rows
    dayBlocks = [];
    if (opts.examRows?.length) {
      const byDay = new Map<string, typeof opts.examRows>();
      for (const r of opts.examRows) {
        const k = r.dayLabel;
        const list = byDay.get(k) || [];
        list.push(r);
        byDay.set(k, list);
      }
      for (const [dayLabel, list] of Array.from(byDay.entries())) {
        const matrix: Record<string, Record<string, string>> = {};
        for (const r of list) {
          const sk = `${r.sessionLabel}|${r.sessionTime}`;
          for (const [form, cell] of Object.entries(r.byForm || {})) {
            if (!matrix[form]) matrix[form] = {};
            matrix[form][sk] = cell;
          }
        }
        dayBlocks.push({ dayLabel, date: list[0]?.date || "", matrix });
      }
    } else if (opts.rows?.length) {
      const byDay = new Map<string, typeof opts.rows>();
      for (const r of opts.rows) {
        const list = byDay.get(r.dayLabel) || [];
        list.push(r);
        byDay.set(r.dayLabel, list);
      }
      for (const [dayLabel, list] of Array.from(byDay.entries())) {
        const matrix: Record<string, Record<string, string>> = {};
        for (const r of list) {
          if (!matrix[r.className]) matrix[r.className] = {};
          for (const [k, v] of Object.entries(r.cells || {})) {
            if (v) matrix[r.className][k] = v;
          }
        }
        dayBlocks.push({ dayLabel, date: list[0]?.date || "", matrix });
      }
    }
  }

  if (!sessions) sessions = [];
  if (!dayBlocks) dayBlocks = [];

  // Header
  let y = pageH - marginT;
  textCentered(pageW / 2, y, 12, (opts.schoolName || "SCHOOL").toUpperCase(), true);
  y -= 16;
  textCentered(pageW / 2, y, 16, (opts.title || "EXAMINATION TIMETABLE").toUpperCase(), true);
  y -= 13;
  if (opts.subtitle) {
    textCentered(pageW / 2, y, 10, opts.subtitle, false);
    y -= 12;
  }
  y -= 4;

  const tableW = pageW - marginL - marginR;
  const classColW = 70;
  const sessW = sessions.length
    ? (tableW - classColW) / sessions.length
    : tableW - classColW;
  const headerH = 30;
  const rowH = 34;

  for (const block of dayBlocks) {
    if (y < marginB + 80) break;

    // Day heading
    textAt(marginL, y, 11, block.dayLabel.toUpperCase().replace(/[^\x20-\x7E]/g, " "), true);
    y -= 14;

    // Column headers
    let x = marginL;
    strokeRect(x, y - headerH, classColW, headerH);
    textCentered(x + classColW / 2, y - headerH / 2 - 3, 9, "CLASS", true);
    x += classColW;
    for (const s of sessions) {
      strokeRect(x, y - headerH, sessW, headerH);
      const l1 = (s.label || "Session").slice(0, 14);
      const l2 = [s.startTime, s.endTime].filter(Boolean).join("-").slice(0, 16)
        || (s as { startTime?: string }).startTime
        || "";
      textCentered(x + sessW / 2, y - headerH / 2 + 4, 8, l1, true);
      if (l2) textCentered(x + sessW / 2, y - headerH / 2 - 8, 7, l2, false);
      x += sessW;
    }
    y -= headerH;

    const forms = Object.keys(block.matrix).sort();
    for (const form of forms) {
      if (y < marginB + rowH) break;
      x = marginL;
      strokeRect(x, y - rowH, classColW, rowH);
      textCentered(x + classColW / 2, y - rowH / 2 - 3, 9, form.slice(0, 12), true);
      x += classColW;
      for (const s of sessions) {
        strokeRect(x, y - rowH, sessW, rowH);
        const cell = (block.matrix[form]?.[s.key] || "").trim();
        if (cell) {
          const lines = cell
            .split("\n")
            .map((l) => l.replace(/[^\x20-\x7E]/g, "-").trim())
            .filter(Boolean);
          const subj = (lines[0] || "").toUpperCase().slice(0, 18);
          const codes = lines.slice(1).join(" ").slice(0, 24);
          textCentered(x + sessW / 2, y - rowH / 2 + (codes ? 5 : -2), 10, subj, true);
          if (codes) {
            textCentered(x + sessW / 2, y - rowH / 2 - 8, 8, codes, false);
          }
        }
        x += sessW;
      }
      y -= rowH;
    }
    y -= 16; // gap between days
  }

  if (opts.footer) {
    textAt(marginL, 12, 7, opts.footer.replace(/[^\x20-\x7E]/g, "-"), false);
  }

  const stream = ops.join("\n");
  const streamId = addObj("<< /Length " + stream.length + " >>\nstream\n" + stream + "\nendstream");
  const fontId = addObj("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>");
  const fontBoldId = addObj("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>");
  const pageId = addObj(
    "<< /Type /Page /Parent 0 0 R /MediaBox [0 0 " + pageW + " " + pageH +
    "] /Contents " + streamId + " 0 R /Resources << /Font << /F1 " + fontId +
    " 0 R /F2 " + fontBoldId + " 0 R >> >> >>"
  );
  const pagesId = addObj("<< /Type /Pages /Kids [" + pageId + " 0 R] /Count 1 >>");
  objects[pageId - 1] =
    pageId + " 0 obj\n<< /Type /Page /Parent " + pagesId +
    " 0 R /MediaBox [0 0 " + pageW + " " + pageH +
    "] /Contents " + streamId + " 0 R /Resources << /Font << /F1 " +
    fontId + " 0 R /F2 " + fontBoldId + " 0 R >> >> >>\nendobj";
  const catalogId = addObj("<< /Type /Catalog /Pages " + pagesId + " 0 R >>");
  let pdf = "%PDF-1.4\n";
  const offsets = [0];
  for (const obj of objects) {
    offsets.push(pdf.length);
    pdf += obj + "\n";
  }
  const xrefPos = pdf.length;
  pdf += "xref\n0 " + (objects.length + 1) + "\n0000000000 65535 f \n";
  for (let j = 1; j <= objects.length; j++)
    pdf += String(offsets[j]).padStart(10, "0") + " 00000 n \n";
  pdf +=
    "trailer\n<< /Size " + (objects.length + 1) + " /Root " + catalogId +
    " 0 R >>\nstartxref\n" + xrefPos + "\n%%EOF";
  return toBytes(pdf);
}


/** Remedial landscape PDF — same day × class × session matrix as exam */
export function buildRemedialMatrixPdf(opts: {
  schoolName: string;
  title: string;
  subtitle?: string;
  footer?: string;
  dayBlocks: {
    dayLabel: string;
    date?: string;
    matrix: Record<string, Record<string, string>>;
  }[];
  sessions: { key: string; label: string; startTime: string; endTime: string }[];
}): Uint8Array {
  return buildExamMatrixPdf({
    schoolName: opts.schoolName,
    title: opts.title,
    subtitle: opts.subtitle,
    footer: opts.footer,
    sessionColumns: [],
    rows: [],
    dayBlocks: opts.dayBlocks.map((b) => ({
      dayLabel: b.dayLabel,
      date: b.date || "",
      matrix: b.matrix,
    })),
    sessions: opts.sessions,
  });
}
