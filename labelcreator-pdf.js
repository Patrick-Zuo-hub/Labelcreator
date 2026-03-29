const LABEL_MM = {
  width: 60,
  height: 30,
  margin: 1.5,
  font: 2.8,
  barcodeTop: 4.7,
  barcodeHeight: 10.4,
  fnskuTop: 15.7,
  itemTop: 19.0,
  skuTop: 22.1,
  bottomTop: 25.1,
};

const CODE128_PATTERNS = [
  "212222", "222122", "222221", "121223", "121322", "131222", "122213", "122312", "132212",
  "221213", "221312", "231212", "112232", "122132", "122231", "113222", "123122", "123221",
  "223211", "221132", "221231", "213212", "223112", "312131", "311222", "321122", "321221",
  "312212", "322112", "322211", "212123", "212321", "232121", "111323", "131123", "131321",
  "112313", "132113", "132311", "211313", "231113", "231311", "112133", "112331", "132131",
  "113123", "113321", "133121", "313121", "211331", "231131", "213113", "213311", "213131",
  "311123", "311321", "331121", "312113", "312311", "332111", "314111", "221411", "431111",
  "111224", "111422", "121124", "121421", "141122", "141221", "112214", "112412", "122114",
  "122411", "142112", "142211", "241211", "221114", "413111", "241112", "134111", "111242",
  "121142", "121241", "114212", "124112", "124211", "411212", "421112", "421211", "212141",
  "214121", "412121", "111143", "111341", "131141", "114113", "114311", "411113", "411311",
  "113141", "114131", "311141", "411131", "211412", "211214", "211232", "2331112",
];

function clean(value) {
  return (value || "").toString().trim();
}

function valueOrFallback(value, fallback) {
  return clean(value) || fallback;
}

function escapePdfText(value) {
  return value.replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)");
}

function mmToPt(mm) {
  return mm * 72 / 25.4;
}

function createMeasureContext() {
  if (typeof document === "undefined") {
    return null;
  }

  const canvas = document.createElement("canvas");
  return canvas.getContext("2d");
}

const measureContext = createMeasureContext();

function measureTextPx(text, fontPx) {
  if (measureContext) {
    measureContext.font = `400 ${fontPx}px Arial, Helvetica, sans-serif`;
    return measureContext.measureText(text).width;
  }

  return text.length * fontPx * 0.56;
}

function fitFontPx(text, maxWidthPx, baseFontPx) {
  let size = baseFontPx;
  while (size > 1) {
    if (measureTextPx(text, size) <= maxWidthPx) {
      return size;
    }
    size -= 1;
  }
  return 1;
}

function pdfTextWidthPt(text, fontPx) {
  return measureTextPx(text, fontPx) * 72 / 96;
}

function fitFontPt(text, maxWidthMm, baseFontMm) {
  const maxWidthPx = maxWidthMm * 96 / 25.4;
  const baseFontPx = baseFontMm * 96 / 25.4;
  return fitFontPx(text, maxWidthPx, baseFontPx) * 72 / 96;
}

function ensurePdfAscii(data) {
  const values = [
    data.manufactureSku,
    data.fnsku,
    data.sku,
    data.itemName,
    data.storeName,
    data.condition,
  ];

  for (const value of values) {
    if (/[^\x20-\x7E]/.test(value)) {
      throw new Error("PDF export currently supports ASCII text only. Use PNG or print for non-ASCII content.");
    }
  }
}

export function encodeCode128B(text) {
  const input = valueOrFallback(text, "FNSKU");
  const codes = [104];
  let checksum = 104;

  for (let index = 0; index < input.length; index += 1) {
    const codePoint = input.charCodeAt(index);
    const codeValue = codePoint - 32;

    if (codeValue < 0 || codeValue > 95) {
      throw new Error("FNSKU contains unsupported characters. Use ASCII text only.");
    }

    codes.push(codeValue);
    checksum += codeValue * (index + 1);
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

export function barcodeSvgMarkup(text) {
  const barcode = encodeCode128B(text);
  const height = 64;
  const rects = [];
  let cursor = 0;

  for (const segment of barcode.bars) {
    if (segment.isBar) {
      rects.push(
        `<rect x="${cursor}" y="0" width="${segment.width}" height="${height}" fill="#000"></rect>`,
      );
    }
    cursor += segment.width;
  }

  return {
    viewBox: `0 0 ${barcode.totalModules} ${height}`,
    markup: rects.join(""),
  };
}

export function buildPdf(labelData) {
  ensurePdfAscii(labelData);

  const pageWidthPt = mmToPt(LABEL_MM.width);
  const pageHeightPt = mmToPt(LABEL_MM.height);
  const marginPt = mmToPt(LABEL_MM.margin);
  const contentWidthPt = pageWidthPt - marginPt * 2;
  const ascentFactor = 0.78;

  const barcode = encodeCode128B(labelData.fnsku);
  const modulePt = contentWidthPt / barcode.totalModules;
  let barcodeCursor = marginPt;
  const barTopPt = pageHeightPt - mmToPt(LABEL_MM.barcodeTop + LABEL_MM.barcodeHeight);
  const barHeightPt = mmToPt(LABEL_MM.barcodeHeight);

  const ops = ["0 g"];

  function topMmToBaselinePt(topMm, fontPt) {
    return pageHeightPt - mmToPt(topMm) - (fontPt * ascentFactor);
  }

  function pushText(text, topMm, align, maxWidthMm) {
    const fontPt = fitFontPt(text, maxWidthMm, LABEL_MM.font);
    const textWidthPt = pdfTextWidthPt(text, fontPt * 96 / 72);
    let xPt = marginPt;

    if (align === "center") {
      xPt = (pageWidthPt - textWidthPt) / 2;
    } else if (align === "right") {
      xPt = pageWidthPt - marginPt - textWidthPt;
    }

    ops.push(
      "BT /F1 " + fontPt.toFixed(2) + " Tf 1 0 0 1 " +
      xPt.toFixed(2) + " " + topMmToBaselinePt(topMm, fontPt).toFixed(2) +
      " Tm (" + escapePdfText(text) + ") Tj ET",
    );
  }

  for (const segment of barcode.bars) {
    const widthPt = segment.width * modulePt;
    if (segment.isBar) {
      ops.push(
        barcodeCursor.toFixed(3) + " " +
        barTopPt.toFixed(3) + " " +
        widthPt.toFixed(3) + " " +
        barHeightPt.toFixed(3) + " re f",
      );
    }
    barcodeCursor += widthPt;
  }

  pushText(labelData.manufactureSku, LABEL_MM.margin, "center", LABEL_MM.width - LABEL_MM.margin * 2);
  pushText(labelData.fnsku, LABEL_MM.fnskuTop, "center", LABEL_MM.width - LABEL_MM.margin * 2);
  pushText(labelData.itemName, LABEL_MM.itemTop, "left", LABEL_MM.width - LABEL_MM.margin * 2);
  pushText(labelData.sku, LABEL_MM.skuTop, "left", (LABEL_MM.width - LABEL_MM.margin * 2) * 0.76);
  pushText(labelData.condition, LABEL_MM.bottomTop, "left", (LABEL_MM.width - LABEL_MM.margin * 2) * 0.42);
  pushText(labelData.storeName, LABEL_MM.bottomTop, "right", (LABEL_MM.width - LABEL_MM.margin * 2) * 0.26);

  const stream = ops.join("\n");
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Count 1 /Kids [3 0 R] >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 " + pageWidthPt.toFixed(2) + " " + pageHeightPt.toFixed(2) + "] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
    "<< /Length " + stream.length + " >>\nstream\n" + stream + "\nendstream",
  ];

  let pdf = "%PDF-1.4\n";
  const offsets = [0];

  for (let i = 0; i < objects.length; i += 1) {
    offsets.push(pdf.length);
    pdf += (i + 1) + " 0 obj\n" + objects[i] + "\nendobj\n";
  }

  const xrefStart = pdf.length;
  pdf += "xref\n0 " + (objects.length + 1) + "\n";
  pdf += "0000000000 65535 f \n";
  for (let i = 1; i < offsets.length; i += 1) {
    pdf += String(offsets[i]).padStart(10, "0") + " 00000 n \n";
  }
  pdf += "trailer\n<< /Size " + (objects.length + 1) + " /Root 1 0 R >>\n";
  pdf += "startxref\n" + xrefStart + "\n%%EOF";

  return new Blob([pdf], { type: "application/pdf" });
}
