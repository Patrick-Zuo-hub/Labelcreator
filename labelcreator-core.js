const EXPECTED_COLUMNS = 6;
const ALLOWED_STORES = new Set(["NA", "EU", "AU", "Walmart-US"]);
const REQUIRED_FIELDS = [
  ["sku", "SKU"],
  ["fnsku", "FNSKU"],
  ["manufactureSku", "Manufacture SKU"],
  ["productChineseName", "产品中文名称"],
  ["itemName", "Item Name"],
];

function cleanCell(value) {
  return String(value ?? "").trim();
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
      storeName: cleanCell(padded[5]) || "NA",
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

    if (!ALLOWED_STORES.has(record.storeName)) {
      rowErrors.push({
        rowNumber: record.rowNumber,
        field: "storeName",
        message: `Row ${record.rowNumber}: Store Name must be one of NA, EU, AU, Walmart-US`,
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

  return `【标签】--${safe(record.productChineseName)}--${safe(record.storeName)}--${safe(record.fnsku)}.pdf`;
}

export function buildExportJobs(records) {
  return records
    .filter((record) => !(record.errors?.length > 0))
    .map((record) => ({
      filename: buildPdfFilename(record),
      labelData: toPreviewRecord(record),
    }));
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
