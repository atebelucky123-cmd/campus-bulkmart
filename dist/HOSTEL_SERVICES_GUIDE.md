# LHBM Hostel Services — Admin Guide

## 1. Overview

Hostel Services are a special product type separate from groceries and stationeries. Unlike regular products with a single flat price, services have a **price list** made up of groups and items (e.g. "Ear Piercings → Upper Lobe → ₦5,000"). Customers view the rate card on the storefront and book directly via WhatsApp.

---

## 2. Adding a New Service

1. In the admin sidebar, click **➕ Add Service**.
2. Fill in the following fields:
   - **Service Name** — what customers see on the card (e.g. "Ear Piercing Studio")
   - **Short Description** — one or two lines shown on the storefront card
   - **Image URL** — paste any direct image link (Unsplash, etc.)
   - **Top Pick** — check to feature in the Top Picks section
   - **Allow Group Order** — check if this service supports bulk/group bookings
3. Click **➕ Add Service**.
4. You'll be taken to the **Services tab** automatically. The service now exists with no pricing yet.
5. Click **💰 Price List** on the service row to add pricing.

---

## 3. Managing the Price List

1. In the **Services** tab, click **💰 Price List** next to a service.
2. The **Price List Manager** opens with two zones:
   - **Group Builder** — a visual editor for groups and items
   - **CSV Section** — for bulk upload

### Adding Groups and Items Manually

- Click **+ Add Group** to create a new group (e.g. "Ear Piercings").
- Type a group name in the input field.
- Click **+ Add Item** inside the group to add a row.
- Each row has: **Item Name**, **Price**, and **Description** (optional).
- Leave price blank → the item shows "DM for price" on the storefront.
- Click **× Remove Group** to delete an entire group (after confirmation).
- Click **×** at the end of any item row to remove just that item.

### Saving

Click **💾 Save Price List** at the bottom. The service's starting price on the storefront updates immediately.

---

## 4. Using CSV to Update Prices

### CSV Format

| group | name | price | description |
|-------|------|-------|-------------|
| Ear Piercings | Upper Lobe | 5000 | Standard lobe piercing with jewellery |
| Ear Piercings | Lobe | 5000 | |
| Advanced Ear Piercings | Conch | 7500 | Cartilage piercing |
| 18+ Piercings | Nipple (single or pair) | | DM for price and booking |

**Column rules:**
- `group` — required. The group this item belongs to.
- `name` — required. The item name shown to customers.
- `price` — optional. A whole number (e.g. `5000`). Leave blank for "DM for price".
- `description` — optional. Shown in an expandable accordion on the storefront.
- Descriptions containing commas must be wrapped in double quotes: `"Long, detailed description here"`
- Maximum **50 items** across all groups per service.

### Steps

1. Click **⬇ Download CSV Template** to get a pre-formatted starting point.
2. Edit the file in any spreadsheet app (Excel, Google Sheets).
3. Save as `.csv`.
4. In the Price List Manager, click the upload zone and select your file.
5. A preview table appears showing all parsed items.
6. Choose **Replace all** (wipe existing and rebuild) or **Merge** (add new items on top).
7. Click **✅ Apply to Builder** — the group builder updates with your data.
8. Review the builder, then click **💾 Save Price List**.

### Common Errors

| Error | Fix |
|-------|-----|
| `CSV must have 'group' and 'name' columns` | Check your first row has exactly those headers |
| `Row X: invalid price "abc"` | Price must be a whole number or blank |
| `Row X: missing group` | The group column is empty for that row |
| `CSV has N items — maximum is 50` | Split across multiple services or reduce items |

---

## 5. Editing a Service

In the **Services** tab, click **Edit Details** to update:
- Service name
- Short description
- Image URL
- Top Pick status
- Group Order setting

This does **not** change the price list. Use **💰 Price List** for that.

---

## 6. Deleting a Service

Click **Delete** in the Services tab. The service is removed from Firestore immediately and disappears from the storefront on the next page load.

---

## 7. CSV Format Quick Reference

```
group,name,price,description
Ear Piercings,Upper Lobe,5000,Standard lobe piercing with jewellery
Ear Piercings,Lobe,5000,
Advanced Ear Piercings,Conch,7500,Cartilage piercing
Advanced Ear Piercings,Industrial,10000,Double cartilage bar piercing
18+ Piercings,Nipple (single or pair),,DM for price and booking
```

**Rules checklist:**
- [ ] First row is the header exactly as shown above
- [ ] `group` and `name` are never empty
- [ ] `price` is a whole number or blank (not `0`, not text)
- [ ] Descriptions with commas are wrapped in `"double quotes"`
- [ ] Total items across all groups ≤ 50
