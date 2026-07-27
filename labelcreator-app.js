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
import { barcodeSvgMarkup, buildPdf } from "./labelcreator-pdf.js";

const EMPTY_PREVIEW = {
  manufactureSku: "等待数据",
  fnsku: "FNSKU",
  sku: "SKU",
  itemName: "Item Name",
  storeName: "",
  condition: "NEW",
};

const GRID_FIELD_ORDER = [
  "sku",
  "fnsku",
  "manufactureSku",
  "productChineseName",
  "itemName",
  "storeName",
];

const GRID_HINT_TEXT = "SKU | FNSKU | Manufacture SKU | 产品中文名称 | Item Name | Store Name";

const FIELD_LABELS = {
  row: "整行数据",
  sku: "SKU",
  fnsku: "FNSKU",
  manufactureSku: "Manufacture SKU",
  productChineseName: "产品中文名称",
  itemName: "Item Name",
  storeName: "Store Name",
};

const state = {
  rows: createEmptyGridRows(),
  records: [],
  selectedIndex: 0,
  isExporting: false,
  previewError: null,
  statusMode: "live",
  validatedRecordKey: null,
  gridNotice: "",
  cellErrors: new Map(),
  validationResult: {
    records: [],
    errors: [],
    canExport: false,
  },
  gridRows: [],
};

function buildDatasetKey(records) {
  return JSON.stringify(
    records.map((record) => ({
      rowNumber: record.rowNumber,
      sku: record.sku,
      fnsku: record.fnsku,
      manufactureSku: record.manufactureSku,
      productChineseName: record.productChineseName,
      itemName: record.itemName,
      storeName: record.storeName,
      rawColumns: record.rawColumns,
    })),
  );
}

function formatRecordError(error) {
  const fieldLabel = FIELD_LABELS[error.field] || error.field || "字段";

  if (error.field === "row") {
    return `${fieldLabel}: 必须恰好包含 6 列`;
  }

  if (error.message.includes("is required")) {
    return `${fieldLabel}: 必填`;
  }

  if (error.field === "storeName" && error.message.includes("must be one of")) {
    return `${fieldLabel}: 仅支持 ${STORE_OPTIONS.join("、")}`;
  }

  return `${fieldLabel}: ${error.message}`;
}

function summarizeRecordErrors(record) {
  if (!record?.errors?.length) {
    return {
      shortText: "通过",
      fullText: "当前记录校验通过。",
    };
  }

  const details = record.errors.map(formatRecordError);
  return {
    shortText: `${details.length} 处错误`,
    fullText: details.join("\n"),
  };
}

function summarizeValidationBanner(result, notice = "") {
  const messages = [];

  if (result.errors.length > 0) {
    messages.push(`发现 ${result.errors.length} 处校验错误，修正后才能导出 ZIP。`);
  }

  if (notice) {
    messages.push(notice);
  }

  return messages.join("\n");
}

export function getStatusMessage(result, uiState = {}, mode = "live") {
  const exportJobs = buildExportJobs(result.records);
  const blockedExportCount = result.records.length - exportJobs.length;

  if (uiState.isExporting) {
    return `正在导出 ${exportJobs.length} 个 PDF 到 ZIP...`;
  }

  if (!result.records.length) {
    return "请先填写表格数据。";
  }

  if (uiState.previewError) {
    return `预览条码渲染失败：${uiState.previewError}`;
  }

  if (result.errors.length > 0) {
    return `共有 ${result.errors.length} 处错误，修正后才能导出 ZIP。`;
  }

  if (mode === "validated") {
    if (blockedExportCount > 0) {
      return `${blockedExportCount} 条记录包含当前无法导出 PDF 的内容，修正后才能导出 ZIP。PDF 导出仅支持 ASCII 标签字段（Manufacture SKU / FNSKU / SKU / Item Name / Store Name）。`;
    }

    return `校验通过，共 ${result.records.length} 条记录。可以导出 ZIP。`;
  }

  return `已载入 ${result.records.length} 条记录，尚未校验。`;
}

function mountApp() {
  state.rows = createEmptyGridRows();
  state.records = [];
  state.selectedIndex = 0;
  state.isExporting = false;
  state.previewError = null;
  state.statusMode = "live";
  state.validatedRecordKey = null;
  state.gridNotice = "";
  state.validationResult = {
    records: [],
    errors: [],
    canExport: false,
  };
  state.gridRows = [];

  const elements = {
    batchGridHint: document.getElementById("batchGridHint"),
    batchGridBody: document.getElementById("batchGridBody"),
    storeNameOptions: document.getElementById("storeNameOptions"),
    clearData: document.getElementById("clearData"),
    validateData: document.getElementById("validateData"),
    exportZip: document.getElementById("exportZip"),
    status: document.getElementById("status"),
    prevRecord: document.getElementById("prevRecord"),
    nextRecord: document.getElementById("nextRecord"),
    previewPosition: document.getElementById("previewPosition"),
    recordInspector: document.getElementById("recordInspector"),
    validationSummary: document.getElementById("validationSummary"),
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

  elements.storeNameOptions.innerHTML = "";
  STORE_OPTIONS.forEach((storeName) => {
    const option = document.createElement("option");
    option.value = storeName;
    elements.storeNameOptions.appendChild(option);
  });

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

  function renderRecordInspector(record) {
    if (!elements.recordInspector) {
      return;
    }

    if (!record) {
      elements.recordInspector.textContent = "选择一条记录后，这里会显示当前行的校验结果与错误原因。";
      return;
    }

    elements.recordInspector.textContent = summarizeRecordErrors(record).fullText;
  }

  function updateValidationSummary(result) {
    if (!elements.validationSummary) {
      return;
    }

    const summaryText = summarizeValidationBanner(result, state.gridNotice);
    elements.validationSummary.textContent = summaryText;
    elements.validationSummary.hidden = !summaryText;
    elements.validationSummary.classList.toggle("has-errors", result.errors.length > 0);
    elements.validationSummary.classList.toggle("has-notice", !result.errors.length && Boolean(state.gridNotice));
  }

  function updatePreviewNavigation() {
    if (!elements.previewPosition || !elements.prevRecord || !elements.nextRecord) {
      return;
    }

    elements.previewPosition.textContent = `第 ${state.selectedIndex + 1} / ${state.rows.length} 条`;
    elements.prevRecord.disabled = state.selectedIndex === 0;
    elements.nextRecord.disabled = state.selectedIndex >= state.rows.length - 1;
  }

  function updateStatus(result, mode = state.statusMode) {
    elements.status.textContent = getStatusMessage(result, {
      isExporting: state.isExporting,
      previewError: state.previewError,
    }, mode);
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

  function getSelectedGridRow() {
    return state.rows[state.selectedIndex] || null;
  }

  function getSelectedValidationRecord() {
    return state.validationResult.records.find((record) => record.rowNumber === state.selectedIndex + 1) || null;
  }

  function renderSelectedRowDetails() {
    const currentRow = getSelectedGridRow();
    const previewRecord = currentRow ? normalizeGridRowsForValidation([{ ...currentRow, rowNumber: state.selectedIndex + 1 }])[0] : null;

    renderPreview(previewRecord ? toPreviewRecord(previewRecord) : null);
    renderRecordInspector(getSelectedValidationRecord());
  }

  function refreshGridSelection() {
    state.gridRows.forEach((rowElement, index) => {
      rowElement.classList.toggle("selected", index === state.selectedIndex);
    });
  }

  function refreshGridValidationState() {
    state.gridRows.forEach((rowElement, rowIndex) => {
      const rowNumber = rowIndex + 1;
      const rowErrors = state.cellErrors.get(rowNumber) || {};

      Array.from(rowElement.children).forEach((cell, fieldIndex) => {
        const field = GRID_FIELD_ORDER[fieldIndex];
        const input = cell.children[0];
        const fieldErrors = rowErrors[field] || [];
        const hasError = fieldErrors.length > 0;
        const title = hasError
          ? fieldErrors.map((message) => formatRecordError({ field, message })).join("；")
          : FIELD_LABELS[field];

        cell.classList.toggle("has-cell-error", hasError);
        input.classList.toggle("has-cell-error", hasError);
        input.setAttribute("aria-invalid", hasError ? "true" : "false");
        input.title = title;
        cell.title = title;
      });

      rowElement.classList.toggle("has-row-error", Object.keys(rowErrors).length > 0);
    });
  }

  function recomputeValidation() {
    const result = validateRecords(normalizeGridRowsForValidation(state.rows));

    state.records = result.records;
    state.cellErrors = mapCellErrors(result.errors);
    state.validationResult = result;

    return result;
  }

  function refreshFromValidation(mode = state.statusMode) {
    refreshGridValidationState();
    renderSelectedRowDetails();
    updateValidationSummary(state.validationResult);
    updatePreviewNavigation();
    updateStatus(state.validationResult, mode);
    updateToolbar(state.validationResult);
  }

  function syncFromGrid() {
    const result = recomputeValidation();
    const datasetKey = buildDatasetKey(result.records);

    state.statusMode = result.records.length > 0 && datasetKey === state.validatedRecordKey ? "validated" : "live";
    refreshFromValidation();
  }

  function selectRow(index) {
    state.selectedIndex = Math.max(0, Math.min(state.rows.length - 1, index));
    refreshGridSelection();
    refreshFromValidation();
  }

  function moveSelection(direction) {
    const nextIndex = selectAdjacentIndex(state.selectedIndex, state.rows.length, direction);
    selectRow(nextIndex);

    const row = state.gridRows[nextIndex];
    if (row) {
      row.focus();
    }
  }

  function renderGrid() {
    elements.batchGridBody.innerHTML = "";
    state.gridRows = [];

    if (elements.batchGridHint) {
      elements.batchGridHint.textContent = GRID_HINT_TEXT;
    }

    state.rows.forEach((row, rowIndex) => {
      const rowElement = document.createElement("div");
      rowElement.classList.add("batch-grid-row");
      rowElement.dataset.index = String(rowIndex);
      rowElement.tabIndex = 0;

      rowElement.addEventListener("click", () => {
        selectRow(rowIndex);
      });
      rowElement.addEventListener("keydown", (event) => {
        if (event.key === "ArrowDown" || event.key === "ArrowUp") {
          event.preventDefault();
          moveSelection(event.key === "ArrowDown" ? 1 : -1);
        }
      });

      GRID_FIELD_ORDER.forEach((field, fieldIndex) => {
        const cell = document.createElement("div");
        cell.classList.add("batch-grid-cell");

        const input = document.createElement("input");
        input.classList.add("batch-grid-input");
        input.type = "text";
        input.value = row[field] || "";
        input.placeholder = FIELD_LABELS[field];
        input.title = FIELD_LABELS[field];
        input.dataset.row = String(rowIndex);
        input.dataset.field = field;
        input.setAttribute("aria-label", `${FIELD_LABELS[field]} 第 ${rowIndex + 1} 行`);

        if (field === "storeName") {
          input.setAttribute("list", "storeNameOptions");
        }

        input.addEventListener("focus", () => {
          selectRow(rowIndex);
        });
        input.addEventListener("input", () => {
          state.rows[rowIndex][field] = input.value;
          state.gridNotice = "";
          syncFromGrid();
        });
        input.addEventListener("paste", (event) => {
          const clipboardText = event?.clipboardData?.getData?.("text") ?? "";
          if (!clipboardText) {
            return;
          }

          event.preventDefault?.();
          const result = applyGridPaste(state.rows, { row: rowIndex, col: fieldIndex + 1 }, clipboardText);
          state.rows = result.rows;
          state.gridNotice = result.notice || "";
          renderGrid();
          syncFromGrid();
        });

        cell.appendChild(input);
        rowElement.appendChild(cell);
      });

      elements.batchGridBody.appendChild(rowElement);
      state.gridRows.push(rowElement);
    });

    refreshGridSelection();
  }

  renderGrid();
  recomputeValidation();
  refreshFromValidation();
  updatePreviewNavigation();

  elements.clearData.addEventListener("click", () => {
    state.rows = createEmptyGridRows();
    state.records = [];
    state.isExporting = false;
    state.previewError = null;
    state.statusMode = "live";
    state.validatedRecordKey = null;
    state.gridNotice = "";
    state.cellErrors = new Map();
    state.validationResult = { records: [], errors: [], canExport: false };
    state.selectedIndex = 0;

    renderGrid();
    recomputeValidation();
    refreshFromValidation();
  });

  elements.validateData.addEventListener("click", () => {
    const result = recomputeValidation();
    const datasetKey = buildDatasetKey(result.records);

    state.statusMode = result.records.length > 0 ? "validated" : "live";
    state.validatedRecordKey = result.records.length > 0 ? datasetKey : null;
    refreshFromValidation("validated");
  });

  elements.prevRecord?.addEventListener("click", () => {
    moveSelection(-1);
  });

  elements.nextRecord?.addEventListener("click", () => {
    moveSelection(1);
  });

  elements.exportZip.addEventListener("click", async () => {
    const exportJobs = buildExportJobs(state.validationResult.records);
    if (!state.validationResult.canExport || exportJobs.length !== state.validationResult.records.length) {
      updateStatus(state.validationResult, state.statusMode);
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

  return true;
}

export { mountApp };
