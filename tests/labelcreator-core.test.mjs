import test from "node:test";
import assert from "node:assert/strict";
import {
  parseBatchText,
  validateRecords,
  buildPdfFilename,
  selectAdjacentIndex,
  toPreviewRecord,
} from "../labelcreator-core.js";

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
