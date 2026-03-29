import {
  parseBatchText,
  validateRecords,
  buildExportJobs,
  selectAdjacentIndex,
  toPreviewRecord,
} from "./labelcreator-core.js";
import { barcodeSvgMarkup, buildPdf } from "./labelcreator-pdf.js";

const EMPTY_PREVIEW = {
  manufactureSku: "等待数据",
  fnsku: "FNSKU",
  sku: "SKU",
  itemName: "Item Name",
  storeName: "NA",
  condition: "NEW",
};

const state = {
  records: [],
  selectedIndex: 0,
  isExporting: false,
  previewError: null,
  validationResult: {
    records: [],
    errors: [],
    canExport: false,
  },
};

function mountApp() {
  const elements = {
    pasteInput: document.getElementById("pasteInput"),
    clearData: document.getElementById("clearData"),
    validateData: document.getElementById("validateData"),
    exportZip: document.getElementById("exportZip"),
    status: document.getElementById("status"),
    recordsBody: document.getElementById("recordsBody"),
    preview: {
      manufactureSku: document.getElementById("vManufactureSku"),
      fnsku: document.getElementById("vFnsku"),
      sku: document.getElementById("vSku"),
      itemName: document.getElementById("vItemName"),
      storeName: document.getElementById("vStoreName"),
      condition: document.getElementById("vCondition"),
      barcode: document.getElementById("barcodePreview"),
    },
  };

  if (!elements.pasteInput) {
    return false;
  }

  function renderPreview(record) {
    const previewRecord = record || EMPTY_PREVIEW;

    elements.preview.manufactureSku.textContent = previewRecord.manufactureSku;
    elements.preview.fnsku.textContent = previewRecord.fnsku;
    elements.preview.sku.textContent = previewRecord.sku;
    elements.preview.itemName.textContent = previewRecord.itemName;
    elements.preview.storeName.textContent = previewRecord.storeName;
    elements.preview.condition.textContent = previewRecord.condition;

    try {
      const svg = barcodeSvgMarkup(previewRecord.fnsku);
      elements.preview.barcode.setAttribute("viewBox", svg.viewBox);
      elements.preview.barcode.innerHTML = svg.markup;
      state.previewError = null;
    } catch (error) {
      elements.preview.barcode.setAttribute("viewBox", "0 0 100 64");
      elements.preview.barcode.innerHTML = "";
      state.previewError = error.message;
    }
  }

  function updateStatus(result) {
    const exportJobs = buildExportJobs(result.records);
    const blockedExportCount = result.records.length - exportJobs.length;

    if (state.isExporting) {
      elements.status.textContent = `正在导出 ${exportJobs.length} 个 PDF 到 ZIP...`;
      return;
    }

    if (!result.records.length) {
      elements.status.textContent = "请先粘贴 Excel 表格数据。";
      return;
    }

    if (state.previewError) {
      elements.status.textContent = `预览条码渲染失败：${state.previewError}`;
      return;
    }

    if (result.errors.length > 0) {
      elements.status.textContent = `共有 ${result.errors.length} 处错误，修正后才能导出 ZIP。`;
      return;
    }

    if (blockedExportCount > 0) {
      elements.status.textContent = `${blockedExportCount} 条记录包含当前无法导出 PDF 的内容，修正后才能导出 ZIP。PDF 导出仅支持 ASCII 标签字段（Manufacture SKU / FNSKU / SKU / Item Name / Store Name）。`;
      return;
    }

    elements.status.textContent = `已载入 ${result.records.length} 条记录，可以导出 ZIP。`;
  }

  function updateToolbar(result) {
    const exportJobs = buildExportJobs(result.records);
    const canExport = result.canExport && exportJobs.length === result.records.length && !state.isExporting;
    elements.exportZip.disabled = !canExport;
    elements.exportZip.title = canExport
      ? "下载包含每条有效记录 PDF 的 ZIP 文件"
      : result.records.length && exportJobs.length !== result.records.length
        ? "存在当前无法导出 PDF 的记录"
        : "";
  }

  async function exportValidatedZip() {
    const JSZipCtor = window.JSZip;
    if (!JSZipCtor) {
      throw new Error("JSZip 未加载，无法导出 ZIP。");
    }

    const jobs = buildExportJobs(state.validationResult.records);
    if (!jobs.length) {
      return;
    }

    const zip = new JSZipCtor();
    for (const job of jobs) {
      zip.file(job.filename, buildPdf(job.labelData));
    }

    const zipBlob = await zip.generateAsync({ type: "blob" });
    const downloadUrl = URL.createObjectURL(zipBlob);
    const link = document.createElement("a");
    link.href = downloadUrl;
    link.download = "amazon-labels.zip";
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(downloadUrl);
  }

  function renderTable(records) {
    elements.recordsBody.innerHTML = "";

    records.forEach((record, index) => {
      const row = document.createElement("tr");
      row.dataset.index = String(index);
      row.tabIndex = 0;
      row.classList.toggle("selected", index === state.selectedIndex);

      if (record.errors?.length) {
        row.classList.add("has-errors");
      }

      const cells = [
        record.rowNumber,
        record.sku,
        record.fnsku,
        record.manufactureSku,
        record.productChineseName,
        record.storeName,
      ];

      for (const value of cells) {
        const cell = document.createElement("td");
        cell.textContent = value || "—";
        row.appendChild(cell);
      }

      row.addEventListener("click", () => {
        selectRecord(index);
      });

      row.addEventListener("keydown", (event) => {
        if (event.key === "ArrowDown" || event.key === "ArrowUp") {
          event.preventDefault();
          const direction = event.key === "ArrowDown" ? 1 : -1;
          moveSelection(direction);
        }
      });

      elements.recordsBody.appendChild(row);
    });
  }

  function selectRecord(index) {
    if (!state.records.length) {
      state.selectedIndex = 0;
      renderPreview(null);
      renderTable([]);
      updateStatus(state.validationResult);
      return;
    }

    state.selectedIndex = Math.max(0, Math.min(state.records.length - 1, index));
    renderTable(state.records);
    renderPreview(toPreviewRecord(state.records[state.selectedIndex]));
    updateStatus(state.validationResult);
  }

  function moveSelection(direction) {
    const nextIndex = selectAdjacentIndex(state.selectedIndex, state.records.length, direction);
    selectRecord(nextIndex);

    const row = elements.recordsBody.querySelector(`[data-index="${nextIndex}"]`);
    if (row) {
      row.focus();
    }
  }

  function syncFromTextarea() {
    const parsed = parseBatchText(elements.pasteInput.value);
    const result = validateRecords(parsed);

    state.records = result.records;
    state.validationResult = result;
    state.selectedIndex = 0;

    renderTable(result.records);
    renderPreview(result.records[0] ? toPreviewRecord(result.records[0]) : null);
    updateStatus(result);
    updateToolbar(result);
  }

  elements.pasteInput.addEventListener("input", syncFromTextarea);

  elements.clearData.addEventListener("click", () => {
    elements.pasteInput.value = "";
    state.records = [];
    state.isExporting = false;
    state.previewError = null;
    state.validationResult = { records: [], errors: [], canExport: false };
    state.selectedIndex = 0;
    renderTable([]);
    renderPreview(null);
    updateStatus(state.validationResult);
    updateToolbar(state.validationResult);
  });

  elements.validateData.addEventListener("click", () => {
    const parsed = parseBatchText(elements.pasteInput.value);
    const result = validateRecords(parsed);

    state.records = result.records;
    state.validationResult = result;
    if (state.records.length > 0) {
      state.selectedIndex = Math.min(state.selectedIndex, state.records.length - 1);
      renderTable(state.records);
      renderPreview(toPreviewRecord(state.records[state.selectedIndex]));
    } else {
      state.selectedIndex = 0;
      renderTable([]);
      renderPreview(null);
    }
    updateStatus(result, "validated");
    updateToolbar(result);
  });

  elements.exportZip.addEventListener("click", async () => {
    const exportJobs = buildExportJobs(state.validationResult.records);
    if (!state.validationResult.canExport || exportJobs.length !== state.validationResult.records.length) {
      updateStatus(state.validationResult, "validated");
      return;
    }

    state.isExporting = true;
    updateToolbar(state.validationResult);
    updateStatus(state.validationResult);

    try {
      const exportCount = exportJobs.length;
      await exportValidatedZip();
      elements.status.textContent = `已导出 amazon-labels.zip，包含 ${exportCount} 个 PDF。`;
    } catch (error) {
      elements.status.textContent = `ZIP 导出失败：${error.message}`;
    } finally {
      state.isExporting = false;
      updateToolbar(state.validationResult);
    }
  });

  renderPreview(null);
  updateStatus(state.validationResult);
  updateToolbar(state.validationResult);

  return true;
}

export { mountApp };
