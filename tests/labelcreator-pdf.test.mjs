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
