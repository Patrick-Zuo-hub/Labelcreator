# Code 128 Auto-Mode Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Automatically use `Code 128 C` for pure numeric even-length FNSKU values while preserving `Code 128 B` for every other case.

**Architecture:** Keep the current `Code 128 B` encoder intact, add a dedicated `Code 128 C` encoder, and route barcode rendering through a small auto-selector. This keeps the change local to the barcode/PDF layer and avoids changing page UI, filename rules, or label layout behavior.

**Tech Stack:** Vanilla JavaScript modules, Node built-in `node:test`, existing PDF generation in `labelcreator-pdf.js`

---

## File Structure

- `labelcreator-pdf.js`
  Add a dedicated `Code 128 C` encoder plus a small `encodeBarcodeAuto()` selector, then route barcode SVG and PDF generation through the selector.
- `tests/labelcreator-pdf.test.mjs`
  Add unit tests for `Code 128 C`, auto-mode selection rules, and the PDF regression that proves numeric even-length content now renders a lower-module-count barcode.

### Task 1: Add Failing Tests For Code 128 C And Auto Selection

**Files:**
- Modify: `tests/labelcreator-pdf.test.mjs`

- [ ] **Step 1: Update imports to include the new encoder entry points**

```js
import {
  encodeCode128B,
  encodeCode128C,
  encodeBarcodeAuto,
  buildPdf,
  barcodeSvgMarkup,
} from "../labelcreator-pdf.js";
```

- [ ] **Step 2: Add a failing test for pure numeric even-length Code 128 C encoding**

```js
test("encodeCode128C compresses even-length numeric input into digit pairs", () => {
  const barcode = encodeCode128C("00761483238211");

  assert.equal(barcode.input, "00761483238211");
  assert.equal(barcode.totalModules, 112);
});
```

- [ ] **Step 3: Add failing tests for auto-mode selection**

```js
test("encodeBarcodeAuto uses Code 128 C for pure numeric even-length input", () => {
  const barcode = encodeBarcodeAuto("00761483238211");
  assert.equal(barcode.totalModules, 112);
});

test("encodeBarcodeAuto falls back to Code 128 B for pure numeric odd-length input", () => {
  const barcode = encodeBarcodeAuto("12345");
  assert.equal(barcode.totalModules, encodeCode128B("12345").totalModules);
});

test("encodeBarcodeAuto falls back to Code 128 B for alphanumeric input", () => {
  const barcode = encodeBarcodeAuto("X0050P4BTR");
  assert.equal(barcode.totalModules, encodeCode128B("X0050P4BTR").totalModules);
});
```

- [ ] **Step 4: Add a failing regression test proving barcode SVG now auto-selects `C`**

```js
test("barcodeSvgMarkup uses the auto-selected mode for pure numeric even-length input", () => {
  const svg = barcodeSvgMarkup("00761483238211");
  assert.equal(svg.viewBox, "0 0 112 64");
});
```

- [ ] **Step 5: Run the focused test file and confirm failure**

Run:

```bash
node --test tests/labelcreator-pdf.test.mjs
```

Expected:
- FAIL with missing exports for `encodeCode128C` and `encodeBarcodeAuto`
- or FAIL because `barcodeSvgMarkup()` still uses `Code 128 B`

- [ ] **Step 6: Commit the red-state test file if working in a branch that allows red commits; otherwise continue immediately**

```bash
git add tests/labelcreator-pdf.test.mjs
```

### Task 2: Implement Code 128 C And Auto-Selection

**Files:**
- Modify: `labelcreator-pdf.js`
- Modify: `tests/labelcreator-pdf.test.mjs`

- [ ] **Step 1: Add helpers for numeric-even detection**

```js
function isNumericEvenLength(value) {
  return /^[0-9]+$/.test(value) && value.length % 2 === 0;
}
```

- [ ] **Step 2: Add `encodeCode128C()` next to the existing `encodeCode128B()`**

```js
export function encodeCode128C(text) {
  const input = valueOrFallback(text, "00");

  if (!isNumericEvenLength(input)) {
    throw new Error("Code 128 C requires an even-length numeric string.");
  }

  const codes = [105];
  let checksum = 105;

  for (let index = 0; index < input.length; index += 2) {
    const pairValue = Number(input.slice(index, index + 2));
    codes.push(pairValue);
    checksum += pairValue * ((index / 2) + 1);
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
```

- [ ] **Step 3: Add `encodeBarcodeAuto()` as the selector layer**

```js
export function encodeBarcodeAuto(text) {
  const input = valueOrFallback(text, "FNSKU");

  if (isNumericEvenLength(input)) {
    return encodeCode128C(input);
  }

  return encodeCode128B(input);
}
```

- [ ] **Step 4: Route SVG and PDF generation through auto mode**

Replace these lines:

```js
const barcode = encodeCode128B(text);
```

and

```js
const barcode = encodeCode128B(labelData.fnsku);
```

with:

```js
const barcode = encodeBarcodeAuto(text);
```

and:

```js
const barcode = encodeBarcodeAuto(labelData.fnsku);
```

- [ ] **Step 5: Run the focused test file and confirm the new tests pass**

Run:

```bash
node --test tests/labelcreator-pdf.test.mjs
```

Expected:
- PASS for the new `Code 128 C` and auto-mode tests
- existing `Code 128 B` tests remain green

- [ ] **Step 6: Commit the encoder implementation**

```bash
git add labelcreator-pdf.js tests/labelcreator-pdf.test.mjs
git commit -m "feat: auto-select code128 mode for numeric fnsku"
```

### Task 3: Add PDF Regression Coverage For Numeric Auto-Mode

**Files:**
- Modify: `tests/labelcreator-pdf.test.mjs`
- Modify: `labelcreator-pdf.js`

- [ ] **Step 1: Add a PDF regression test for numeric even-length content**

```js
test("buildPdf uses Code 128 C for pure numeric even-length fnsku values", async () => {
  const blob = buildPdf({
    manufactureSku: "25W041",
    fnsku: "00761483238211",
    sku: "F-SCM-C5-PN-GD",
    itemName: "Perfnique Scalloped Mirror-C5-Flower-Gold",
    storeName: "Walmart-US",
    condition: "NEW",
  });

  const pdf = await blob.text();

  assert.match(pdf, /^11\.339 42\.236 3\.\d+ 29\.480 re f/m);
  assert.match(pdf, /\(00761483238211\) Tj ET/);
});
```

- [ ] **Step 2: Run the focused test file and confirm it fails for the right reason if the PDF path still uses the wrong encoder**

Run:

```bash
node --test tests/labelcreator-pdf.test.mjs
```

Expected:
- PASS if Task 2 already routed `buildPdf()` through auto mode correctly
- otherwise FAIL because the barcode rectangle widths/viewBox still match `Code 128 B`

- [ ] **Step 3: Adjust the expected first-bar width only if the actual `Code 128 C` module math requires it**

If needed after observing the PDF output, update just the first-bar width regex while keeping the rest of the test structure intact:

```js
assert.match(pdf, /^11\.339 42\.236 3\.\d+ 29\.480 re f/m);
```

- [ ] **Step 4: Run the full test suite**

Run:

```bash
npm test
```

Expected:
- PASS
- no regressions in core app tests or PDF tests

- [ ] **Step 5: Commit the final regression coverage**

```bash
git add labelcreator-pdf.js tests/labelcreator-pdf.test.mjs
git commit -m "test: cover numeric code128 auto-selection"
```

## Spec Coverage Check

- Pure numeric and even-length -> `Code 128 C`: covered in Tasks 1 and 2
- All other cases remain `Code 128 B`: covered in Task 1
- No UI changes: preserved by limiting file scope to `labelcreator-pdf.js` and tests
- Preview and PDF both use the same selector path: covered in Task 2
- Regression safety for numeric output: covered in Task 3
