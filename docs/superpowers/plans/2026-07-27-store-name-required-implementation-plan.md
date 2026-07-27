# Store Name Required-Field Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Require users to explicitly enter a valid Store Name for every populated product row, while preserving editable-grid and Excel-paste workflows.

**Architecture:** Make the ordered store options a single exported source of truth in the core module, remove all implicit `NA` fallbacks, and distinguish required-value errors from unsupported-value errors. The app will reuse the exported options to populate one native `datalist`, attach it to Store Name inputs, and keep blank Store Name values blank in the preview.

**Tech Stack:** Vanilla JavaScript ES modules, browser-native `input`/`datalist`, Node.js built-in `node:test`, static HTML

---

## File Structure

- `labelcreator-core.js`
  Owns the canonical store options, trimming, required-field validation, allowed-value validation, normalization, export eligibility, and label data.
- `labelcreator-app.js`
  Populates the Store Name suggestions, attaches them to the correct grid inputs, renders blank preview values, and surfaces live validation state.
- `Labelcreator.html`
  Provides the empty shared `datalist` mount point and an empty Store Name preview node.
- `tests/labelcreator-core.test.mjs`
  Covers pure core rules plus the mounted grid, datalist, paste, preview, error, and recovery flows.

### Task 1: Make Store Name Explicitly Required In The Core

**Files:**
- Modify: `tests/labelcreator-core.test.mjs`
- Modify: `labelcreator-core.js`

- [ ] **Step 1: Import the canonical option list in the test file**

Add `STORE_OPTIONS` to the existing core import:

```js
import {
  STORE_OPTIONS,
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
```

- [ ] **Step 2: Replace tests that expect blank Store Name to default to `NA`**

Rename the trimming/default test and change the Store Name expectation:

```js
test("parseBatchText trims fields and preserves a blank store name", () => {
  const rows = parseBatchText("\n  SKU-2 \t X002 \t MFG-2 \t 中文名2 \t Item Name 2 \t   \n   \n");

  assert.equal(rows.length, 1);
  assert.equal(rows[0].sku, "SKU-2");
  assert.equal(rows[0].fnsku, "X002");
  assert.equal(rows[0].manufactureSku, "MFG-2");
  assert.equal(rows[0].productChineseName, "中文名2");
  assert.equal(rows[0].itemName, "Item Name 2");
  assert.equal(rows[0].storeName, "");
  assert.equal(rows[0].condition, "NEW");
});
```

Update the multi-row parsing test so its first row expects an empty Store Name:

```js
assert.deepEqual(rows[0], {
  rowNumber: 1,
  sku: "SKU-1",
  fnsku: "X001",
  manufactureSku: "MFG-1",
  productChineseName: "中文名 1",
  itemName: "Item One",
  storeName: "",
  condition: "NEW",
  rawColumns: ["SKU-1", "X001", "MFG-1", "中文名 1", "Item One", ""],
});
```

Update the normalization test:

```js
assert.equal(rows[0].storeName, "");
```

- [ ] **Step 3: Add failing tests for required, allowed, trimming, and case-sensitive behavior**

Add these tests near the existing validation tests:

```js
test("STORE_OPTIONS exposes the ordered Store Name suggestions", () => {
  assert.deepEqual(STORE_OPTIONS, ["NA", "EU", "AU", "Walmart-US"]);
});

test("validateRecords reports one required error for a blank Store Name", () => {
  const rows = normalizeGridRowsForValidation([
    {
      rowNumber: 1,
      sku: "SKU-1",
      fnsku: "X001",
      manufactureSku: "MFG-1",
      productChineseName: "中文名",
      itemName: "Item One",
      storeName: "",
    },
  ]);

  const result = validateRecords(rows);
  const storeErrors = result.errors.filter((error) => error.field === "storeName");

  assert.equal(result.canExport, false);
  assert.equal(storeErrors.length, 1);
  assert.match(storeErrors[0].message, /required/);
  assert.doesNotMatch(storeErrors[0].message, /must be one of/);
});

test("validateRecords accepts exact Store Name values and trims surrounding spaces", () => {
  for (const storeName of [...STORE_OPTIONS, " NA "]) {
    const rows = parseBatchText(
      `SKU-1\tX001\tMFG-1\t中文名\tItem One\t${storeName}`,
    );
    assert.equal(validateRecords(rows).canExport, true);
  }
});

test("validateRecords rejects incorrect Store Name case", () => {
  for (const storeName of ["na", "Eu", "walmart-us"]) {
    const rows = parseBatchText(
      `SKU-1\tX001\tMFG-1\t中文名\tItem One\t${storeName}`,
    );
    const result = validateRecords(rows);

    assert.equal(result.canExport, false);
    assert.match(
      result.errors.find((error) => error.field === "storeName").message,
      /must be one of/,
    );
  }
});
```

- [ ] **Step 4: Run focused tests and confirm the new contract fails**

Run:

```bash
node --test --test-name-pattern="Store Name|store name|STORE_OPTIONS" tests/labelcreator-core.test.mjs
```

Expected:

- FAIL because `STORE_OPTIONS` is not exported.
- Existing blank-value tests still observe `NA`.

- [ ] **Step 5: Export one canonical option list and make Store Name required**

Replace the top-level store constants and required fields in `labelcreator-core.js` with:

```js
const EXPECTED_COLUMNS = 6;
export const STORE_OPTIONS = Object.freeze(["NA", "EU", "AU", "Walmart-US"]);
const ALLOWED_STORES = new Set(STORE_OPTIONS);
const REQUIRED_FIELDS = [
  ["sku", "SKU"],
  ["fnsku", "FNSKU"],
  ["manufactureSku", "Manufacture SKU"],
  ["productChineseName", "产品中文名称"],
  ["itemName", "Item Name"],
  ["storeName", "Store Name"],
];
```

- [ ] **Step 6: Remove both implicit `NA` fallback paths**

In `normalizeGridRowsForValidation()`, use:

```js
storeName: cleanCell(row.storeName),
```

In `parseBatchText()`, use:

```js
storeName: cleanCell(padded[5]),
```

- [ ] **Step 7: Prevent duplicate Store Name errors**

Change the allowed-value check in `validateRecords()` so blank values receive only the required-field error:

```js
if (record.storeName && !ALLOWED_STORES.has(record.storeName)) {
  rowErrors.push({
    rowNumber: record.rowNumber,
    field: "storeName",
    message: `Row ${record.rowNumber}: Store Name must be one of ${STORE_OPTIONS.join(", ")}`,
  });
}
```

- [ ] **Step 8: Run the focused tests**

Run:

```bash
node --test --test-name-pattern="Store Name|store name|STORE_OPTIONS" tests/labelcreator-core.test.mjs
```

Expected: PASS for all matching tests.

- [ ] **Step 9: Run the complete core/app test file and fix only obsolete fallback expectations**

Run:

```bash
node --test tests/labelcreator-core.test.mjs
```

Expected: PASS. If an old assertion still expects a blank Store Name to become `NA`, update that assertion to `""`; do not change valid-record fixtures that explicitly use `NA`.

- [ ] **Step 10: Commit the core behavior**

```bash
git add labelcreator-core.js tests/labelcreator-core.test.mjs
git commit -m "feat: require explicit store name"
```

### Task 2: Add Editable Store Name Suggestions And Blank Preview

**Files:**
- Modify: `tests/labelcreator-core.test.mjs`
- Modify: `labelcreator-app.js`
- Modify: `Labelcreator.html`

- [ ] **Step 1: Extend the mock DOM to represent attributes and the shared datalist**

Add an attribute map and getter to `createMockElement()`:

```js
const attributes = new Map();
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
  setAttribute(name, value) {
    attributes.set(name, String(value));
    this[name] = value;
  },
  getAttribute(name) {
    return attributes.get(name) ?? null;
  },
  // Keep the existing classList, listeners, appendChild, querySelector,
  // focus, remove, and innerHTML behavior unchanged.
};
```

Remove the old duplicate `setAttribute()` method from the mock.

Add the shared datalist ID to `setupMockAppDom()`:

```js
const ids = [
  "clearData",
  "validateData",
  "exportZip",
  "status",
  "prevRecord",
  "nextRecord",
  "previewPosition",
  "recordInspector",
  "vManufactureSku",
  "vFnsku",
  "vSku",
  "vItemName",
  "vStoreName",
  "vCondition",
  "barcodePreview",
  "batchGridHint",
  "validationSummary",
  "batchGridBody",
  "storeNameOptions",
];
```

- [ ] **Step 2: Add a failing mounted-app test for datalist suggestions and blank preview**

```js
test("mountApp adds Store Name suggestions without defaulting the preview", () => {
  const { elements, restore } = setupMockAppDom();

  try {
    assert.equal(mountApp(), true);

    const datalist = elements.get("storeNameOptions");
    const storeNameInput = getGridInput(elements, 0, 5);
    const skuInput = getGridInput(elements, 0, 0);

    assert.deepEqual(
      datalist.children.map((option) => option.value),
      STORE_OPTIONS,
    );
    assert.equal(storeNameInput.getAttribute("list"), "storeNameOptions");
    assert.equal(skuInput.getAttribute("list"), null);
    assert.equal(storeNameInput.value, "");
    assert.equal(elements.get("vStoreName").textContent, "");
  } finally {
    restore();
  }
});
```

- [ ] **Step 3: Add failing integration tests for immediate error, paste, and recovery**

```js
test("mountApp immediately marks Store Name required for a populated row", () => {
  const { elements, restore } = setupMockAppDom();

  try {
    assert.equal(mountApp(), true);

    fillGridRow(elements, 0, [
      "SKU-1",
      "X001",
      "MFG-1",
      "中文名 1",
      "Item One",
    ]);

    const storeNameCell = elements.get("batchGridBody").children[0].children[5];
    const storeNameInput = storeNameCell.children[0];

    assert.equal(storeNameCell.classList.contains("has-cell-error"), true);
    assert.match(storeNameInput.title, /必填/);
    assert.match(elements.get("recordInspector").textContent, /Store Name.*必填/);
    assert.equal(elements.get("vStoreName").textContent, "");
    assert.equal(elements.get("exportZip").disabled, true);
  } finally {
    restore();
  }
});

test("mountApp keeps a missing pasted Store Name empty and clears the error after correction", () => {
  const { elements, restore } = setupMockAppDom();

  try {
    assert.equal(mountApp(), true);

    pasteIntoGridCell(
      elements,
      0,
      0,
      "SKU-1\tX001\tMFG-1\t中文名 1\tItem One\t",
    );

    let storeNameInput = getGridInput(elements, 0, 5);
    assert.equal(storeNameInput.value, "");
    assert.equal(storeNameInput.classList.contains("has-cell-error"), true);
    assert.equal(elements.get("exportZip").disabled, true);

    storeNameInput.value = "EU";
    storeNameInput.listeners.input();
    storeNameInput = getGridInput(elements, 0, 5);

    assert.equal(storeNameInput.classList.contains("has-cell-error"), false);
    assert.equal(elements.get("vStoreName").textContent, "EU");
    assert.equal(elements.get("exportZip").disabled, false);
  } finally {
    restore();
  }
});
```

- [ ] **Step 4: Add a failing static-HTML regression test**

Add this import at the top of the test file:

```js
import { readFile } from "node:fs/promises";
```

Add:

```js
test("Labelcreator.html provides the Store Name datalist and blank preview node", async () => {
  const html = await readFile(
    new URL("../Labelcreator.html", import.meta.url),
    "utf8",
  );

  assert.match(html, /<datalist id="storeNameOptions"><\/datalist>/);
  assert.match(html, /<div class="label-line" id="vStoreName"><\/div>/);
});
```

- [ ] **Step 5: Run the new mounted-app and HTML tests and confirm failure**

Run:

```bash
node --test --test-name-pattern="suggestions|immediately marks|missing pasted|datalist and blank" tests/labelcreator-core.test.mjs
```

Expected:

- FAIL because the app does not populate or attach a datalist.
- FAIL because the empty preview still displays `NA`.
- FAIL because the HTML does not contain the shared datalist.

- [ ] **Step 6: Import the canonical options and clear the empty preview**

Update the core import in `labelcreator-app.js`:

```js
import {
  STORE_OPTIONS,
  createEmptyGridRows,
  applyGridPaste,
  mapCellErrors,
  normalizeGridRowsForValidation,
  validateRecords,
  buildExportJobs,
  selectAdjacentIndex,
  toPreviewRecord,
} from "./labelcreator-core.js";
```

Update `EMPTY_PREVIEW`:

```js
const EMPTY_PREVIEW = {
  manufactureSku: "等待数据",
  fnsku: "FNSKU",
  sku: "SKU",
  itemName: "Item Name",
  storeName: "",
  condition: "NEW",
};
```

Update the Store Name display error so it also uses the canonical options:

```js
if (error.field === "storeName" && error.message.includes("must be one of")) {
  return `${fieldLabel}: 仅支持 ${STORE_OPTIONS.join("、")}`;
}
```

- [ ] **Step 7: Register and populate the shared datalist**

Add the element to the `elements` object:

```js
storeNameOptions: document.getElementById("storeNameOptions"),
```

Include it in the mount guard:

```js
if (
  !elements.batchGridBody ||
  !elements.status ||
  !elements.clearData ||
  !elements.validateData ||
  !elements.exportZip ||
  !elements.storeNameOptions
) {
  return false;
}
```

Immediately after the mount guard, populate the list:

```js
elements.storeNameOptions.innerHTML = "";
STORE_OPTIONS.forEach((storeName) => {
  const option = document.createElement("option");
  option.value = storeName;
  elements.storeNameOptions.appendChild(option);
});
```

- [ ] **Step 8: Attach suggestions only to Store Name inputs**

In `renderGrid()`, after assigning the input metadata, add:

```js
if (field === "storeName") {
  input.setAttribute("list", "storeNameOptions");
}
```

- [ ] **Step 9: Add the datalist mount and clear the initial HTML preview**

In `Labelcreator.html`, place the shared datalist next to the grid body:

```html
<div class="batch-grid-body" id="batchGridBody"></div>
<datalist id="storeNameOptions"></datalist>
```

Change the preview Store Name node to:

```html
<div class="label-line" id="vStoreName"></div>
```

- [ ] **Step 10: Run the focused mounted-app and HTML tests**

Run:

```bash
node --test --test-name-pattern="suggestions|immediately marks|missing pasted|datalist and blank" tests/labelcreator-core.test.mjs
```

Expected: PASS for all matching tests.

- [ ] **Step 11: Run the complete core/app test file**

Run:

```bash
node --test tests/labelcreator-core.test.mjs
```

Expected: PASS with no regressions in grid editing, paste handling, validation summaries, preview navigation, filename generation, or ZIP eligibility.

- [ ] **Step 12: Commit the UI behavior**

```bash
git add labelcreator-app.js Labelcreator.html tests/labelcreator-core.test.mjs
git commit -m "feat: add required store name suggestions"
```

### Task 3: Verify The Complete Feature

**Files:**
- Verify: `labelcreator-core.js`
- Verify: `labelcreator-app.js`
- Verify: `Labelcreator.html`
- Verify: `tests/labelcreator-core.test.mjs`

- [ ] **Step 1: Run the complete automated test suite**

Run:

```bash
npm test
```

Expected: all tests pass with zero failures, skips, or cancellations.

- [ ] **Step 2: Check formatting and repository scope**

Run:

```bash
git diff --check
git status --short
```

Expected:

- `git diff --check` prints no output.
- `git status --short` is clean after the two feature commits.

- [ ] **Step 3: Start the static site for browser verification**

Run:

```bash
python3 -m http.server 8787
```

Open:

```text
http://localhost:8787/Labelcreator.html
```

- [ ] **Step 4: Verify the browser behavior**

Check these exact scenarios:

1. A completely blank row has no red Store Name error.
2. Entering SKU in a row immediately marks its blank Store Name cell red.
3. Focusing Store Name offers `NA`, `EU`, `AU`, and `Walmart-US`.
4. Selecting `EU` clears the error and shows `EU` in the preview.
5. Entering `eu` produces the unsupported-value error.
6. Entering ` EU ` is trimmed and accepted as `EU`.
7. Pasting five populated columns leaves Store Name blank and required.
8. Pasting six columns with `Walmart-US` validates successfully.
9. The ZIP export button stays disabled while any populated row has a blank or invalid Store Name.
10. A valid batch exports with unchanged PDF labels and filenames.

- [ ] **Step 5: Stop the local server**

Stop the foreground server with `Ctrl+C`.

## Spec Coverage Check

- Required Store Name with no implicit `NA`: Task 1, Steps 2-7.
- Exact allowed values and trim-only normalization: Task 1, Steps 3-8.
- One source of truth for suggestions and validation: Tasks 1 and 2.
- Native editable datalist: Task 2, Steps 2, 6-10.
- Immediate cell-level error on populated rows: Task 2, Step 3.
- Empty spare rows ignored: existing normalization test retained and full suite in Task 3.
- Missing sixth-column paste: Task 2, Step 3.
- Blank preview instead of `NA`: Task 2, Steps 2, 6, and 9.
- Batch export blocking and recovery: Task 2, Step 3.
- PDF, ZIP, barcode, Condition, and filename regressions: Task 3 full suite and browser verification.
