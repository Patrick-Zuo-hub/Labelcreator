import test from "node:test";
import assert from "node:assert/strict";
import { parseBatchText } from "../labelcreator-core.js";

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
