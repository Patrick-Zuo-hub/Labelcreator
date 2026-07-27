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
const GRID_COLUMNS = [
  "sku",
  "fnsku",
  "manufactureSku",
  "productChineseName",
  "itemName",
  "storeName",
];

function cleanCell(value) {
  return String(value ?? "").trim();
}

function isAsciiPdfValue(value) {
  return !/[^\x20-\x7E]/.test(String(value ?? ""));
}

export function createEmptyGridRows(count = 10) {
  return Array.from({ length: count }, (_, index) => ({
    rowNumber: index + 1,
    sku: "",
    fnsku: "",
    manufactureSku: "",
    productChineseName: "",
    itemName: "",
    storeName: "",
  }));
}

export function applyGridPaste(rows, startCell, clipboardText) {
  const nextRows = rows.map((row) => ({ ...row }));
  const lines = String(clipboardText || "").split(/\r?\n/).filter((line) => line.length > 0);
  let ignoredExtraColumns = false;
  const startColumnIndex = Math.max(0, (startCell?.col ?? 0) - 1);

  lines.forEach((line, rowOffset) => {
    const targetRow = startCell.row + rowOffset;
    if (!nextRows[targetRow]) return;

    const values = line.split("\t");
    const maxColumns = GRID_COLUMNS.length - startColumnIndex;
    const appliedColumns = Math.min(values.length, maxColumns);
    for (let colOffset = 0; colOffset < appliedColumns; colOffset += 1) {
      nextRows[targetRow][GRID_COLUMNS[startColumnIndex + colOffset]] = cleanCell(values[colOffset]);
    }

    if (values.length > maxColumns) {
      ignoredExtraColumns = true;
    }
  });

  return {
    rows: nextRows,
    notice: ignoredExtraColumns ? "检测到多余列已忽略，已自动忽略第 7 列及之后的数据。" : "",
  };
}

function hasMeaningfulGridValue(row) {
  return GRID_COLUMNS.some((key) => String(row[key] ?? "").trim() !== "");
}

export function normalizeGridRowsForValidation(rows) {
  return rows
    .filter(hasMeaningfulGridValue)
    .map((row) => ({
      rowNumber: row.rowNumber,
      sku: cleanCell(row.sku),
      fnsku: cleanCell(row.fnsku),
      manufactureSku: cleanCell(row.manufactureSku),
      productChineseName: cleanCell(row.productChineseName),
      itemName: cleanCell(row.itemName),
      storeName: cleanCell(row.storeName),
      condition: "NEW",
      rawColumns: GRID_COLUMNS.map((key) => cleanCell(row[key])),
    }));
}

export function mapCellErrors(errors) {
  const byRow = new Map();

  errors.forEach((error) => {
    if (!byRow.has(error.rowNumber)) {
      byRow.set(error.rowNumber, {});
    }

    const row = byRow.get(error.rowNumber);
    row[error.field] = row[error.field] || [];
    row[error.field].push(error.message);
  });

  return byRow;
}

export function parseBatchText(text) {
  const lines = String(text || "").split(/\r?\n/);
  const records = [];

  lines.forEach((line, index) => {
    if (!line.trim()) return;

    const columns = line.split("\t");
    const padded = [...columns];
    while (padded.length < EXPECTED_COLUMNS) padded.push("");

    records.push({
      rowNumber: index + 1,
      sku: cleanCell(padded[0]),
      fnsku: cleanCell(padded[1]),
      manufactureSku: cleanCell(padded[2]),
      productChineseName: cleanCell(padded[3]),
      itemName: cleanCell(padded[4]),
      storeName: cleanCell(padded[5]),
      condition: "NEW",
      rawColumns: columns.map(cleanCell),
    });
  });

  return records;
}

export function validateRecords(records) {
  const errors = [];
  const normalizedRecords = records.map((record) => {
    const rowErrors = [];

    if (record.rawColumns.length !== EXPECTED_COLUMNS) {
      rowErrors.push({
        rowNumber: record.rowNumber,
        field: "row",
        message: `Row ${record.rowNumber} must contain exactly 6 columns`,
      });
    }

    for (const [key, label] of REQUIRED_FIELDS) {
      if (!record[key]) {
        rowErrors.push({
          rowNumber: record.rowNumber,
          field: key,
          message: `Row ${record.rowNumber}: ${label} is required`,
        });
      }
    }

    if (record.storeName && !ALLOWED_STORES.has(record.storeName)) {
      rowErrors.push({
        rowNumber: record.rowNumber,
        field: "storeName",
        message: `Row ${record.rowNumber}: Store Name must be one of ${STORE_OPTIONS.join(", ")}`,
      });
    }

    errors.push(...rowErrors);
    return { ...record, errors: rowErrors };
  });

  return {
    records: normalizedRecords,
    errors,
    canExport: normalizedRecords.length > 0 && errors.length === 0,
  };
}

export function buildPdfFilename(record) {
  const safe = (value) => String(value ?? "").replace(/[\\/:*?"<>|]/g, "-").trim();

  return `【标签】${safe(record.manufactureSku)}-${safe(record.productChineseName)}-${safe(record.fnsku)}-${safe(record.storeName)}.pdf`;
}

function withFilenameSuffix(filename, suffixNumber) {
  if (suffixNumber <= 1) {
    return filename;
  }

  return filename.replace(/\.pdf$/i, ` (${suffixNumber}).pdf`);
}

export function buildExportJobs(records) {
  const filenameCounts = new Map();

  return records.flatMap((record) => {
      if (!Array.isArray(record.errors) || record.errors.length > 0) {
        return [];
      }

      const labelData = toPreviewRecord(record);
      const isPdfSafe = Object.values(labelData).every(isAsciiPdfValue);
      if (!isPdfSafe) {
        return [];
      }

      const baseFilename = buildPdfFilename(record);
      const nextCount = (filenameCounts.get(baseFilename) || 0) + 1;
      filenameCounts.set(baseFilename, nextCount);

      return [{
        filename: withFilenameSuffix(baseFilename, nextCount),
        labelData,
      }];
    });
}

export function selectAdjacentIndex(currentIndex, total, direction) {
  if (total <= 0) {
    return 0;
  }

  return Math.max(0, Math.min(total - 1, currentIndex + direction));
}

export function toPreviewRecord(record) {
  return {
    manufactureSku: record.manufactureSku,
    fnsku: record.fnsku,
    sku: record.sku,
    itemName: record.itemName,
    storeName: record.storeName,
    condition: "NEW",
  };
}
