const EXPECTED_COLUMNS = 6;

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
