export function parseBatchText(text) {
  const lines = String(text || "").trim().split(/\r?\n/).filter(Boolean);
  return lines.map((line) => {
    const [
      sku = "",
      fnsku = "",
      manufactureSku = "",
      productChineseName = "",
      itemName = "",
      storeName = "",
    ] = line.split("\t");

    return {
      sku: sku.trim(),
      fnsku: fnsku.trim(),
      manufactureSku: manufactureSku.trim(),
      productChineseName: productChineseName.trim(),
      itemName: itemName.trim(),
      storeName: storeName.trim() || "NA",
      condition: "NEW",
    };
  });
}
