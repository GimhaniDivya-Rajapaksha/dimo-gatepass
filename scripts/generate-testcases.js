const XLSX = require("xlsx");
const path = require("path");

const HEADERS = [
  "Test Case ID", "Sub ID", "Test Case Description", "Scenario", "Screen",
  "Pre-conditions", "Test Steps", "Test Data", "Expected Result",
  "Actual Result", "Status v1.0", "Priority", "Comments"
];

// ─── AFTER SALES DATA ─────────────────────────────────────────────────────────
const afterSalesData = [
  // AS-TC-001 Login & Role Access
  ["AS-TC-001","","LOGIN & ROLE ACCESS — AFTER SALES ACTORS","","","","","","","","","",""],
  ["AS-TC-001","AS-TC-001-01","Initiator login and dashboard access","Verify Initiator can log in and see After Sales dashboard","Login → Dashboard","System running; Initiator account exists","1. Navigate to /login\n2. Enter credentials\n3. Click Sign In\n4. Verify redirect","Email: initiator1@dimo.lk\nPW: Test@1234","Redirected to Initiator dashboard; sidebar shows My Gate Passes, Create Gate Pass, Vehicle Arrivals","","","High",""],
  ["AS-TC-001","AS-TC-001-02","Security Officer login and dashboard","Verify SO can log in and access Gate IN/OUT screen","Login → Gate IN/OUT","SO account exists","1. Login as Security Officer\n2. Verify sidebar nav\n3. Navigate to Gate IN/OUT","Email: security1@dimo.lk\nPW: Test@1234","Redirected to SO dashboard; Gate IN / OUT visible in sidebar with notification dot","","","High",""],
  ["AS-TC-001","AS-TC-001-03","ASO login and dashboard access","Verify Area Sales Officer sees correct nav items","Login → Dashboard","ASO account exists","1. Login as ASO\n2. Check sidebar\n3. Verify accessible menu items","Email: aso1@dimo.lk\nPW: Test@1234","ASO dashboard shows Create Sub-Pass, Vehicle Arrivals, My Gate Passes; does NOT show LT or CD creation","","","High",""],
  ["AS-TC-001","AS-TC-001-04","Cashier login and dashboard","Verify Cashier can access cashier review screen","Login → Dashboard","Cashier account exists","1. Login as Cashier\n2. Navigate to Cashier Review","Email: cashier1@dimo.lk\nPW: Test@1234","Cashier review queue visible with pending MAIN_OUT passes","","","High",""],
  ["AS-TC-001","AS-TC-001-05","Approver login and dashboard","Verify Approver sees After Sales queue","Login → Dashboard","Approver account exists","1. Login as Approver\n2. Navigate to Approvals","Email: approver1@dimo.lk\nPW: Test@1234","Approver queue shows MAIN_OUT passes with credit orders","","","High",""],
  ["AS-TC-001","AS-TC-001-06","Role isolation — Initiator cannot access Security Gate IN/OUT page","Verify unauthorized access is blocked","Gate IN/OUT","Initiator logged in","1. Login as Initiator\n2. Navigate to /gate-pass/security-gate-out","N/A","Redirected away from Security page; access denied or redirected to dashboard","","","High",""],
  ["AS-TC-001","AS-TC-001-07","Role isolation — Security Officer cannot create gate pass","Verify SO has no Create Gate Pass button","Create Gate Pass","SO logged in","1. Login as Security Officer\n2. Check sidebar for Create Gate Pass","N/A","Create Gate Pass is NOT visible in SO sidebar","","","High",""],
  ["AS-TC-001","AS-TC-001-08","Role isolation — ASO cannot create Location Transfer or Customer Delivery","ASO restricted to After Sales sub-passes only","Create Gate Pass","ASO logged in","1. Login as ASO\n2. Navigate to Create Gate Pass\n3. Check pass type options","N/A","Pass type options show only After Sales; Location Transfer and Customer Delivery are hidden","","","High",""],

  // AS-TC-002 Create MAIN_IN
  ["AS-TC-002","","CREATE MAIN_IN PASS (Gate In — Vehicle Arriving for Service)","","","","","","","","","",""],
  ["AS-TC-002","AS-TC-002-01","Successful MAIN_IN pass creation with all valid fields","Happy path — full valid data submission","Create Gate Pass","Logged in as Initiator; After Sales tab selected; Sub-type = Main IN","1. Navigate to Create Gate Pass\n2. Select Service / Repair\n3. Sub-type defaults to Main IN\n4. Fill all required fields\n5. Click Submit","Vehicle: UPLG-7012\nChassis: MAT41640397R18710\nCustomer: John Silva\nJob Type: Service\nReceiving Location: Colombo TATA - Altair Showroom\nArrival Date: tomorrow\nArrival Time: 10:00","Pass created; status = Approved; GP number assigned (e.g. GP-0180); success toast shown; redirected to pass list","","","Critical","MAIN_IN auto-approved on creation — no approver needed"],
  ["AS-TC-002","AS-TC-002-02","MAIN_IN — Vehicle field is required","Validate mandatory field","Create Gate Pass","Initiator logged in; Service/Repair form open","1. Leave Vehicle field empty\n2. Fill all other fields\n3. Click Submit","Vehicle: (empty); all others valid","Validation error shown: Vehicle is required; form not submitted","","","High",""],
  ["AS-TC-002","AS-TC-002-03","MAIN_IN — Arrival date cannot be in the past","Date validation","Create Gate Pass","Initiator logged in; Service/Repair form open","1. Enter a past date in Arrival Date\n2. Click Submit","Arrival Date: yesterday's date","Error: Arrival date cannot be in the past; form not submitted","","","High",""],
  ["AS-TC-002","AS-TC-002-04","MAIN_IN — Arrival time cannot be in the past (same day)","Time validation for today","Create Gate Pass","Initiator logged in","1. Set Arrival Date to today\n2. Set Arrival Time to a past time\n3. Click Submit","Date: today\nTime: 01:00 AM (past)","Error: Arrival time cannot be in the past; form not submitted","","","High",""],
  ["AS-TC-002","AS-TC-002-05","MAIN_IN — Receiving location is required","Validate mandatory location field","Create Gate Pass","Initiator logged in","1. Leave Receiving Location empty\n2. Fill all other fields\n3. Click Submit","Receiving Location: (empty)","Error: Receiving location is required; form not submitted","","","High",""],
  ["AS-TC-002","AS-TC-002-06","MAIN_IN — Approver field is required","Validate approver selection","Create Gate Pass","Initiator logged in","1. Leave Approver field empty\n2. Fill all other fields\n3. Submit","Approver: (empty)","Error: Approver is required; form not submitted","","","High",""],
  ["AS-TC-002","AS-TC-002-07","MAIN_IN — Job type is required","Validate job type selection","Create Gate Pass","Initiator logged in","1. Leave Job Type unselected\n2. Submit","Job Type: (empty)","Error: Job type is required; form not submitted","","","High",""],
  ["AS-TC-002","AS-TC-002-08","MAIN_IN — Status is APPROVED immediately after creation","Auto-approval verification","My Gate Passes","MAIN_IN pass just created","1. Create a valid MAIN_IN pass\n2. Check status in My Gate Passes","Valid data","Pass status shows Approved immediately (not Pending)","","","Critical","MAIN_IN bypasses approver — auto-approved"],
  ["AS-TC-002","AS-TC-002-09","MAIN_IN — Security Officer at same location receives notification","Notification delivery","Gate IN/OUT","Security Officer logged in at same location as initiator","1. Initiator creates MAIN_IN\n2. Login as SO at same location\n3. Check notification bell","fromLocation matches SO defaultLocation","Notification received: Incoming Service Vehicle — Confirm Gate IN; bell shows unread count","","","High",""],
  ["AS-TC-002","AS-TC-002-10","MAIN_IN — SO at DIFFERENT location does NOT see pass in Gate IN queue","Location filter verification","Gate IN/OUT","Two SOs at different locations; MAIN_IN created for Location A","1. Create MAIN_IN at Location A\n2. Login as SO at Location B\n3. Check Gate IN queue","fromLocation = Location A\nSO at Location B","Gate IN queue empty for Location B SO; pass does NOT appear","","","High",""],
  ["AS-TC-002","AS-TC-002-11","MAIN_IN — Pass appears in Security Gate IN queue at correct location","Queue visibility","Gate IN/OUT","MAIN_IN created; SO at same location logged in","1. Login as SO at same location as initiator\n2. Open Gate IN/OUT\n3. Check Gate IN panel","Initiator defaultLocation = SO defaultLocation","MAIN_IN pass visible in Gate IN queue with correct vehicle, chassis, and details","","","Critical",""],
  ["AS-TC-002","AS-TC-002-12","MAIN_IN — Vehicle lookup populates chassis and make automatically","Auto-fill from vehicle lookup","Create Gate Pass","Initiator logged in; vehicle exists in SAP lookup","1. Type vehicle plate in Vehicle field\n2. Select from dropdown","Vehicle: UPLG-7012","Chassis number and make/model auto-filled from lookup","","","Medium",""],
  ["AS-TC-002","AS-TC-002-13","MAIN_IN — Service job number field accepts input","Optional field","Create Gate Pass","Initiator logged in","1. Enter service job number\n2. Submit pass","Service Job No: SJ-20240101","Pass created with service job number stored","","","Low",""],

  // AS-TC-003 Security Gate IN - MAIN_IN
  ["AS-TC-003","","SECURITY GATE IN — MAIN_IN CONFIRMATION","","","","","","","","","",""],
  ["AS-TC-003","AS-TC-003-01","Security Officer confirms Gate IN for MAIN_IN — pass moves to COMPLETED","Happy path Gate IN confirmation","Gate IN/OUT","MAIN_IN at APPROVED status; SO logged in at same location","1. Login as SO\n2. Open Gate IN/OUT\n3. Locate MAIN_IN in Gate IN panel\n4. Slide to confirm IN","MAIN_IN pass at status APPROVED","Status changes to COMPLETED; pass removed from Gate IN queue; success toast shown","","","Critical",""],
  ["AS-TC-003","AS-TC-003-02","Gate IN — Initiator receives Vehicle Arrived notification after confirmation","Notification after Gate IN","My Gate Passes / Notifications","MAIN_IN pass; SO just confirmed Gate IN","1. SO confirms Gate IN\n2. Login as Initiator\n3. Check notifications","Pass just moved to COMPLETED","Initiator receives notification: Vehicle Arrived — Security Confirmed Gate IN","","","High",""],
  ["AS-TC-003","AS-TC-003-03","Gate IN — Chassis mismatch — SO records mismatch note","Mismatch handling","Gate IN/OUT","MAIN_IN in Gate IN queue","1. SO opens pass in Gate IN\n2. Checks Mismatch option\n3. Enters mismatch note\n4. Confirms Gate IN","Mismatch Note: Chassis plate different","Pass moves to COMPLETED with mismatch flag; comment stored as [MISMATCH] Chassis plate different","","","High",""],
  ["AS-TC-003","AS-TC-003-04","Gate IN — SO can enter received chassis if different from pass chassis","Chassis update on gate in","Gate IN/OUT","MAIN_IN with chassis; SO logged in","1. SO opens MAIN_IN\n2. Enters different chassis number\n3. Confirms Gate IN","Received Chassis: MAT00000000000","Pass COMPLETED with new chassis stored; original chassis replaced","","","Medium",""],
  ["AS-TC-003","AS-TC-003-05","Gate IN — Pass removed from queue after confirmation","Queue cleanup","Gate IN/OUT","MAIN_IN just confirmed by SO","1. SO confirms Gate IN\n2. Check Gate IN queue","N/A","MAIN_IN pass no longer visible in Gate IN queue","","","High",""],
  ["AS-TC-003","AS-TC-003-06","Gate IN — MAIN_IN at APPROVED accepted by security_gate_in (direct flow — no INITIATOR_IN step)","API action validation","Gate IN/OUT","MAIN_IN at APPROVED status","1. SO slides to confirm on APPROVED MAIN_IN","status = APPROVED; passSubType = MAIN_IN","Gate IN confirmation accepted; no error; status → COMPLETED","","","Critical","Validates removal of INITIATOR_IN intermediary step"],
  ["AS-TC-003","AS-TC-003-07","Gate IN — SO at wrong location cannot confirm MAIN_IN","Location-based restriction","Gate IN/OUT","MAIN_IN exists; SO at different location logged in","1. SO at Location B tries to slide MAIN_IN belonging to Location A","N/A","Pass not visible in Gate IN queue for wrong-location SO; confirmation blocked","","","High",""],
  ["AS-TC-003","AS-TC-003-08","Gate IN — Pass details visible in card (vehicle, chassis, approver, initiator)","UI card content","Gate IN/OUT","MAIN_IN in Gate IN queue","1. SO opens Gate IN/OUT\n2. Locate MAIN_IN card\n3. Inspect card content","N/A","Card shows: GP number, vehicle, chassis, make, color, initiator name, job type; vehicle color indicator visible","","","Medium",""],

  // AS-TC-004 Create SUB_OUT
  ["AS-TC-004","","CREATE SUB_OUT PASS (Send Vehicle to Sub-Location)","","","","","","","","","",""],
  ["AS-TC-004","AS-TC-004-01","Successful SUB_OUT pass creation linked to MAIN_IN","Happy path SUB_OUT creation","Create Gate Pass","Initiator logged in; parent MAIN_IN pass at COMPLETED","1. Navigate to Create Gate Pass\n2. Select After Sales\n3. Sub-type = Sub OUT\n4. Search parent GP number\n5. Fill destination and transport fields\n6. Submit","Parent GP: GP-0173\nTo Location: Kandy Branch - Vehicle Park-1\nDriver: Ravi\nVehicle: UPLG-7012","SUB_OUT created with status APPROVED; fromLocation auto-filled from parent MAIN_IN.fromLocation; GP number assigned","","","Critical",""],
  ["AS-TC-004","AS-TC-004-02","SUB_OUT — From Location auto-filled from parent MAIN_IN's DIMO location (fromLocation, not toLocation)","Auto-fill verification","Create Gate Pass","Parent MAIN_IN with fromLocation = DIMO location","1. Search for parent MAIN_IN GP number\n2. Observe From Location field","Parent MAIN_IN.fromLocation = Colombo TATA - Altair Showroom","From Location field auto-filled as Colombo TATA - Altair Showroom (parent's DIMO location, NOT toLocation)","","","High","Critical — uses fromLocation not toLocation to prevent location mismatch"],
  ["AS-TC-004","AS-TC-004-03","SUB_OUT — Status is APPROVED immediately (auto-approved)","Auto-approval","My Gate Passes","SUB_OUT just created","1. Create SUB_OUT\n2. Check status in My Gate Passes","Valid SUB_OUT data","Status = Approved immediately; no approver queue step","","","Critical",""],
  ["AS-TC-004","AS-TC-004-04","SUB_OUT — Security Officer at same location notified on creation","Notification","Gate IN/OUT","SO logged in at same location as initiator","1. Initiator creates SUB_OUT\n2. SO checks notification bell","fromLocation = SO defaultLocation","SO receives notification: Sub OUT Ready — Confirm Gate Release","","","High",""],
  ["AS-TC-004","AS-TC-004-05","SUB_OUT — Appears in Security Gate OUT queue at same location","Queue visibility","Gate IN/OUT","SUB_OUT at APPROVED; SO at same location","1. SO opens Gate IN/OUT\n2. Check Gate OUT panel","fromLocation = SO defaultLocation","SUB_OUT visible in Gate OUT queue","","","Critical",""],
  ["AS-TC-004","AS-TC-004-06","SUB_OUT — To Location field is required","Validation","Create Gate Pass","Initiator creating SUB_OUT","1. Leave To Location empty\n2. Submit","To Location: (empty)","Validation error: To location is required","","","High",""],
  ["AS-TC-004","AS-TC-004-07","SUB_OUT — Cannot be created without linking to a valid parent MAIN_IN","Parent pass validation","Create Gate Pass","Initiator creating SUB_OUT","1. Enter invalid GP number\n2. Try to submit","Parent GP: GP-9999 (nonexistent)","Error: parent pass not found; system does not allow submission without valid MAIN_IN link","","","High",""],
  ["AS-TC-004","AS-TC-004-08","SUB_OUT — Departure date is required","Field validation","Create Gate Pass","Initiator creating SUB_OUT","1. Leave Departure Date empty\n2. Submit","Departure Date: (empty)","Validation error shown; form not submitted","","","Medium",""],
  ["AS-TC-004","AS-TC-004-09","SUB_OUT — To Location must be in full format (PlantDescription - StorageDescription)","Location format","Create Gate Pass","Initiator using location lookup dropdown","1. Select destination from lookup dropdown","Lookup returns: Kandy Branch - Vehicle Park-1","toLocation stored as Kandy Branch - Vehicle Park-1 (full format with dash); correct for downstream filtering","","","High","Prevents location mismatch issues for SO and Initiator filters"],
  ["AS-TC-004","AS-TC-004-10","SUB_OUT — Driver and carrier information fields","Optional transport details","Create Gate Pass","Initiator creating SUB_OUT","1. Fill driver name, NIC, contact, carrier reg no\n2. Submit","Driver: John\nNIC: 123456789V\nContact: 0771234567\nCarrier: WP-1234","Pass created with all transport details stored","","","Low",""],

  // AS-TC-005 Security Gate OUT - SUB_OUT
  ["AS-TC-005","","SECURITY GATE OUT — SUB_OUT CONFIRMATION","","","","","","","","","",""],
  ["AS-TC-005","AS-TC-005-01","Security confirms Gate OUT for SUB_OUT — status moves to GATE_OUT","Happy path Gate OUT","Gate IN/OUT","SUB_OUT at APPROVED; SO at same location (fromLocation)","1. SO opens Gate IN/OUT\n2. Locate SUB_OUT in Gate OUT panel\n3. Slide to confirm OUT","SO defaultLocation = SUB_OUT.fromLocation","Status → GATE_OUT; departure date/time auto-recorded; pass removed from Gate OUT queue","","","Critical",""],
  ["AS-TC-005","AS-TC-005-02","Gate OUT confirmation — departure date and time auto-stamped","Timestamp auto-set","Gate IN/OUT","SUB_OUT at APPROVED","1. SO confirms Gate OUT\n2. View pass details","N/A","Pass shows departureDate and departureTime set to actual confirmation moment","","","High",""],
  ["AS-TC-005","AS-TC-005-03","Gate OUT — Destination Security Officer notified","Cross-location notification","Gate IN/OUT","SO at destination location","1. Security One confirms Gate OUT\n2. Security Two (destination) checks notifications","toLocation = Security Two defaultLocation","Security Two receives notification: Incoming Vehicle — Confirm Gate IN on Arrival","","","High",""],
  ["AS-TC-005","AS-TC-005-04","Gate OUT — Destination Initiator receives Vehicle Arrival notification","Notification to destination","Dashboard / Notifications","Initiator Two at destination","1. Security One confirms Gate OUT\n2. Initiator Two checks notifications","toLocation = Initiator Two defaultLocation","Initiator Two receives notification about incoming vehicle","","","High",""],
  ["AS-TC-005","AS-TC-005-05","Gate OUT — ASO at destination notified","ASO notification","Dashboard","ASO at destination","1. Gate OUT confirmed for SUB_OUT\n2. ASO checks notifications","N/A","ASO receives: Vehicle Heading Your Way — Confirm Sub IN on Arrival","","","Medium",""],
  ["AS-TC-005","AS-TC-005-06","Gate OUT — SO at wrong location cannot see SUB_OUT in Gate OUT queue","Location filter","Gate IN/OUT","SO at Location B; SUB_OUT fromLocation = Location A","1. SO at Location B opens Gate OUT queue","fromLocation ≠ SO defaultLocation","SUB_OUT NOT visible in SO at Location B's Gate OUT queue","","","High",""],
  ["AS-TC-005","AS-TC-005-07","Gate OUT — Chassis mismatch can be recorded at Gate OUT","Mismatch handling","Gate IN/OUT","SUB_OUT in Gate OUT queue","1. SO ticks mismatch\n2. Enters mismatch note\n3. Confirms Gate OUT","Mismatch Note: Chassis scratched","Gate OUT confirmed; mismatch comment stored; status → GATE_OUT","","","Medium",""],

  // AS-TC-006 Destination Security Gate IN - SUB_OUT
  ["AS-TC-006","","DESTINATION SECURITY GATE IN — SUB_OUT (at Destination Location)","","","","","","","","","",""],
  ["AS-TC-006","AS-TC-006-01","SUB_OUT at GATE_OUT appears in destination Security's Gate IN queue","Queue visibility at destination","Gate IN/OUT","SUB_OUT at GATE_OUT; destination SO logged in","1. Login as SO at destination\n2. Open Gate IN/OUT\n3. Check Gate IN panel","toLocation = destination SO defaultLocation","SUB_OUT visible in destination SO's Gate IN queue","","","Critical",""],
  ["AS-TC-006","AS-TC-006-02","Destination SO confirms Gate IN for SUB_OUT — status → COMPLETED","Happy path destination Gate IN","Gate IN/OUT","SUB_OUT at GATE_OUT in destination SO's Gate IN queue","1. Destination SO slides to confirm Gate IN","N/A","Status → COMPLETED; pass removed from Gate IN queue; originating initiator notified","","","Critical",""],
  ["AS-TC-006","AS-TC-006-03","Originating Initiator notified when destination SO confirms Gate IN","Notification chain","Notifications","SUB_OUT COMPLETED at destination","1. Destination SO confirms Gate IN\n2. Original Initiator checks notifications","N/A","Initiator receives: Vehicle Arrived at Sub-Location — Security Confirmed Gate IN","","","High",""],
  ["AS-TC-006","AS-TC-006-04","SO at wrong (origin) location cannot see GATE_OUT SUB_OUT in their Gate IN","Location isolation","Gate IN/OUT","SUB_OUT at GATE_OUT; SO at origin (not destination)","1. Origin SO checks Gate IN queue","toLocation ≠ origin SO location","Origin SO's Gate IN queue does NOT show the GATE_OUT SUB_OUT","","","High",""],

  // AS-TC-007 Vehicle Arrivals
  ["AS-TC-007","","INITIATOR — VEHICLE ARRIVALS DASHBOARD","","","","","","","","","",""],
  ["AS-TC-007","AS-TC-007-01","GATE_OUT SUB_OUT appears in destination Initiator's Vehicle Arrivals","Vehicle Arrivals visibility","Initiator Dashboard","SUB_OUT at GATE_OUT; Initiator Two at destination","1. Login as Initiator Two at destination\n2. Check Vehicle Arrivals section","toLocation = Initiator Two defaultLocation","SUB_OUT pass visible in Vehicle Arrivals section with vehicle details","","","Critical",""],
  ["AS-TC-007","AS-TC-007-02","Initiator at origin location does NOT see SUB_OUT in their Vehicle Arrivals","Location isolation","Initiator Dashboard","SUB_OUT at GATE_OUT; Initiator One at origin","1. Login as Initiator One (origin)\n2. Check Vehicle Arrivals","toLocation ≠ Initiator One defaultLocation","SUB_OUT not visible in Initiator One's Vehicle Arrivals","","","High",""],
  ["AS-TC-007","AS-TC-007-03","Vehicle Arrivals auto-refreshes when new pass arrives","Auto-refresh","Initiator Dashboard","SUB_OUT just confirmed GATE_OUT","1. Destination Initiator has Vehicle Arrivals open\n2. Security confirms Gate OUT\n3. Wait for auto-refresh interval","Auto-refresh interval","New pass appears in Vehicle Arrivals without manual page reload","","","Medium",""],

  // AS-TC-008 Create MAIN_OUT
  ["AS-TC-008","","CREATE MAIN_OUT PASS (Vehicle Release After Service)","","","","","","","","","",""],
  ["AS-TC-008","AS-TC-008-01","Successful MAIN_OUT pass creation","Happy path","Create Gate Pass","Initiator logged in; parent MAIN_IN completed; vehicle serviced","1. Navigate to Create Gate Pass\n2. Select After Sales\n3. Select MAIN_OUT sub-type\n4. Link parent GP\n5. Fill required fields\n6. Submit","Parent GP: GP-0173\nVehicle: UPLG-7012\nChassis: MAT000","MAIN_OUT created; status = CASHIER_REVIEW; SAP orders fetched; GP number assigned","","","Critical","MAIN_OUT always goes to CASHIER_REVIEW first"],
  ["AS-TC-008","AS-TC-008-02","MAIN_OUT — status is CASHIER_REVIEW on creation (not APPROVED)","Status routing","My Gate Passes","MAIN_OUT just created","1. Create MAIN_OUT\n2. Check status","Valid MAIN_OUT data","Status = Cashier Review immediately; does NOT appear as Approved","","","Critical",""],
  ["AS-TC-008","AS-TC-008-03","MAIN_OUT — SAP orders fetched and displayed at creation","SAP integration","Create Gate Pass / Cashier Review","Chassis in SAP with active orders","1. Create MAIN_OUT with valid chassis\n2. Navigate to cashier review\n3. View SAP orders","Chassis with SAP orders","Service orders visible in cashier review; payTerm and order details shown","","","High",""],
  ["AS-TC-008","AS-TC-008-04","MAIN_OUT — Cashier notified on creation (if immediate orders)","Notification","Cashier Dashboard","Cashier logged in","1. Create MAIN_OUT with immediate SAP orders\n2. Cashier checks notifications","Immediate payTerm orders exist","Cashier receives: Order Review Required notification","","","High",""],
  ["AS-TC-008","AS-TC-008-05","MAIN_OUT — Approver notified on creation (if credit orders exist)","Parallel notification","Approver Dashboard","Approver logged in","1. Create MAIN_OUT with credit SAP orders\n2. Approver checks notifications","Credit payTerm orders exist","Approver receives: Credit Payment — Approval Required notification","","","High",""],
  ["AS-TC-008","AS-TC-008-06","MAIN_OUT — Vehicle field is required","Field validation","Create Gate Pass","Initiator creating MAIN_OUT","1. Submit MAIN_OUT with empty vehicle field","Vehicle: (empty)","Validation error: Vehicle is required; form not submitted","","","High",""],
  ["AS-TC-008","AS-TC-008-07","MAIN_OUT — Departure date is required","Date validation","Create Gate Pass","Initiator creating MAIN_OUT","1. Leave departure date empty\n2. Submit","Departure Date: (empty)","Validation error shown","","","High",""],

  // AS-TC-009 Cashier Review MAIN_OUT
  ["AS-TC-009","","CASHIER REVIEW — MAIN_OUT PAYMENT CLEARANCE","","","","","","","","","",""],
  ["AS-TC-009","AS-TC-009-01","Cashier sees MAIN_OUT in review queue","Queue visibility","Cashier Review","MAIN_OUT at CASHIER_REVIEW; Cashier logged in","1. Login as Cashier\n2. Navigate to Cashier Review","N/A","MAIN_OUT pass visible in cashier queue with vehicle, chassis, GP number","","","Critical",""],
  ["AS-TC-009","AS-TC-009-02","Cashier can view SAP service orders for the pass","SAP order display","Cashier Review","MAIN_OUT with SAP orders","1. Cashier opens pass details\n2. View SAP orders section","Orders with payTerm data","SAP orders listed with order ID, status, pay term","","","High",""],
  ["AS-TC-009","AS-TC-009-03","Cashier clears payment (immediate-only pass) — status moves to APPROVED","Full cashier clearance (no credit)","Cashier Review","MAIN_OUT with only immediate orders; creditApproved auto-true","1. Cashier clicks Clear Payment\n2. Confirm","hasCredit=false\nhasImmediate=true","Status → APPROVED; Security notified for Gate OUT; Initiator notified","","","Critical",""],
  ["AS-TC-009","AS-TC-009-04","Cashier clears (mixed: immediate + credit) — stays at CASHIER_REVIEW until Approver done","Parallel track — cashier done first","Cashier Review","MAIN_OUT with both immediate and credit orders","1. Cashier clears payment","hasImmediate=true\nhasCredit=true\ncreditApproved=false","cashierCleared=true; status stays CASHIER_REVIEW (waiting for Approver)","","","High",""],
  ["AS-TC-009","AS-TC-009-05","Approver approves credit (mixed) — if cashier already cleared → APPROVED","Parallel track — approver completes second","Approver Dashboard","Mixed MAIN_OUT; cashierCleared=true","1. Approver clicks Approve Credit","creditApproved action","Both tracks done → status APPROVED; Security notified","","","High",""],
  ["AS-TC-009","AS-TC-009-06","Approver approves credit first (mixed) — if cashier NOT done → stays CASHIER_REVIEW","Parallel track — approver first","Approver Dashboard","Mixed MAIN_OUT; cashierCleared=false","1. Approver approves credit","creditApproved action","creditApproved=true; status stays CASHIER_REVIEW (waiting for Cashier)","","","High",""],
  ["AS-TC-009","AS-TC-009-07","No SAP orders — cashier and credit tracks auto-cleared → APPROVED immediately","No orders edge case","Create Gate Pass → Cashier Review","MAIN_OUT with no SAP orders","1. Create MAIN_OUT\n2. Check status","No SAP orders for chassis","Status → APPROVED (both tracks pre-cleared); Security notified","","","Medium",""],

  // AS-TC-010 Approver Credit MAIN_OUT
  ["AS-TC-010","","APPROVER — CREDIT APPROVAL FOR MAIN_OUT","","","","","","","","","",""],
  ["AS-TC-010","AS-TC-010-01","Approver sees MAIN_OUT with credit orders in approval queue","Queue visibility","Approver Dashboard","MAIN_OUT at CASHIER_REVIEW with credit orders","1. Login as Approver\n2. Navigate to approval queue","hasCredit=true","MAIN_OUT visible in Approver queue under After Sales section","","","Critical",""],
  ["AS-TC-010","AS-TC-010-02","Approver approves credit for MAIN_OUT","Approval action","Approver Dashboard","MAIN_OUT with credit orders pending","1. Approver opens pass\n2. Clicks Approve Credit","N/A","creditApproved=true; if cashierCleared=true → APPROVED; notifications sent","","","Critical",""],
  ["AS-TC-010","AS-TC-010-03","Non-Approver role cannot execute credit_approve action","Role restriction","N/A (API level)","Initiator logged in","1. Initiator calls credit_approve action via API","action: credit_approve","Error 403: Unauthorized; action blocked","","","High",""],

  // AS-TC-011 Security Gate OUT MAIN_OUT
  ["AS-TC-011","","SECURITY GATE OUT — MAIN_OUT (Post-Approval)","","","","","","","","","",""],
  ["AS-TC-011","AS-TC-011-01","MAIN_OUT at APPROVED appears in Security Gate OUT queue","Queue visibility","Gate IN/OUT","MAIN_OUT at APPROVED","1. Login as Security Officer\n2. Open Gate IN/OUT\n3. Check Gate OUT panel","status = APPROVED; passSubType = MAIN_OUT","MAIN_OUT visible in Gate OUT queue","","","Critical",""],
  ["AS-TC-011","AS-TC-011-02","Security confirms Gate OUT for MAIN_OUT — status → GATE_OUT","Gate OUT confirmation","Gate IN/OUT","MAIN_OUT at APPROVED in Gate OUT queue","1. SO slides to confirm OUT","N/A","Status → GATE_OUT; departure date/time auto-stamped; creator notified","","","Critical",""],
  ["AS-TC-011","AS-TC-011-03","Initiator notified after Security confirms MAIN_OUT Gate OUT","Notification","Notifications","MAIN_OUT just confirmed by SO","1. SO confirms\n2. Initiator checks notifications","N/A","Initiator receives: Security Confirmed Gate OUT","","","High",""],
  ["AS-TC-011","AS-TC-011-04","MAIN_OUT does NOT appear in Gate IN queue (only Gate OUT)","Queue isolation","Gate IN/OUT","MAIN_OUT at APPROVED","1. SO checks Gate IN queue","N/A","MAIN_OUT NOT in Gate IN queue; only in Gate OUT","","","High",""],

  // AS-TC-012 ASO Flows
  ["AS-TC-012","","ASO (AREA SALES OFFICER) — SPECIFIC FLOWS","","","","","","","","","",""],
  ["AS-TC-012","AS-TC-012-01","ASO cannot create Location Transfer or Customer Delivery passes","Role restriction","Create Gate Pass","ASO logged in","1. Login as ASO\n2. Open Create Gate Pass\n3. Observe pass type options","N/A","Only After Sales pass type visible; LT and CD hidden","","","Critical",""],
  ["AS-TC-012","AS-TC-012-02","ASO can create SUB_IN pass","ASO sub-pass creation","Create Gate Pass","ASO logged in; SUB_OUT at GATE_OUT","1. Login as ASO\n2. Create gate pass\n3. Select SUB_IN","Valid sub-pass data","SUB_IN created at APPROVED; linked to parent","","","High",""],
  ["AS-TC-012","AS-TC-012-03","ASO sees incoming vehicles in their dashboard","Vehicle Arrivals","ASO Dashboard","SUB_OUT at GATE_OUT heading to ASO location","1. Login as ASO\n2. Check Vehicles Incoming section","toLocation = ASO defaultLocation","Incoming SUB_OUT visible in ASO's Vehicles Incoming","","","High",""],
  ["AS-TC-012","AS-TC-012-04","ASO cannot create MAIN_IN or MAIN_OUT directly","Role restriction","Create Gate Pass","ASO logged in","1. ASO attempts MAIN_IN creation","N/A","MAIN_IN option not available to ASO; only SUB_IN, SUB_OUT, SUB_OUT_IN available","","","High",""],

  // AS-TC-013 Pass Detail & Print
  ["AS-TC-013","","PASS DETAIL PAGE & PRINT","","","","","","","","","",""],
  ["AS-TC-013","AS-TC-013-01","Pass detail page shows correct information for all sub-types","Detail view","Gate Pass Detail","Any AFTER_SALES pass created","1. Navigate to pass detail\n2. Verify all fields","Any valid pass","All fields displayed: GP number, sub-type, status, vehicle, chassis, from/to locations, driver, timeline","","","Medium",""],
  ["AS-TC-013","AS-TC-013-02","Print button available for APPROVED and COMPLETED passes only","Print access","My Gate Passes","Pass at APPROVED status","1. Check print button on APPROVED pass","N/A","Print button active (green); clicking opens print view","","","Medium",""],
  ["AS-TC-013","AS-TC-013-03","Print button disabled for PENDING passes","Print access","My Gate Passes","Pass at PENDING_APPROVAL","1. Check print button on pending pass","N/A","Print button disabled/greyed out; tooltip: Available after approval","","","Medium",""],
  ["AS-TC-013","AS-TC-013-04","Pass timeline shows all status transitions","Timeline accuracy","Gate Pass Detail","Pass with multiple status changes","1. Open pass detail\n2. View timeline section","Pass through 3+ statuses","Timeline shows each status change with timestamp","","","Medium",""],

  // AS-TC-014 My Gate Passes & Filtering
  ["AS-TC-014","","AFTER SALES — MY GATE PASSES LIST & FILTERING","","","","","","","","","",""],
  ["AS-TC-014","AS-TC-014-01","Initiator sees only their own passes and sub-passes of their passes","Data isolation","My Gate Passes","Two Initiators with different passes","1. Login as Initiator One\n2. View My Gate Passes","N/A","Only Initiator One's own passes and sub-passes linked to their MAIN_IN are visible","","","High",""],
  ["AS-TC-014","AS-TC-014-02","Filter by Service / Repair shows only AFTER_SALES passes","Filter","My Gate Passes","Initiator with mixed pass types","1. Click Service / Repair tab","N/A","Only AFTER_SALES passes shown; LT and CD hidden","","","Medium",""],
  ["AS-TC-014","AS-TC-014-03","Search by chassis number","Search","My Gate Passes","Passes exist","1. Type chassis in search box","Chassis: MAT41640397R18710","Only pass with matching chassis shown","","","Medium",""],
  ["AS-TC-014","AS-TC-014-04","Search by GP number","Search","My Gate Passes","Passes exist","1. Type GP-0173 in search","GP No: GP-0173","Only GP-0173 shown","","","Medium",""],
  ["AS-TC-014","AS-TC-014-05","Filter by status (e.g., Approved)","Status filter","My Gate Passes","Multiple passes at different statuses","1. Select Approved from status dropdown","N/A","Only Approved passes shown","","","Medium",""],
  ["AS-TC-014","AS-TC-014-06","Sub-passes of a MAIN_IN are visible to the originating Initiator","Sub-pass visibility","My Gate Passes","MAIN_IN with SUB_OUT created","1. Initiator opens their MAIN_IN pass row (expanded)","N/A","Sub-passes (SUB_OUT, SUB_IN) listed under the parent MAIN_IN row","","","High",""],

  // AS-TC-015 Notifications
  ["AS-TC-015","","NOTIFICATIONS — REAL-TIME BELL & AUTO-REFRESH","","","","","","","","","",""],
  ["AS-TC-015","AS-TC-015-01","Notification bell shows unread count badge","Notification badge","Any Dashboard","User with unread notifications","1. Trigger an action that sends notification\n2. Check bell icon","N/A","Bell icon shows red badge with unread count","","","Medium",""],
  ["AS-TC-015","AS-TC-015-02","Notification count decreases when notifications read","Mark as read","Notification panel","User with unread notifications","1. Click notification bell\n2. Mark as read","N/A","Badge count decreases; notifications marked read","","","Medium",""],
  ["AS-TC-015","AS-TC-015-03","Gate IN/OUT page auto-refreshes every 30 seconds","Auto-refresh","Gate IN/OUT","SO on Gate IN/OUT page","1. Keep Gate IN/OUT page open\n2. Create a new MAIN_IN from another session\n3. Wait 30 seconds","N/A","New MAIN_IN appears in Gate IN queue without manual refresh","","","Medium",""],
];

// ─── CUSTOMER DELIVERY DATA ───────────────────────────────────────────────────
const cdData = [
  // CD-TC-001 Login & Role Access
  ["CD-TC-001","","LOGIN & ROLE ACCESS — CD ACTORS","","","","","","","","","",""],
  ["CD-TC-001","CD-TC-001-01","Initiator login — can access Create Gate Pass for Customer Delivery","Role access","Login → Create Gate Pass","Initiator account exists","1. Login as Initiator\n2. Navigate to Create Gate Pass\n3. Select Customer Delivery","Email: initiator1@dimo.lk\nPW: Test@1234","Customer Delivery form accessible; all required fields visible","","","High",""],
  ["CD-TC-001","CD-TC-001-02","Cashier login — can access Cashier Review queue","Role access","Login → Cashier Review","Cashier account exists","1. Login as Cashier\n2. Navigate to Cashier Review","Email: cashier1@dimo.lk\nPW: Test@1234","Cashier Review page accessible; pending CD passes visible","","","High",""],
  ["CD-TC-001","CD-TC-001-03","Approver login — can see CD passes in approval queue","Role access","Login → Approvals","Approver account exists","1. Login as Approver\n2. Navigate to Pending Approvals","Email: approver1@dimo.lk\nPW: Test@1234","CD passes with credit payment terms visible in approval queue","","","High",""],
  ["CD-TC-001","CD-TC-001-04","Security Officer login — can access Gate IN/OUT for CD","Role access","Login → Gate IN/OUT","SO account exists","1. Login as SO\n2. Open Gate IN/OUT","Email: security1@dimo.lk\nPW: Test@1234","APPROVED CD passes visible in Gate OUT queue","","","High",""],
  ["CD-TC-001","CD-TC-001-05","Initiator cannot access Cashier Review page","Role isolation","Cashier Review","Initiator logged in","1. Login as Initiator\n2. Navigate to /gate-pass/cashier-review","N/A","Access denied; redirected to dashboard or 403 shown","","","High",""],
  ["CD-TC-001","CD-TC-001-06","Cashier cannot approve/reject passes","Role isolation","Approvals","Cashier logged in","1. Login as Cashier\n2. Navigate to Approvals page","N/A","Approve/Reject actions not available to Cashier role","","","High",""],

  // CD-TC-002 Form Validation
  ["CD-TC-002","","CREATE CUSTOMER DELIVERY PASS — FORM VALIDATION","","","","","","","","","",""],
  ["CD-TC-002","CD-TC-002-01","Successful CD pass creation with all valid fields","Happy path creation","Create Gate Pass","Initiator logged in","1. Select Customer Delivery\n2. Fill all required fields\n3. Submit","Vehicle: WP-CA-1234\nChassis: VIN12345678\nTo Location: Customer\nApprover: Tharindi\nDeparture Date: tomorrow\nTime: 10:00","Pass created; GP number assigned; SAP queried; status routed based on payment type; success toast shown","","","Critical",""],
  ["CD-TC-002","CD-TC-002-02","Vehicle number / plate field is required","Field validation","Create Gate Pass","Initiator on CD form","1. Leave Vehicle field empty\n2. Fill all other fields\n3. Submit","Vehicle: (empty)","Error: Vehicle is required; form not submitted","","","High",""],
  ["CD-TC-002","CD-TC-002-03","Departure date is required","Field validation","Create Gate Pass","Initiator on CD form","1. Leave Departure Date empty\n2. Submit","Departure Date: (empty)","Validation error shown; form not submitted","","","High",""],
  ["CD-TC-002","CD-TC-002-04","Departure date cannot be in the past","Date validation","Create Gate Pass","Initiator on CD form","1. Enter past date\n2. Submit","Departure Date: yesterday","Error: Departure date cannot be in the past","","","High",""],
  ["CD-TC-002","CD-TC-002-05","Departure time cannot be in the past (same day)","Time validation","Create Gate Pass","Initiator on CD form","1. Set date to today\n2. Set time to past time\n3. Submit","Date: today\nTime: 01:00 AM","Error: Departure time cannot be in the past","","","High",""],
  ["CD-TC-002","CD-TC-002-06","Approver field is required","Field validation","Create Gate Pass","Initiator on CD form","1. Leave Approver empty\n2. Submit","Approver: (empty)","Error: Approver is required","","","High",""],
  ["CD-TC-002","CD-TC-002-07","To Location field is required","Field validation","Create Gate Pass","Initiator on CD form","1. Leave To Location empty\n2. Submit","To Location: (empty)","Error: To location is required","","","High",""],
  ["CD-TC-002","CD-TC-002-08","Vehicle lookup auto-fills chassis number and make","Auto-fill","Create Gate Pass","Vehicle exists in lookup","1. Type plate number in Vehicle field\n2. Select from dropdown","Vehicle: WP-CA-1234","Chassis and make auto-filled from system","","","Medium",""],
  ["CD-TC-002","CD-TC-002-09","Chassis number field accepts alphanumeric input","Field format","Create Gate Pass","Initiator on CD form","1. Enter chassis manually","Chassis: VIN12345678901234","Chassis stored correctly","","","Low",""],
  ["CD-TC-002","CD-TC-002-10","Driver name field — optional","Optional field","Create Gate Pass","Initiator on CD form","1. Leave Driver Name empty\n2. Submit all required fields","Driver: (empty)","Pass created successfully without driver name","","","Low",""],
  ["CD-TC-002","CD-TC-002-11","Driver NIC validation — must be 9 digits + V/X or 12 digits","NIC format","Create Gate Pass","Initiator on CD form","1. Enter invalid NIC\n2. Submit","NIC: 123","Validation error for NIC format","","","Medium",""],
  ["CD-TC-002","CD-TC-002-12","Driver contact must be 10 digits","Contact format","Create Gate Pass","Initiator on CD form","1. Enter 8-digit number\n2. Submit","Contact: 12345678","Validation error for contact format","","","Medium",""],
  ["CD-TC-002","CD-TC-002-13","GP number auto-generated sequentially","GP numbering","My Gate Passes","Multiple passes exist","1. Create new CD pass\n2. Note GP number","Last GP: GP-0179","New GP = GP-0180 (sequential, zero-padded to 4 digits)","","","Medium",""],
  ["CD-TC-002","CD-TC-002-14","Mileage field — numeric only","Numeric validation","Create Gate Pass","Initiator on CD form","1. Enter text in Mileage field","Mileage: abc","Only numeric input accepted; text rejected","","","Low",""],

  // CD-TC-003 SAP Payment Routing
  ["CD-TC-003","","SAP PAYMENT ROUTING — STATUS ASSIGNMENT ON CREATION","","","","","","","","","",""],
  ["CD-TC-003","CD-TC-003-01","CD with immediate payment SAP orders → status = CASHIER_REVIEW","Immediate payment routing","My Gate Passes","Chassis with immediate SAP orders","1. Create CD pass\n2. Check status","PayTerm: immediate / ZC01","Status = CASHIER_REVIEW; Cashier notified","","","Critical",""],
  ["CD-TC-003","CD-TC-003-02","CD with credit payment SAP orders → status = PENDING_APPROVAL","Credit payment routing","My Gate Passes","Chassis with credit SAP orders","1. Create CD pass with credit-term chassis\n2. Check status","PayTerm: credit term","Status = PENDING_APPROVAL; Approver notified","","","Critical",""],
  ["CD-TC-003","CD-TC-003-03","CD with no SAP orders → status = PENDING_APPROVAL (safe default)","No orders fallback","My Gate Passes","Chassis with no active SAP orders","1. Create CD pass\n2. Check status","No SAP orders","Status = PENDING_APPROVAL; Approver notified for manual decision","","","High",""],
  ["CD-TC-003","CD-TC-003-04","CD with mixed orders (immediate + credit) → status = CASHIER_REVIEW (immediate priority)","Mixed payment routing","My Gate Passes","Chassis with both immediate and credit orders","1. Create CD pass with mixed-term chassis","Mixed payTerms","Status = CASHIER_REVIEW; hasImmediate=true; Cashier + Approver both notified","","","High",""],
  ["CD-TC-003","CD-TC-003-05","Initiator notified of initial status after creation","Creation notification","Notifications","Initiator just created CD pass","1. Create CD pass\n2. Check notifications","N/A","Notification confirms pass created and current routing","","","Medium",""],

  // CD-TC-004 Cashier Review
  ["CD-TC-004","","CASHIER REVIEW — IMMEDIATE PAYMENT CLEARANCE","","","","","","","","","",""],
  ["CD-TC-004","CD-TC-004-01","Cashier sees CD pass in review queue","Queue visibility","Cashier Review","CD at CASHIER_REVIEW; Cashier logged in","1. Login as Cashier\n2. Open Cashier Review","N/A","CD pass visible in queue with vehicle, chassis, GP number, payment type","","","Critical",""],
  ["CD-TC-004","CD-TC-004-02","Cashier can view SAP orders linked to the CD pass","SAP order display","Cashier Review","CD with SAP orders","1. Open pass details in Cashier Review\n2. View order list","Active SAP orders","Orders listed with orderId, payTerm, status","","","High",""],
  ["CD-TC-004","CD-TC-004-03","Cashier clears immediate payment → status moves to APPROVED","Clearance action","Cashier Review","CD at CASHIER_REVIEW with immediate orders","1. Cashier clicks Clear Payment\n2. Confirm action","hasImmediate=true\nhasCredit=false","Status → APPROVED; Security Officers notified for Gate OUT; Initiator notified Payment Cleared","","","Critical",""],
  ["CD-TC-004","CD-TC-004-04","Cashier notified by bell when new CD pass enters review queue","Notification","Cashier Dashboard","Initiator just created CD with immediate payment","1. Initiator creates pass\n2. Cashier checks bell","N/A","Cashier receives notification: CD Payment Clearance Required","","","High",""],
  ["CD-TC-004","CD-TC-004-05","Cashier cannot clear a non-CD pass via cashier_clear_cd action","Role/type restriction","Cashier Review","Non-CD pass in system","1. Cashier attempts cashier_clear_cd on AFTER_SALES pass","N/A","Error: cashier_clear_cd only valid for Customer Delivery; action blocked","","","Medium",""],
  ["CD-TC-004","CD-TC-004-06","Cashier cleared CD — Security Officers notified at fromLocation","Notification to SO","Gate IN/OUT","CD just cleared by Cashier","1. Cashier clears payment\n2. SO at fromLocation checks notifications","N/A","SO receives: Customer Delivery Cleared — Confirm Gate OUT","","","High",""],
  ["CD-TC-004","CD-TC-004-07","Initiator notified when Cashier clears payment","Notification","Notifications","CD cleared by cashier","1. Cashier clears payment\n2. Initiator checks notifications","N/A","Initiator receives: Payment Cleared — Vehicle Ready for Gate OUT","","","High",""],

  // CD-TC-005 Approver Flow
  ["CD-TC-005","","APPROVER — CREDIT PAYMENT AUTHORIZATION","","","","","","","","","",""],
  ["CD-TC-005","CD-TC-005-01","Approver sees credit CD pass in approval queue","Queue visibility","Approver Dashboard","CD at PENDING_APPROVAL with credit orders","1. Login as Approver\n2. Navigate to Pending Approvals","N/A","CD pass visible in approval queue","","","Critical",""],
  ["CD-TC-005","CD-TC-005-02","Approver approves CD pass → status moves to APPROVED","Approval action","Approver Dashboard","CD at PENDING_APPROVAL","1. Approver clicks Approve\n2. Confirm","N/A","Status → APPROVED; Initiator notified Gate Pass Approved; Security notified for Gate OUT","","","Critical",""],
  ["CD-TC-005","CD-TC-005-03","Approver rejects CD pass with reason","Rejection action","Approver Dashboard","CD at PENDING_APPROVAL","1. Approver clicks Reject\n2. Enter rejection reason\n3. Confirm","Reason: Credit limit exceeded","Status → REJECTED; Initiator notified with rejection reason visible","","","Critical",""],
  ["CD-TC-005","CD-TC-005-04","Rejection reason is visible to Initiator in pass details","Rejection reason display","Gate Pass Detail / My Gate Passes","CD at REJECTED","1. Login as Initiator\n2. Open rejected CD pass","N/A","Rejection reason displayed: Credit limit exceeded","","","High",""],
  ["CD-TC-005","CD-TC-005-05","Initiator notified when Approver approves","Notification","Notifications","CD just approved","1. Approver approves\n2. Initiator checks notifications","N/A","Initiator receives: Gate Pass Approved","","","High",""],
  ["CD-TC-005","CD-TC-005-06","Security Officers notified when Approver approves CD","SO notification","Gate IN/OUT","CD approved by Approver","1. Approver approves\n2. SO checks notifications","fromLocation = SO defaultLocation","SO receives: Customer Delivery Approved — Confirm Gate OUT","","","High",""],
  ["CD-TC-005","CD-TC-005-07","Non-Approver role cannot approve/reject passes","Role restriction","Approvals (API level)","Initiator or Cashier logged in","1. Attempt approve action via API","role ≠ APPROVER","Error 403: Unauthorized","","","High",""],

  // CD-TC-006 Resubmit
  ["CD-TC-006","","INITIATOR — RESUBMIT AFTER REJECTION","","","","","","","","","",""],
  ["CD-TC-006","CD-TC-006-01","Initiator can resubmit a rejected CD pass","Resubmit flow","My Gate Passes / Gate Pass Detail","CD at REJECTED","1. Open rejected pass\n2. Edit resubmit note\n3. Click Resubmit","Resubmit Note: Corrected details","Status → PENDING_APPROVAL; Approver notified Gate Pass Resubmitted","","","High",""],
  ["CD-TC-006","CD-TC-006-02","Resubmit counter increments each time","Resubmit count","Gate Pass Detail","CD resubmitted once before","1. Resubmit same pass second time","N/A","resubmitCount = 2; visible in pass history","","","Medium",""],
  ["CD-TC-006","CD-TC-006-03","Approver notified on resubmit","Notification","Approver Notifications","Pass resubmitted","1. Initiator resubmits\n2. Approver checks bell","N/A","Approver receives: Gate Pass Resubmitted notification","","","High",""],
  ["CD-TC-006","CD-TC-006-04","Only REJECTED passes can be resubmitted","Status restriction","My Gate Passes","CD at PENDING_APPROVAL","1. Initiator tries resubmit on PENDING_APPROVAL pass","N/A","Resubmit button not shown for non-REJECTED passes","","","Medium",""],

  // CD-TC-007 Security Gate OUT
  ["CD-TC-007","","SECURITY GATE OUT — CUSTOMER DELIVERY","","","","","","","","","",""],
  ["CD-TC-007","CD-TC-007-01","Approved CD pass appears in Security Gate OUT queue","Queue visibility","Gate IN/OUT","CD at APPROVED; SO logged in at fromLocation","1. Login as SO\n2. Open Gate IN/OUT\n3. Check Gate OUT panel","SO defaultLocation = CD.fromLocation","CD pass visible in Gate OUT queue","","","Critical",""],
  ["CD-TC-007","CD-TC-007-02","Security confirms Gate OUT for CD — status immediately COMPLETED (no GATE_OUT step)","Direct complete for CD","Gate IN/OUT","CD at APPROVED","1. SO slides to confirm Gate OUT","isCdPass = true","Status → COMPLETED (not GATE_OUT); delivery marked complete; creator notified","","","Critical","CD skips GATE_OUT → goes straight to COMPLETED"],
  ["CD-TC-007","CD-TC-007-03","Initiator notified when Security confirms CD Gate OUT","Notification","Notifications","CD confirmed by SO","1. SO confirms Gate OUT\n2. Initiator checks notifications","N/A","Initiator receives: Security Confirmed Gate OUT — Delivery Complete","","","High",""],
  ["CD-TC-007","CD-TC-007-04","Departure date and time auto-stamped at Gate OUT confirmation","Timestamp","Gate Pass Detail","CD just confirmed by SO","1. SO confirms Gate OUT\n2. View pass details","N/A","departureDate and departureTime set to actual confirmation moment","","","High",""],
  ["CD-TC-007","CD-TC-007-05","SO at wrong location cannot see CD in Gate OUT queue","Location filter","Gate IN/OUT","SO at Location B; CD.fromLocation = Location A","1. Login as SO at Location B\n2. Check Gate OUT queue","fromLocation ≠ SO defaultLocation","CD NOT visible in Location B SO's Gate OUT queue","","","High",""],
  ["CD-TC-007","CD-TC-007-06","Chassis mismatch can be recorded at Gate OUT","Mismatch handling","Gate IN/OUT","CD in Gate OUT queue","1. SO ticks mismatch\n2. Enters mismatch note\n3. Confirms","Mismatch Note: Colour different","COMPLETED with mismatch flag and comment [MISMATCH] Colour different","","","Medium",""],
  ["CD-TC-007","CD-TC-007-07","CD pass card shows vehicle color indicator in Gate OUT queue","UI card content","Gate IN/OUT","CD with color data in Gate OUT queue","1. SO views Gate OUT queue cards","vehicleColor: Navy Blue","Color swatch visible on card matching vehicle color","","","Low",""],
  ["CD-TC-007","CD-TC-007-08","COMPLETED CD pass does NOT appear in Gate OUT queue","Queue cleanup","Gate IN/OUT","CD at COMPLETED","1. SO opens Gate IN/OUT","N/A","COMPLETED CD not visible in Gate OUT queue","","","High",""],

  // CD-TC-008 Pass Detail & Print
  ["CD-TC-008","","PASS DETAIL & PRINT — CUSTOMER DELIVERY","","","","","","","","","",""],
  ["CD-TC-008","CD-TC-008-01","Print button active for APPROVED CD pass","Print access","My Gate Passes","CD at APPROVED","1. Locate CD pass in list\n2. Check print button","N/A","Print button active; clicking opens print/PDF view with all pass details","","","Medium",""],
  ["CD-TC-008","CD-TC-008-02","Print button disabled for PENDING_APPROVAL CD pass","Print access","My Gate Passes","CD at PENDING_APPROVAL","1. Locate pending CD pass\n2. Check print button","N/A","Print button disabled; tooltip: Available after approval","","","Medium",""],
  ["CD-TC-008","CD-TC-008-03","Pass detail shows correct status badge and timeline","Detail view","Gate Pass Detail","CD with multiple status changes","1. Open CD pass detail page\n2. View status and timeline","N/A","Correct status badge shown; timeline lists all transitions with actor and timestamp","","","Medium",""],
  ["CD-TC-008","CD-TC-008-04","SAP orders visible in CD pass detail","SAP order display","Gate Pass Detail","CD with SAP orders","1. Open CD pass detail","Active orders","Service orders listed with order ID, pay term, status","","","Medium",""],

  // CD-TC-009 Filtering & Search
  ["CD-TC-009","","CD PASS LIST — FILTERING & SEARCH","","","","","","","","","",""],
  ["CD-TC-009","CD-TC-009-01","Initiator sees only their own CD passes","Data isolation","My Gate Passes","Two Initiators logged in","1. Login as Initiator One\n2. Filter by Customer Delivery","N/A","Only Initiator One's CD passes shown","","","High",""],
  ["CD-TC-009","CD-TC-009-02","Filter by Customer Delivery tab shows only CD passes","Tab filter","My Gate Passes","Initiator with multiple pass types","1. Click Customer Delivery tab","N/A","Only passType = CUSTOMER_DELIVERY passes shown","","","Medium",""],
  ["CD-TC-009","CD-TC-009-03","Search by GP number","Search","My Gate Passes","CD passes exist","1. Type GP number in search","GP: GP-0180","Only matching GP shown","","","Medium",""],
  ["CD-TC-009","CD-TC-009-04","Filter by status Cashier Review","Status filter","My Gate Passes","CD at CASHIER_REVIEW exists","1. Select Cashier Review from status dropdown","N/A","Only CASHIER_REVIEW passes shown","","","Medium",""],
  ["CD-TC-009","CD-TC-009-05","Initiator can cancel a PENDING_APPROVAL CD pass","Cancel action","My Gate Passes","CD at PENDING_APPROVAL","1. Click cancel on pending CD pass\n2. Confirm","N/A","Status → CANCELLED; pass no longer actionable","","","Medium",""],
  ["CD-TC-009","CD-TC-009-06","Initiator cannot cancel a pass in CASHIER_REVIEW or APPROVED state","Cancel restriction","My Gate Passes","CD at CASHIER_REVIEW","1. Check for cancel option on non-PENDING pass","N/A","Cancel button not visible for CASHIER_REVIEW or APPROVED passes","","","Medium",""],
];

// ─── STYLE HELPERS ────────────────────────────────────────────────────────────
function buildSheet(data, sheetName) {
  const rows = [HEADERS, ...data];
  const ws = XLSX.utils.aoa_to_sheet(rows);

  // Column widths
  ws["!cols"] = [
    { wch: 14 }, // Test Case ID
    { wch: 16 }, // Sub ID
    { wch: 40 }, // Description
    { wch: 30 }, // Scenario
    { wch: 28 }, // Screen
    { wch: 38 }, // Pre-conditions
    { wch: 45 }, // Test Steps
    { wch: 35 }, // Test Data
    { wch: 45 }, // Expected Result
    { wch: 22 }, // Actual Result
    { wch: 14 }, // Status
    { wch: 10 }, // Priority
    { wch: 38 }, // Comments
  ];

  // Freeze header row
  ws["!freeze"] = { xSplit: 0, ySplit: 1, topLeftCell: "A2", activePane: "bottomLeft", state: "frozen" };

  // Apply styles to header row
  const headerStyle = {
    font: { bold: true, color: { rgb: "FFFFFF" }, sz: 10 },
    fill: { fgColor: { rgb: "1a4f9e" } },
    alignment: { horizontal: "center", vertical: "center", wrapText: true },
    border: {
      top: { style: "thin", color: { rgb: "CCCCCC" } },
      bottom: { style: "thin", color: { rgb: "CCCCCC" } },
      left: { style: "thin", color: { rgb: "CCCCCC" } },
      right: { style: "thin", color: { rgb: "CCCCCC" } },
    },
  };

  HEADERS.forEach((_, ci) => {
    const cellRef = XLSX.utils.encode_cell({ r: 0, c: ci });
    if (ws[cellRef]) ws[cellRef].s = headerStyle;
  });

  // Style data rows
  data.forEach((row, ri) => {
    const isSectionHeader = row[1] === "" && row[2] !== "" && row[2] === row[2].toUpperCase();
    row.forEach((_, ci) => {
      const cellRef = XLSX.utils.encode_cell({ r: ri + 1, c: ci });
      if (!ws[cellRef]) ws[cellRef] = { t: "s", v: "" };

      const priority = row[11] || "";
      let priorityColor = "FFFFFF";
      if (isSectionHeader) {
        priorityColor = "dbeafe"; // light blue for section headers
      } else if (priority === "Critical") {
        priorityColor = ci === 11 ? "fee2e2" : "FFFFFF"; // red tint for critical priority cell
      } else if (priority === "High") {
        priorityColor = ci === 11 ? "fef9c3" : "FFFFFF"; // yellow for high
      } else if (priority === "Medium") {
        priorityColor = ci === 11 ? "dcfce7" : "FFFFFF"; // green for medium
      }

      const rowBg = isSectionHeader ? "dbeafe" : (ri % 2 === 0 ? "f8fafc" : "FFFFFF");

      ws[cellRef].s = {
        font: {
          bold: isSectionHeader,
          sz: isSectionHeader ? 10 : 9,
          color: { rgb: isSectionHeader ? "1e3a8a" : "1f2937" },
        },
        fill: { fgColor: { rgb: ci === 11 && !isSectionHeader ? priorityColor : rowBg } },
        alignment: {
          horizontal: ci === 0 || ci === 1 || ci === 10 || ci === 11 ? "center" : "left",
          vertical: "top",
          wrapText: true,
        },
        border: {
          top: { style: "thin", color: { rgb: "E5E7EB" } },
          bottom: { style: "thin", color: { rgb: "E5E7EB" } },
          left: { style: "thin", color: { rgb: "E5E7EB" } },
          right: { style: "thin", color: { rgb: "E5E7EB" } },
        },
      };
    });
  });

  return ws;
}

// ─── BUILD WORKBOOK ───────────────────────────────────────────────────────────
const wb = XLSX.utils.book_new();

const asSheet = buildSheet(afterSalesData, "After Sales");
XLSX.utils.book_append_sheet(wb, asSheet, "After Sales");

const cdSheet = buildSheet(cdData, "Customer Delivery");
XLSX.utils.book_append_sheet(wb, cdSheet, "Customer Delivery");

// ─── WRITE FILE ───────────────────────────────────────────────────────────────
const outPath = path.join(__dirname, "..", "DIMO_TestCases_AS_CD_v1.0.xlsx");
XLSX.writeFile(wb, outPath);
console.log("✓ Generated:", outPath);
console.log("  After Sales rows :", afterSalesData.length);
console.log("  Customer Delivery rows:", cdData.length);
