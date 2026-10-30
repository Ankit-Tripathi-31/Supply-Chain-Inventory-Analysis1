"""Clean the supplied supply-chain workbook and generate dashboard/report assets."""

from __future__ import annotations

import argparse
import json
from pathlib import Path

import pandas as pd


SOURCE_COLUMNS = [
    "Product_ID",
    "Product_Name",
    "Category",
    "Supplier_Name",
    "Order_Date",
    "Delivery_Date",
    "Stock_Quantity",
    "Reorder_Level",
    "Units_Sold",
    "Purchase_Cost",
    "Selling_Price",
    "Warehouse_Location",
    "Shipping_Time_Days",
]
NUMERIC_COLUMNS = [
    "Stock_Quantity",
    "Reorder_Level",
    "Units_Sold",
    "Purchase_Cost",
    "Selling_Price",
    "Shipping_Time_Days",
]
TEXT_COLUMNS = [
    "Product_ID",
    "Product_Name",
    "Category",
    "Supplier_Name",
    "Warehouse_Location",
]
DELAY_THRESHOLD_DAYS = 7


def markdown_table(headers: list[str], rows: list[list[object]]) -> str:
    lines = [
        "| " + " | ".join(str(value) for value in headers) + " |",
        "| " + " | ".join("---" for _ in headers) + " |",
    ]
    lines.extend("| " + " | ".join(str(value) for value in row) + " |" for row in rows)
    return "\n".join(lines)


def find_source(folder: Path) -> Path:
    candidates = sorted(path for path in folder.glob("*.xlsx") if path.name != "analysis_summary.xlsx")
    if not candidates:
        raise FileNotFoundError("No .xlsx workbook was found. Pass its path with --input.")
    if len(candidates) > 1:
        raise ValueError("More than one .xlsx workbook was found. Pass the intended file with --input.")
    return candidates[0]


def clean_workbook(source: Path) -> tuple[pd.DataFrame, dict[str, int]]:
    frame = pd.read_excel(source)
    missing_columns = [column for column in SOURCE_COLUMNS if column not in frame.columns]
    if missing_columns:
        raise ValueError(f"Workbook is missing required columns: {', '.join(missing_columns)}")

    frame = frame[SOURCE_COLUMNS].copy()
    initial_rows = len(frame)
    for column in TEXT_COLUMNS:
        frame[column] = frame[column].astype("string").str.strip().replace("", pd.NA)
    for column in NUMERIC_COLUMNS:
        frame[column] = pd.to_numeric(frame[column], errors="coerce")
    for column in ("Order_Date", "Delivery_Date"):
        frame[column] = pd.to_datetime(frame[column], errors="coerce")

    exact_duplicates = int(frame.duplicated(keep="first").sum())
    frame = frame.drop_duplicates(keep="first").copy()

    required = [column for column in SOURCE_COLUMNS if column != "Shipping_Time_Days"]
    missing_rows = int(frame[required].isna().any(axis=1).sum())
    frame = frame.dropna(subset=required).copy()

    invalid_values = (
        (frame["Stock_Quantity"] < 0)
        | (frame["Reorder_Level"] < 0)
        | (frame["Units_Sold"] < 0)
        | (frame["Purchase_Cost"] <= 0)
        | (frame["Selling_Price"] <= 0)
        | (frame["Delivery_Date"] < frame["Order_Date"])
    )
    invalid_rows = int(invalid_values.sum())
    frame = frame.loc[~invalid_values].copy()
    if frame.empty:
        raise ValueError("No valid rows remain after cleaning.")

    actual_shipping_days = (frame["Delivery_Date"] - frame["Order_Date"]).dt.days
    shipping_changed = frame["Shipping_Time_Days"].isna() | frame["Shipping_Time_Days"].ne(actual_shipping_days)
    shipping_corrections = int(shipping_changed.sum())
    frame["Shipping_Time_Days"] = actual_shipping_days.astype("int64")

    for column in NUMERIC_COLUMNS:
        if column != "Shipping_Time_Days":
            frame[column] = frame[column].astype("int64")
    frame["Revenue"] = frame["Units_Sold"] * frame["Selling_Price"]
    frame["Cost_of_Goods_Sold"] = frame["Units_Sold"] * frame["Purchase_Cost"]
    frame["Profit"] = frame["Revenue"] - frame["Cost_of_Goods_Sold"]
    frame["Profit_Margin_Pct"] = (
        frame["Profit"].div(frame["Revenue"].where(frame["Revenue"].ne(0))).fillna(0) * 100
    )
    frame["Inventory_Status"] = "Healthy"
    frame.loc[frame["Stock_Quantity"] > 2 * frame["Reorder_Level"], "Inventory_Status"] = "Overstock"
    frame.loc[frame["Stock_Quantity"] < frame["Reorder_Level"], "Inventory_Status"] = "Reorder"
    frame.loc[frame["Stock_Quantity"] == 0, "Inventory_Status"] = "Out of stock"
    frame["Slow_Delivery_Flag"] = frame["Shipping_Time_Days"] > DELAY_THRESHOLD_DAYS

    diagnostics = {
        "input_rows": initial_rows,
        "exact_duplicates_removed": exact_duplicates,
        "incomplete_rows_removed": missing_rows,
        "invalid_rows_removed": invalid_rows,
        "shipping_days_corrected": shipping_corrections,
        "output_rows": len(frame),
    }
    return frame, diagnostics


def build_report(frame: pd.DataFrame, diagnostics: dict[str, int], source: Path) -> str:
    revenue = int(frame["Revenue"].sum())
    profit = int(frame["Profit"].sum())
    units = int(frame["Units_Sold"].sum())
    avg_shipping = float(frame["Shipping_Time_Days"].mean())
    delay_mask = frame["Shipping_Time_Days"] > DELAY_THRESHOLD_DAYS
    status_counts = frame["Inventory_Status"].value_counts()
    product = frame.groupby("Product_Name").agg(
        units=("Units_Sold", "sum"),
        revenue=("Revenue", "sum"),
        profit=("Profit", "sum"),
    )
    out_of_stock_products = (
        frame.loc[frame["Inventory_Status"] == "Out of stock"]
        .groupby("Product_Name")
        .size()
        .sort_values(ascending=False)
    )
    supplier = frame.groupby("Supplier_Name").agg(
        records=("Product_ID", "size"),
        avg_days=("Shipping_Time_Days", "mean"),
        slow_share=("Slow_Delivery_Flag", "mean"),
    )
    leading_profit = product["profit"].idxmax()
    leading_sales = product["units"].idxmax()
    slowest_supplier = supplier["avg_days"].idxmax()
    low_stock = int(status_counts.get("Reorder", 0) + status_counts.get("Out of stock", 0))
    slow_units = float(frame.loc[delay_mask, "Units_Sold"].mean()) if delay_mask.any() else 0
    on_time_units = float(frame.loc[~delay_mask, "Units_Sold"].mean()) if (~delay_mask).any() else 0
    supplier_table = markdown_table(
        ["Supplier", "Records", "Avg shipping days", "Shipments >7 days"],
        [
            [name, int(row["records"]), f'{row["avg_days"]:.2f}', f'{row["slow_share"] * 100:.1f}%']
            for name, row in supplier.sort_values("avg_days", ascending=False).iterrows()
        ],
    )
    product_table = markdown_table(
        ["Product", "Units sold", "Revenue", "Profit"],
        [
            [name, f'{int(row["units"]):,}', f'{int(row["revenue"]):,}', f'{int(row["profit"]):,}']
            for name, row in product.sort_values("profit", ascending=False).head(5).iterrows()
        ],
    )
    status_table = markdown_table(
        ["Inventory status", "Records"],
        [
            [label, f'{int(status_counts.get(label, 0)):,}']
            for label in ("Out of stock", "Reorder", "Healthy", "Overstock")
        ],
    )
    out_of_stock_table = (
        markdown_table(
            ["Product", "Zero-stock records"],
            [[name, f"{int(count):,}"] for name, count in out_of_stock_products.items()],
        )
        if not out_of_stock_products.empty
        else "No records have zero stock."
    )

    return f"""# Supply Chain & Inventory Analysis

## Executive summary

- **{len(frame):,}** clean records cover orders from **{frame["Order_Date"].min():%Y-%m-%d}** through **{frame["Order_Date"].max():%Y-%m-%d}**.
- Total revenue is **{revenue:,}** and estimated gross profit is **{profit:,}** (profit margin **{profit / revenue * 100:.1f}%**).
- The dataset records **{units:,}** units sold and average shipping time of **{avg_shipping:.2f} days**.
- **{low_stock:,} records ({low_stock / len(frame) * 100:.1f}%)** are at/below reorder level, including **{int(status_counts.get("Out of stock", 0))}** with zero stock.
- **{int(delay_mask.sum()):,} shipments ({delay_mask.mean() * 100:.1f}%)** took more than 7 days. This is a descriptive slow-shipment flag, not a contractual late-delivery measure.

## Data cleaning and quality

Source workbook: `{source.name}`. Cleaning was performed by `clean_analyze.py`; the supplied workbook has {diagnostics["input_rows"]:,} rows.

| Check | Result |
|---|---:|
| Exact duplicate rows removed | {diagnostics["exact_duplicates_removed"]:,} |
| Rows with missing required values removed | {diagnostics["incomplete_rows_removed"]:,} |
| Rows with invalid values removed | {diagnostics["invalid_rows_removed"]:,} |
| Shipping-day values recomputed from dates | {diagnostics["shipping_days_corrected"]:,} |
| Clean rows written | {diagnostics["output_rows"]:,} |

Cleaning rules: trim text fields; parse dates and numeric values; remove exact duplicate rows; exclude rows missing required fields, with negative stock/reorder/sales, non-positive prices, or delivery before order; recompute shipping days from the two dates. Revenue is `Units_Sold x Selling_Price`; gross profit is `Units_Sold x (Selling_Price - Purchase_Cost)`.

Inventory status uses row-level stock: **Out of stock** when stock is zero; **Reorder** when stock is below reorder level; **Overstock** when stock exceeds twice reorder level; otherwise **Healthy**. A shipment taking more than 7 days is marked slow because no SLA/target is provided.

## Inventory status

{status_table}

Products with zero stock:

{out_of_stock_table}

## Top products by gross profit

{product_table}

The highest-profit product name is **{leading_profit}**. The highest-volume product name is **{leading_sales}**. These aggregate product names across all records; they do not represent unique SKU lifetime performance.

## Supplier performance

Average shipping time and the share of records exceeding 7 days:

{supplier_table}

**{slowest_supplier}** has the highest average shipping time ({supplier.loc[slowest_supplier, "avg_days"]:.2f} days), but it is nearly tied with the next supplier; **{supplier["slow_share"].idxmax()}** has the highest share of shipments taking more than 7 days ({supplier["slow_share"].max() * 100:.1f}%). Use the dashboard's supplier and date filters to compare suppliers over the same subset.

## Slow shipment and sales comparison

Records taking more than 7 days average **{slow_units:.1f} units sold**, versus **{on_time_units:.1f}** for records taking 7 days or less. This is an observational comparison only; the dataset does not establish that shipping duration caused a change in sales.

## Recommendations

1. Review the **{low_stock:,}** records at or below reorder level and prioritize the **{int(status_counts.get("Out of stock", 0))}** zero-stock records; validate demand and replenishment lead time before ordering.
2. Audit products classified as overstock (more than twice reorder level) before replenishing them, and consider transfers between warehouses where demand supports it.
3. Investigate supplier shipments taking more than 7 days, especially the supplier with the highest mean transit time. Define an agreed SLA before reporting contractual late-delivery rates.
4. Monitor revenue, gross profit, stock status, and supplier transit time together. The records are order-level observations, so avoid treating the stock quantity as a historical stock balance or the product name as a unique SKU.

## Interpretation limits

- Currency is not specified in the workbook; monetary totals are shown in dataset units.
- `Purchase_Cost` and `Selling_Price` are treated as per-unit values.
- Inventory status is evaluated per record using the supplied stock and reorder level; it is not a time-series inventory reconstruction.
- “Slow delivery” means more than 7 calendar days, an analysis threshold rather than a promised delivery SLA.
- Sales versus slow-delivery comparisons are not causal.
"""


def build_analysis_frames(frame: pd.DataFrame, diagnostics: dict[str, int]) -> dict[str, pd.DataFrame]:
    slow = frame["Shipping_Time_Days"] > DELAY_THRESHOLD_DAYS
    low_stock = frame["Inventory_Status"].isin(["Reorder", "Out of stock"])
    inventory_order = ["Out of stock", "Reorder", "Healthy", "Overstock"]
    status_counts = frame["Inventory_Status"].value_counts().reindex(inventory_order, fill_value=0)

    products = frame.groupby("Product_Name").agg(
        Records=("Product_ID", "size"),
        Units_Sold=("Units_Sold", "sum"),
        Revenue=("Revenue", "sum"),
        Profit=("Profit", "sum"),
        Reorder_Records=("Inventory_Status", lambda values: values.isin(["Reorder", "Out of stock"]).sum()),
        Zero_Stock_Records=("Inventory_Status", lambda values: values.eq("Out of stock").sum()),
    ).sort_values("Profit", ascending=False)
    suppliers = frame.groupby("Supplier_Name").agg(
        Records=("Product_ID", "size"),
        Average_Shipping_Days=("Shipping_Time_Days", "mean"),
        Slow_Shipments=("Slow_Delivery_Flag", "sum"),
        Revenue=("Revenue", "sum"),
        Profit=("Profit", "sum"),
    )
    suppliers["Slow_Shipment_Rate_Pct"] = suppliers["Slow_Shipments"] / suppliers["Records"] * 100
    suppliers = suppliers.sort_values("Average_Shipping_Days", ascending=False)
    warehouses = frame.groupby("Warehouse_Location").agg(
        Records=("Product_ID", "size"),
        Revenue=("Revenue", "sum"),
        Profit=("Profit", "sum"),
        Average_Stock=("Stock_Quantity", "mean"),
        At_or_Below_Reorder=("Inventory_Status", lambda values: values.isin(["Reorder", "Out of stock"]).sum()),
    ).sort_values("Revenue", ascending=False)
    monthly = frame.assign(Month=frame["Order_Date"].dt.to_period("M").astype(str)).groupby("Month").agg(
        Records=("Product_ID", "size"),
        Units_Sold=("Units_Sold", "sum"),
        Revenue=("Revenue", "sum"),
        Profit=("Profit", "sum"),
        Average_Shipping_Days=("Shipping_Time_Days", "mean"),
    )
    category = frame.groupby("Category").agg(
        Records=("Product_ID", "size"),
        Units_Sold=("Units_Sold", "sum"),
        Revenue=("Revenue", "sum"),
        Profit=("Profit", "sum"),
        At_or_Below_Reorder=("Inventory_Status", lambda values: values.isin(["Reorder", "Out of stock"]).sum()),
    ).sort_values("Revenue", ascending=False)
    shipping_comparison = frame.assign(Shipping_Group=slow.map({True: "More than 7 days", False: "7 days or less"})).groupby(
        "Shipping_Group", sort=False
    ).agg(
        Records=("Product_ID", "size"),
        Average_Units_Sold=("Units_Sold", "mean"),
        Revenue=("Revenue", "sum"),
        Profit=("Profit", "sum"),
    )
    overview = pd.DataFrame(
        [
            ["Source rows", diagnostics["input_rows"]],
            ["Clean rows", diagnostics["output_rows"]],
            ["Exact duplicates removed", diagnostics["exact_duplicates_removed"]],
            ["Incomplete rows removed", diagnostics["incomplete_rows_removed"]],
            ["Invalid rows removed", diagnostics["invalid_rows_removed"]],
            ["Shipping days recomputed", diagnostics["shipping_days_corrected"]],
            ["Total units sold", int(frame["Units_Sold"].sum())],
            ["Total revenue (dataset units)", int(frame["Revenue"].sum())],
            ["Estimated gross profit (dataset units)", int(frame["Profit"].sum())],
            ["Gross margin (%)", frame["Profit"].sum() / frame["Revenue"].sum() * 100],
            ["Average shipping days", frame["Shipping_Time_Days"].mean()],
            ["Shipments over 7 days", int(slow.sum())],
            ["Records at/below reorder level", int(low_stock.sum())],
            ["Zero-stock records", int((frame["Inventory_Status"] == "Out of stock").sum())],
        ],
        columns=["Metric", "Value"],
    )
    inventory = pd.DataFrame(
        {"Records": status_counts, "Share_Pct": status_counts / len(frame) * 100}
    ).rename_axis("Inventory_Status")
    return {
        "Overview": overview,
        "Inventory": inventory,
        "Products": products,
        "Suppliers": suppliers,
        "Warehouses": warehouses,
        "Monthly Trends": monthly,
        "Categories": category,
        "Shipping Comparison": shipping_comparison,
    }


def write_analysis_workbook(path: Path, sheets: dict[str, pd.DataFrame]) -> None:
    with pd.ExcelWriter(path, engine="openpyxl") as writer:
        for sheet_name, data in sheets.items():
            data.to_excel(writer, sheet_name=sheet_name, index=sheet_name != "Overview")

    from openpyxl import load_workbook
    from openpyxl.styles import Font, PatternFill

    workbook = load_workbook(path)
    for worksheet in workbook.worksheets:
        worksheet.freeze_panes = "A2"
        worksheet.auto_filter.ref = worksheet.dimensions
        for cell in worksheet[1]:
            cell.fill = PatternFill(fill_type="solid", fgColor="182237")
            cell.font = Font(color="FFFFFF", bold=True)
        for column in worksheet.columns:
            letter = column[0].column_letter
            width = min(42, max(12, max(len(str(cell.value or "")) for cell in column) + 2))
            worksheet.column_dimensions[letter].width = width
    workbook.save(path)


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--input", type=Path, help="Source .xlsx workbook (defaults to the only .xlsx beside this script).")
    parser.add_argument("--output-dir", type=Path, default=Path(__file__).resolve().parent)
    args = parser.parse_args()
    output_dir = args.output_dir.resolve()
    output_dir.mkdir(parents=True, exist_ok=True)
    source = (args.input or find_source(Path(__file__).resolve().parent)).resolve()

    cleaned, diagnostics = clean_workbook(source)
    csv_path = output_dir / "cleaned_dataset.csv"
    report_path = output_dir / "analysis_report.md"
    workbook_path = output_dir / "analysis_summary.xlsx"
    data_path = output_dir / "dashboard_data.js"

    cleaned.to_csv(csv_path, index=False, date_format="%Y-%m-%d")
    dashboard_records = cleaned[SOURCE_COLUMNS].copy()
    dashboard_records["Order_Date"] = dashboard_records["Order_Date"].dt.strftime("%Y-%m-%d")
    dashboard_records["Delivery_Date"] = dashboard_records["Delivery_Date"].dt.strftime("%Y-%m-%d")
    data_path.write_text(
        "window.INVENTORY_DATA = " + json.dumps(dashboard_records.to_dict(orient="records"), separators=(",", ":")) + ";\n",
        encoding="utf-8",
    )
    report_path.write_text(build_report(cleaned, diagnostics, source), encoding="utf-8")
    write_analysis_workbook(workbook_path, build_analysis_frames(cleaned, diagnostics))

    print(f"Cleaned {diagnostics['output_rows']:,} of {diagnostics['input_rows']:,} rows.")
    print(f"Created: {csv_path}")
    print(f"Created: {report_path}")
    print(f"Created: {workbook_path}")
    print(f"Created: {data_path}")


if __name__ == "__main__":
    main()
