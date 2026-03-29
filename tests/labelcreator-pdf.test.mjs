import test from "node:test";
import assert from "node:assert/strict";
import { encodeCode128B, buildPdf, barcodeSvgMarkup } from "../labelcreator-pdf.js";

test("encodeCode128B returns bar segments for ASCII FNSKU input", () => {
  const barcode = encodeCode128B("X0050P4BTR");
  assert.equal(barcode.totalModules, 145);
  assert.deepEqual(barcode.bars.slice(0, 8), [
    { isBar: true, width: 2 },
    { isBar: false, width: 1 },
    { isBar: true, width: 1 },
    { isBar: false, width: 2 },
    { isBar: true, width: 1 },
    { isBar: false, width: 4 },
    { isBar: true, width: 3 },
    { isBar: false, width: 3 },
  ]);
});

test("barcodeSvgMarkup preserves the extracted barcode view box", () => {
  const svg = barcodeSvgMarkup("X0050P4BTR");

  assert.equal(svg.viewBox, "0 0 145 64");
  assert.match(svg.markup, /^<rect x="0" y="0" width="2" height="64" fill="#000"><\/rect>/);
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

  const pdf = await blob.text();

  assert.equal(blob.type, "application/pdf");
  assert.ok(pdf.startsWith("%PDF-1.4"));
  assert.match(pdf, /\/MediaBox \[0 0 170\.08 85\.04\]/);
  assert.match(pdf, /\/BaseFont \/Helvetica/);
  assert.equal((pdf.match(/BT \/F1 7\.94 Tf/g) || []).length, 6);
  assert.match(pdf, /\(25W027\) Tj ET/);
  assert.match(pdf, /\(X0050P4BTR\) Tj ET/);
});
