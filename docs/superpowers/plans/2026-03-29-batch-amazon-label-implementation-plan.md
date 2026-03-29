# Batch Amazon Label Workspace Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a project-local batch Amazon label page that accepts Excel-style table paste, validates every row, previews one label at a time, and exports one ZIP containing one PDF per row.

**Architecture:** Keep the user entrypoint as a locally openable `Labelcreator.html`, but move reusable logic into small adjacent ES modules so parsing, validation, selection, file naming, barcode rendering, and PDF generation stay testable. Reuse the proven barcode and PDF math from the older single-label page, replace the single-record form with a batch workspace, and vendor a local ZIP library so runtime stays offline.

**Tech Stack:** Vanilla HTML/CSS/JavaScript modules, Node built-in `node:test`, local vendored `JSZip`, native Blob/Object URL APIs, existing custom Code128/PDF logic.

---

## File Structure

- `Labelcreator.html`
  Project-local batch workspace entrypoint. Owns layout, static copy, script tags, and no business logic beyond mounting points.
- `labelcreator-core.js`
  Pure functions for parsing pasted text, defaulting `Store Name`, forcing `Condition = NEW`, validating records, building preview view-models, and generating safe PDF filenames.
- `labelcreator-pdf.js`
  Barcode encoding, SVG preview barcode markup, and native PDF Blob generation reused from the existing single-label implementation.
- `labelcreator-app.js`
  Browser orchestration: textarea paste handling, table rendering, row selection, previous/next navigation, status updates, and ZIP export wiring.
- `vendor/jszip.min.js`
  Local runtime dependency for ZIP creation. Loaded from disk, never from a CDN.
- `tests/labelcreator-core.test.mjs`
  Unit coverage for parsing, defaults, validation, navigation helpers, and filename generation.
- `tests/labelcreator-pdf.test.mjs`
  Unit coverage for barcode encoding and PDF generation guardrails.
- `.gitignore`
  Ignore `node_modules/`, `.DS_Store`, and generated temporary files.
- `package.json`
  Minimal local scripts for `node --test`; no build step required.

## Task 1: Bootstrap The Project-Local Workspace

**Files:**
- Create: `.gitignore`
- Create: `package.json`
- Create: `tests/labelcreator-core.test.mjs`
- Create: `labelcreator-core.js`
- Create: `labelcreator-app.js`
- Create: `Labelcreator.html`

- [ ] **Step 1: Write the first failing test for the project-local core module**

```js
// tests/labelcreator-core.test.mjs
import test from "node:test";
import assert from "node:assert/strict";
import { parseBatchText } from "../labelcreator-core.js";

test("parseBatchText returns one normalized record for one pasted row", () => {
  const rows = parseBatchText("SKU-1\tX001\tMFG-1\t中文名\tItem Name\tNA");

  assert.equal(rows.length, 1);
  assert.equal(rows[0].sku, "SKU-1");
  assert.equal(rows[0].condition, "NEW");
});
```

- [ ] **Step 2: Run the test to verify the workspace is still missing**

Run: `node --test tests/labelcreator-core.test.mjs`
Expected: FAIL with `ERR_MODULE_NOT_FOUND` for `../labelcreator-core.js`

- [ ] **Step 3: Create the local implementation scaffold**

```json
// package.json
{
  "name": "labelcreator",
  "private": true,
  "type": "module",
  "scripts": {
    "test": "node --test"
  }
}
```

```gitignore
# .gitignore
node_modules/
.DS_Store
*.log
```

```js
// labelcreator-core.js
export function parseBatchText(text) {
  const lines = String(text || "").trim().split(/\r?\n/).filter(Boolean);
  return lines.map((line) => {
    const [sku = "", fnsku = "", manufactureSku = "", productChineseName = "", itemName = "", storeName = ""] = line.split("\t");
    return {
      sku: sku.trim(),
      fnsku: fnsku.trim(),
      manufactureSku: manufactureSku.trim(),
      productChineseName: productChineseName.trim(),
      itemName: itemName.trim(),
      storeName: (storeName.trim() || "NA"),
      condition: "NEW"
    };
  });
}
```

```js
// labelcreator-app.js
export function mountApp() {
  return true;
}
```

```bash
cp "/Users/patrick/Documents/New project/Labelcreator.html" "/Users/patrick/Documents/LabelCreating Project/Labelcreator.html"
git init
```

- [ ] **Step 4: Run the test suite to verify the local scaffold works**

Run: `npm test`
Expected: PASS with `1 test`

- [ ] **Step 5: Commit the scaffold**

```bash
git add .gitignore package.json Labelcreator.html labelcreator-core.js labelcreator-app.js tests/labelcreator-core.test.mjs
git commit -m "chore: scaffold local batch label workspace"
```

## Task 2: Implement Batch Parsing, Defaulting, And Row Shape

**Files:**
- Modify: `labelcreator-core.js`
- Modify: `tests/labelcreator-core.test.mjs`

- [ ] **Step 1: Extend the core test with real batch parsing requirements**

```js
test("parseBatchText ignores blank lines and defaults Store Name and Condition", () => {
  const input = [
    "SKU-1\tX001\tMFG-1\t中文名 1\tItem One\t",
    "",
    "SKU-2\tX002\tMFG-2\t中文名 2\tItem Two\tEU"
  ].join("\n");

  const rows = parseBatchText(input);

  assert.equal(rows.length, 2);
  assert.deepEqual(rows[0], {
    rowNumber: 1,
    sku: "SKU-1",
    fnsku: "X001",
    manufactureSku: "MFG-1",
    productChineseName: "中文名 1",
    itemName: "Item One",
    storeName: "NA",
    condition: "NEW",
    rawColumns: ["SKU-1", "X001", "MFG-1", "中文名 1", "Item One", ""]
  });
  assert.equal(rows[1].storeName, "EU");
});

test("parseBatchText preserves rows with missing columns for later validation", () => {
  const rows = parseBatchText("SKU-1\tX001\tMFG-1\t中文名 1");
  assert.equal(rows[0].rawColumns.length, 4);
  assert.equal(rows[0].itemName, "");
});
```

- [ ] **Step 2: Run the test to confirm the parser is still too weak**

Run: `node --test tests/labelcreator-core.test.mjs`
Expected: FAIL because `rowNumber` and `rawColumns` are missing

- [ ] **Step 3: Upgrade the parser to return stable normalized records**

```js
const EXPECTED_COLUMNS = 6;

function cleanCell(value) {
  return String(value ?? "").trim();
}

export function parseBatchText(text) {
  const lines = String(text || "").split(/\r?\n/);
  const records = [];

  lines.forEach((line, index) => {
    if (!line.trim()) return;

    const columns = line.split("\t");
    const padded = [...columns];
    while (padded.length < EXPECTED_COLUMNS) padded.push("");

    records.push({
      rowNumber: index + 1,
      sku: cleanCell(padded[0]),
      fnsku: cleanCell(padded[1]),
      manufactureSku: cleanCell(padded[2]),
      productChineseName: cleanCell(padded[3]),
      itemName: cleanCell(padded[4]),
      storeName: cleanCell(padded[5]) || "NA",
      condition: "NEW",
      rawColumns: columns.map(cleanCell)
    });
  });

  return records;
}
```

- [ ] **Step 4: Re-run the parser tests**

Run: `npm test`
Expected: PASS with the parser tests green

- [ ] **Step 5: Commit the parser work**

```bash
git add labelcreator-core.js tests/labelcreator-core.test.mjs
git commit -m "feat: parse pasted rows into normalized batch records"
```

## Task 3: Add Validation, Navigation Helpers, And Safe File Naming

**Files:**
- Modify: `labelcreator-core.js`
- Modify: `tests/labelcreator-core.test.mjs`

- [ ] **Step 1: Write failing tests for validation, row navigation, and export filename rules**

```js
import {
  parseBatchText,
  validateRecords,
  buildPdfFilename,
  selectAdjacentIndex
} from "../labelcreator-core.js";

test("validateRecords blocks rows with missing required fields and invalid store values", () => {
  const rows = parseBatchText([
    "SKU-1\tX001\tMFG-1\t中文名 1\tItem One\tNA",
    "SKU-2\t\tMFG-2\t中文名 2\tItem Two\tBAD"
  ].join("\n"));

  const result = validateRecords(rows);

  assert.equal(result.canExport, false);
  assert.equal(result.errors.length, 2);
  assert.match(result.errors[0].message, /FNSKU/);
  assert.match(result.errors[1].message, /Store Name/);
});

test("buildPdfFilename uses the agreed naming rule and replaces unsafe characters", () => {
  const filename = buildPdfFilename({
    productChineseName: "浴室凳/24",
    storeName: "NA",
    fnsku: "X001:ABC"
  });

  assert.equal(filename, "【标签】--浴室凳-24--NA--X001-ABC.pdf");
});

test("selectAdjacentIndex clamps previous and next navigation at the edges", () => {
  assert.equal(selectAdjacentIndex(0, 3, -1), 0);
  assert.equal(selectAdjacentIndex(0, 3, 1), 1);
  assert.equal(selectAdjacentIndex(2, 3, 1), 2);
});
```

- [ ] **Step 2: Run the tests to verify these helpers do not exist yet**

Run: `node --test tests/labelcreator-core.test.mjs`
Expected: FAIL with missing exports or assertion failures

- [ ] **Step 3: Implement validation and helper logic**

```js
const ALLOWED_STORES = new Set(["NA", "EU", "AU", "Walmart-US"]);
const REQUIRED_FIELDS = [
  ["sku", "SKU"],
  ["fnsku", "FNSKU"],
  ["manufactureSku", "Manufacture SKU"],
  ["productChineseName", "产品中文名称"],
  ["itemName", "Item Name"]
];

export function validateRecords(records) {
  const errors = [];
  const rows = records.map((record) => {
    const rowErrors = [];

    if (record.rawColumns.length !== 6) {
      rowErrors.push({
        rowNumber: record.rowNumber,
        field: "row",
        message: `Row ${record.rowNumber} must contain exactly 6 columns`
      });
    }

    for (const [key, label] of REQUIRED_FIELDS) {
      if (!record[key]) {
        rowErrors.push({
          rowNumber: record.rowNumber,
          field: key,
          message: `Row ${record.rowNumber}: ${label} is required`
        });
      }
    }

    if (!ALLOWED_STORES.has(record.storeName)) {
      rowErrors.push({
        rowNumber: record.rowNumber,
        field: "storeName",
        message: `Row ${record.rowNumber}: Store Name must be one of NA, EU, AU, Walmart-US`
      });
    }

    errors.push(...rowErrors);
    return { ...record, errors: rowErrors };
  });

  return {
    records: rows,
    errors,
    canExport: rows.length > 0 && errors.length === 0
  };
}

export function buildPdfFilename(record) {
  const safe = (value) => String(value ?? "").replace(/[\\/:*?"<>|]/g, "-").trim();
  return `【标签】--${safe(record.productChineseName)}--${safe(record.storeName)}--${safe(record.fnsku)}.pdf`;
}

export function selectAdjacentIndex(currentIndex, total, direction) {
  return Math.max(0, Math.min(total - 1, currentIndex + direction));
}
```

- [ ] **Step 4: Run the full core tests**

Run: `npm test`
Expected: PASS with parsing, validation, naming, and navigation tests all green

- [ ] **Step 5: Commit the helper layer**

```bash
git add labelcreator-core.js tests/labelcreator-core.test.mjs
git commit -m "feat: add batch validation and export naming helpers"
```

## Task 4: Replace The Single-Record Form With The Batch Workspace UI

**Files:**
- Modify: `Labelcreator.html`
- Modify: `labelcreator-app.js`
- Modify: `labelcreator-core.js`
- Modify: `tests/labelcreator-core.test.mjs`

- [ ] **Step 1: Add a failing view-model test for preview selection**

```js
import { toPreviewRecord } from "../labelcreator-core.js";

test("toPreviewRecord keeps 产品中文名称 out of the label but keeps Condition fixed", () => {
  const preview = toPreviewRecord({
    sku: "SKU-1",
    fnsku: "X001",
    manufactureSku: "MFG-1",
    productChineseName: "中文名 1",
    itemName: "Item One",
    storeName: "NA",
    condition: "NEW"
  });

  assert.equal(preview.condition, "NEW");
  assert.equal(preview.storeName, "NA");
  assert.equal("productChineseName" in preview, false);
});
```

- [ ] **Step 2: Run the core tests to confirm the preview mapper is missing**

Run: `node --test tests/labelcreator-core.test.mjs`
Expected: FAIL with missing `toPreviewRecord`

- [ ] **Step 3: Update the HTML shell and browser orchestration for batch mode**

```html
<!-- Labelcreator.html -->
<section class="panel form-panel">
  <h2 class="section-title">批量标签数据</h2>
  <p class="hint">粘贴顺序：SKU | FNSKU | Manufacture SKU | 产品中文名称 | Item Name | Store Name</p>
  <textarea id="pasteInput" class="paste-input" placeholder="直接粘贴 Excel 多行数据"></textarea>

  <div class="toolbar">
    <button type="button" class="secondary" id="clearData">清空数据</button>
    <button type="button" class="ghost" id="validateData">校验数据</button>
    <button type="button" class="primary" id="exportZip" disabled>导出 ZIP</button>
  </div>

  <div class="status" id="status"></div>
  <div class="table-shell">
    <table class="records-table">
      <thead>
        <tr>
          <th>Row</th>
          <th>SKU</th>
          <th>FNSKU</th>
          <th>Manufacture SKU</th>
          <th>产品中文名称</th>
          <th>Store Name</th>
        </tr>
      </thead>
      <tbody id="recordsBody"></tbody>
    </table>
  </div>
</section>
```

```js
// labelcreator-core.js
export function toPreviewRecord(record) {
  return {
    manufactureSku: record.manufactureSku,
    fnsku: record.fnsku,
    sku: record.sku,
    itemName: record.itemName,
    storeName: record.storeName,
    condition: "NEW"
  };
}
```

```js
// labelcreator-app.js
import {
  parseBatchText,
  validateRecords,
  selectAdjacentIndex,
  toPreviewRecord
} from "./labelcreator-core.js";

const state = {
  records: [],
  selectedIndex: 0
};

function syncFromTextarea() {
  const parsed = parseBatchText(document.getElementById("pasteInput").value);
  const result = validateRecords(parsed);
  state.records = result.records;
  state.selectedIndex = 0;
  renderTable(result.records);
  renderPreview(result.records[0] ? toPreviewRecord(result.records[0]) : null);
  updateStatus(result);
}
```

- [ ] **Step 4: Run tests and do one browser smoke check**

Run: `npm test`
Expected: PASS

Run: `python3 -m http.server 4173`
Expected: `Serving HTTP on` output, then open `http://127.0.0.1:4173/Labelcreator.html` and verify:
- the single-record fields are gone
- the paste textarea, table, and ZIP button are visible
- the preview pane still renders one label card

- [ ] **Step 5: Commit the batch UI shell**

```bash
git add Labelcreator.html labelcreator-app.js labelcreator-core.js tests/labelcreator-core.test.mjs
git commit -m "feat: replace single-form UI with batch workspace shell"
```

## Task 5: Extract And Reuse The Barcode And PDF Engine

**Files:**
- Create: `tests/labelcreator-pdf.test.mjs`
- Create: `labelcreator-pdf.js`
- Modify: `labelcreator-app.js`

- [ ] **Step 1: Write failing tests for barcode encoding and PDF generation**

```js
// tests/labelcreator-pdf.test.mjs
import test from "node:test";
import assert from "node:assert/strict";
import { encodeCode128B, buildPdf } from "../labelcreator-pdf.js";

test("encodeCode128B returns bar segments for ASCII FNSKU input", () => {
  const barcode = encodeCode128B("X0050P4BTR");
  assert.ok(barcode.totalModules > 0);
  assert.ok(barcode.bars.some((segment) => segment.isBar));
});

test("buildPdf returns an application/pdf blob for ASCII label content", async () => {
  const blob = buildPdf({
    manufactureSku: "25W027",
    fnsku: "X0050P4BTR",
    sku: "F-TSB-C3-TK-TW",
    itemName: "TeakAura Bench",
    storeName: "NA",
    condition: "NEW"
  });

  assert.equal(blob.type, "application/pdf");
  assert.ok((await blob.text()).startsWith("%PDF-1.4"));
});
```

- [ ] **Step 2: Run the PDF tests to confirm the module is absent**

Run: `node --test tests/labelcreator-pdf.test.mjs`
Expected: FAIL with `ERR_MODULE_NOT_FOUND`

- [ ] **Step 3: Move the proven single-label PDF logic into a dedicated module**

```js
// labelcreator-pdf.js
const LABEL_MM = {
  width: 60,
  height: 30,
  margin: 1.5,
  font: 2.8,
  barcodeTop: 4.7,
  barcodeHeight: 10.4,
  fnskuTop: 15.7,
  itemTop: 19.0,
  skuTop: 22.1,
  bottomTop: 25.1
};

const CODE128_PATTERNS = [
  "212222", "222122", "222221", "121223", "121322", "131222", "122213", "122312", "132212",
  "221213", "221312", "231212", "112232", "122132", "122231", "113222", "123122", "123221",
  "223211", "221132", "221231", "213212", "223112", "312131", "311222", "321122", "321221",
  "312212", "322112", "322211", "212123", "212321", "232121", "111323", "131123", "131321",
  "112313", "132113", "132311", "211313", "231113", "231311", "112133", "112331", "132131",
  "113123", "113321", "133121", "313121", "211331", "231131", "213113", "213311", "213131",
  "311123", "311321", "331121", "312113", "312311", "332111", "314111", "221411", "431111",
  "111224", "111422", "121124", "121421", "141122", "141221", "112214", "112412", "122114",
  "122411", "142112", "142211", "241211", "221114", "413111", "241112", "134111", "111242",
  "121142", "121241", "114212", "124112", "124211", "411212", "421112", "421211", "212141",
  "214121", "412121", "111143", "111341", "131141", "114113", "114311", "411113", "411311",
  "113141", "114131", "311141", "411131", "211412", "211214", "211232", "2331112"
];

const measureCanvas = typeof OffscreenCanvas !== "undefined"
  ? new OffscreenCanvas(1, 1)
  : {
      getContext() {
        return {
          font: "",
          measureText(text) {
            return { width: String(text).length * 7 };
          }
        };
      }
    };
const measureContext = measureCanvas.getContext("2d");

function escapePdfText(value) {
  return value.replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)");
}

function mmToPt(mm) {
  return mm * 72 / 25.4;
}

function fitFontPx(text, maxWidthPx, baseFontPx) {
  let size = baseFontPx;
  while (size > 12) {
    measureContext.font = `400 ${size}px Arial, Helvetica, sans-serif`;
    if (measureContext.measureText(text).width <= maxWidthPx) return size;
    size -= 1;
  }
  return 12;
}

export function encodeCode128B(text) {
  const input = String(text || "").trim() || "FNSKU";
  const codes = [104];
  let checksum = 104;

  for (let index = 0; index < input.length; index += 1) {
    const codeValue = input.charCodeAt(index) - 32;
    if (codeValue < 0 || codeValue > 95) {
      throw new Error("FNSKU contains unsupported characters. Use ASCII text only.");
    }
    codes.push(codeValue);
    checksum += codeValue * (index + 1);
  }

  codes.push(checksum % 103, 106);

  const bars = [];
  let totalModules = 0;

  for (const code of codes) {
    const pattern = CODE128_PATTERNS[code];
    for (let i = 0; i < pattern.length; i += 1) {
      const width = Number(pattern[i]);
      const isBar = i % 2 === 0;
      bars.push({ isBar, width });
      totalModules += width;
    }
  }

  return { input, bars, totalModules };
}

export function barcodeSvgMarkup(text) {
  const barcode = encodeCode128B(text);
  const height = 64;
  let cursor = 0;
  const rects = [];

  for (const segment of barcode.bars) {
    if (segment.isBar) {
      rects.push(`<rect x="${cursor}" y="0" width="${segment.width}" height="${height}" fill="#000"></rect>`);
    }
    cursor += segment.width;
  }

  return {
    viewBox: `0 0 ${barcode.totalModules} ${height}`,
    markup: rects.join("")
  };
}

function pdfTextWidthPt(text, fontPx) {
  measureContext.font = `400 ${fontPx}px Arial, Helvetica, sans-serif`;
  return measureContext.measureText(text).width * 72 / 96;
}

function fitFontPt(text, maxWidthMm, baseFontMm) {
  const maxWidthPx = maxWidthMm * 96 / 25.4;
  const baseFontPx = baseFontMm * 96 / 25.4;
  return fitFontPx(text, maxWidthPx, baseFontPx) * 72 / 96;
}

function ensurePdfAscii(labelData) {
  const values = [
    labelData.manufactureSku,
    labelData.fnsku,
    labelData.sku,
    labelData.itemName,
    labelData.storeName,
    labelData.condition
  ];

  for (const value of values) {
    if (/[^\x20-\x7E]/.test(value)) {
      throw new Error("PDF export currently supports ASCII text only.");
    }
  }
}

export function buildPdf(labelData) {
  ensurePdfAscii(labelData);

  const pageWidthPt = mmToPt(LABEL_MM.width);
  const pageHeightPt = mmToPt(LABEL_MM.height);
  const marginPt = mmToPt(LABEL_MM.margin);
  const contentWidthPt = pageWidthPt - marginPt * 2;
  const barcode = encodeCode128B(labelData.fnsku);
  const modulePt = contentWidthPt / barcode.totalModules;
  const barTopPt = pageHeightPt - mmToPt(LABEL_MM.barcodeTop + LABEL_MM.barcodeHeight);
  const barHeightPt = mmToPt(LABEL_MM.barcodeHeight);
  const ascentFactor = 0.78;
  let barcodeCursor = marginPt;
  const ops = ["0 g"];

  function topMmToBaselinePt(topMm, fontPt) {
    return pageHeightPt - mmToPt(topMm) - (fontPt * ascentFactor);
  }

  function pushText(text, topMm, align, maxWidthMm) {
    const fontPt = fitFontPt(text, maxWidthMm, LABEL_MM.font);
    const textWidthPt = pdfTextWidthPt(text, fontPt * 96 / 72);
    let xPt = marginPt;

    if (align === "center") xPt = (pageWidthPt - textWidthPt) / 2;
    if (align === "right") xPt = pageWidthPt - marginPt - textWidthPt;

    ops.push(
      `BT /F1 ${fontPt.toFixed(2)} Tf 1 0 0 1 ${xPt.toFixed(2)} ${topMmToBaselinePt(topMm, fontPt).toFixed(2)} Tm (${escapePdfText(text)}) Tj ET`
    );
  }

  for (const segment of barcode.bars) {
    const widthPt = segment.width * modulePt;
    if (segment.isBar) {
      ops.push(`${barcodeCursor.toFixed(3)} ${barTopPt.toFixed(3)} ${widthPt.toFixed(3)} ${barHeightPt.toFixed(3)} re f`);
    }
    barcodeCursor += widthPt;
  }

  pushText(labelData.manufactureSku, LABEL_MM.margin, "center", LABEL_MM.width - LABEL_MM.margin * 2);
  pushText(labelData.fnsku, LABEL_MM.fnskuTop, "center", LABEL_MM.width - LABEL_MM.margin * 2);
  pushText(labelData.itemName, LABEL_MM.itemTop, "left", LABEL_MM.width - LABEL_MM.margin * 2);
  pushText(labelData.sku, LABEL_MM.skuTop, "left", (LABEL_MM.width - LABEL_MM.margin * 2) * 0.76);
  pushText(labelData.condition, LABEL_MM.bottomTop, "left", (LABEL_MM.width - LABEL_MM.margin * 2) * 0.42);
  pushText(labelData.storeName, LABEL_MM.bottomTop, "right", (LABEL_MM.width - LABEL_MM.margin * 2) * 0.26);

  const stream = ops.join("\n");
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Count 1 /Kids [3 0 R] >>",
    `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${pageWidthPt.toFixed(2)} ${pageHeightPt.toFixed(2)}] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>`,
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
    `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`
  ];

  let pdf = "%PDF-1.4\n";
  const offsets = [0];

  for (let i = 0; i < objects.length; i += 1) {
    offsets.push(pdf.length);
    pdf += `${i + 1} 0 obj\n${objects[i]}\nendobj\n`;
  }

  const xrefStart = pdf.length;
  pdf += `xref\n0 ${objects.length + 1}\n`;
  pdf += "0000000000 65535 f \n";

  for (let i = 1; i < offsets.length; i += 1) {
    pdf += `${String(offsets[i]).padStart(10, "0")} 00000 n \n`;
  }

  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\n`;
  pdf += `startxref\n${xrefStart}\n%%EOF`;
  return new Blob([pdf], { type: "application/pdf" });
}
```

```js
// labelcreator-app.js
import { buildPdf, barcodeSvgMarkup } from "./labelcreator-pdf.js";
```

- [ ] **Step 4: Run the unit tests and re-check one label in the browser**

Run: `npm test`
Expected: PASS for both `tests/labelcreator-core.test.mjs` and `tests/labelcreator-pdf.test.mjs`

Run: `python3 -m http.server 4173`
Expected manual result:
- choosing different rows updates the barcode preview
- preview layout still matches the old 60mm x 30mm label rules

- [ ] **Step 5: Commit the PDF module extraction**

```bash
git add labelcreator-pdf.js labelcreator-app.js tests/labelcreator-pdf.test.mjs
git commit -m "refactor: extract barcode and pdf generation module"
```

## Task 6: Add ZIP Export And Final Batch Wiring

**Files:**
- Create: `vendor/jszip.min.js`
- Modify: `package.json`
- Modify: `Labelcreator.html`
- Modify: `labelcreator-app.js`
- Modify: `labelcreator-core.js`
- Modify: `tests/labelcreator-core.test.mjs`

- [ ] **Step 1: Write a failing export-job test for the ZIP workflow**

```js
import { buildExportJobs } from "../labelcreator-core.js";

test("buildExportJobs returns one PDF job per validated record", () => {
  const jobs = buildExportJobs([
    {
      rowNumber: 1,
      sku: "SKU-1",
      fnsku: "X001",
      manufactureSku: "MFG-1",
      productChineseName: "中文名 1",
      itemName: "Item One",
      storeName: "NA",
      condition: "NEW",
      errors: []
    }
  ]);

  assert.equal(jobs.length, 1);
  assert.equal(jobs[0].filename, "【标签】--中文名 1--NA--X001.pdf");
});
```

- [ ] **Step 2: Run tests to confirm the export job helper is not implemented yet**

Run: `node --test tests/labelcreator-core.test.mjs`
Expected: FAIL with missing `buildExportJobs`

- [ ] **Step 3: Vendor JSZip and wire the export button**

Run: `npm install jszip`
Expected: `added 1 package` or similar success output

```bash
mkdir -p vendor
cp node_modules/jszip/dist/jszip.min.js vendor/jszip.min.js
```

```html
<!-- Labelcreator.html -->
<script src="./vendor/jszip.min.js"></script>
<script type="module" src="./labelcreator-app.js"></script>
```

```js
// labelcreator-core.js
export function buildExportJobs(records) {
  return records.map((record) => ({
    filename: buildPdfFilename(record),
    labelData: toPreviewRecord(record)
  }));
}
```

```js
// labelcreator-app.js
import { buildExportJobs } from "./labelcreator-core.js";
import { buildPdf } from "./labelcreator-pdf.js";

async function exportZip(result) {
  const zip = new window.JSZip();
  const jobs = buildExportJobs(result.records);

  for (const job of jobs) {
    zip.file(job.filename, buildPdf(job.labelData));
  }

  const blob = await zip.generateAsync({ type: "blob" });
  triggerDownload(blob, "amazon-labels.zip");
}
```

- [ ] **Step 4: Run automated tests and complete the end-to-end browser smoke test**

Run: `npm test`
Expected: PASS

Run: `python3 -m http.server 4173`
Expected manual result:
- invalid rows keep `导出 ZIP` disabled
- valid rows enable `导出 ZIP`
- exporting downloads one `amazon-labels.zip`
- the ZIP contains one PDF per row
- each PDF name matches `【标签】--产品中文名称--Store Name--FNSKU.pdf`

- [ ] **Step 5: Commit the batch export flow**

```bash
git add package.json package-lock.json vendor/jszip.min.js Labelcreator.html labelcreator-app.js labelcreator-core.js tests/labelcreator-core.test.mjs
git commit -m "feat: export validated batch labels as zip of pdf files"
```

## Task 7: Remove Legacy Actions And Tighten Final UX

**Files:**
- Modify: `Labelcreator.html`
- Modify: `labelcreator-app.js`
- Modify: `tests/labelcreator-core.test.mjs`

- [ ] **Step 1: Add a regression test for empty-state and export gating**

```js
test("validateRecords only allows export when every parsed row is valid", () => {
  const empty = validateRecords([]);
  assert.equal(empty.canExport, false);

  const valid = validateRecords(parseBatchText("SKU-1\tX001\tMFG-1\t中文名 1\tItem One\tNA"));
  assert.equal(valid.canExport, true);
});
```

- [ ] **Step 2: Run tests to capture any gating regressions**

Run: `npm test`
Expected: PASS or a focused failure if the export gate drifted during ZIP wiring

- [ ] **Step 3: Remove the old affordances and polish status messaging**

```html
<!-- Labelcreator.html -->
<p>批量粘贴后自动解析并逐行预览，仅保留 PDF 导出，PNG 和打印入口已移除。</p>
```

```js
// labelcreator-app.js
function updateStatus(result) {
  const exportButton = document.getElementById("exportZip");
  exportButton.disabled = !result.canExport;

  if (!result.records.length) {
    setStatus("请先粘贴 Excel 表格数据。");
    return;
  }

  if (result.errors.length) {
    setStatus(`共有 ${result.errors.length} 处错误，修正后才能导出 ZIP。`);
    return;
  }

  setStatus(`已载入 ${result.records.length} 条记录，可以导出 ZIP。`);
}
```

- [ ] **Step 4: Run the last smoke pass**

Run: `npm test`
Expected: PASS

Run: `python3 -m http.server 4173`
Expected manual result:
- there is no PNG button
- there is no print button
- status text clearly explains whether export is blocked or ready

- [ ] **Step 5: Commit the UX cleanup**

```bash
git add Labelcreator.html labelcreator-app.js tests/labelcreator-core.test.mjs
git commit -m "chore: remove legacy actions and polish batch export UX"
```

## Spec Coverage Check

- Batch paste from Excel is implemented in Task 2 and surfaced in Task 4.
- Fixed column order is surfaced in Task 4 and enforced in Task 3.
- `Condition = NEW` is normalized in Task 2 and used for preview/PDF in Tasks 4-6.
- `Store Name` defaults to `NA` and validates allowed values in Task 3.
- `产品中文名称` stays out of the label and only affects filenames in Tasks 3, 4, and 6.
- Single-row preview with previous/next navigation is covered in Tasks 3 and 4.
- Whole-batch blocking on any invalid row is enforced in Tasks 3 and 7.
- One PDF per row inside one ZIP archive is implemented in Task 6.
- Removal of PNG and print is completed in Task 7.
