(function () {
  "use strict";

  const COLORS = {
    purple: "#7658e8",
    green: "#2eae84",
    blue: "#5794e8",
    amber: "#edae42",
    red: "#df6876",
    slate: "#a9b2c1",
    grid: "#edf0f5",
    text: "#8791a3"
  };
  const STATUS_COLORS = {
    "Out of stock": COLORS.red,
    Reorder: COLORS.amber,
    Healthy: COLORS.green,
    Overstock: COLORS.purple
  };
  const REQUIRED = [
    "Product_ID", "Product_Name", "Category", "Supplier_Name", "Order_Date", "Delivery_Date",
    "Stock_Quantity", "Reorder_Level", "Units_Sold", "Purchase_Cost", "Selling_Price",
    "Warehouse_Location", "Shipping_Time_Days"
  ];
  const numberFormat = new Intl.NumberFormat("en-IN", { maximumFractionDigits: 0 });
  const compactFormat = new Intl.NumberFormat("en-IN", { notation: "compact", maximumFractionDigits: 1 });
  const state = { rows: [], sourceName: "Supplied dataset" };

  const el = (id) => document.getElementById(id);
  const round = (value, digits) => Number(value.toFixed(digits));
  const compact = (value) => compactFormat.format(value);
  const full = (value) => numberFormat.format(Math.round(value));
  const percent = (value) => `${value.toFixed(1)}%`;

  function toRecord(row) {
    const record = {};
    for (const column of REQUIRED) {
      if (row[column] === undefined || row[column] === null || String(row[column]).trim() === "") return null;
      record[column] = String(row[column]).trim();
    }
    for (const column of ["Order_Date", "Delivery_Date"]) {
      if (Number.isNaN(Date.parse(record[column]))) return null;
    }
    for (const column of ["Stock_Quantity", "Reorder_Level", "Units_Sold", "Purchase_Cost", "Selling_Price"]) {
      const value = Number(record[column]);
      if (!Number.isFinite(value)) return null;
      record[column] = value;
    }
    if (record.Stock_Quantity < 0 || record.Reorder_Level < 0 || record.Units_Sold < 0 ||
        record.Purchase_Cost <= 0 || record.Selling_Price <= 0 ||
        Date.parse(record.Delivery_Date) < Date.parse(record.Order_Date)) return null;

    const shippingDays = Math.round((Date.parse(record.Delivery_Date) - Date.parse(record.Order_Date)) / 86400000);
    record.Shipping_Time_Days = shippingDays;
    record.Revenue = record.Units_Sold * record.Selling_Price;
    record.Profit = record.Units_Sold * (record.Selling_Price - record.Purchase_Cost);
    record.Inventory_Status = record.Stock_Quantity === 0 ? "Out of stock" :
      record.Stock_Quantity < record.Reorder_Level ? "Reorder" :
        record.Stock_Quantity > 2 * record.Reorder_Level ? "Overstock" : "Healthy";
    return record;
  }

  function normalizeHeader(value) {
    return value.replace(/^\uFEFF/, "").trim().toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");
  }

  function parseCsv(text) {
    const matrix = [];
    let row = [];
    let field = "";
    let quoted = false;
    for (let i = 0; i < text.length; i += 1) {
      const char = text[i];
      if (quoted) {
        if (char === '"' && text[i + 1] === '"') {
          field += '"';
          i += 1;
        } else if (char === '"') {
          quoted = false;
        } else {
          field += char;
        }
      } else if (char === '"' && field.length === 0) {
        quoted = true;
      } else if (char === ",") {
        row.push(field);
        field = "";
      } else if (char === "\n" || char === "\r") {
        if (char === "\r" && text[i + 1] === "\n") i += 1;
        row.push(field);
        field = "";
        if (row.some((cell) => cell.trim() !== "")) matrix.push(row);
        row = [];
      } else {
        field += char;
      }
    }
    row.push(field);
    if (row.some((cell) => cell.trim() !== "")) matrix.push(row);
    if (!matrix.length) throw new Error("The CSV file is empty.");

    const positions = new Map(matrix[0].map((header, index) => [normalizeHeader(header), index]));
    const missing = REQUIRED.filter((column) => !positions.has(normalizeHeader(column)));
    if (missing.length) throw new Error(`Missing required columns: ${missing.join(", ")}.`);
    let rejected = 0;
    const rows = [];
    for (const cells of matrix.slice(1)) {
      const source = {};
      for (const column of REQUIRED) source[column] = cells[positions.get(normalizeHeader(column))] ?? "";
      const record = toRecord(source);
      if (record) rows.push(record);
      else rejected += 1;
    }
    if (!rows.length) throw new Error("No valid records were found. Check the required columns and values.");
    return { rows, rejected };
  }

  function setOptions(select, values, placeholder) {
    const selected = select.value;
    select.replaceChildren(new Option(placeholder, ""));
    [...values].sort((a, b) => a.localeCompare(b)).forEach((value) => select.add(new Option(value, value)));
    if ([...select.options].some((option) => option.value === selected)) select.value = selected;
  }

  function initializeFilters() {
    setOptions(el("category-filter"), new Set(state.rows.map((row) => row.Category)), "All categories");
    setOptions(el("supplier-filter"), new Set(state.rows.map((row) => row.Supplier_Name)), "All suppliers");
    setOptions(el("warehouse-filter"), new Set(state.rows.map((row) => row.Warehouse_Location)), "All warehouses");
    const dates = state.rows.map((row) => row.Order_Date.slice(0, 10)).sort();
    el("date-from").min = dates[0] || "";
    el("date-from").max = dates[dates.length - 1] || "";
    el("date-to").min = dates[0] || "";
    el("date-to").max = dates[dates.length - 1] || "";
    el("date-from").value = "";
    el("date-to").value = "";
  }

  function filteredRows() {
    const search = el("search-filter").value.trim().toLowerCase();
    const category = el("category-filter").value;
    const supplier = el("supplier-filter").value;
    const warehouse = el("warehouse-filter").value;
    const from = el("date-from").value;
    const to = el("date-to").value;
    return state.rows.filter((row) =>
      (!search || row.Product_Name.toLowerCase().includes(search) || row.Product_ID.toLowerCase().includes(search)) &&
      (!category || row.Category === category) &&
      (!supplier || row.Supplier_Name === supplier) &&
      (!warehouse || row.Warehouse_Location === warehouse) &&
      (!from || row.Order_Date.slice(0, 10) >= from) &&
      (!to || row.Order_Date.slice(0, 10) <= to)
    );
  }

  function groupBy(rows, key, values) {
    const groups = new Map();
    for (const row of rows) {
      const label = key(row);
      if (!groups.has(label)) groups.set(label, { label, count: 0, ...values(row) });
      const group = groups.get(label);
      group.count += 1;
      for (const name of Object.keys(group)) {
        if (name !== "label" && name !== "count") group[name] += values(row)[name];
      }
    }
    return [...groups.values()];
  }

  function drawCanvas(canvas, draw) {
    const box = canvas.getBoundingClientRect();
    if (box.width < 5 || box.height < 5) return;
    const ratio = window.devicePixelRatio || 1;
    canvas.width = Math.round(box.width * ratio);
    canvas.height = Math.round(box.height * ratio);
    const ctx = canvas.getContext("2d");
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    ctx.clearRect(0, 0, box.width, box.height);
    draw(ctx, box.width, box.height);
  }

  function drawTrend(rows) {
    const totals = new Map();
    rows.forEach((row) => totals.set(row.Order_Date.slice(0, 7), (totals.get(row.Order_Date.slice(0, 7)) || 0) + row.Revenue));
    const data = [...totals.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([label, revenue]) => ({ label, revenue }));
    drawCanvas(el("trend-chart"), (ctx, width, height) => {
      const pad = { left: 48, right: 12, top: 14, bottom: 28 };
      const chartWidth = width - pad.left - pad.right;
      const chartHeight = height - pad.top - pad.bottom;
      const max = Math.max(1, ...data.map((point) => point.revenue)) * 1.12;
      ctx.font = "9px 'Segoe UI', sans-serif";
      ctx.textBaseline = "middle";
      for (let tick = 0; tick <= 4; tick += 1) {
        const y = pad.top + chartHeight * tick / 4;
        ctx.strokeStyle = COLORS.grid;
        ctx.beginPath(); ctx.moveTo(pad.left, y); ctx.lineTo(width - pad.right, y); ctx.stroke();
        ctx.fillStyle = COLORS.text;
        ctx.textAlign = "right";
        ctx.fillText(compact(max * (1 - tick / 4)), pad.left - 8, y);
      }
      if (!data.length) return;
      const step = data.length > 1 ? chartWidth / (data.length - 1) : chartWidth / 2;
      const points = data.map((point, index) => ({
        x: pad.left + (data.length > 1 ? step * index : chartWidth / 2),
        y: pad.top + chartHeight * (1 - point.revenue / max),
        ...point
      }));
      const gradient = ctx.createLinearGradient(0, pad.top, 0, height - pad.bottom);
      gradient.addColorStop(0, "rgba(118,88,232,.20)");
      gradient.addColorStop(1, "rgba(118,88,232,0)");
      ctx.beginPath();
      points.forEach((point, index) => index ? ctx.lineTo(point.x, point.y) : ctx.moveTo(point.x, point.y));
      ctx.lineTo(points[points.length - 1].x, height - pad.bottom);
      ctx.lineTo(points[0].x, height - pad.bottom);
      ctx.closePath();
      ctx.fillStyle = gradient; ctx.fill();
      ctx.beginPath();
      points.forEach((point, index) => index ? ctx.lineTo(point.x, point.y) : ctx.moveTo(point.x, point.y));
      ctx.strokeStyle = COLORS.purple; ctx.lineWidth = 2.2; ctx.lineJoin = "round"; ctx.stroke();
      const labelStep = Math.max(1, Math.ceil(data.length / 9));
      points.forEach((point, index) => {
        if (index % labelStep !== 0 && index !== points.length - 1) return;
        ctx.fillStyle = COLORS.text; ctx.textAlign = "center"; ctx.textBaseline = "top";
        ctx.fillText(point.label, point.x, height - pad.bottom + 9);
      });
      canvasTooltip(el("trend-chart"), points, (point) => `${point.label}: ${full(point.revenue)} revenue`);
    });
  }

  function canvasTooltip(canvas, points, describe) {
    canvas.onmousemove = (event) => {
      if (!points.length) return;
      const bounds = canvas.getBoundingClientRect();
      const x = event.clientX - bounds.left;
      const y = event.clientY - bounds.top;
      const nearest = points.reduce((best, point) =>
        Math.hypot(point.x - x, point.y - y) < Math.hypot(best.x - x, best.y - y) ? point : best
      );
      canvas.title = describe(nearest);
    };
  }

  function drawDonut(rows) {
    const labels = ["Out of stock", "Reorder", "Healthy", "Overstock"];
    const counts = new Map(labels.map((label) => [label, 0]));
    rows.forEach((row) => counts.set(row.Inventory_Status, (counts.get(row.Inventory_Status) || 0) + 1));
    const data = labels.map((label) => ({ label, value: counts.get(label), color: STATUS_COLORS[label] }));
    drawCanvas(el("stock-chart"), (ctx, width, height) => {
      const cx = width / 2; const cy = height / 2; const radius = Math.min(width * .29, height * .42);
      let angle = -Math.PI / 2;
      const total = data.reduce((sum, item) => sum + item.value, 0);
      for (const item of data) {
        if (!item.value || !total) continue;
        const next = angle + item.value / total * Math.PI * 2;
        ctx.beginPath(); ctx.arc(cx, cy, radius, angle, next);
        ctx.strokeStyle = item.color; ctx.lineWidth = Math.max(16, radius * .25); ctx.lineCap = "butt"; ctx.stroke();
        angle = next;
      }
      ctx.textAlign = "center"; ctx.textBaseline = "middle"; ctx.fillStyle = "#263148";
      ctx.font = "700 21px 'Segoe UI', sans-serif"; ctx.fillText(full(total), cx, cy - 3);
      ctx.font = "9px 'Segoe UI', sans-serif"; ctx.fillStyle = COLORS.text; ctx.fillText("records", cx, cy + 14);
    });
    el("stock-legend").replaceChildren(...data.map((item) => {
      const span = document.createElement("span");
      span.className = "legend-item";
      span.innerHTML = `<i class="legend-swatch" style="background:${item.color}"></i>${item.label} <b>${full(item.value)}</b>`;
      return span;
    }));
  }

  function drawBars(canvasId, data, options) {
    drawCanvas(el(canvasId), (ctx, width, height) => {
      const horizontal = options.horizontal;
      const pad = horizontal ? { left: 78, right: 39, top: 9, bottom: 8 } : { left: 37, right: 10, top: 12, bottom: 30 };
      const chartWidth = width - pad.left - pad.right;
      const chartHeight = height - pad.top - pad.bottom;
      const max = Math.max(1, ...data.map((item) => item.value)) * 1.16;
      const hitTargets = [];
      ctx.font = "9px 'Segoe UI', sans-serif";
      ctx.textBaseline = "middle";

      if (horizontal) {
        const slot = chartHeight / Math.max(data.length, 1);
        data.forEach((item, index) => {
          const y = pad.top + index * slot;
          ctx.fillStyle = COLORS.text; ctx.textAlign = "right";
          ctx.fillText(truncate(item.label, 14), pad.left - 9, y + slot / 2);
          const barWidth = chartWidth * item.value / max;
          roundedRect(ctx, pad.left, y + slot * .24, barWidth, slot * .5, 4);
          ctx.fillStyle = item.color || COLORS.purple; ctx.fill();
          ctx.fillStyle = "#667187"; ctx.textAlign = "left";
          ctx.fillText(options.valueLabel(item.value), Math.min(pad.left + barWidth + 6, width - pad.right + 3), y + slot / 2);
          hitTargets.push({ ...item, x: pad.left + barWidth / 2, y: y + slot / 2 });
        });
      } else {
        for (let tick = 0; tick <= 3; tick += 1) {
          const y = pad.top + chartHeight * tick / 3;
          ctx.strokeStyle = COLORS.grid; ctx.beginPath(); ctx.moveTo(pad.left, y); ctx.lineTo(width - pad.right, y); ctx.stroke();
          ctx.fillStyle = COLORS.text; ctx.textAlign = "right";
          ctx.fillText(maxLabel(max * (1 - tick / 3)), pad.left - 5, y);
        }
        const slot = chartWidth / Math.max(data.length, 1);
        data.forEach((item, index) => {
          const barWidth = Math.min(34, slot * .56);
          const barHeight = chartHeight * item.value / max;
          const x = pad.left + index * slot + (slot - barWidth) / 2;
          const y = pad.top + chartHeight - barHeight;
          roundedRect(ctx, x, y, barWidth, barHeight, 4);
          ctx.fillStyle = item.color || COLORS.blue; ctx.fill();
          ctx.fillStyle = COLORS.text; ctx.textAlign = "center"; ctx.textBaseline = "top";
          ctx.fillText(truncate(item.label, 10), x + barWidth / 2, height - pad.bottom + 9);
          hitTargets.push({ ...item, x: x + barWidth / 2, y: y + barHeight / 2 });
        });
      }
      canvasTooltip(el(canvasId), hitTargets, (item) => options.tooltip(item));
    });
  }

  function roundedRect(ctx, x, y, width, height, radius) {
    const r = Math.min(radius, width / 2, height / 2);
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + width, y, x + width, y + height, r);
    ctx.arcTo(x + width, y + height, x, y + height, r);
    ctx.arcTo(x, y + height, x, y, r);
    ctx.arcTo(x, y, x + width, y, r);
    ctx.closePath();
  }

  function maxLabel(value) {
    return Number.isInteger(value) ? compact(value) : value.toFixed(1);
  }

  function truncate(value, limit) {
    return value.length > limit ? `${value.slice(0, limit - 1)}…` : value;
  }

  function updateKpis(rows) {
    const revenue = rows.reduce((sum, row) => sum + row.Revenue, 0);
    const profit = rows.reduce((sum, row) => sum + row.Profit, 0);
    const units = rows.reduce((sum, row) => sum + row.Units_Sold, 0);
    const avgShipping = rows.length ? rows.reduce((sum, row) => sum + row.Shipping_Time_Days, 0) / rows.length : 0;
    const lowStock = rows.filter((row) => row.Inventory_Status === "Reorder" || row.Inventory_Status === "Out of stock").length;
    const outOfStock = rows.filter((row) => row.Inventory_Status === "Out of stock").length;
    const slow = rows.filter((row) => row.Shipping_Time_Days > 7).length;
    el("kpi-revenue").textContent = compact(revenue);
    el("kpi-profit").textContent = compact(profit);
    el("kpi-units").textContent = compact(units);
    el("kpi-shipping").textContent = `${round(avgShipping, 1)} days`;
    el("kpi-attention").textContent = full(lowStock);
    el("kpi-records").textContent = `${full(rows.length)} records`;
    el("kpi-margin").textContent = `${percent(revenue ? profit / revenue * 100 : 0)} margin`;
    el("kpi-products").textContent = `${new Set(rows.map((row) => row.Product_Name)).size} product types`;
    el("kpi-slow").textContent = `${full(slow)} over 7 days`;
    el("kpi-out").textContent = `${full(outOfStock)} out of stock`;
  }

  function updateCharts(rows) {
    drawTrend(rows);
    drawDonut(rows);
    const products = groupBy(rows, (row) => row.Product_Name, (row) => ({ units: row.Units_Sold }))
      .sort((a, b) => b.units - a.units).slice(0, 8)
      .map((item) => ({ label: item.label, value: item.units, color: COLORS.purple }));
    drawBars("product-chart", products, {
      horizontal: true,
      valueLabel: compact,
      tooltip: (item) => `${item.label}: ${full(item.value)} units sold`
    });
    const suppliers = groupBy(rows, (row) => row.Supplier_Name, (row) => ({
      days: row.Shipping_Time_Days,
      slow: row.Shipping_Time_Days > 7 ? 1 : 0
    })).map((item) => ({
      label: item.label,
      value: item.count ? item.days / item.count : 0,
      slowPercent: item.count ? item.slow / item.count * 100 : 0,
      color: COLORS.blue
    })).sort((a, b) => b.value - a.value);
    drawBars("supplier-chart", suppliers, {
      horizontal: false,
      valueLabel: (value) => `${value.toFixed(1)}d`,
      tooltip: (item) => `${item.label}: ${item.value.toFixed(2)} days avg; ${item.slowPercent.toFixed(1)}% over 7 days`
    });
    const transit = new Map();
    rows.forEach((row) => transit.set(row.Shipping_Time_Days, (transit.get(row.Shipping_Time_Days) || 0) + 1));
    const delivery = [...transit.entries()].sort(([a], [b]) => a - b).map(([days, count]) => ({
      label: `${days}d`, value: count, color: days > 7 ? COLORS.amber : COLORS.green
    }));
    drawBars("delivery-chart", delivery, {
      horizontal: false,
      valueLabel: compact,
      tooltip: (item) => `${item.label}: ${full(item.value)} shipments`
    });
  }

  function updateDateLabel(rows) {
    if (!rows.length) {
      el("date-range-label").textContent = "No matching records";
      return;
    }
    const dates = rows.map((row) => row.Order_Date.slice(0, 10)).sort();
    el("date-range-label").textContent = `${dates[0]} — ${dates[dates.length - 1]}`;
  }

  function render() {
    const rows = filteredRows();
    updateKpis(rows);
    updateCharts(rows);
    updateDateLabel(rows);
  }

  function initialize(data, name) {
    const cleanRows = [];
    let rejected = 0;
    for (const item of data) {
      const row = toRecord(item);
      if (row) cleanRows.push(row);
      else rejected += 1;
    }
    if (!cleanRows.length) {
      el("dataset-status").textContent = "No valid data";
      el("load-message").hidden = false;
      el("load-message").textContent = "No valid records were available. Upload a CSV with the required columns to continue.";
      return;
    }
    state.rows = cleanRows;
    state.sourceName = name;
    initializeFilters();
    el("dataset-status").textContent = `${full(cleanRows.length)} records`;
    el("footer-source").textContent = `${name} · Values shown without a currency symbol; the source does not specify a currency.`;
    if (rejected) {
      el("load-message").hidden = false;
      el("load-message").textContent = `${full(rejected)} incomplete or invalid records were skipped.`;
    } else {
      el("load-message").hidden = true;
    }
    render();
  }

  function setup() {
    ["search-filter", "category-filter", "supplier-filter", "warehouse-filter", "date-from", "date-to"]
      .forEach((id) => el(id).addEventListener(id === "search-filter" ? "input" : "change", render));
    el("reset-filters").addEventListener("click", () => {
      el("search-filter").value = "";
      el("category-filter").value = "";
      el("supplier-filter").value = "";
      el("warehouse-filter").value = "";
      el("date-from").value = "";
      el("date-to").value = "";
      render();
    });
    el("csv-upload").addEventListener("change", async (event) => {
      const file = event.target.files && event.target.files[0];
      if (!file) return;
      try {
        const result = parseCsv(await file.text());
        initialize(result.rows, file.name);
        if (result.rejected) {
          el("load-message").hidden = false;
          el("load-message").textContent = `${full(result.rejected)} incomplete or invalid CSV rows were skipped.`;
        }
      } catch (error) {
        el("load-message").hidden = false;
        el("load-message").textContent = error.message;
      }
      event.target.value = "";
    });
    window.addEventListener("resize", render);

    if (Array.isArray(window.INVENTORY_DATA)) {
      initialize(window.INVENTORY_DATA, "Supplied dataset");
    } else {
      el("dataset-status").textContent = "CSV required";
      el("load-message").hidden = false;
      el("load-message").textContent = "The default data file is missing. Run python clean_analyze.py, then refresh, or upload cleaned_dataset.csv.";
    }
  }

  document.addEventListener("DOMContentLoaded", setup);
}());
