# Labelcreator

## Overview

`Labelcreator` is a standalone web page used to quickly generate Amazon FNSKU barcode labels.

The page was discussed and refined to support:

- fast field entry
- real-time label preview
- barcode generation based on `FNSKU`
- export to `PNG`
- export to `PDF`
- print-ready output

The current page file is:

- [Labelcreator.html](/Users/patrick/Documents/New%20project/Labelcreator.html)

## Core Goal

Create a simple web page that lets a user fill in Amazon label data and immediately generate a compact label suitable for printing.

The label is intended to match a practical Amazon-style FNSKU label layout and should feel close to the provided sample label PDF in spacing and readability.

## Label Size

- Final label size: `6cm x 3cm`
- Output should not include decorative borders
- Output should not include extra blank margins
- All content must stay inside a `1.5mm` safe margin on all four sides

## Required Fields

The label supports these data fields:

- `Manufacture SKU`
- `FNSKU`
- `SKU`
- `Item Name`
- `Store Name`
- `Condition`

## Barcode Rules

- The barcode is generated from the `FNSKU` field
- The barcode should be visually clear and sharp, not blurry
- The barcode should be relatively wide and visually prominent
- Preview and export should both preserve barcode readability

To avoid blur, the current implementation uses native barcode drawing logic instead of relying on remote CDN barcode libraries.

## Preview Layout Requirements

The label preview was adjusted several times to align with the requested style.

Final agreed layout rules:

- Do not show field labels inside the label preview
- Show only field values
- `Manufacture SKU` must be centered
- `FNSKU` must be centered
- `Item Name` appears below the barcode text
- `SKU` appears below `Item Name`
- `Condition` is placed at the lower left
- `Store Name` is placed at the lower right

The preview should resemble a practical FNSKU label rather than a generic form demo.

## Typography Requirements

The typography requirements were refined based on the sample PDF:

- Use `Arial / Helvetica` style typography for the label content
- Do not use bold text in exported output
- Exported label text should use regular weight
- All label text sizes were aligned to the same visual size as the `Manufacture SKU` line

Notes:

- The page chrome can use a richer UI font stack
- The actual label content should stay in `Arial / Helvetica` style for consistency with the sample

## Export Requirements

### PNG Export

- Must export exactly the label content area
- Must preserve the `6cm x 3cm` ratio
- Must not add border or white frame outside the label
- Must keep barcode crisp

### PDF Export

- Must export at `60mm x 30mm`
- Must use the same label layout as preview
- Must keep the label borderless
- Must use `Arial / Helvetica` style regular-weight text

Current implementation note:

- PDF export currently supports ASCII text only
- For non-ASCII content, `PNG` export or direct print is the safer path

### Print

- Printing should target the label size directly
- Print layout should remove page UI and leave only the label

## Front-End Style Direction

The page UI was requested to loosely reference a clean label editor interface:

- left side: data entry form
- right side: live label preview
- clean, direct workflow
- minimal friction for repeated use

The UI should feel more intentional than a default boilerplate form, but the actual label itself must remain plain, compact, and print-oriented.

## Important Historical Changes From Discussion

The final requirements came from multiple rounds of feedback. Key requested changes included:

- remove field names from inside the label
- remove barcode surrounding lines
- center `Manufacture SKU`
- center `FNSKU`
- remove label border in final output
- ensure exported files do not include extra whitespace
- widen and enlarge the barcode
- make the content feel more filled and closer to the sample PDF label
- switch exported fonts toward `Arial / Helvetica`
- remove bold from exported text
- enforce `1.5mm` safe margin around all sides
- improve barcode sharpness to avoid fuzzy output
- unify label text sizes

## Current Technical Approach

The current standalone implementation uses:

- a single HTML file
- native JavaScript
- native SVG preview rendering for the barcode
- native canvas rendering for PNG export
- native PDF construction for PDF export

This was chosen so the page can work as a self-contained file without depending on remote CDNs.

## File Naming

The requested page name is:

- `Labelcreator`

The current generated web file is:

- `Labelcreator.html`

## Suggested Future Improvements

If the tool continues evolving, likely next improvements would be:

- batch label generation
- CSV or Excel import
- multiple label copies per export
- editable font-size presets
- direct printer preset support
- optional PDF Unicode support

## Summary

`Labelcreator` is a compact Amazon FNSKU label generator web page designed around a strict `6cm x 3cm` print label, a sharp FNSKU barcode, borderless export, `1.5mm` safe margins, and `Arial / Helvetica` regular-weight label typography.

It was iteratively refined to match a real sample label more closely, especially in barcode clarity, spacing, alignment, and export cleanliness.
