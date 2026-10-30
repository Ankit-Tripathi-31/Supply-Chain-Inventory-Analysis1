# Supply Chain & Inventory Analysis

## Executive summary

- **15,000** clean records cover orders from **2023-01-01** through **2024-12-31**.
- Total revenue is **3,076,312,144** and estimated gross profit is **612,924,204** (profit margin **19.9%**).
- The dataset records **2,222,508** units sold and average shipping time of **5.50 days**.
- **2,992 records (19.9%)** are at/below reorder level, including **32** with zero stock.
- **4,502 shipments (30.0%)** took more than 7 days. This is a descriptive slow-shipment flag, not a contractual late-delivery measure.

## Data cleaning and quality

Source workbook: `Project-03 supply_chain_inventory_dataset_15000_rows 2.xlsx`. Cleaning was performed by `clean_analyze.py`; the supplied workbook has 15,000 rows.

| Check | Result |
|---|---:|
| Exact duplicate rows removed | 0 |
| Rows with missing required values removed | 0 |
| Rows with invalid values removed | 0 |
| Shipping-day values recomputed from dates | 0 |
| Clean rows written | 15,000 |

Cleaning rules: trim text fields; parse dates and numeric values; remove exact duplicate rows; exclude rows missing required fields, with negative stock/reorder/sales, non-positive prices, or delivery before order; recompute shipping days from the two dates. Revenue is `Units_Sold x Selling_Price`; gross profit is `Units_Sold x (Selling_Price - Purchase_Cost)`.

Inventory status uses row-level stock: **Out of stock** when stock is zero; **Reorder** when stock is below reorder level; **Overstock** when stock exceeds twice reorder level; otherwise **Healthy**. A shipment taking more than 7 days is marked slow because no SLA/target is provided.

## Inventory status

| Inventory status | Records |
| --- | --- |
| Out of stock | 32 |
| Reorder | 2,960 |
| Healthy | 3,004 |
| Overstock | 9,004 |

Products with zero stock:

| Product | Zero-stock records |
| --- | --- |
| Phone | 6 |
| TV | 5 |
| Watch | 4 |
| Laptop | 4 |
| Tablet | 3 |
| AC | 2 |
| Camera | 2 |
| Fan | 2 |
| Mixer | 2 |
| Shoes | 2 |

## Top products by gross profit

| Product | Units sold | Revenue | Profit |
| --- | --- | --- | --- |
| Camera | 240,401 | 334,229,473 | 67,289,924 |
| Laptop | 227,840 | 316,613,786 | 62,301,164 |
| Fan | 220,851 | 306,617,496 | 61,626,332 |
| Watch | 219,547 | 304,689,482 | 61,540,660 |
| Mixer | 226,878 | 317,081,023 | 61,423,945 |

The highest-profit product name is **Camera**. The highest-volume product name is **Camera**. These aggregate product names across all records; they do not represent unique SKU lifetime performance.

## Supplier performance

Average shipping time and the share of records exceeding 7 days:

| Supplier | Records | Avg shipping days | Shipments >7 days |
| --- | --- | --- | --- |
| Supplier E | 3009 | 5.55 | 30.9% |
| Supplier D | 2944 | 5.54 | 30.2% |
| Supplier B | 2980 | 5.52 | 30.4% |
| Supplier A | 3025 | 5.48 | 29.8% |
| Supplier C | 3042 | 5.39 | 28.9% |

**Supplier E** has the highest average shipping time (5.55 days), but it is nearly tied with the next supplier; **Supplier E** has the highest share of shipments taking more than 7 days (30.9%). Use the dashboard's supplier and date filters to compare suppliers over the same subset.

## Slow shipment and sales comparison

Records taking more than 7 days average **147.8 units sold**, versus **148.3** for records taking 7 days or less. This is an observational comparison only; the dataset does not establish that shipping duration caused a change in sales.

## Recommendations

1. Review the **2,992** records at or below reorder level and prioritize the **32** zero-stock records; validate demand and replenishment lead time before ordering.
2. Audit products classified as overstock (more than twice reorder level) before replenishing them, and consider transfers between warehouses where demand supports it.
3. Investigate supplier shipments taking more than 7 days, especially the supplier with the highest mean transit time. Define an agreed SLA before reporting contractual late-delivery rates.
4. Monitor revenue, gross profit, stock status, and supplier transit time together. The records are order-level observations, so avoid treating the stock quantity as a historical stock balance or the product name as a unique SKU.

## Interpretation limits

- Currency is not specified in the workbook; monetary totals are shown in dataset units.
- `Purchase_Cost` and `Selling_Price` are treated as per-unit values.
- Inventory status is evaluated per record using the supplied stock and reorder level; it is not a time-series inventory reconstruction.
- “Slow delivery” means more than 7 calendar days, an analysis threshold rather than a promised delivery SLA.
- Sales versus slow-delivery comparisons are not causal.
