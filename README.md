# 📦 Supply Chain & Inventory Analysis

[🚀 View Live Interactive Dashboard](https://ankit-tripathi-31.github.io/Supply-Chain-Inventory-Analysis1/)

[💻 View GitHub Repository](https://github.com/Ankit-Tripathi-31/Supply-Chain-Inventory-Analysis1)

## 📌 Project Overview

An end-to-end data analytics project focused on analyzing supply chain operations, inventory performance, supplier efficiency, and product profitability.

## 🛠️ Tools & Technologies

- Python
- Pandas
- Microsoft Excel
- HTML
- CSS
- JavaScript
- Data Cleaning
- Exploratory Data Analysis
- Data Visualization

## 📊 Project Highlights

- Analyzed 15,000 records.
- Identified low-stock and out-of-stock inventory.
- Evaluated supplier and product profitability.
- Analyzed shipping and inventory performance.
- Developed an interactive web-based dashboard.

## 💡 Key Business Insights

- Identified products requiring inventory replenishment.
- Compared supplier profitability.
- Evaluated product-level sales and gross profit.
- Examined inventory availability across locations.

## 📁 Project Files

- `clean_analyze.py` – Data analysis script
- `cleaned_dataset.csv` – Cleaned dataset
- `analysis_summary.xlsx` – Analysis summary
- `analysis_report.md` – Analytical report
- `index.html` – Dashboard interface
- `styles.css` – Dashboard styling
- `dashboard.js` – Dashboard functionality
- `dashboard_data.js` – Dashboard data

## 🌐 Live Dashboard

Explore the interactive dashboard:

https://ankit-tripathi-31.github.io/Supply-Chain-Inventory-Analysis1/

## 👨‍💻 Author

Ankit Kumar Tripathi

GitHub: https://github.com/Ankit-Tripathi-31

# 📦 Supply Chain & Inventory Analysis

## 🚀 Live Interactive Dashboard

**[Click here to explore the live dashboard](https://ankit-tripathi-31.github.io/Supply-Chain-Inventory-Analysis1/)**

Explore interactive visualizations, inventory KPIs, supplier performance, stock availability, and business insights.

---

# Supply Chain & Inventory Analysis

An interactive, browser-based dashboard for the supplied 15,000-record supply-chain workbook. The dashboard works offline with its generated default data file and can load other CSV datasets with the same columns.

## Project files

- `Project-03 supply_chain_inventory_dataset_15000_rows 2.xlsx` - supplied source workbook.
- `Project-03_Supply_chain_inventory_project_Docx (1).docx` - project brief.
- `clean_analyze.py` - repeatable cleaning, analysis, and dashboard-data generation.
- `cleaned_dataset.csv` - cleaned source records plus derived sales, profit, and inventory fields.
- `analysis_report.md` - data-quality summary, business insights, rules, and interpretation limits.
- `analysis_summary.xlsx` - analysis workbook with overview, inventory, product, supplier, warehouse, monthly, category, and shipping-comparison sheets.
- `index.html`, `styles.css`, `dashboard.js` - responsive interactive dashboard.
- `dashboard_data.js` - generated default records so the dashboard works when opened directly from disk.

## Refresh the generated files

Install the requirements if they are not already available:

```powershell
python -m pip install -r requirements.txt
```

Run the pipeline from this folder:

```powershell
python clean_analyze.py
```

To select a workbook or a different output folder:

```powershell
python clean_analyze.py --input "path\to\workbook.xlsx" --output-dir "path\to\output"
```

Open `index.html` in a browser. The generated `dashboard_data.js` lets it load the supplied dataset without a web server. Use **Upload CSV** to load another dataset; CSV files must contain all 13 source columns listed in the project brief. The browser recalculates metrics and charts from the uploaded records.

## Cleaning and analysis conventions

- Remove exact duplicate rows; trim text, parse numeric/date fields, and exclude incomplete or invalid rows.
- Reject negative stock, reorder levels, or units sold; non-positive purchase/selling prices; and deliveries dated before orders.
- Recompute shipping time from `Delivery_Date - Order_Date`.
- Revenue = units sold × selling price. Estimated gross profit = units sold × (selling price − purchase cost).
- Inventory status is evaluated per row: zero stock = out of stock; stock below reorder level = reorder; stock above twice the reorder level = overstock; otherwise healthy.
- More than 7 shipping days is shown as a **slow shipment**, not a contractual late delivery: the source has no delivery SLA.
- Currency is not specified, so monetary amounts have no currency symbol. Shipping/sales comparisons are descriptive and not causal.

See `analysis_report.md` for the supplied-data results and detailed limitations.
