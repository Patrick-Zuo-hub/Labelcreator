import {
  parseBatchText,
  validateRecords,
  selectAdjacentIndex,
  toPreviewRecord,
} from "./labelcreator-core.js";
import { barcodeSvgMarkup } from "./labelcreator-pdf.js";

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

  function updateStatus(result, mode = "live") {
    if (!result.records.length) {
      elements.status.textContent = "等待粘贴批量数据。";
      return;
    }

    if (state.previewError) {
      elements.status.textContent = `预览条码渲染失败：${state.previewError}`;
      return;
    }

    if (result.errors.length > 0) {
      elements.status.textContent = `${result.errors.length} 个问题待修复。首条：${result.errors[0].message}`;
      return;
    }

    elements.status.textContent = mode === "validated"
      ? `校验通过，共 ${result.records.length} 条记录。ZIP 导出将在后续任务中接入。`
      : `已载入 ${result.records.length} 条记录。`;
  }

  function updateToolbar(result) {
    elements.exportZip.disabled = true;
    elements.exportZip.title = result.records.length
      ? "ZIP 导出将在后续任务中接入。"
      : "";
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

  elements.exportZip.addEventListener("click", () => {
    if (!state.validationResult.canExport) {
      return;
    }

    elements.status.textContent = "ZIP 导出将在后续任务中接入。";
  });

  renderPreview(null);
  updateStatus(state.validationResult);
  updateToolbar(state.validationResult);

  return true;
}

export { mountApp };
