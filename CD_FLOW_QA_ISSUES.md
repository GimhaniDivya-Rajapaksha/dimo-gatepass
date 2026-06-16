# Customer Delivery Flow — QA Issues

> Found: 2026-06-16  
> Status: NOT FIXED — do not change code until each issue is confirmed

---

## Bug 1 — Immediate pay CD goes to all location approvers when SAP returns no orders

**Severity:** High  
**File:** `app/api/gate-pass/route.ts` ~line 588

### What happens
```
CD created → fetchSapOrders() → active.length === 0
  → falls through to "No SAP orders" block
  → status = PENDING_APPROVAL
  → findApproversForLocationBrand(location, selectedApproverName, make)
  → returns ALL approvers at that location
  → ALL get notified
```

### When it triggers
- SAP is down (502 / NoResponse)
- Vehicle has no SAP orders yet
- SAP order lookup fails for any reason

### Expected
- If SAP is unavailable, pass should route to Cashier (since it is likely an Immediate pay vehicle)
- OR hold in a pending state and retry SAP when available

---

## Bug 2 — Credit CD with no approver selected → all location approvers see it

**Severity:** High  
**Files:** `lib/approver-routing.ts` lines 74–96 and `app/api/gate-pass/route.ts` lines 186–200

### What happens
In `findApproversForLocationBrand`:
```typescript
if (selectedName) {
  // Only runs if approver was explicitly selected by initiator
  const exact = await findUsers({ name: { equals: selectedName } });
  if (exact.length > 0) return exact; // returns early
}
// If no name selected → falls through → returns ALL location approvers
```

If initiator leaves the Approver field blank:
- `selectedName = ""`
- All approvers at the location get notified

Also in the dashboard query filter:
```typescript
{ OR: [
  { intendedApprover: { equals: approverName } },
  { intendedApprover: null },   // ← NULL means ALL approvers can see it
]}
```
Passes with `intendedApprover = null` are visible to every approver at every location.

### Expected
- If no approver selected, either block submission (make approver required) OR assign to a default approver only
- Passes with null `intendedApprover` should not be visible to unrelated approvers

---

## Bug 3 — `immediateTerms` list is inconsistent between create and cashier

**Severity:** Medium  
**Files:** `app/api/gate-pass/route.ts` line 472 vs `app/gate-pass/cashier-review/page.tsx` line 146

### Create route (routing decision)
```typescript
const immediateTerms = [
  "immediate", "zc01", "0001", "payment immediate",
  "cash", "pay immediately w/o deduction"
];
```

### Cashier review page (order classification in modal)
```typescript
const immediateTerms = [
  "immediate", "zc01", "payment immediate",
  "cash", "pay immediately w/o deduction", ""
];
```

### Differences
| Term | Create Route | Cashier Page |
|------|-------------|--------------|
| `"0001"` | ✅ Immediate | ❌ Missing → classified as Credit |
| `""` (empty) | ❌ Missing | ✅ Immediate |

### What happens
An order with `payTermCode = "0001"`:
- At creation → classified as Immediate → `CASHIER_REVIEW`
- In cashier modal → classified as Credit order (appears in wrong column)

---

## Bug 4 — ServiceOrder.payTerm stored in wrong format at gate pass creation

**Severity:** Medium  
**File:** `app/api/gate-pass/route.ts` line 490

### What happens
When orders are stored at gate pass creation:
```typescript
payTerm: `HSTAT:${o.orderStatusCode}|${o.billingType}|${o.billingDate}`,
// Stored as: "HSTAT:H070|ZSF2|20260616"
```

But the cashier modal classifies orders by checking this value against:
```typescript
immediateTerms.includes((o.payTerm || "").toLowerCase().trim())
// Checks: "hstat:h070|zsf2|20260616" against ["immediate", "zc01", ...]
// → NEVER matches → ALL orders appear as Credit
```

### Effect
All orders appear as Credit in the cashier modal until the cashier manually clicks **"Sync SAP"**, which re-fetches and overwrites the payTerm with the real value (e.g., "Payment Immediate").

### Expected
Either store the actual term name at creation, or the cashier modal should handle both formats.

---

## Bug 5 — Security Officer is notified for CD (contradicts "bypasses security" design)

**Severity:** Medium  
**File:** `app/api/gate-pass/[id]/status/route.ts` line 289–316

### What happens
In the `approve` action:
```typescript
const needsSecurityNotify = (
  (action === "approve" && gatePass.passType === "AFTER_SALES" && ...) ||
  (action === "approve" && gatePass.passType === "LOCATION_TRANSFER") ||
  (action === "approve" && gatePass.passType === "CUSTOMER_DELIVERY") // ← CD notifies Security
);
```

Security Officer receives: **"Customer Delivery Approved — Confirm Gate OUT"**

### Problem
CD design says initiator prints gate pass → status goes to COMPLETED (bypassing Security Gate OUT step). But Security is still notified and may try to act on the pass. If the initiator already printed and the pass is COMPLETED, the Security Officer sees a stale notification for a completed pass.

### Expected
CD should not notify Security on approve. Only notify initiator to print.

---

## Bug 6 — SAP fetch error leaves pass stuck with no routing

**Severity:** Medium  
**File:** `app/api/gate-pass/route.ts` — catch block after `fetchSapOrders`

### What happens
If `fetchSapOrders` throws an exception (network error, timeout, etc.), the catch block runs. If the catch block is empty or only logs the error:
- Gate pass is created with status `PENDING_APPROVAL` (initial default)
- No notifications sent (neither Cashier nor Approver)
- Pass is stuck — nobody knows it exists

### Expected
On SAP failure, either:
- Route to a safe default (e.g., notify Cashier with a warning that SAP was unavailable)
- OR send admin notification that the pass needs manual routing

---

## Summary

| # | Issue | Severity | File |
|---|---|---|---|
| 1 | SAP no-orders → Immediate CD routes to all approvers | 🔴 High | `app/api/gate-pass/route.ts` ~588 |
| 2 | No approver selected → all location approvers see pass | 🔴 High | `lib/approver-routing.ts` + `route.ts` filter |
| 3 | `immediateTerms` mismatch create vs cashier modal | 🟡 Medium | `route.ts:472` + `cashier-review/page.tsx:146` |
| 4 | `ServiceOrder.payTerm` stored as HSTAT format not term name | 🟡 Medium | `route.ts:490` |
| 5 | Security notified for CD (should bypass security) | 🟡 Medium | `status/route.ts:292` |
| 6 | SAP error → pass stuck with no routing | 🟡 Medium | `route.ts` catch block |

---

## PLAN — CD Flow Simplification

> Status: IN PLANNING — no code changes yet
> Last updated: 2026-06-16

### Paths being REMOVED

#### Path C — Mixed Payment (REMOVE)
Current behaviour:
- `hasImmediate=true && hasCredit=true` → CASHIER_REVIEW, both cashier and approver notified in parallel
- Two independent flags (`cashierCleared`, `creditApproved`) must both be true before APPROVED
- Complex dual-track coordination logic in `cashier_clear_cd` and `credit_approve`

Decision: **This path will no longer exist.**
Replacement: TBD — options are:
  - a) Treat as Immediate only → route to Cashier, ignore credit terms
  - b) Treat as Credit only → route to Approver, ignore immediate terms
  - c) Something else (user to confirm)

#### Path D — No SAP Orders (REMOVE)
Current behaviour:
- `active.length === 0` → PENDING_APPROVAL, paymentType=CREDIT, all location approvers notified
- Treats missing SAP data as a credit scenario — incorrect assumption

Decision: **This path will no longer exist.**
Replacement: TBD — options are:
  - a) Block CD creation if SAP returns no orders (show error on form)
  - b) Route to Cashier as default (safe side)
  - c) Something else (user to confirm)

---

### Paths KEEPING (unchanged)

| Path | Trigger | Routing |
|------|---------|---------|
| A — Immediate Only | All orders have immediate payTerm | → CASHIER_REVIEW |
| B — Credit Only | All orders have non-immediate payTerm | → PENDING_APPROVAL → Approver |
| E — SAP Error | fetchSapOrders throws | → TBD (currently same as D, also being removed) |

---

### Other fixes to do in same pass (from QA issues above)

| # | Fix | Note |
|---|-----|------|
| 3 | Sync `immediateTerms` between `route.ts` and `cashier-review/page.tsx` | Add `"0001"`, remove `""` from cashier page |
| 4 | Store real payTerm in `ServiceOrder` at creation (not HSTAT format) | So cashier modal shows correct columns without needing Sync SAP |
| 5 | Remove Security notification from CD `approve` action | `status/route.ts` line 292 — CD should not notify Security |
| Bug 2 | Fix `intendedApprover: null` showing to all approvers | Needs schema/query change |

---

### Confirmed decisions (all)

| # | Decision |
|---|---|
| Mixed payment removed | Any order with `isHappyPath=false` → entire gate pass goes **Credit (Approver)**. No parallel cashier+approver path. |
| Immediate logic (FS §2.4) | `isHappyPath = hstat==="H070" && (fkart==="ZSF2"\|\|"ZVVO") && zterm==="ZC01" && !cancelled`. Already in `lib/sap.ts:130`. |
| All orders isHappyPath | → CASHIER_REVIEW |
| Any order NOT isHappyPath | → PENDING_APPROVAL (Approver). Any credit order = whole pass goes to Approver. Covers old Mixed path. |
| No SAP orders | → PENDING_APPROVAL (go to Approver, same as credit). Do NOT auto-approve. |
| SAP fetch error | → Show error message to initiator. Must split from no-orders: `fetchSapOrders` must throw on error instead of returning `[]`. |
| Security Gate OUT after APPROVED | SAME AS LT: Security sees pass in Gate OUT dashboard AND initiator gets print button. Whoever acts first → COMPLETED. Other queue clears. |
| Cashier path — Security notify bug | BUG TO FIX: `cashier_clear_cd → APPROVED` does NOT currently notify Security. Must be added — Security must be notified when CD becomes APPROVED via cashier path. |
| Credit approve — Security notify | CORRECT (keep): `approve` action already notifies Security. Intentional. |
| Single order escalate | KEEP |
| Payment override | KEEP — approver selection TBD (see open question) |
| Bug 2 | Not a real issue — approver is mandatory dropdown. No fix needed. |
| Schema change (ServiceOrder) | OK — store `orderStatusCode` (hstat), `billingType` (fkart), `payTermCode` (zterm), `cancelled` (fksto) as proper columns. Remove HSTAT-format string. |

### FS §2.4 Happy Path (confirmed)
```
HSTAT = "H070"            (Order Closed)
FKART = "ZSF2" OR "ZVVO" (Workshop Invoice / New Vehicle Invoice)
ZTERM = "ZC01"            (Payment Immediate)
FKSTO = "No"              (Not Cancelled)
```
All 4 true → Immediate → CASHIER_REVIEW
Any condition fails → Credit → PENDING_APPROVAL

### Payment Override — CONFIRMED

| # | Decision |
|---|---|
| Payment override approver | **Option A — cashier selects approver on screen** (same dropdown as single order escalate) |
| Code fix needed | `cashier_override_request` currently uses `cashierUser.approverId` (pre-assigned). Must be changed to use `body.approverId` (cashier-selected) — same pattern as `cashier_single_order_escalate` |

---

## ALL QUESTIONS RESOLVED — READY FOR IMPLEMENTATION
