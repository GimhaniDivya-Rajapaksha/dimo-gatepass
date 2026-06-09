# Phase 2 — Pending Items

## 1. To Location Dropdown — Extended Plant List Issue

**Problem:**
The To Location dropdown is loaded based on the vehicle's material number (`matnr`), fetched from SAP `/plant` endpoint. SAP only returns plants where the material **currently has vehicles in stock**. Extended plants with zero current inventory are missing from the dropdown.

If a user selects a non-extended plant and the system writes to SAP, SAP will reject the write.

**Current behaviour:**
- `/api/lookups/route.ts` — `matnr` path (lines 88–126)
- Calls `fetchPlantVehicleRows()`, filters by `materialNo === matnr`
- Returns only plants with current stock for that material

**What is needed from TechLead / SAP side:**
Is there a SAP API endpoint that returns the **extended plant list** for a given material number?
e.g. something like `/material/{matnr}/plants` or a filter on an existing endpoint.

**Proposed fix (once SAP API confirmed):**
Use the extended plant list API to get all valid plants for the material, then:
1. Match those plant codes against the `LocationOption` DB table
2. Return all storage locations within those plants
3. Apply the same `locationType` filter (DIMO / Dealer / Promo / Finance)

**Fallback (if no SAP API available):**
Use plant codes returned by SAP for this matnr → pull all storage locations for those plant codes from DB LocationOption table. This covers sub-locations within confirmed plants, but cannot cover plants with zero current inventory.

---

## 2. LocationOption Table — Admin Management UI

**Problem:**
The `LocationOption` table (plant codes, descriptions, storage location codes) needs to be maintained by admin as SAP adds/changes locations. Currently it is seeded manually via a seed script.

**What is needed:**
Admin panel page to Add / Edit / Delete location entries directly (no code change, no SAP sync API).

When admin assigns `defaultLocation` to a user, the dropdown should pull from this table (not free text) so assignments are always valid and code-matching works correctly.

---
