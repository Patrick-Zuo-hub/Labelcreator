import test from "node:test";
import assert from "node:assert/strict";
import {
  createEmptyGridRows,
  applyGridPaste,
  mapCellErrors,
  normalizeGridRowsForValidation,
  parseBatchText,
  validateRecords,
  buildPdfFilename,
  buildExportJobs,
  selectAdjacentIndex,
  toPreviewRecord,
} from "../labelcreator-core.js";
import { getStatusMessage, mountApp } from "../labelcreator-app.js";

function createMockElement(tagName = "div") {
  const classNames = new Set();
  const element = {
    tagName,
    textContent: "",
    value: "",
    disabled: false,
    title: "",
    dataset: {},
    tabIndex: 0,
    children: [],
    listeners: {},
    classList: {
      add(...names) {
        names.forEach((name) => classNames.add(name));
      },
      remove(...names) {
        names.forEach((name) => classNames.delete(name));
      },
      toggle(name, force) {
        if (force === undefined) {
          if (classNames.has(name)) {
            classNames.delete(name);
            return false;
          }

          classNames.add(name);
          return true;
        }

        if (force) {
          classNames.add(name);
          return true;
        }

        classNames.delete(name);
        return false;
      },
      contains(name) {
        return classNames.has(name);
      },
    },
    addEventListener(type, handler) {
      this.listeners[type] = handler;
    },
    appendChild(child) {
      this.children.push(child);
      return child;
    },
    remove() {
      this.removed = true;
    },
    setAttribute(name, value) {
      this[name] = value;
    },
    querySelector(selector) {
      const match = selector.match(/^\[data-index="(\d+)"\]$/);
      if (!match) {
        return null;
      }

      return this.children.find((child) => child.dataset?.index === match[1]) || null;
    },
    focus() {
      this.focused = true;
    },
  };

  Object.defineProperty(element, "innerHTML", {
    get() {
      return this._innerHTML || "";
    },
    set(value) {
      this._innerHTML = value;
      if (value === "") {
        this.children = [];
      }
    },
  });

  return element;
}

test("parseBatchText returns one normalized record for one pasted row", () => {
  const rows = parseBatchText("SKU-1\tX001\tMFG-1\t中文名\tItem Name\tNA");

  assert.equal(rows.length, 1);
  assert.equal(rows[0].sku, "SKU-1");
  assert.equal(rows[0].fnsku, "X001");
  assert.equal(rows[0].manufactureSku, "MFG-1");
  assert.equal(rows[0].productChineseName, "中文名");
  assert.equal(rows[0].itemName, "Item Name");
  assert.equal(rows[0].storeName, "NA");
  assert.equal(rows[0].condition, "NEW");
});

test("parseBatchText trims fields, skips whitespace-only lines, and defaults store name", () => {
  const rows = parseBatchText("\n  SKU-2 \t X002 \t MFG-2 \t 中文名2 \t Item Name 2 \t   \n   \n");

  assert.equal(rows.length, 1);
  assert.equal(rows[0].sku, "SKU-2");
  assert.equal(rows[0].fnsku, "X002");
  assert.equal(rows[0].manufactureSku, "MFG-2");
  assert.equal(rows[0].productChineseName, "中文名2");
  assert.equal(rows[0].itemName, "Item Name 2");
  assert.equal(rows[0].storeName, "NA");
  assert.equal(rows[0].condition, "NEW");
});

test("parseBatchText preserves empty leading columns without shifting later fields", () => {
  const rows = parseBatchText("\tX003\tMFG-3\t\tItem Name 3\tNA");

  assert.equal(rows.length, 1);
  assert.equal(rows[0].sku, "");
  assert.equal(rows[0].fnsku, "X003");
  assert.equal(rows[0].manufactureSku, "MFG-3");
  assert.equal(rows[0].productChineseName, "");
  assert.equal(rows[0].itemName, "Item Name 3");
  assert.equal(rows[0].storeName, "NA");
  assert.equal(rows[0].condition, "NEW");
});

test("parseBatchText ignores blank lines and defaults Store Name and Condition", () => {
  const input = [
    "SKU-1\tX001\tMFG-1\t中文名 1\tItem One\t",
    "",
    "SKU-2\tX002\tMFG-2\t中文名 2\tItem Two\tEU",
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
    rawColumns: ["SKU-1", "X001", "MFG-1", "中文名 1", "Item One", ""],
  });
  assert.equal(rows[1].storeName, "EU");
});

test("parseBatchText preserves rows with missing columns for later validation", () => {
  const rows = parseBatchText("SKU-1\tX001\tMFG-1\t中文名 1");

  assert.equal(rows[0].rawColumns.length, 4);
  assert.equal(rows[0].itemName, "");
});

test("createEmptyGridRows returns 10 blank editable rows", () => {
  const rows = createEmptyGridRows();

  assert.equal(rows.length, 10);
  assert.deepEqual(Object.keys(rows[0]), [
    "rowNumber",
    "sku",
    "fnsku",
    "manufactureSku",
    "productChineseName",
    "itemName",
    "storeName",
  ]);
  assert.equal(rows[0].storeName, "");
});

test("applyGridPaste fills from the selected cell and pads missing cells", () => {
  const baseRows = createEmptyGridRows(3);
  baseRows[1] = {
    ...baseRows[1],
    fnsku: "OLD-FNSKU",
    manufactureSku: "OLD-MFG",
    productChineseName: "OLD-NAME",
    itemName: "OLD-ITEM",
    storeName: "OLD-STORE",
  };
  const result = applyGridPaste(baseRows, { row: 1, col: 2 }, "X001\tMFG-1\t中文名\tItem One\nX002\tMFG-2");

  assert.equal(result.rows[1].fnsku, "X001");
  assert.equal(result.rows[1].manufactureSku, "MFG-1");
  assert.equal(result.rows[1].productChineseName, "中文名");
  assert.equal(result.rows[1].itemName, "Item One");
  assert.equal(result.rows[1].storeName, "");
  assert.equal(result.rows[2].fnsku, "X002");
  assert.equal(result.rows[2].itemName, "");
});

test("applyGridPaste ignores extra columns and reports a notice", () => {
  const baseRows = createEmptyGridRows(1);
  const result = applyGridPaste(baseRows, { row: 0, col: 0 }, "SKU-1\tX001\tMFG-1\t中文名\tItem\tNA\tEXTRA");

  assert.equal(result.rows[0].storeName, "NA");
  assert.match(result.notice, /多余列已忽略/);
});

test("mapCellErrors groups validation errors by row and field", () => {
  const mapped = mapCellErrors([
    { rowNumber: 2, field: "fnsku", message: "Row 2: FNSKU is required" },
    { rowNumber: 2, field: "storeName", message: "Row 2: Store Name must be one of NA, EU, AU, Walmart-US" },
  ]);

  assert.equal(mapped.get(2).fnsku.length, 1);
  assert.equal(mapped.get(2).storeName.length, 1);
});

test("normalizeGridRowsForValidation keeps only rows with meaningful input", () => {
  const rows = normalizeGridRowsForValidation([
    { rowNumber: 1, sku: "", fnsku: "", manufactureSku: "", productChineseName: "", itemName: "", storeName: "" },
    { rowNumber: 2, sku: "SKU-1", fnsku: "X001", manufactureSku: "MFG-1", productChineseName: "中文名", itemName: "Item", storeName: "" },
  ]);

  assert.equal(rows.length, 1);
  assert.equal(rows[0].rowNumber, 2);
  assert.equal(rows[0].storeName, "NA");
  assert.equal(rows[0].condition, "NEW");
});

test("validateRecords blocks rows with missing required fields and invalid store values", () => {
  const rows = parseBatchText([
    "SKU-1\tX001\tMFG-1\t中文名 1\tItem One\tNA",
    "SKU-2\t\tMFG-2\t中文名 2\tItem Two\tBAD",
  ].join("\n"));

  const result = validateRecords(rows);

  assert.equal(result.canExport, false);
  assert.equal(result.errors.length, 2);
  assert.match(result.errors[0].message, /FNSKU/);
  assert.match(result.errors[1].message, /Store Name/);
});

test("validateRecords only allows export when every parsed row is valid", () => {
  const empty = validateRecords([]);
  assert.equal(empty.canExport, false);

  const valid = validateRecords(parseBatchText("SKU-1\tX001\tMFG-1\t中文名 1\tItem One\tNA"));
  assert.equal(valid.canExport, true);
});

test("getStatusMessage distinguishes loaded rows from validated rows", () => {
  const loaded = getStatusMessage(
    validateRecords(parseBatchText("SKU-1\tX001\tMFG-1\t中文名 1\tItem One\tNA")),
    { isExporting: false, previewError: null },
  );
  const validated = getStatusMessage(
    validateRecords(parseBatchText("SKU-1\tX001\tMFG-1\t中文名 1\tItem One\tNA")),
    { isExporting: false, previewError: null },
    "validated",
  );

  assert.equal(loaded, "已载入 1 条记录，尚未校验。");
  assert.equal(validated, "校验通过，共 1 条记录。可以导出 ZIP。");
});

test("getStatusMessage keeps validated export blocked when label data is not ASCII-safe", () => {
  const result = validateRecords(parseBatchText("SKU-1\tX001\tMFG-1\t中文名 1\t咖啡凳\tNA"));

  assert.equal(result.canExport, true);
  assert.match(
    getStatusMessage(result, { isExporting: false, previewError: null }, "validated"),
    /当前无法导出 PDF/,
  );
  assert.equal(buildExportJobs(result.records).length, 0);
});

test("mountApp keeps validated status wording through the real validate button flow", () => {
  const elements = new Map();
  const ids = [
    "pasteInput",
    "clearData",
    "validateData",
    "exportZip",
    "status",
    "recordsBody",
    "vManufactureSku",
    "vFnsku",
    "vSku",
    "vItemName",
    "vStoreName",
    "vCondition",
    "barcodePreview",
    "prevRecord",
    "nextRecord",
    "previewPosition",
    "recordInspector",
  ];

  for (const id of ids) {
    elements.set(id, createMockElement(id === "barcodePreview" ? "svg" : "div"));
  }

  const originalDocument = globalThis.document;
  const originalWindow = globalThis.window;

  globalThis.document = {
    getElementById(id) {
      return elements.get(id) || null;
    },
    createElement(tagName) {
      return createMockElement(tagName);
    },
    body: createMockElement("body"),
  };
  globalThis.window = {};

  try {
    assert.equal(mountApp(), true);

    const pasteInput = elements.get("pasteInput");
    const validateData = elements.get("validateData");
    const status = elements.get("status");

    pasteInput.value = "SKU-1\tX001\tMFG-1\t中文名 1\tItem One\tNA";
    pasteInput.listeners.input();
    assert.equal(status.textContent, "已载入 1 条记录，尚未校验。");

    validateData.listeners.click();
    assert.equal(status.textContent, "校验通过，共 1 条记录。可以导出 ZIP。");

    pasteInput.value = "SKU-2\tX002\tMFG-2\t中文名 2\t咖啡凳\tNA";
    validateData.listeners.click();
    assert.match(status.textContent, /当前无法导出 PDF/);
  } finally {
    globalThis.document = originalDocument;
    globalThis.window = originalWindow;
  }
});

test("mountApp preserves validated status while selecting a different row from the same dataset", () => {
  const elements = new Map();
  const ids = [
    "pasteInput",
    "clearData",
    "validateData",
    "exportZip",
    "status",
    "recordsBody",
    "vManufactureSku",
    "vFnsku",
    "vSku",
    "vItemName",
    "vStoreName",
    "vCondition",
    "barcodePreview",
    "prevRecord",
    "nextRecord",
    "previewPosition",
    "recordInspector",
  ];

  for (const id of ids) {
    elements.set(id, createMockElement(id === "barcodePreview" ? "svg" : "div"));
  }

  const originalDocument = globalThis.document;
  const originalWindow = globalThis.window;

  globalThis.document = {
    getElementById(id) {
      return elements.get(id) || null;
    },
    createElement(tagName) {
      return createMockElement(tagName);
    },
    body: createMockElement("body"),
  };
  globalThis.window = {};

  try {
    assert.equal(mountApp(), true);

    const pasteInput = elements.get("pasteInput");
    const validateData = elements.get("validateData");
    const recordsBody = elements.get("recordsBody");
    const status = elements.get("status");
    const nextRecord = elements.get("nextRecord");

    pasteInput.value = [
      "SKU-1\tX001\tMFG-1\t中文名 1\tItem One\tNA",
      "SKU-2\tX002\tMFG-2\t中文名 2\tItem Two\tNA",
    ].join("\n");
    pasteInput.listeners.input();
    validateData.listeners.click();

    assert.equal(status.textContent, "校验通过，共 2 条记录。可以导出 ZIP。");
    recordsBody.children[1].listeners.click();
    assert.equal(status.textContent, "校验通过，共 2 条记录。可以导出 ZIP。");

    nextRecord.listeners.click();
    assert.equal(status.textContent, "校验通过，共 2 条记录。可以导出 ZIP。");
  } finally {
    globalThis.document = originalDocument;
    globalThis.window = originalWindow;
  }
});

test("mountApp shows selected row error reasons and preview navigation state", () => {
  const elements = new Map();
  const ids = [
    "pasteInput",
    "clearData",
    "validateData",
    "exportZip",
    "status",
    "recordsBody",
    "vManufactureSku",
    "vFnsku",
    "vSku",
    "vItemName",
    "vStoreName",
    "vCondition",
    "barcodePreview",
    "prevRecord",
    "nextRecord",
    "previewPosition",
    "recordInspector",
  ];

  for (const id of ids) {
    elements.set(id, createMockElement(id === "barcodePreview" ? "svg" : "div"));
  }

  const originalDocument = globalThis.document;
  const originalWindow = globalThis.window;

  globalThis.document = {
    getElementById(id) {
      return elements.get(id) || null;
    },
    createElement(tagName) {
      return createMockElement(tagName);
    },
    body: createMockElement("body"),
  };
  globalThis.window = {};

  try {
    assert.equal(mountApp(), true);

    const pasteInput = elements.get("pasteInput");
    const recordsBody = elements.get("recordsBody");
    const previewPosition = elements.get("previewPosition");
    const recordInspector = elements.get("recordInspector");
    const prevRecord = elements.get("prevRecord");
    const nextRecord = elements.get("nextRecord");

    pasteInput.value = [
      "SKU-1\t\tMFG-1\t中文名 1\tItem One\tBAD",
      "SKU-2\tX002\tMFG-2\t中文名 2\tItem Two\tNA",
    ].join("\n");
    pasteInput.listeners.input();

    assert.match(recordInspector.textContent, /FNSKU/);
    assert.match(recordInspector.textContent, /Store Name/);
    assert.equal(previewPosition.textContent, "第 1 / 2 条");
    assert.equal(prevRecord.disabled, true);
    assert.equal(nextRecord.disabled, false);

    nextRecord.listeners.click();
    assert.equal(previewPosition.textContent, "第 2 / 2 条");
    assert.match(recordInspector.textContent, /当前记录校验通过/);
    assert.equal(prevRecord.disabled, false);
    assert.equal(nextRecord.disabled, true);

    recordsBody.children[0].listeners.click();
    assert.equal(previewPosition.textContent, "第 1 / 2 条");
    assert.match(recordInspector.textContent, /FNSKU/);
  } finally {
    globalThis.document = originalDocument;
    globalThis.window = originalWindow;
  }
});

test("buildPdfFilename uses the agreed naming rule and replaces unsafe characters", () => {
  const filename = buildPdfFilename({
    productChineseName: "浴室凳/24",
    storeName: "NA",
    fnsku: "X001:ABC",
  });

  assert.equal(filename, "【标签】--浴室凳-24--NA--X001-ABC.pdf");
});

test("selectAdjacentIndex clamps previous and next navigation at the edges", () => {
  assert.equal(selectAdjacentIndex(0, 3, -1), 0);
  assert.equal(selectAdjacentIndex(0, 3, 1), 1);
  assert.equal(selectAdjacentIndex(2, 3, 1), 2);
});

test("toPreviewRecord keeps 产品中文名称 out of the label but keeps Condition fixed", () => {
  const preview = toPreviewRecord({
    sku: "SKU-1",
    fnsku: "X001",
    manufactureSku: "MFG-1",
    productChineseName: "中文名 1",
    itemName: "Item One",
    storeName: "NA",
    condition: "NEW",
  });

  assert.equal(preview.condition, "NEW");
  assert.equal(preview.storeName, "NA");
  assert.equal("productChineseName" in preview, false);
});

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
      errors: [],
    },
  ]);

  assert.equal(jobs.length, 1);
  assert.equal(jobs[0].filename, "【标签】--中文名 1--NA--X001.pdf");
  assert.deepEqual(jobs[0].labelData, {
    manufactureSku: "MFG-1",
    fnsku: "X001",
    sku: "SKU-1",
    itemName: "Item One",
    storeName: "NA",
    condition: "NEW",
  });
});

test("buildExportJobs excludes rows with validation errors, raw rows without validation metadata, and PDF-unsafe label data", () => {
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
      errors: [],
    },
    {
      rowNumber: 2,
      sku: "SKU-2",
      fnsku: "",
      manufactureSku: "MFG-2",
      productChineseName: "中文名 2",
      itemName: "Item Two",
      storeName: "NA",
      condition: "NEW",
      errors: [{ field: "fnsku", message: "Row 2: FNSKU is required" }],
    },
    {
      rowNumber: 3,
      sku: "SKU-3",
      fnsku: "X003",
      manufactureSku: "MFG-3",
      productChineseName: "中文名 3",
      itemName: "咖啡凳",
      storeName: "NA",
      condition: "NEW",
      errors: [],
    },
    {
      rowNumber: 4,
      sku: "SKU-4",
      fnsku: "X004",
      manufactureSku: "MFG-4",
      productChineseName: "中文名 4",
      itemName: "Item Four",
      storeName: "NA",
      condition: "NEW",
    },
  ]);

  assert.equal(jobs.length, 1);
  assert.equal(jobs[0].filename, "【标签】--中文名 1--NA--X001.pdf");
});

test("buildExportJobs blocks otherwise valid rows whose label data is not ASCII-safe", () => {
  const result = validateRecords(parseBatchText("SKU-1\tX001\tMFG-1\t中文名 1\t咖啡凳\tNA"));

  assert.equal(result.canExport, true);
  assert.equal(buildExportJobs(result.records).length, 0);
});

test("buildExportJobs keeps one PDF per validated row when filenames collide", () => {
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
      errors: [],
    },
    {
      rowNumber: 2,
      sku: "SKU-2",
      fnsku: "X001",
      manufactureSku: "MFG-2",
      productChineseName: "中文名 1",
      itemName: "Item Two",
      storeName: "NA",
      condition: "NEW",
      errors: [],
    },
    {
      rowNumber: 3,
      sku: "SKU-3",
      fnsku: "X001",
      manufactureSku: "MFG-3",
      productChineseName: "中文名 1",
      itemName: "Item Three",
      storeName: "NA",
      condition: "NEW",
      errors: [],
    },
  ]);

  assert.equal(jobs.length, 3);
  assert.deepEqual(jobs.map((job) => job.filename), [
    "【标签】--中文名 1--NA--X001.pdf",
    "【标签】--中文名 1--NA--X001 (2).pdf",
    "【标签】--中文名 1--NA--X001 (3).pdf",
  ]);
});
