# Code 128 Auto-Mode Design

## Goal

Improve barcode thickness for numeric-only FNSKU values without changing the page workflow, file naming, or label layout rules.

## Scope

This change only affects barcode encoding selection.

- Pure numeric FNSKU values with an even number of digits should automatically use `Code 128 C`
- All other FNSKU values should continue using `Code 128 B`
- Existing preview and PDF generation flows should keep working without any new user controls

Out of scope:

- Manual barcode mode selection in the UI
- Mixed B/C switching for odd-length numeric strings
- Any changes to label size, text layout, file naming, padding, or export flow

## Encoding Rules

### Current behavior

The project currently encodes all barcode content with `Code 128 B`, even when the FNSKU contains only digits.

### New behavior

Use this decision rule:

1. If the FNSKU is composed only of digits (`0-9`)
2. And the digit count is even
3. Then encode with `Code 128 C`
4. Otherwise encode with `Code 128 B`

Examples:

- `00761483238211` -> `Code 128 C`
- `12345` -> `Code 128 B`
- `X0050P4BTR` -> `Code 128 B`
- `12AB34` -> `Code 128 B`

## Architecture

Keep the existing `Code 128 B` path intact and add a small selection layer.

### Recommended structure

- Keep `encodeCode128B(text)` as the existing implementation for printable ASCII content
- Add `encodeCode128C(text)` for pure numeric, even-length content
- Add a small shared selector, for example `encodeBarcodeAuto(text)`, that chooses between `B` and `C`

Then route these functions through the new selector:

- `barcodeSvgMarkup(text)`
- `buildPdf(labelData)`

This keeps each concern isolated:

- `B` encoder handles existing general-purpose text
- `C` encoder handles compressed numeric pairs
- `Auto` only decides which encoder to use

## Implementation Notes

### Code 128 C constraints

`Code 128 C` encodes digits in pairs. That means it is only valid for strings that are:

- numeric-only
- even-length

This project should not try to add mixed-mode switching in this change. Odd-length numeric strings should simply fall back to `Code 128 B`.

### Expected output effect

When a barcode switches from `B` to `C`:

- total module count decreases
- the barcode becomes visually wider/thicker at the same rendered width
- scan reliability often improves on thermal printers because the narrowest bars are no longer as thin

Example:

- `00761483238211` with `Code 128 B` -> `189` modules
- `00761483238211` with `Code 128 C` -> `112` modules

## Testing Strategy

Add or update tests in `tests/labelcreator-pdf.test.mjs` to cover:

1. Existing `Code 128 B` behavior stays valid for alphanumeric input
2. `encodeCode128C()` correctly encodes a pure numeric even-length value
3. `encodeBarcodeAuto()` chooses `Code 128 C` for pure numeric even-length input
4. `encodeBarcodeAuto()` chooses `Code 128 B` for:
   - alphanumeric strings
   - pure numeric odd-length strings
5. `barcodeSvgMarkup()` reflects the reduced module count when `C` is selected
6. `buildPdf()` uses the auto-selected barcode mode, not hard-coded `B`

Regression coverage should confirm that non-numeric values produce the same visual barcode output they do today.

## Files Expected To Change

- `labelcreator-pdf.js`
- `tests/labelcreator-pdf.test.mjs`

## Acceptance Criteria

- Numeric even-length FNSKU values render with `Code 128 C`
- All other FNSKU values still render with `Code 128 B`
- No new UI is introduced
- Existing PDF and preview flows still work
- All tests pass after the change
