# Store Name Required-Field Design

## Goal

Change `Store Name` from an optional field with an implicit `NA` fallback into an explicitly required field. Users must choose or enter the correct store for every populated product row before the batch can be exported.

## Current Behavior

- The editable grid renders `Store Name` as a free-form text input.
- Empty `Store Name` values are normalized to `NA`.
- Validation accepts only `NA`, `EU`, `AU`, and `Walmart-US`.
- A non-empty invalid value blocks the entire ZIP export.
- Because blank values become `NA`, users can export without explicitly confirming the store.

## Agreed Behavior

### Required value

- `Store Name` is required for every populated product row.
- The system must not prefill, infer, or substitute `NA`.
- A completely empty spare row remains ignored and must not show validation errors.
- As soon as any field in a row contains data, an empty `Store Name` becomes a validation error.

### Allowed values

The only valid values remain:

- `NA`
- `EU`
- `AU`
- `Walmart-US`

Leading and trailing whitespace is removed before validation. Case is not normalized, so ` NA ` is valid after trimming while `na`, `Eu`, and `walmart-us` are invalid.

### Input control

`Store Name` remains an editable text input so that single-cell editing and Excel grid paste continue to work. The input uses a native `datalist` to suggest the four allowed values.

- Users can select a suggestion.
- Users can type or paste a value.
- The suggestion list does not make arbitrary text valid; validation remains authoritative.
- The field starts empty and does not show a selected default.

The allowed option list has one source of truth. The core module exports the ordered store options, validation builds its allowed-value set from that list, and the app uses the same exported list to populate one shared `datalist`. The HTML contains the empty shared `datalist` mount point; it does not duplicate the option values.

## Data Flow

1. The user edits a cell or pastes tabular data into the grid.
2. Cell values are trimmed but `Store Name` is not defaulted or case-normalized.
3. Completely empty rows are removed from the validation dataset.
4. Every remaining row is validated immediately.
5. A blank `Store Name` produces a required-field error.
6. A non-empty value outside the allowed list produces an allowed-values error.
7. The live preview mirrors the trimmed input. A blank Store Name stays blank and is never displayed as `NA`.
8. Export jobs are created only when every populated row is valid.

Legacy text parsing must follow the same rule: an absent or empty sixth column remains empty and is validated as required rather than becoming `NA`.

## Validation And Feedback

### Blank value

The cell-level message is:

`Store Name: 必填`

### Unsupported value

The cell-level message is:

`Store Name: 仅支持 NA、EU、AU、Walmart-US`

Errors appear through the existing validation surfaces:

- red cell styling;
- input and cell tooltip;
- current-record inspector;
- batch validation summary;
- disabled ZIP export.

Blank and unsupported values must produce one Store Name error each. A blank value must not also receive the unsupported-value error.

## Grid And Paste Behavior

- `Store Name` remains the sixth grid column.
- A full-row paste can provide the value in column six.
- A paste with a missing or blank sixth value leaves the field empty and immediately marks it required once the row contains other data.
- Pasting directly into the Store Name cell remains supported.
- Extra columns continue to use the existing ignored-column notice.
- Correcting the value immediately clears the Store Name error and restores export eligibility when no other errors remain.

## Preview, PDF, And Filename Behavior

- The live preview continues to update from the selected row even when that row is incomplete.
- A blank Store Name renders as blank in the preview.
- A typed unsupported value may appear in the live preview, but the visible validation error makes the row ineligible for export.
- The printed label position of Store Name remains unchanged.
- The PDF filename format remains:

  `【标签】Manufacture SKU-产品中文名称-FNSKU-Store Name.pdf`

- No PDF or ZIP job is created until all populated rows contain a valid Store Name.

## Implementation Boundaries

Expected code changes are limited to:

- `labelcreator-core.js`
  - export the ordered store options;
  - remove both `NA` fallback paths;
  - make `storeName` a required field;
  - run allowed-value validation only for non-empty values.
- `labelcreator-app.js`
  - populate a shared Store Name `datalist`;
  - attach it only to Store Name grid inputs;
  - remove `NA` from the empty preview state.
- `tests/labelcreator-core.test.mjs`
  - update old defaulting expectations;
  - add required-field, trimming, case-sensitivity, datalist, paste, live-error, and recovery coverage.
- `Labelcreator.html`
  - add one empty shared `datalist` mount point for the app to populate.

No changes are planned for barcode encoding, `Condition = NEW`, PDF dimensions, label layout, ZIP structure, or PDF filename ordering.

## Testing Strategy

Automated coverage must verify:

- empty Store Name is preserved as empty;
- completely empty rows remain ignored;
- a populated row with an empty Store Name fails with one required-field error;
- all four exact allowed values pass;
- surrounding whitespace is trimmed;
- incorrect case fails;
- unsupported values fail with the allowed-values message;
- missing or blank sixth-column paste produces the required error;
- the Store Name input exposes all four suggestions;
- manual typing and full-grid paste still work;
- the preview does not substitute `NA`;
- correcting the Store Name removes the error;
- export remains blocked until every populated row is valid;
- existing PDF and filename behavior remains unchanged for valid rows.

Run the focused core/app tests and the complete test suite before completion.

## Success Criteria

- No code path silently converts an empty Store Name to `NA`.
- Every populated row requires an explicit, valid Store Name.
- The user receives immediate and field-specific feedback.
- Excel paste and single-cell editing remain intact.
- Valid batches continue to preview and export exactly as before.
