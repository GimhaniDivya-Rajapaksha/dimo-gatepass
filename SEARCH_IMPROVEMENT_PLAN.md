# Vehicle Search Improvement Plan — Plate Number + /plant Optimisation

## Safe Point (DO NOT DELETE THIS)

- **Branch:** `Dev`
- **Safe commit:** `bec7cb2` — feat: send Confirm Arrival email to TO-plant ASOs for LT gate out
- **Date documented:** 2026-06-26

### To roll back to safe state at any time:
```bash
git checkout Dev
git reset --hard bec7cb2
```

Or if already pushed and need to revert on remote:
```bash
git revert HEAD
git push origin Dev
```

---

## Problem Being Solved

Vehicle search currently only sends `vhvin` (chassis/VIN) to SAP OData filter.  
When user searches by **plate number** (`xdbexlicext` e.g. `WP-KT-8890`), SAP returns 0 — the vehicle is found only via the unfiltered `/plant` fallback (heavy payload, ~1–2s retry delay, no location pre-fill).

---

## Files That Will Change

| File | What changes |
|---|---|
| `lib/sap.ts` | Add `xdbexlicext` to OData filter (lines 171, 177) |
| `app/api/lookups/route.ts` | Change `/plant` from always-unfiltered-parallel to filtered-sequential after SAP result |

**Nothing else changes.** LT flow, CD flow, location dropdown, SAP write, UI — all untouched.

---

## Step 1 — `lib/sap.ts` (lines 171 and 177)

### Before (current — safe):
```typescript
// Line 171 — LT fetchIN
apimPost("in", chassisQ ? `substringof('${chassisQ}', vhvin)` : "")

// Line 177 — CD fetchOUT
apimPost("out", chassisQ ? `(${sdstaFilter}) and substringof('${chassisQ}', vhvin)` : sdstaFilter)
```

### After (planned):
```typescript
// Line 171 — LT fetchIN
apimPost("in", chassisQ ? `substringof('${chassisQ}', vhvin) or substringof('${chassisQ}', xdbexlicext)` : "")

// Line 177 — CD fetchOUT
apimPost("out", chassisQ ? `(${sdstaFilter}) and (substringof('${chassisQ}', vhvin) or substringof('${chassisQ}', xdbexlicext))` : sdstaFilter)
```

### Roll back Step 1:
Revert lines 171 and 177 to the "Before" version above. Or:
```bash
git revert HEAD
```

---

## Step 2 — `app/api/lookups/route.ts`

### Current behaviour:
- SAP `/in` or `/out` runs in parallel with `/plant` (unfiltered — returns ALL vehicles)
- `/plant` unfiltered = massive payload, JS-filtered client-side by `externalNo`/`chassisNo`/`internalNo`

### Planned behaviour:
- SAP `/in` or `/out` runs first
- If SAP returns results → call `/plant` filtered by `Vhvin eq 'WDD205...'` (targeted — only that vehicle's rows)
- If SAP returns 0 → fall back to unfiltered `/plant` exactly as today

### Why this is safe:
- `/plant` filtered by vhvin already works (used by location dropdown after vehicle selection)
- Unfiltered `/plant` fallback is unchanged for edge cases
- Extended locations for destination dropdown come from the post-selection `/api/lookups?field=location` call — NOT from this search call. No impact.

### Roll back Step 2:
Revert `app/api/lookups/route.ts` to the parallel unfiltered version. Or:
```bash
git revert HEAD
```

---

## What Does NOT Change (constraint — do not touch)

- `SearchInput` component — no touch
- 3-character minimum — no touch
- Enter-to-search behaviour — no touch
- Location dropdown after vehicle selection — no touch
- SAP write logic (`updateVehiclePlantLocation`) — no touch
- LT flow — no touch
- CD flow — no touch
- Dedup logic (`jsVehicleFilter`) — no touch
- All UI behaviour — no touch
- Business status filtering behaviour — no touch
- Already-delivered warning — no touch

---

## Risk

- **Unknown:** Does SAP `/in` and `/out` support `substringof` on `xdbexlicext`? Likely yes (field is in the response), but only confirmed by testing.
- **If SAP rejects the filter (4xx):** Existing retry logic fires → falls back to `/plant` unfiltered → behaviour is exactly today. Nothing breaks.

---

## Implementation Order

1. Step 1 only → test in Dev → confirm plate search works via SAP directly
2. If Step 1 works → proceed to Step 2
3. If Step 1 breaks anything → `git revert HEAD` → back to safe commit `bec7cb2`
