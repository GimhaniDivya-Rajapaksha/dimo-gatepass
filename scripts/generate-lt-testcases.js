const XLSX = require("xlsx");
const path = require("path");

// ── Column headers ──────────────────────────────────────────────────────────
const HEADERS = [
  "Test Case ID",
  "Sub ID",
  "Test Case Description",
  "Scenario",
  "Screen",
  "Pre-conditions",
  "Test Steps",
  "Test Data",
  "Expected Result",
  "Actual Result",
  "Status v1.0",
  "Priority",
  "Comments",
];

// ── Helper to build a row ───────────────────────────────────────────────────
function row(tcId, subId, desc, scenario, screen, pre, steps, data, expected, priority, comments = "") {
  return [tcId, subId, desc, scenario, screen, pre, steps, data, expected, "", "", priority, comments];
}

// ── All test data ───────────────────────────────────────────────────────────
const testCases = [

  // ── LT-TC-001 Authentication & Login ──────────────────────────────────────
  row("LT-TC-001","LT-TC-001-01","Authentication & Login","Valid login — Initiator role","Login Page",
    "App is accessible; INITIATOR user account exists",
    "1. Navigate to /login\n2. Enter email\n3. Enter password\n4. Click Sign In",
    "Email: initiator@dimo.lk\nPassword: password123",
    "Redirect to /initiator dashboard. Session set. Role = INITIATOR","Critical",""),

  row("LT-TC-001","LT-TC-001-02","Authentication & Login","Valid login — Approver role","Login Page",
    "APPROVER user account exists",
    "1. Navigate to /login\n2. Enter email\n3. Enter password\n4. Click Sign In",
    "Email: approver@dimo.lk\nPassword: password123",
    "Redirect to Approver dashboard. Role = APPROVER","Critical",""),

  row("LT-TC-001","LT-TC-001-03","Authentication & Login","Valid login — Security Officer role","Login Page",
    "SECURITY_OFFICER user account exists",
    "1. Navigate to /login\n2. Enter email\n3. Enter password\n4. Click Sign In",
    "Email: security@dimo.lk\nPassword: password123",
    "Redirect to Security dashboard. No sidebar shown. Role = SECURITY_OFFICER","Critical",""),

  row("LT-TC-001","LT-TC-001-04","Authentication & Login","Valid login — Recipient role","Login Page",
    "RECIPIENT user account exists",
    "1. Navigate to /login\n2. Enter email\n3. Enter password\n4. Click Sign In",
    "Email: recipient@dimo.lk\nPassword: password123",
    "Redirect to Recipient dashboard. Role = RECIPIENT","Critical",""),

  row("LT-TC-001","LT-TC-001-05","Authentication & Login","Invalid login — wrong password","Login Page",
    "Valid user exists",
    "1. Enter valid email\n2. Enter wrong password\n3. Click Sign In",
    "Email: initiator@dimo.lk\nPassword: wrongpass",
    "Error message displayed: 'Invalid credentials'. No redirect.","Critical",""),

  row("LT-TC-001","LT-TC-001-06","Authentication & Login","Invalid login — non-existent email","Login Page",
    "None",
    "1. Enter non-existent email\n2. Enter any password\n3. Click Sign In",
    "Email: nobody@dimo.lk\nPassword: password123",
    "Error message displayed. Login rejected.","Critical",""),

  row("LT-TC-001","LT-TC-001-07","Authentication & Login","Empty email field submission","Login Page",
    "None",
    "1. Leave email blank\n2. Enter password\n3. Click Sign In",
    "Email: (empty)\nPassword: password123",
    "Validation error shown on email field. Form not submitted.","High",""),

  row("LT-TC-001","LT-TC-001-08","Authentication & Login","Empty password field submission","Login Page",
    "None",
    "1. Enter valid email\n2. Leave password blank\n3. Click Sign In",
    "Email: initiator@dimo.lk\nPassword: (empty)",
    "Validation error shown on password field. Form not submitted.","High",""),

  row("LT-TC-001","LT-TC-001-09","Authentication & Login","Both fields empty","Login Page",
    "None",
    "1. Leave both fields blank\n2. Click Sign In",
    "Email: (empty)\nPassword: (empty)",
    "Validation errors on both fields. Form not submitted.","High",""),

  row("LT-TC-001","LT-TC-001-10","Authentication & Login","Unauthenticated access to protected route","Any Dashboard Page",
    "User is NOT logged in",
    "1. Navigate directly to /gate-pass/create without logging in",
    "URL: /gate-pass/create",
    "Redirect to /login. Protected page not accessible.","Critical",""),

  row("LT-TC-001","LT-TC-001-11","Authentication & Login","Session expiry behaviour","Any Dashboard Page",
    "User is logged in",
    "1. Login\n2. Leave session idle until expiry\n3. Attempt to navigate to protected page",
    "N/A",
    "Redirect to /login. Session expired — auto-redirect.","High",""),

  row("LT-TC-001","LT-TC-001-12","Authentication & Login","Sign out","Any Dashboard Page",
    "User is logged in",
    "1. Click Sign Out button in sidebar\n2. Confirm",
    "N/A",
    "Session cleared. Redirected to /login. Back button does not restore session.","High",""),

  row("LT-TC-001","LT-TC-001-13","Authentication & Login","SQL injection in login fields","Login Page",
    "None",
    "1. Enter SQL injection in email\n2. Enter SQL injection in password\n3. Click Sign In",
    "Email: ' OR 1=1 --\nPassword: ' OR '1'='1",
    "Login rejected. No database error exposed. Treated as invalid credentials.","Critical","Security Test"),

  row("LT-TC-001","LT-TC-001-14","Authentication & Login","XSS in login fields","Login Page",
    "None",
    "1. Enter script tag in email field\n2. Click Sign In",
    "Email: <script>alert('xss')</script>@dimo.lk",
    "Script not executed. Input sanitised. No alert popup.","Critical","Security Test"),

  // ── LT-TC-002 Role-Based Access Control ───────────────────────────────────
  row("LT-TC-002","LT-TC-002-01","Role-Based Access Control & Navigation","Initiator sees Create Gate Pass in nav","Sidebar / Dashboard",
    "Logged in as INITIATOR",
    "1. Login as Initiator\n2. Observe sidebar navigation",
    "N/A",
    "Sidebar shows: Dashboard, My Gate Passes, Create Gate Pass","Critical",""),

  row("LT-TC-002","LT-TC-002-02","Role-Based Access Control & Navigation","Approver sees Approvals queue in nav","Sidebar / Dashboard",
    "Logged in as APPROVER",
    "1. Login as Approver\n2. Observe sidebar navigation",
    "N/A",
    "Sidebar shows: Dashboard, Pending Approvals, All Passes","Critical",""),

  row("LT-TC-002","LT-TC-002-03","Role-Based Access Control & Navigation","Security Officer has no sidebar","Security Gate Dashboard",
    "Logged in as SECURITY_OFFICER",
    "1. Login as Security Officer\n2. Observe layout",
    "N/A",
    "No left sidebar. Full-width layout. Gate OUT and Gate IN queues shown.","Critical",""),

  row("LT-TC-002","LT-TC-002-04","Role-Based Access Control & Navigation","Recipient sees Gate Out / Completed passes only","Gate Pass List",
    "Logged in as RECIPIENT",
    "1. Login as Recipient\n2. Navigate to Gate Pass list",
    "N/A",
    "Only GATE_OUT and COMPLETED passes visible. PENDING/APPROVED hidden.","Critical",""),

  row("LT-TC-002","LT-TC-002-05","Role-Based Access Control & Navigation","Initiator cannot access Approver's page","Approval Page",
    "Logged in as INITIATOR",
    "1. Login as Initiator\n2. Manually navigate to /gate-pass/approve",
    "URL: /gate-pass/approve",
    "Redirected away or Unauthorized message shown.","Critical",""),

  row("LT-TC-002","LT-TC-002-06","Role-Based Access Control & Navigation","Initiator cannot access Security Gate page","Security Gate",
    "Logged in as INITIATOR",
    "1. Login as Initiator\n2. Navigate to /gate-pass/security-gate-out",
    "URL: /gate-pass/security-gate-out",
    "Redirected or access denied. Security gate only for SECURITY_OFFICER.","Critical",""),

  row("LT-TC-002","LT-TC-002-07","Role-Based Access Control & Navigation","Approver cannot create a gate pass","Create Gate Pass",
    "Logged in as APPROVER",
    "1. Login as Approver\n2. Navigate to /gate-pass/create",
    "N/A",
    "Access denied or form not rendered. Only INITIATOR/ASO can create.","Critical",""),

  row("LT-TC-002","LT-TC-002-08","Role-Based Access Control & Navigation","Security Officer cannot approve passes (API level)","API",
    "Logged in as SECURITY_OFFICER",
    "1. Login as Security Officer\n2. Call approve API directly",
    "PATCH /api/gate-pass/{id}/status {action:'approve'}",
    "403 Unauthorized returned from API.","Critical","API-level security test"),

  row("LT-TC-002","LT-TC-002-09","Role-Based Access Control & Navigation","INITIATOR cannot perform security_gate_out (API level)","API",
    "Logged in as INITIATOR",
    "1. Login as Initiator\n2. Call security_gate_out API for own LT pass",
    "PATCH /api/gate-pass/{id}/status {action:'security_gate_out'}",
    "403 Unauthorized returned. Only SECURITY_OFFICER can perform this.","Critical","API-level security test"),

  row("LT-TC-002","LT-TC-002-10","Role-Based Access Control & Navigation","Cross-user access — Initiator A cannot action Initiator B's pass","Gate Pass",
    "Initiator B has a pass; logged in as Initiator A",
    "1. Login as Initiator A\n2. Attempt gate_out on Initiator B's pass ID",
    "Initiator B's pass ID",
    "403 Forbidden. Cannot act on another user's pass.","Critical",""),

  // ── LT-TC-003 Vehicle Field Validation ────────────────────────────────────
  row("LT-TC-003","LT-TC-003-01","Create LT — Vehicle Field Validation","Vehicle field — submit empty","Create Gate Pass",
    "Logged in as INITIATOR, Location Transfer selected",
    "1. Navigate to Create\n2. Select Location Transfer\n3. Leave vehicle field empty\n4. Click Submit",
    "Vehicle: (empty)",
    "Inline error: 'Vehicle is required'. Form not submitted.","High",""),

  row("LT-TC-003","LT-TC-003-02","Create LT — Vehicle Field Validation","Vehicle search — returns results","Create Gate Pass",
    "Vehicle records exist in system",
    "1. Navigate to Create\n2. Select Location Transfer\n3. Type valid vehicle registration",
    "Vehicle: CAA-1234",
    "Dropdown displays matching vehicles. Auto-suggests options.","High",""),

  row("LT-TC-003","LT-TC-003-03","Create LT — Vehicle Field Validation","Vehicle search — no results","Create Gate Pass",
    "Logged in as INITIATOR",
    "1. Type non-existent vehicle reg",
    "Vehicle: ZZZ-9999",
    "Dropdown shows 'No matches' or empty. No crash.","Medium",""),

  row("LT-TC-003","LT-TC-003-04","Create LT — Vehicle Field Validation","Vehicle selection auto-populates chassis","Create Gate Pass",
    "Vehicle exists in system with chassis number",
    "1. Search and select a vehicle",
    "Vehicle: CAA-1234",
    "Chassis field auto-populated with vehicle's chassis number.","High",""),

  row("LT-TC-003","LT-TC-003-05","Create LT — Vehicle Field Validation","Vehicle selection auto-populates colour","Create Gate Pass",
    "Vehicle exists in system",
    "1. Search and select a vehicle",
    "Vehicle: CAA-1234",
    "Vehicle colour field auto-populated.","High",""),

  row("LT-TC-003","LT-TC-003-06","Create LT — Vehicle Field Validation","Vehicle selection auto-populates make","Create Gate Pass",
    "Vehicle exists in system",
    "1. Search and select a vehicle",
    "Vehicle: CAA-1234",
    "Vehicle make field auto-populated.","High",""),

  row("LT-TC-003","LT-TC-003-07","Create LT — Vehicle Field Validation","Special characters in vehicle field","Create Gate Pass",
    "Logged in as INITIATOR",
    "1. Enter special characters in vehicle field",
    "Vehicle: @#$%^&*",
    "Input sanitised. No crash. Error or no results returned.","Medium",""),

  row("LT-TC-003","LT-TC-003-08","Create LT — Vehicle Field Validation","Very long vehicle registration","Create Gate Pass",
    "Logged in as INITIATOR",
    "1. Enter extremely long string in vehicle field",
    "Vehicle: AAAA-1234567890-XXXXXXXXXX",
    "Input handled gracefully. No crash. Max length enforced or error shown.","Medium",""),

  row("LT-TC-003","LT-TC-003-09","Create LT — Vehicle Field Validation","Clear vehicle selection and reselect","Create Gate Pass",
    "Vehicle previously selected",
    "1. Select a vehicle\n2. Clear the field\n3. Select a different vehicle",
    "Vehicle 1: CAA-1234\nVehicle 2: WP-AB-1234",
    "All auto-populated fields update to new vehicle's data.","High",""),

  // ── LT-TC-004 Location Field Validation ───────────────────────────────────
  row("LT-TC-004","LT-TC-004-01","Create LT — Location Field Validation","To Location — submit empty","Create Gate Pass",
    "LT selected",
    "1. Leave To Location blank\n2. Submit",
    "To Location: (empty)",
    "Error: 'Destination location is required'. Form not submitted.","High",""),

  row("LT-TC-004","LT-TC-004-02","Create LT — Location Field Validation","To Location — valid DIMO location","Create Gate Pass",
    "Location records exist",
    "1. Select DIMO type\n2. Search and select a DIMO location",
    "To Location: DIMO Colombo",
    "Location accepted. Form field populated.","High",""),

  row("LT-TC-004","LT-TC-004-03","Create LT — Location Field Validation","To Location — valid DEALER location","Create Gate Pass",
    "Dealer records exist",
    "1. Select DEALER type\n2. Search and select dealer",
    "To Location: Dealer ABC",
    "Dealer location accepted.","High",""),

  row("LT-TC-004","LT-TC-004-04","Create LT — Location Field Validation","To Location — PROMOTION type shows two-column picker","Create Gate Pass",
    "Promotion locations exist",
    "1. Select PROMOTION location type",
    "Type: PROMOTION",
    "Two-column location picker displayed (plant + storage).","Medium",""),

  row("LT-TC-004","LT-TC-004-05","Create LT — Location Field Validation","To Location — FINANCE type shows two-column picker","Create Gate Pass",
    "Finance locations exist",
    "1. Select FINANCE location type",
    "Type: FINANCE",
    "Two-column location picker displayed.","Medium",""),

  row("LT-TC-004","LT-TC-004-06","Create LT — Location Field Validation","From Location — auto-set to user's default location","Create Gate Pass",
    "User has defaultLocation set",
    "1. Navigate to Create\n2. Select LT\n3. Observe From Location",
    "User defaultLocation: DIMO Head Office",
    "From Location pre-filled with user's defaultLocation.","High",""),

  row("LT-TC-004","LT-TC-004-07","Create LT — Location Field Validation","From Location and To Location — same location","Create Gate Pass",
    "Logged in as INITIATOR",
    "1. Set From and To Location to same value\n2. Submit",
    "From: DIMO Colombo\nTo: DIMO Colombo",
    "System warns or prevents same-location transfers. Verify behaviour.","Medium","Business rule — verify"),

  row("LT-TC-004","LT-TC-004-08","Create LT — Location Field Validation","Location search — partial text match","Create Gate Pass",
    "Location records exist",
    "1. Type partial location name",
    "Search: Col",
    "Dropdown returns all locations containing 'Col'.","Medium",""),

  row("LT-TC-004","LT-TC-004-09","Create LT — Location Field Validation","Location search — case insensitive","Create Gate Pass",
    "Location records exist",
    "1. Type location in all caps",
    "Search: COLOMBO",
    "Returns same results as lowercase search.","Medium",""),

  row("LT-TC-004","LT-TC-004-10","Create LT — Location Field Validation","Location dropdown — no results","Create Gate Pass",
    "Logged in as INITIATOR",
    "1. Search for non-existent location",
    "Search: XYZ Unknown",
    "Dropdown shows no results. No crash.","Medium",""),

  // ── LT-TC-005 Date & Time Validation ──────────────────────────────────────
  row("LT-TC-005","LT-TC-005-01","Create LT — Date & Time Validation","Departure date — empty","Create Gate Pass",
    "LT selected",
    "1. Leave departure date blank\n2. Submit",
    "Date: (empty)",
    "Error: 'Departure date is required'.","High",""),

  row("LT-TC-005","LT-TC-005-02","Create LT — Date & Time Validation","Departure time — empty","Create Gate Pass",
    "LT selected",
    "1. Fill date, leave time blank\n2. Submit",
    "Date: Tomorrow\nTime: (empty)",
    "Error: 'Departure time is required'.","High",""),

  row("LT-TC-005","LT-TC-005-03","Create LT — Date & Time Validation","Departure date — past date","Create Gate Pass",
    "Today is 2026-03-27",
    "1. Enter a past date\n2. Submit",
    "Date: 2026-03-01",
    "Error: 'Departure date cannot be in the past'.","High",""),

  row("LT-TC-005","LT-TC-005-04","Create LT — Date & Time Validation","Departure date/time — past datetime (today, past time)","Create Gate Pass",
    "Current time is 14:00",
    "1. Enter today's date\n2. Enter a time before current time\n3. Submit",
    "Date: 2026-03-27\nTime: 08:00",
    "Error: 'Departure time cannot be in the past'.","High",""),

  row("LT-TC-005","LT-TC-005-05","Create LT — Date & Time Validation","Departure date — today's date with future time","Create Gate Pass",
    "Current time is 10:00",
    "1. Enter today's date\n2. Enter future time",
    "Date: 2026-03-27\nTime: 15:00",
    "Form accepts. No error.","High",""),

  row("LT-TC-005","LT-TC-005-06","Create LT — Date & Time Validation","Departure date — future date","Create Gate Pass",
    "Logged in as INITIATOR",
    "1. Enter a date 7 days from now",
    "Date: 2026-04-03\nTime: 09:00",
    "Form accepts. No error.","High",""),

  row("LT-TC-005","LT-TC-005-07","Create LT — Date & Time Validation","Departure date — invalid format","Create Gate Pass",
    "Using manual text input",
    "1. Enter date in wrong format",
    "Date: 27-03-2026",
    "DatePicker handles format. Invalid entry not accepted.","Medium",""),

  row("LT-TC-005","LT-TC-005-08","Create LT — Date & Time Validation","Arrival date — optional, left empty","Create Gate Pass",
    "Departure date set",
    "1. Fill departure date/time\n2. Leave arrival date/time empty\n3. Submit",
    "Arrival: (empty)",
    "Form submits successfully. Arrival date stored as null.","Medium",""),

  row("LT-TC-005","LT-TC-005-09","Create LT — Date & Time Validation","Arrival date — before departure date","Create Gate Pass",
    "Logged in as INITIATOR",
    "1. Set departure date to tomorrow\n2. Set arrival date to today",
    "Dep: 2026-03-28\nArr: 2026-03-27",
    "System warns if arrival is before departure. Verify behaviour.","Medium","Business rule — verify"),

  row("LT-TC-005","LT-TC-005-10","Create LT — Date & Time Validation","Date picker — navigation across months","Create Gate Pass",
    "Date picker open",
    "1. Open date picker\n2. Navigate to next month\n3. Select date",
    "Next month date",
    "Date picker navigates correctly. Selected date shows in field.","Medium","Usability"),

  row("LT-TC-005","LT-TC-005-11","Create LT — Date & Time Validation","Time picker — valid 24-hour format","Create Gate Pass",
    "Time picker open",
    "1. Open time picker\n2. Select 23:30",
    "Time: 23:30",
    "Time stored and displayed as 23:30.","Medium",""),

  row("LT-TC-005","LT-TC-005-12","Create LT — Date & Time Validation","Time picker — midnight edge case","Create Gate Pass",
    "Time picker open",
    "1. Select 00:00",
    "Time: 00:00",
    "Midnight handled correctly. No validation error for valid future date.","Medium",""),

  // ── LT-TC-006 Transport & Carrier Validation ───────────────────────────────
  row("LT-TC-006","LT-TC-006-01","Create LT — Transport & Carrier Validation","CARRIER mode — all carrier fields shown","Create Gate Pass",
    "LT selected",
    "1. Select Transport Mode = CARRIER",
    "Mode: CARRIER",
    "Company name, registration, driver name, NIC, contact fields appear.","High",""),

  row("LT-TC-006","LT-TC-006-02","Create LT — Transport & Carrier Validation","OTHER mode — carrier fields hidden","Create Gate Pass",
    "LT selected",
    "1. Select Transport Mode = OTHER",
    "Mode: OTHER",
    "Carrier-specific fields are hidden.","High",""),

  row("LT-TC-006","LT-TC-006-03","Create LT — Transport & Carrier Validation","CARRIER — company name empty","Create Gate Pass",
    "CARRIER mode selected",
    "1. Leave company name blank\n2. Submit",
    "Company: (empty)",
    "Error: 'Carrier company name is required'.","High",""),

  row("LT-TC-006","LT-TC-006-04","Create LT — Transport & Carrier Validation","CARRIER — registration number empty","Create Gate Pass",
    "CARRIER mode selected",
    "1. Leave carrier reg no blank\n2. Submit",
    "Reg No: (empty)",
    "Error: 'Carrier registration number is required'.","High",""),

  row("LT-TC-006","LT-TC-006-05","Create LT — Transport & Carrier Validation","CARRIER — driver name empty","Create Gate Pass",
    "CARRIER mode selected",
    "1. Leave driver name blank\n2. Submit",
    "Driver Name: (empty)",
    "Error: 'Driver name is required'.","High",""),

  row("LT-TC-006","LT-TC-006-06","Create LT — Transport & Carrier Validation","CARRIER — driver NIC empty","Create Gate Pass",
    "CARRIER mode selected",
    "1. Leave driver NIC blank\n2. Submit",
    "NIC: (empty)",
    "Error: 'Driver NIC is required'.","High",""),

  row("LT-TC-006","LT-TC-006-07","Create LT — Transport & Carrier Validation","CARRIER — driver contact empty","Create Gate Pass",
    "CARRIER mode selected",
    "1. Leave driver contact blank\n2. Submit",
    "Contact: (empty)",
    "Error: 'Driver contact number is required'.","High",""),

  row("LT-TC-006","LT-TC-006-08","Create LT — Transport & Carrier Validation","CARRIER — all fields valid","Create Gate Pass",
    "LT selected",
    "1. Select CARRIER\n2. Fill all carrier fields\n3. Submit",
    "Company: ABC Transport\nReg: WP-TR-1234\nDriver: Kamal Silva\nNIC: 198512345678\nContact: 0771234567",
    "Form submits successfully. All carrier data stored.","High",""),

  row("LT-TC-006","LT-TC-006-09","Create LT — Transport & Carrier Validation","NIC — old format (9 digits + V)","Create Gate Pass",
    "CARRIER mode",
    "1. Enter old-format NIC",
    "NIC: 856234567V",
    "Accepted — 9+V is valid Sri Lankan format.","Medium",""),

  row("LT-TC-006","LT-TC-006-10","Create LT — Transport & Carrier Validation","NIC — too short / invalid","Create Gate Pass",
    "CARRIER mode",
    "1. Enter too-short NIC",
    "NIC: 12345",
    "System handles. Verify if NIC format is validated.","Medium",""),

  row("LT-TC-006","LT-TC-006-11","Create LT — Transport & Carrier Validation","Contact number — letters entered","Create Gate Pass",
    "CARRIER mode",
    "1. Enter letters in contact field",
    "Contact: ABCDE",
    "Error or non-numeric input rejected.","Medium",""),

  row("LT-TC-006","LT-TC-006-12","Create LT — Transport & Carrier Validation","Switch transport mode after filling CARRIER fields","Create Gate Pass",
    "CARRIER fields filled",
    "1. Fill all CARRIER fields\n2. Switch to OTHER\n3. Switch back to CARRIER",
    "N/A",
    "Carrier fields clear or retain. Verify UX behaviour.","Medium",""),

  // ── LT-TC-007 Reason & Approver Validation ────────────────────────────────
  row("LT-TC-007","LT-TC-007-01","Create LT — Reason & Approver Validation","Out Reason — empty","Create Gate Pass",
    "LT selected",
    "1. Leave Out Reason blank\n2. Submit",
    "Reason: (empty)",
    "Error: 'Reason for going out is required'.","High",""),

  row("LT-TC-007","LT-TC-007-02","Create LT — Reason & Approver Validation","Out Reason — valid selection","Create Gate Pass",
    "Reason records exist",
    "1. Click reason dropdown\n2. Select a reason\n3. Submit",
    "Reason: Stock Transfer",
    "Reason stored. Form submits.","High",""),

  row("LT-TC-007","LT-TC-007-03","Create LT — Reason & Approver Validation","Out Reason — dropdown loads reasons","Create Gate Pass",
    "Logged in as INITIATOR",
    "1. Click Out Reason field",
    "N/A",
    "Dropdown populates with available reason options from system.","High",""),

  row("LT-TC-007","LT-TC-007-04","Create LT — Reason & Approver Validation","Out Reason — search within dropdown","Create Gate Pass",
    "Reasons exist",
    "1. Type partial reason text",
    "Search: Stock",
    "Filters to matching reasons.","Medium",""),

  row("LT-TC-007","LT-TC-007-05","Create LT — Reason & Approver Validation","Approver — empty","Create Gate Pass",
    "LT selected",
    "1. Leave Approver blank\n2. Submit",
    "Approver: (empty)",
    "Error: 'Approver is required'.","High",""),

  row("LT-TC-007","LT-TC-007-06","Create LT — Reason & Approver Validation","Approver — valid selection","Create Gate Pass",
    "Approver users exist",
    "1. Click Approver field\n2. Select an approver\n3. Submit",
    "Approver: John Perera",
    "Approver stored. Notification sent to selected approver.","High",""),

  row("LT-TC-007","LT-TC-007-07","Create LT — Reason & Approver Validation","Approver dropdown — only APPROVER role users shown","Create Gate Pass",
    "Multiple user roles exist",
    "1. Open Approver dropdown",
    "N/A",
    "Only users with APPROVER role shown in list.","High",""),

  row("LT-TC-007","LT-TC-007-08","Create LT — Reason & Approver Validation","Approver — search by name","Create Gate Pass",
    "Multiple approvers exist",
    "1. Type partial approver name",
    "Search: John",
    "Filters to approvers matching 'John'.","Medium",""),

  // ── LT-TC-008 Successful Submission ───────────────────────────────────────
  row("LT-TC-008","LT-TC-008-01","Create LT — Successful Submission","Full valid LT submission — CARRIER mode","Create Gate Pass",
    "Logged in as INITIATOR; Vehicle, Location, Approver records exist",
    "1. Navigate to /gate-pass/create\n2. Select Location Transfer\n3. Select vehicle\n4. Set From/To Location\n5. Set departure date (tomorrow) + time\n6. Select reason\n7. Select CARRIER mode\n8. Fill all carrier fields\n9. Select approver\n10. Click Submit",
    "Vehicle: CAA-1234\nFrom: DIMO Colombo\nTo: DIMO Kandy\nDate: 2026-03-28\nTime: 10:00\nReason: Stock Transfer\nCompany: ABC Transport\nReg: WP-TR-1234\nDriver: Kamal\nNIC: 198512345678\nContact: 0771234567\nApprover: John Perera",
    "Gate pass created. Status = PENDING_APPROVAL. GP number generated. Redirect to detail/list. Approver notified. Email sent.","Critical",""),

  row("LT-TC-008","LT-TC-008-02","Create LT — Successful Submission","Full valid LT submission — OTHER mode","Create Gate Pass",
    "Logged in as INITIATOR",
    "1. Complete all required LT fields\n2. Select OTHER transport mode\n3. Submit",
    "Same as above; Mode: OTHER",
    "Gate pass created. Status = PENDING_APPROVAL. No carrier fields required.","Critical",""),

  row("LT-TC-008","LT-TC-008-03","Create LT — Successful Submission","Gate pass number auto-generated","Gate Pass Detail",
    "Pass created",
    "1. Create a valid LT pass\n2. View the created pass",
    "N/A",
    "Unique gate pass number auto-assigned (e.g. GP-0147). Sequential or UUID format.","High",""),

  row("LT-TC-008","LT-TC-008-04","Create LT — Successful Submission","Newly created pass appears in Initiator's list","Gate Pass List",
    "Pass created",
    "1. Create LT pass\n2. Navigate to My Gate Passes",
    "N/A",
    "Created pass appears at top of list with status 'Pending Approval'.","High",""),

  row("LT-TC-008","LT-TC-008-05","Create LT — Successful Submission","Approver receives notification on submission","Notifications",
    "Pass created",
    "1. Create LT pass\n2. Login as assigned Approver\n3. Check notifications",
    "N/A",
    "Notification: 'New Gate Pass Submitted' with gate pass number and details.","High",""),

  row("LT-TC-008","LT-TC-008-06","Create LT — Successful Submission","Approver receives email on submission","Email",
    "Pass created with approver assigned",
    "1. Create LT pass\n2. Check approver's email",
    "N/A",
    "Email received with GP number, pass type, vehicle, locations, departure date/time, submitted by.","High",""),

  row("LT-TC-008","LT-TC-008-07","Create LT — Successful Submission","Duplicate submission prevention (double-click)","Create Gate Pass",
    "LT form filled",
    "1. Fill all fields\n2. Double-click Submit button rapidly",
    "N/A",
    "Only one gate pass created. Submit button disabled/loading after first click.","High",""),

  row("LT-TC-008","LT-TC-008-08","Create LT — Successful Submission","Form reset after successful submission","Create Gate Pass",
    "Pass submitted",
    "1. Submit a valid pass\n2. Navigate back to Create",
    "N/A",
    "Form is clean/empty for new entry. No previous data retained.","Medium",""),

  row("LT-TC-008","LT-TC-008-09","Create LT — Successful Submission","Optional fields stored as null if blank","Gate Pass Detail",
    "Pass created without optional fields",
    "1. Submit LT pass without arrival date, mileage, insurance\n2. View pass detail",
    "Arrival Date: (blank)\nMileage: (blank)",
    "Optional fields show as blank/null in detail view. No error.","Medium",""),

  // ── LT-TC-009 Initiator View & Manage ─────────────────────────────────────
  row("LT-TC-009","LT-TC-009-01","Initiator — View & Manage Passes","Initiator sees only own passes","Gate Pass List",
    "Multiple initiators have passes",
    "1. Login as Initiator A\n2. View gate pass list",
    "N/A",
    "Only Initiator A's passes shown (and sub-passes linked to them).","High",""),

  row("LT-TC-009","LT-TC-009-02","Initiator — View & Manage Passes","Filter by status — PENDING_APPROVAL","Gate Pass List",
    "Multiple passes in different statuses",
    "1. Select status filter 'Pending Approval'",
    "Status: PENDING_APPROVAL",
    "Only PENDING_APPROVAL passes shown.","High",""),

  row("LT-TC-009","LT-TC-009-03","Initiator — View & Manage Passes","Filter by status — APPROVED","Gate Pass List",
    "Approved passes exist",
    "1. Select status filter 'Approved'",
    "Status: APPROVED",
    "Only APPROVED passes shown.","High",""),

  row("LT-TC-009","LT-TC-009-04","Initiator — View & Manage Passes","Filter by pass type — Location Transfer","Gate Pass List",
    "Mixed pass types exist",
    "1. Select pass type filter 'Location Transfer'",
    "Type: LOCATION_TRANSFER",
    "Only LT passes shown.","High",""),

  row("LT-TC-009","LT-TC-009-05","Initiator — View & Manage Passes","Search by gate pass number","Gate Pass List",
    "Passes exist",
    "1. Type gate pass number in search field",
    "Search: GP-0100",
    "Pass matching the number appears.","High",""),

  row("LT-TC-009","LT-TC-009-06","Initiator — View & Manage Passes","Search by vehicle number","Gate Pass List",
    "Passes exist",
    "1. Type vehicle registration in search",
    "Search: CAA-1234",
    "Passes with that vehicle returned.","High",""),

  row("LT-TC-009","LT-TC-009-07","Initiator — View & Manage Passes","Cancel a PENDING_APPROVAL pass","Gate Pass List",
    "PENDING_APPROVAL LT pass exists",
    "1. Find pass in list\n2. Click Cancel\n3. Confirm cancellation",
    "Pass status: PENDING_APPROVAL",
    "Pass status changes to CANCELLED. Removed from pending queue.","High",""),

  row("LT-TC-009","LT-TC-009-08","Initiator — View & Manage Passes","Cannot cancel an APPROVED pass","Gate Pass List",
    "APPROVED LT pass exists",
    "1. Find approved pass\n2. Attempt to cancel",
    "Pass status: APPROVED",
    "Cancel option not shown or disabled for APPROVED passes.","High",""),

  row("LT-TC-009","LT-TC-009-09","Initiator — View & Manage Passes","View pass detail","Gate Pass Detail",
    "Pass exists",
    "1. Click view (eye icon) on any pass",
    "N/A",
    "Pass detail page opens. All fields displayed: GP number, type, status, vehicle, locations, dates, carrier info.","High",""),

  row("LT-TC-009","LT-TC-009-10","Initiator — View & Manage Passes","Pagination — navigate pages","Gate Pass List",
    "More than 20 passes exist",
    "1. View gate pass list\n2. Click Next page",
    "N/A",
    "Second page loads. Previous passes not repeated. Total count displayed.","Medium",""),

  row("LT-TC-009","LT-TC-009-11","Initiator — View & Manage Passes","Status badge — PENDING_APPROVAL (orange)","Gate Pass List",
    "Pass in PENDING_APPROVAL",
    "1. View list",
    "N/A",
    "Orange badge with 'Pending Approval' label.","Medium",""),

  row("LT-TC-009","LT-TC-009-12","Initiator — View & Manage Passes","Status badge — APPROVED (green)","Gate Pass List",
    "Pass in APPROVED",
    "1. View list",
    "N/A",
    "Green badge with 'Approved' label.","Medium",""),

  row("LT-TC-009","LT-TC-009-13","Initiator — View & Manage Passes","Status badge — REJECTED (red)","Gate Pass List",
    "Pass in REJECTED",
    "1. View list",
    "N/A",
    "Red badge with 'Rejected' label.","Medium",""),

  row("LT-TC-009","LT-TC-009-14","Initiator — View & Manage Passes","Status badge — GATE_OUT (blue)","Gate Pass List",
    "Pass in GATE_OUT",
    "1. View list",
    "N/A",
    "Blue badge with 'Gate Out' label.","Medium",""),

  row("LT-TC-009","LT-TC-009-15","Initiator — View & Manage Passes","Status badge — COMPLETED (purple)","Gate Pass List",
    "Pass in COMPLETED",
    "1. View list",
    "N/A",
    "Purple badge with 'Completed' label.","Medium",""),

  // ── LT-TC-010 Approver — Approve Flow ─────────────────────────────────────
  row("LT-TC-010","LT-TC-010-01","Approver — Approve Flow","LT pass appears in approver queue","Approvals Page",
    "LT pass in PENDING_APPROVAL",
    "1. Login as Approver\n2. Navigate to Approvals / Pending queue",
    "N/A",
    "LT pass visible with type 'Location Transfer', vehicle, from/to location, departure date.","Critical",""),

  row("LT-TC-010","LT-TC-010-02","Approver — Approve Flow","View full pass details before approving","Approvals Page",
    "LT pass in queue",
    "1. Click on LT pass in queue\n2. View details",
    "N/A",
    "All fields displayed: GP number, vehicle, chassis, colour, from/to location, departure, carrier info, reason.","High",""),

  row("LT-TC-010","LT-TC-010-03","Approver — Approve Flow","Approve a valid LT pass","Approvals Page",
    "LT pass in PENDING_APPROVAL",
    "1. Find LT pass\n2. Click Approve\n3. Confirm",
    "N/A",
    "Status = APPROVED. Initiator gets 'Gate Pass Approved' notification. Security Officers at fromLocation get 'Location Transfer Approved — Confirm Gate OUT' notification.","Critical",""),

  row("LT-TC-010","LT-TC-010-04","Approver — Approve Flow","Approver cannot approve own-created pass (self-approval)","Approvals",
    "Approver also has initiator rights (edge case)",
    "1. If approver submitted a pass, attempt to approve it",
    "Self-submitted pass",
    "System prevents or flags self-approval.","High","Business rule — verify"),

  row("LT-TC-010","LT-TC-010-05","Approver — Approve Flow","Multiple LT passes — batch view","Approvals",
    "Multiple LT passes pending",
    "1. View approvals queue with multiple passes",
    "N/A",
    "All pending passes listed. Each shows correct details.","High",""),

  row("LT-TC-010","LT-TC-010-06","Approver — Approve Flow","Approve — notification to initiator","Notifications",
    "LT pass approved",
    "1. Approve LT pass\n2. Login as Initiator\n3. Check notifications",
    "N/A",
    "Notification: 'Gate Pass Approved' with gate pass number.","High",""),

  row("LT-TC-010","LT-TC-010-07","Approver — Approve Flow","Approve — notification to security at fromLocation","Notifications",
    "LT pass approved; Security Officer defaultLocation = fromLocation",
    "1. Approve LT pass\n2. Login as Security Officer at fromLocation\n3. Check notifications",
    "N/A",
    "Notification: 'Location Transfer Approved — Confirm Gate OUT'. Includes GP number, vehicle, destination.","Critical",""),

  row("LT-TC-010","LT-TC-010-08","Approver — Approve Flow","Approve — Security Officer at different location does NOT receive notification","Notifications",
    "Security Officer at location ≠ fromLocation",
    "1. Approve LT pass (fromLocation = Colombo)\n2. Login as Security at Kandy",
    "fromLocation: DIMO Colombo\nSO location: DIMO Kandy",
    "Security Officer at Kandy does NOT receive Gate OUT notification.","Critical","Location-based filter"),

  row("LT-TC-010","LT-TC-010-09","Approver — Approve Flow","Pass appears in Security Gate OUT queue after approval","Security Gate",
    "LT pass APPROVED",
    "1. Approve LT pass\n2. Login as Security Officer at fromLocation\n3. Open Security Gate dashboard",
    "N/A",
    "LT pass appears in Gate OUT queue. Shows from→to route, vehicle, GP number.","Critical",""),

  row("LT-TC-010","LT-TC-010-10","Approver — Approve Flow","Approved pass visible to initiator in list","Gate Pass List",
    "Pass approved",
    "1. Login as Initiator\n2. View gate pass list",
    "N/A",
    "Pass shows APPROVED status in list.","High",""),

  // ── LT-TC-011 Approver — Reject Flow ──────────────────────────────────────
  row("LT-TC-011","LT-TC-011-01","Approver — Reject Flow","Reject LT pass without reason","Approvals",
    "LT pass in PENDING_APPROVAL",
    "1. Click Reject\n2. Leave reason blank\n3. Confirm",
    "Reason: (empty)",
    "System prompts for rejection reason (if required) or allows rejection without reason. Verify UX.","High",""),

  row("LT-TC-011","LT-TC-011-02","Approver — Reject Flow","Reject LT pass with reason","Approvals",
    "LT pass in PENDING_APPROVAL",
    "1. Click Reject\n2. Enter reason\n3. Confirm",
    "Reason: Incorrect destination location",
    "Status = REJECTED. Reason stored. Initiator notified with rejection reason.","Critical",""),

  row("LT-TC-011","LT-TC-011-03","Approver — Reject Flow","Rejection notification to initiator includes reason","Notifications",
    "Pass rejected with reason",
    "1. Reject pass with reason\n2. Login as Initiator\n3. Check notifications",
    "Reason: Incorrect destination location",
    "Notification: 'Gate Pass Rejected. Reason: Incorrect destination location'","High",""),

  row("LT-TC-011","LT-TC-011-04","Approver — Reject Flow","Rejected pass status in initiator's list","Gate Pass List",
    "Pass rejected",
    "1. Login as Initiator\n2. View list",
    "N/A",
    "Pass shows REJECTED status with red badge.","High",""),

  row("LT-TC-011","LT-TC-011-05","Approver — Reject Flow","Rejected pass NOT in Security Gate queue","Security Gate",
    "Pass rejected",
    "1. Reject a pass\n2. Login as Security Officer\n3. Check Gate OUT queue",
    "N/A",
    "Rejected pass NOT shown in Gate OUT queue.","High",""),

  row("LT-TC-011","LT-TC-011-06","Approver — Reject Flow","Long rejection reason — max characters","Approvals",
    "LT pass pending",
    "1. Enter very long rejection reason",
    "Reason: 500+ character string",
    "System handles gracefully. Either truncates or accepts. Stores correctly.","Medium",""),

  // ── LT-TC-012 Resubmit After Rejection ────────────────────────────────────
  row("LT-TC-012","LT-TC-012-01","Initiator — Resubmit After Rejection","Resubmit button shown for REJECTED pass","Gate Pass List / Detail",
    "Pass in REJECTED status",
    "1. Login as Initiator\n2. Find rejected pass",
    "N/A",
    "Resubmit option visible on rejected pass.","High",""),

  row("LT-TC-012","LT-TC-012-02","Initiator — Resubmit After Rejection","Resubmit with updated departure date","Gate Pass Detail",
    "REJECTED pass",
    "1. Click Resubmit\n2. Enter new departure date\n3. Add resubmit note\n4. Confirm",
    "New Date: 2026-04-05\nNote: Corrected destination",
    "Status = PENDING_APPROVAL. Resubmit count incremented. Approver notified: 'Gate Pass Resubmitted'.","High",""),

  row("LT-TC-012","LT-TC-012-03","Initiator — Resubmit After Rejection","Resubmit count tracked","Gate Pass Detail",
    "Pass resubmitted once",
    "1. View resubmitted pass details",
    "N/A",
    "Resubmit count = 1 visible in pass details.","Medium",""),

  row("LT-TC-012","LT-TC-012-04","Initiator — Resubmit After Rejection","Cannot resubmit non-rejected pass","Gate Pass",
    "PENDING_APPROVAL pass",
    "1. Attempt resubmit action on PENDING pass",
    "N/A",
    "400 error: 'Only rejected passes can be resubmitted'.","High",""),

  row("LT-TC-012","LT-TC-012-05","Initiator — Resubmit After Rejection","Approver notified on resubmission","Notifications",
    "Pass resubmitted",
    "1. Resubmit pass\n2. Login as Approver\n3. Check notifications",
    "N/A",
    "Notification: 'Gate Pass Resubmitted — needs your review' with GP number.","High",""),

  // ── LT-TC-013 Security Gate OUT ───────────────────────────────────────────
  row("LT-TC-013","LT-TC-013-01","Security Officer — Gate OUT Confirmation","LT pass visible in Security Gate OUT queue","Security Gate Dashboard",
    "LT pass APPROVED; SO defaultLocation = fromLocation",
    "1. Login as Security Officer\n2. Open Security Gate dashboard\n3. View Gate OUT section",
    "N/A",
    "APPROVED LT pass visible. Shows: GP number, vehicle, colour, make, from→to route, departure time.","Critical",""),

  row("LT-TC-013","LT-TC-013-02","Security Officer — Gate OUT Confirmation","LT pass shows from→to route on card","Security Gate Dashboard",
    "LT pass in queue",
    "1. View LT pass card",
    "N/A",
    "Route displayed: DIMO Colombo → DIMO Kandy","High",""),

  row("LT-TC-013","LT-TC-013-03","Security Officer — Gate OUT Confirmation","Gate OUT confirmation — slide to confirm","Security Gate",
    "APPROVED LT pass in queue",
    "1. Find LT pass card\n2. Slide/swipe the confirm slider to the end",
    "N/A",
    "Confirmation triggered. API call security_gate_out sent. Visual success state shown.","Critical",""),

  row("LT-TC-013","LT-TC-013-04","Security Officer — Gate OUT Confirmation","Gate OUT stamps actual departure date & time","Gate Pass Detail",
    "Gate OUT confirmed at specific time",
    "1. Confirm Gate OUT at 14:30 on 2026-03-28\n2. View pass detail",
    "Time of confirmation: 14:30",
    "Departure date = 2026-03-28. Departure time = 14:30 (actual wall-clock time, not originally planned).","Critical","Real-time stamp"),

  row("LT-TC-013","LT-TC-013-05","Security Officer — Gate OUT Confirmation","Gate OUT status changes to GATE_OUT","Gate Pass List",
    "Gate OUT confirmed",
    "1. Confirm Gate OUT\n2. Check status",
    "N/A",
    "Pass status = GATE_OUT. Blue badge.","Critical",""),

  row("LT-TC-013","LT-TC-013-06","Security Officer — Gate OUT Confirmation","Pass removed from Gate OUT queue after confirmation","Security Gate",
    "Gate OUT confirmed",
    "1. Confirm Gate OUT\n2. Observe queue",
    "N/A",
    "Card disappears from Gate OUT queue after ~1.5s animation.","High",""),

  row("LT-TC-013","LT-TC-013-07","Security Officer — Gate OUT Confirmation","Initiator notified of Gate OUT","Notifications",
    "Gate OUT confirmed",
    "1. Confirm Gate OUT\n2. Login as Initiator\n3. Check notifications",
    "N/A",
    "Notification: 'Security Confirmed Gate OUT. Vehicle has been released.'","High",""),

  row("LT-TC-013","LT-TC-013-08","Security Officer — Gate OUT Confirmation","Security at toLocation notified of incoming vehicle","Notifications",
    "Gate OUT confirmed; Security B defaultLocation = toLocation",
    "1. Confirm Gate OUT\n2. Login as Security Officer at toLocation",
    "N/A",
    "Notification: 'Incoming Vehicle — Confirm Gate IN on Arrival'. Includes GP number, vehicle, route.","Critical",""),

  row("LT-TC-013","LT-TC-013-09","Security Officer — Gate OUT Confirmation","Recipient at toLocation notified","Notifications",
    "Gate OUT confirmed; Recipient defaultLocation = toLocation",
    "1. Confirm Gate OUT\n2. Login as Recipient",
    "N/A",
    "Notification: 'Vehicle Departing — Confirm Gate IN When It Arrives'.","High",""),

  row("LT-TC-013","LT-TC-013-10","Security Officer — Gate OUT Confirmation","Security at different location does NOT see LT in Gate OUT queue","Security Gate",
    "Security Officer B at location ≠ fromLocation",
    "1. Login as Security Officer B (Kandy)\n2. View Gate OUT queue",
    "LT fromLocation: DIMO Colombo\nSO B location: DIMO Kandy",
    "LT pass NOT in Security B's Gate OUT queue.","Critical","Location filter"),

  row("LT-TC-013","LT-TC-013-11","Security Officer — Gate OUT Confirmation","Mismatch note — vehicle details mismatch","Security Gate",
    "Gate OUT confirmation dialog",
    "1. During confirmation, enable mismatch flag\n2. Enter mismatch note\n3. Confirm",
    "Mismatch note: Different chassis than documented",
    "Gate OUT confirmed. Comment stored as '[MISMATCH] Different chassis than documented'.","High",""),

  row("LT-TC-013","LT-TC-013-12","Security Officer — Gate OUT Confirmation","Gate OUT fails if pass not APPROVED (API guard)","Security Gate / API",
    "Pass in PENDING_APPROVAL",
    "1. Attempt security_gate_out on PENDING pass",
    "N/A",
    "400 error: 'Gate pass must be APPROVED or initiator-confirmed'.","Critical",""),

  row("LT-TC-013","LT-TC-013-13","Security Officer — Gate OUT Confirmation","Print gate pass before Gate OUT","Security Gate",
    "APPROVED LT pass",
    "1. Find pass card\n2. Click print icon",
    "N/A",
    "Gate pass prints with all details: GP number, vehicle, chassis, route, departure, carrier info.","Medium",""),

  row("LT-TC-013","LT-TC-013-14","Security Officer — Gate OUT Confirmation","Search LT pass in Gate OUT queue","Security Gate",
    "Multiple passes in queue",
    "1. Type GP number in search bar",
    "Search: GP-0100",
    "Matching pass highlighted or filtered in queue.","High",""),

  row("LT-TC-013","LT-TC-013-15","Security Officer — Gate OUT Confirmation","Auto-refresh — new LT pass appears without page reload","Security Gate",
    "New LT pass approved while SO is on dashboard",
    "1. Leave Security Gate dashboard open\n2. Approve a new LT pass from another tab",
    "N/A",
    "New pass appears in Gate OUT queue within 30 seconds (auto-refresh interval).","High",""),

  // ── LT-TC-014 Security Gate IN ────────────────────────────────────────────
  row("LT-TC-014","LT-TC-014-01","Security Officer — Gate IN Confirmation","GATE_OUT LT pass appears in Gate IN queue at toLocation","Security Gate",
    "Gate OUT confirmed; SO at toLocation",
    "1. Login as Security Officer at toLocation\n2. View Gate IN section",
    "N/A",
    "LT pass with GATE_OUT status visible in Gate IN queue.","Critical",""),

  row("LT-TC-014","LT-TC-014-02","Security Officer — Gate IN Confirmation","Gate IN card shows from→to route","Security Gate",
    "Pass in Gate IN queue",
    "1. View LT pass card in Gate IN section",
    "N/A",
    "Route shown: DIMO Colombo → DIMO Kandy. Pass type: Location Transfer.","High",""),

  row("LT-TC-014","LT-TC-014-03","Security Officer — Gate IN Confirmation","Gate IN confirmation — slide to confirm","Security Gate",
    "GATE_OUT LT pass in queue",
    "1. Slide confirm slider on Gate IN card",
    "N/A",
    "API call security_gate_in sent. Status → COMPLETED.","Critical",""),

  row("LT-TC-014","LT-TC-014-04","Security Officer — Gate IN Confirmation","Pass status changes to COMPLETED","Gate Pass Detail",
    "Gate IN confirmed",
    "1. Confirm Gate IN\n2. View pass",
    "N/A",
    "Status = COMPLETED. Purple badge.","Critical",""),

  row("LT-TC-014","LT-TC-014-05","Security Officer — Gate IN Confirmation","Initiator notified of vehicle arrival","Notifications",
    "Gate IN confirmed",
    "1. Confirm Gate IN\n2. Login as Initiator",
    "N/A",
    "Notification: 'Vehicle Arrived at Destination — Security Confirmed Gate IN'. Includes toLocation.","High",""),

  row("LT-TC-014","LT-TC-014-06","Security Officer — Gate IN Confirmation","Pass removed from Gate IN queue after confirmation","Security Gate",
    "Gate IN confirmed",
    "1. Confirm Gate IN\n2. Observe queue",
    "N/A",
    "Card animates out and disappears from queue.","High",""),

  row("LT-TC-014","LT-TC-014-07","Security Officer — Gate IN Confirmation","Security at fromLocation does NOT see pass in Gate IN queue","Security Gate",
    "Pass in GATE_OUT; SO at fromLocation",
    "1. Login as Security at fromLocation\n2. View Gate IN section",
    "N/A",
    "GATE_OUT LT pass NOT in SO at fromLocation's Gate IN queue (it belongs to toLocation SO).","Critical",""),

  row("LT-TC-014","LT-TC-014-08","Security Officer — Gate IN Confirmation","Gate IN with chassis mismatch","Security Gate",
    "GATE_OUT LT pass",
    "1. Enable mismatch\n2. Enter different chassis\n3. Enter mismatch note\n4. Confirm",
    "Received Chassis: NEW-CHASSIS-001\nNote: Chassis plate appears different",
    "Pass COMPLETED. chassis updated to NEW-CHASSIS-001. Comment: [MISMATCH] Chassis plate appears different.","High",""),

  row("LT-TC-014","LT-TC-014-09","Security Officer — Gate IN Confirmation","Gate IN fails if pass not in GATE_OUT status (API guard)","Security Gate / API",
    "Pass in APPROVED",
    "1. Attempt security_gate_in on APPROVED LT pass",
    "N/A",
    "400 error: 'Not eligible for Security Gate IN confirmation'.","Critical",""),

  row("LT-TC-014","LT-TC-014-10","Security Officer — Gate IN Confirmation","Gate IN confirmation — success animation","Security Gate",
    "Gate IN confirmed",
    "1. Complete Gate IN slide",
    "N/A",
    "Success animation plays. 'Gate IN Confirmed!' shown with GP number. Card fades out.","Medium","Usability"),

  // ── LT-TC-015 Recipient ────────────────────────────────────────────────────
  row("LT-TC-015","LT-TC-015-01","Recipient — View & Notifications","Recipient only sees GATE_OUT and COMPLETED passes","Gate Pass List",
    "Recipient logged in",
    "1. Login as Recipient\n2. Navigate to Gate Pass list",
    "N/A",
    "Only GATE_OUT and COMPLETED LT passes visible. PENDING/APPROVED/REJECTED not shown.","High",""),

  row("LT-TC-015","LT-TC-015-02","Recipient — View & Notifications","Recipient receives notification when vehicle is en route","Notifications",
    "Gate OUT confirmed; Recipient at toLocation",
    "1. Security confirms Gate OUT\n2. Login as Recipient at toLocation",
    "N/A",
    "Notification: 'Vehicle Departing — Confirm Gate IN When It Arrives'.","High",""),

  row("LT-TC-015","LT-TC-015-03","Recipient — View & Notifications","Recipient NOT notified if at different location","Notifications",
    "Recipient at location ≠ toLocation",
    "1. Confirm Gate OUT (toLocation = Colombo)\n2. Login as Recipient in Kandy",
    "toLocation: DIMO Colombo\nRecipient location: DIMO Kandy",
    "Recipient in Kandy does NOT receive notification.","High","Location filter"),

  row("LT-TC-015","LT-TC-015-04","Recipient — View & Notifications","Recipient can view LT pass details","Gate Pass Detail",
    "GATE_OUT LT pass exists",
    "1. Login as Recipient\n2. Click on LT pass",
    "N/A",
    "Pass detail view opens. Shows all relevant details.","Medium",""),

  row("LT-TC-015","LT-TC-015-05","Recipient — View & Notifications","Recipient can print completed gate pass","Gate Pass Detail",
    "COMPLETED pass",
    "1. View completed pass\n2. Click print",
    "N/A",
    "Gate pass prints with COMPLETED status. All fields visible.","Medium",""),

  // ── LT-TC-016 Notifications ────────────────────────────────────────────────
  row("LT-TC-016","LT-TC-016-01","Notifications System","Notification bell shows unread count","Dashboard",
    "Unread notifications exist",
    "1. Login as Approver with unread notifications\n2. View header",
    "N/A",
    "Notification bell shows badge with unread count.","High",""),

  row("LT-TC-016","LT-TC-016-02","Notifications System","Notification — mark as read","Notifications Panel",
    "Unread notifications exist",
    "1. Open notifications\n2. Click on a notification",
    "N/A",
    "Notification marked as read. Badge count decreases.","High",""),

  row("LT-TC-016","LT-TC-016-03","Notifications System","Notification includes gate pass number","Notifications",
    "Any LT notification",
    "1. Open notification",
    "N/A",
    "Gate pass number (e.g. GP-0100) visible in notification message.","High",""),

  row("LT-TC-016","LT-TC-016-04","Notifications System","Notification link navigates to pass detail","Notifications",
    "Notification exists",
    "1. Click notification",
    "N/A",
    "Navigates to the relevant gate pass detail page.","High",""),

  row("LT-TC-016","LT-TC-016-05","Notifications System","All 4 LT notification events received across full journey","All Screens",
    "Full LT journey completed",
    "1. Create pass → Approver notified\n2. Approve → Initiator + Security notified\n3. Gate OUT → Initiator + Security B + Recipient notified\n4. Gate IN → Initiator notified",
    "N/A",
    "4 distinct notification events. All received by correct recipients.","Critical",""),

  row("LT-TC-016","LT-TC-016-06","Notifications System","No duplicate notifications","Notifications",
    "Multiple security officers at fromLocation",
    "1. Approve LT pass\n2. Check notifications for all SOs at fromLocation",
    "N/A",
    "Each SO receives exactly one notification. No duplicates.","High",""),

  // ── LT-TC-017 Print ───────────────────────────────────────────────────────
  row("LT-TC-017","LT-TC-017-01","Print Gate Pass","Print enabled only for APPROVED/GATE_OUT/COMPLETED","Gate Pass List",
    "Passes in various statuses",
    "1. View gate pass list\n2. Observe print button state for each status",
    "N/A",
    "Print button enabled (green) for APPROVED, GATE_OUT, COMPLETED. Disabled/greyed for PENDING, REJECTED, CANCELLED.","Medium",""),

  row("LT-TC-017","LT-TC-017-02","Print Gate Pass","Print gate pass — opens print view","Gate Pass Detail",
    "APPROVED LT pass",
    "1. Click print icon or navigate to ?print=1",
    "N/A",
    "Print-optimised view opens with all pass details.","Medium",""),

  row("LT-TC-017","LT-TC-017-03","Print Gate Pass","Print content — all fields present","Print View",
    "APPROVED LT pass",
    "1. Open print view\n2. Verify all fields",
    "N/A",
    "Contains: GP number, type (Location Transfer), vehicle, chassis, colour, make, from/to location, departure date/time, carrier info, driver details, reason, status, created by.","High",""),

  row("LT-TC-017","LT-TC-017-04","Print Gate Pass","Print — DIMO logo present","Print View",
    "Print view open",
    "1. Open print view",
    "N/A",
    "DIMO logo displayed on printed document.","Medium",""),

  row("LT-TC-017","LT-TC-017-05","Print Gate Pass","Print — browser print dialog triggers","Print View",
    "?print=1 parameter used",
    "1. Navigate to print URL\n2. Observe",
    "N/A",
    "Browser print dialog auto-triggered OR print button present to trigger it.","Medium",""),

  // ── LT-TC-018 Status Tracking ─────────────────────────────────────────────
  row("LT-TC-018","LT-TC-018-01","Status Tracking & Journey Timeline","Status progresses correctly through full journey","Gate Pass Detail",
    "None",
    "1. Create LT pass\n2. Approve\n3. Security Gate OUT\n4. Security Gate IN",
    "N/A",
    "Status sequence: PENDING_APPROVAL → APPROVED → GATE_OUT → COMPLETED","Critical",""),

  row("LT-TC-018","LT-TC-018-02","Status Tracking & Journey Timeline","Pass detail shows approval timestamp","Gate Pass Detail",
    "Pass approved",
    "1. Approve pass\n2. View detail",
    "N/A",
    "Approved date/time displayed on pass detail.","High",""),

  row("LT-TC-018","LT-TC-018-03","Status Tracking & Journey Timeline","Pass detail shows actual departure date/time (real-time stamp)","Gate Pass Detail",
    "Gate OUT confirmed",
    "1. Confirm Gate OUT at specific time\n2. View pass",
    "Confirmation time: 14:30 on 2026-03-28",
    "Departure Date: 2026-03-28. Departure Time: 14:30 (actual time, may differ from planned).","Critical",""),

  row("LT-TC-018","LT-TC-018-04","Status Tracking & Journey Timeline","Vehicle Report — LT pass journey history","Vehicle Report",
    "Completed LT pass",
    "1. Navigate to Vehicle Report\n2. Search for vehicle",
    "N/A",
    "LT pass appears in journey history with from→to, date, status, security officers.","Medium",""),

  row("LT-TC-018","LT-TC-018-05","Status Tracking & Journey Timeline","Vehicle Report — only Journey History scrolls","Vehicle Report",
    "Multiple journey entries",
    "1. Open vehicle report with many history entries",
    "N/A",
    "Only Journey History table scrolls. Vehicle summary card and title stay fixed.","Medium",""),

  // ── LT-TC-019 Search & Filter ─────────────────────────────────────────────
  row("LT-TC-019","LT-TC-019-01","Search & Filter","Search by GP number — exact match","Gate Pass List",
    "Pass GP-0100 exists",
    "1. Enter GP-0100 in search",
    "Search: GP-0100",
    "Exact pass returned.","High",""),

  row("LT-TC-019","LT-TC-019-02","Search & Filter","Search by GP number — partial match","Gate Pass List",
    "Multiple passes exist",
    "1. Enter partial number",
    "Search: GP-01",
    "All passes starting with GP-01 returned.","High",""),

  row("LT-TC-019","LT-TC-019-03","Search & Filter","Search — empty string returns all","Gate Pass List",
    "Multiple passes",
    "1. Clear search field",
    "Search: (empty)",
    "All passes for the user's role shown (paginated).","Medium",""),

  row("LT-TC-019","LT-TC-019-04","Search & Filter","Search — no results","Gate Pass List",
    "No matching passes",
    "1. Enter non-existent GP number",
    "Search: GP-9999",
    "'No passes found' state shown.","Medium",""),

  row("LT-TC-019","LT-TC-019-05","Search & Filter","Filter + Search combined","Gate Pass List",
    "Various passes",
    "1. Set filter to LOCATION_TRANSFER\n2. Enter vehicle search",
    "Filter: LT\nSearch: CAA-1234",
    "Returns only LT passes with that vehicle.","High",""),

  row("LT-TC-019","LT-TC-019-06","Search & Filter","Status filter clears on page refresh","Gate Pass List",
    "Filter applied",
    "1. Apply status filter\n2. Refresh page",
    "N/A",
    "Filter resets to default (ALL) or persists. Verify intended behaviour.","Medium",""),

  // ── LT-TC-020 Usability ───────────────────────────────────────────────────
  row("LT-TC-020","LT-TC-020-01","Usability Testing","Loading states shown during data fetch","All Pages",
    "Slow network (throttled)",
    "1. Open any list page on slow network",
    "Network: Slow 3G",
    "Loading spinner or skeleton shown. No blank screen.","Medium",""),

  row("LT-TC-020","LT-TC-020-02","Usability Testing","Submit button shows loading state","Create Gate Pass",
    "Form filled",
    "1. Click Submit\n2. Observe button during API call",
    "N/A",
    "Button shows spinner and is disabled during submission. Prevents double-submit.","High",""),

  row("LT-TC-020","LT-TC-020-03","Usability Testing","Slide-to-confirm shows progress","Security Gate",
    "Pass in Gate OUT queue",
    "1. Start dragging slider\n2. Observe visual feedback",
    "N/A",
    "Slider moves with drag. Progress visible. Animation indicates readiness to confirm.","Medium",""),

  row("LT-TC-020","LT-TC-020-04","Usability Testing","Error messages are specific and actionable","Create Gate Pass",
    "Submit with missing fields",
    "1. Submit incomplete form",
    "N/A",
    "Error messages appear inline next to each field. Not generic 'Error occurred'.","High",""),

  row("LT-TC-020","LT-TC-020-05","Usability Testing","Toast notification shown after Gate OUT confirmation","Security Gate",
    "Gate OUT confirmed",
    "1. Confirm Gate OUT",
    "N/A",
    "Success toast shown. Auto-dismisses after ~3.5 seconds.","Medium",""),

  row("LT-TC-020","LT-TC-020-06","Usability Testing","Toast shown on failed action","Security Gate",
    "Network error during confirm",
    "1. Simulate network failure\n2. Attempt Gate OUT",
    "N/A",
    "Error toast shown. Slider resets to start. User can retry.","High",""),

  row("LT-TC-020","LT-TC-020-07","Usability Testing","Dark mode — all LT screens readable","All LT Screens",
    "Dark mode enabled",
    "1. Enable dark mode\n2. Navigate through all LT screens",
    "N/A",
    "All text, badges, buttons, inputs readable in dark mode. No invisible text.","Medium",""),

  row("LT-TC-020","LT-TC-020-08","Usability Testing","Light mode — all LT screens readable","All LT Screens",
    "Light mode enabled",
    "1. Enable light mode\n2. Navigate all LT screens",
    "N/A",
    "All elements visible and readable in light mode.","Medium",""),

  row("LT-TC-020","LT-TC-020-09","Usability Testing","Confirmation modal before destructive action","Gate Pass List",
    "PENDING pass exists",
    "1. Click Cancel pass",
    "N/A",
    "Confirmation modal appears with clear warning. Cancel and Confirm buttons shown.","High",""),

  row("LT-TC-020","LT-TC-020-10","Usability Testing","Responsive — mobile viewport (375px)","Create Gate Pass",
    "Mobile device or resized browser",
    "1. Resize browser to 375px\n2. Navigate to Create Gate Pass",
    "Viewport: 375px",
    "Form fields stack vertically. No overflow. All fields accessible.","Medium",""),

  row("LT-TC-020","LT-TC-020-11","Usability Testing","Responsive — tablet viewport (768px)","Create Gate Pass",
    "Tablet or resized browser",
    "1. Resize to 768px\n2. Navigate Create Gate Pass",
    "Viewport: 768px",
    "Layout adapts. All fields usable.","Medium",""),

  row("LT-TC-020","LT-TC-020-12","Usability Testing","Keyboard navigation — tab through form","Create Gate Pass",
    "Desktop browser",
    "1. Use Tab key to navigate form fields",
    "N/A",
    "All fields accessible via keyboard. Tab order is logical.","Medium","Accessibility"),

  row("LT-TC-020","LT-TC-020-13","Usability Testing","Security Gate — Gate mode toggle (OUT / IN / BOTH)","Security Gate",
    "Logged in as Security Officer",
    "1. Toggle between OUT, IN, BOTH modes",
    "N/A",
    "Queue filters correctly. BOTH shows all. Selection persists across page refreshes.","High",""),

  row("LT-TC-020","LT-TC-020-14","Usability Testing","Animation — page transitions smooth","All Pages",
    "Navigating between pages",
    "1. Navigate between Create, List, Detail, Security pages",
    "N/A",
    "Smooth fade/slide animations. No layout shift or flicker.","Low",""),

  // ── LT-TC-021 Performance ─────────────────────────────────────────────────
  row("LT-TC-021","LT-TC-021-01","Performance Testing","Gate Pass List loads within 3 seconds","Gate Pass List",
    "100+ passes in database",
    "1. Login\n2. Navigate to Gate Pass list\n3. Measure load time",
    "100 passes",
    "Page fully loaded < 3 seconds.","Medium",""),

  row("LT-TC-021","LT-TC-021-02","Performance Testing","Create form submits within 2 seconds","Create Gate Pass",
    "Valid LT form filled",
    "1. Submit complete LT form\n2. Measure response time",
    "Valid data",
    "API responds and redirect occurs < 2 seconds.","Medium",""),

  row("LT-TC-021","LT-TC-021-03","Performance Testing","Security Gate dashboard loads within 3 seconds","Security Gate",
    "50+ approved passes",
    "1. Login as Security Officer\n2. Open Security Gate\n3. Measure",
    "50 pending passes",
    "Page loads and queues render < 3 seconds.","Medium",""),

  row("LT-TC-021","LT-TC-021-04","Performance Testing","Auto-refresh does not degrade performance","Security Gate",
    "Dashboard open for 10 minutes",
    "1. Leave Security Gate open for 10+ minutes",
    "Refresh every 30s",
    "No memory leak. Page remains responsive. No slowdown after repeated refreshes.","Medium",""),

  row("LT-TC-021","LT-TC-021-05","Performance Testing","Concurrent users — 10 simultaneous submissions","Create Gate Pass",
    "10 test users",
    "1. Submit 10 LT passes simultaneously",
    "10 concurrent submissions",
    "All 10 passes created successfully. No data corruption. Unique GP numbers assigned.","Medium",""),

  row("LT-TC-021","LT-TC-021-06","Performance Testing","Pagination — 1000 passes paginated correctly","Gate Pass List",
    "1000 passes in DB",
    "1. Navigate through all pages",
    "1000 passes, 20 per page",
    "50 pages. Each page loads correctly. No duplicate entries across pages.","Medium",""),

  row("LT-TC-021","LT-TC-021-07","Performance Testing","Notification delivery within 5 seconds","Notifications",
    "Gate pass approved",
    "1. Approve pass\n2. Measure time until notification appears",
    "N/A",
    "Notification visible within 5 seconds or on next poll/page load.","Medium",""),

  row("LT-TC-021","LT-TC-021-08","Performance Testing","Vehicle lookup — results in under 1 second","Create Gate Pass",
    "500+ vehicles in system",
    "1. Type vehicle registration\n2. Measure dropdown response",
    "500 vehicles",
    "Search results appear < 1 second after typing.","Medium",""),

  row("LT-TC-021","LT-TC-021-09","Performance Testing","Print view renders within 2 seconds","Print View",
    "APPROVED pass",
    "1. Navigate to print view",
    "N/A",
    "Print-optimised view renders < 2 seconds.","Medium",""),

  // ── LT-TC-022 Security Testing ────────────────────────────────────────────
  row("LT-TC-022","LT-TC-022-01","Security Testing","Unauthenticated API call to GET passes","API",
    "No session",
    "1. Make GET request to /api/gate-pass without auth token",
    "No session cookie",
    "401 Unauthorized returned.","Critical",""),

  row("LT-TC-022","LT-TC-022-02","Security Testing","Unauthenticated PATCH on pass status","API",
    "No session",
    "1. Make PATCH to /api/gate-pass/{id}/status without auth",
    "{action:'approve'}",
    "401 Unauthorized returned.","Critical",""),

  row("LT-TC-022","LT-TC-022-03","Security Testing","INITIATOR attempts approve via API","API",
    "Logged in as INITIATOR",
    "1. Make PATCH with approve action as INITIATOR",
    "{action:'approve'}",
    "403 Unauthorized. Only APPROVER can approve.","Critical",""),

  row("LT-TC-022","LT-TC-022-04","Security Testing","INITIATOR attempts security_gate_out via API","API",
    "Logged in as INITIATOR",
    "1. Make PATCH with security_gate_out action",
    "{action:'security_gate_out'}",
    "403 Unauthorized. Only SECURITY_OFFICER.","Critical",""),

  row("LT-TC-022","LT-TC-022-05","Security Testing","IDOR — Initiator accesses another user's pass ID","API",
    "Two initiators exist",
    "1. Initiator A gets Initiator B's pass ID\n2. Attempts to gate_out B's pass",
    "Initiator B's pass ID",
    "403 Forbidden. createdById !== session.user.id.","Critical",""),

  row("LT-TC-022","LT-TC-022-06","Security Testing","SQL injection in search field","Gate Pass List",
    "Logged in",
    "1. Enter SQL injection in search",
    "Search: ' OR 1=1 --",
    "Treated as literal string. Parameterised query. No data leak.","Critical",""),

  row("LT-TC-022","LT-TC-022-07","Security Testing","XSS in form fields","Create Gate Pass",
    "Logged in as INITIATOR",
    "1. Enter script in vehicle field\n2. Submit\n3. View list",
    "Vehicle: <script>alert(1)</script>",
    "Input stored as plain text. Not executed when displayed.","Critical",""),

  row("LT-TC-022","LT-TC-022-08","Security Testing","XSS in rejection reason","Approvals",
    "Approver rejects",
    "1. Enter script in rejection reason",
    "<img src=x onerror=alert(1)>",
    "Stored and displayed as escaped text. Not executed.","Critical",""),

  row("LT-TC-022","LT-TC-022-09","Security Testing","Sensitive data not in URL","All Pages",
    "Logged in",
    "1. Navigate all LT pages\n2. Check URLs",
    "N/A",
    "No passwords, tokens, or sensitive data in URL query params.","High",""),

  row("LT-TC-022","LT-TC-022-10","Security Testing","Session cookie — HttpOnly flag","Browser DevTools",
    "Logged in",
    "1. Inspect session cookie in browser DevTools",
    "N/A",
    "Session cookie has HttpOnly flag set. Not accessible via JavaScript.","High",""),

  row("LT-TC-022","LT-TC-022-11","Security Testing","CSRF protection — forged cross-site request","API",
    "Logged in",
    "1. Attempt PATCH from a different origin without proper headers",
    "N/A",
    "Request rejected. CSRF protection via NextAuth in place.","High",""),

  row("LT-TC-022","LT-TC-022-12","Security Testing","Rate limiting — rapid API calls","API",
    "Logged in",
    "1. Make 100 rapid API calls to gate pass list",
    "100 calls in 5 seconds",
    "Rate limiting throttles excessive requests. Server handles gracefully without crash.","High",""),

  row("LT-TC-022","LT-TC-022-13","Security Testing","Force-complete a PENDING pass via API","API",
    "Logged in as INITIATOR",
    "1. Attempt PATCH with security_gate_in on PENDING pass",
    "PENDING pass",
    "400 error. 'Not eligible' or status guard rejects.","Critical",""),

  // ── LT-TC-023 Compatibility ───────────────────────────────────────────────
  row("LT-TC-023","LT-TC-023-01","Compatibility Testing","Google Chrome (latest) — full LT journey","All LT Screens",
    "Chrome latest version",
    "1. Complete full LT journey on Chrome",
    "N/A",
    "All screens render. All actions work. Animations play.","High",""),

  row("LT-TC-023","LT-TC-023-02","Compatibility Testing","Mozilla Firefox (latest) — full LT journey","All LT Screens",
    "Firefox latest",
    "1. Complete full LT journey on Firefox",
    "N/A",
    "All screens functional. No browser-specific errors.","High",""),

  row("LT-TC-023","LT-TC-023-03","Compatibility Testing","Microsoft Edge (latest) — full LT journey","All LT Screens",
    "Edge latest",
    "1. Complete full LT journey on Edge",
    "N/A",
    "All screens functional. No layout issues.","High",""),

  row("LT-TC-023","LT-TC-023-04","Compatibility Testing","Safari (macOS) — full LT journey","All LT Screens",
    "Safari latest",
    "1. Complete full LT journey on Safari",
    "N/A",
    "All screens functional. Date/time pickers work correctly.","High",""),

  row("LT-TC-023","LT-TC-023-05","Compatibility Testing","Mobile Chrome (Android) — create LT pass","Create Gate Pass",
    "Android phone, Chrome",
    "1. Open Create Gate Pass on Android\n2. Complete and submit LT form",
    "N/A",
    "Form usable on mobile. Touch interactions work. Dropdown selections work.","High",""),

  row("LT-TC-023","LT-TC-023-06","Compatibility Testing","Mobile Safari (iOS) — create LT pass","Create Gate Pass",
    "iPhone, Safari",
    "1. Open Create Gate Pass on iPhone\n2. Complete and submit",
    "N/A",
    "Form usable. Date picker works natively or via component.","High",""),

  row("LT-TC-023","LT-TC-023-07","Compatibility Testing","Security Gate — slide-to-confirm on touch device","Security Gate",
    "Mobile / tablet",
    "1. Open Security Gate on tablet\n2. Attempt slide-to-confirm",
    "N/A",
    "Touch slide works. Slider responds to swipe gesture. Confirmation triggered.","High",""),

  row("LT-TC-023","LT-TC-023-08","Compatibility Testing","Windows tablet — Security Gate dashboard","Security Gate",
    "Windows tablet",
    "1. Open Security dashboard on Windows tablet",
    "N/A",
    "Layout adjusts for tablet screen. Queues visible. Slide works.","Medium",""),

  row("LT-TC-023","LT-TC-023-09","Compatibility Testing","Dark mode — OS-level dark mode respected","All Screens",
    "OS dark mode enabled",
    "1. Set OS to dark mode\n2. Open app",
    "N/A",
    "App switches to dark theme automatically or manual toggle works.","Medium",""),

  row("LT-TC-023","LT-TC-023-10","Compatibility Testing","High-DPI / Retina display — sharp rendering","All Screens",
    "Retina MacBook or 4K display",
    "1. View all LT screens on high-DPI display",
    "N/A",
    "DIMO logo sharp. No pixelation. All text crisp.","Medium",""),

  row("LT-TC-023","LT-TC-023-11","Compatibility Testing","Zoom — 150% browser zoom level","All LT Screens",
    "Browser zoomed to 150%",
    "1. Set browser zoom to 150%\n2. Navigate all LT screens",
    "Zoom: 150%",
    "No horizontal scroll overflow. Layout adapts. All elements accessible.","Medium",""),

  row("LT-TC-023","LT-TC-023-12","Compatibility Testing","Screen reader accessibility — form labels","Create Gate Pass",
    "Screen reader enabled (NVDA/JAWS)",
    "1. Enable screen reader\n2. Tab through Create Gate Pass form",
    "N/A",
    "All fields announced with correct labels. Required fields flagged.","Medium","Accessibility"),
];

// ── Build workbook ──────────────────────────────────────────────────────────
const wb = XLSX.utils.book_new();

// Worksheet 1: All test cases
const wsData = [HEADERS, ...testCases];
const ws = XLSX.utils.aoa_to_sheet(wsData);

// Column widths
ws["!cols"] = [
  { wch: 14 },  // Test Case ID
  { wch: 18 },  // Sub ID
  { wch: 40 },  // Description
  { wch: 45 },  // Scenario
  { wch: 28 },  // Screen
  { wch: 40 },  // Pre-conditions
  { wch: 55 },  // Test Steps
  { wch: 40 },  // Test Data
  { wch: 55 },  // Expected Result
  { wch: 18 },  // Actual Result
  { wch: 14 },  // Status v1.0
  { wch: 12 },  // Priority
  { wch: 30 },  // Comments
];

// Row heights — header taller
ws["!rows"] = [{ hpt: 30 }];

// Freeze header row
ws["!freeze"] = { xSplit: 0, ySplit: 1, topLeftCell: "A2", activePane: "bottomLeft", state: "frozen" };

// Apply header styling + wrap all cells
const range = XLSX.utils.decode_range(ws["!ref"]);
for (let R = range.s.r; R <= range.e.r; R++) {
  for (let C = range.s.c; C <= range.e.c; C++) {
    const addr = XLSX.utils.encode_cell({ r: R, c: C });
    if (!ws[addr]) ws[addr] = { v: "", t: "s" };
    if (!ws[addr].s) ws[addr].s = {};
    ws[addr].s.alignment = { wrapText: true, vertical: "top" };
    if (R === 0) {
      ws[addr].s.font = { bold: true, color: { rgb: "FFFFFF" } };
      ws[addr].s.fill = { fgColor: { rgb: "0D1B2A" } };
      ws[addr].s.alignment = { horizontal: "center", vertical: "center", wrapText: true };
    }
  }
}

XLSX.utils.book_append_sheet(wb, ws, "LT Test Cases");

// Worksheet 2: Summary
const summaryData = [
  ["DIMO Gate Pass System — Location Transfer Test Case Summary"],
  [""],
  ["Version", "v1.0"],
  ["Flow", "Location Transfer (LT)"],
  ["Actors", "Initiator · Approver · Security Officer · Recipient"],
  ["Date", new Date().toLocaleDateString("en-GB")],
  [""],
  ["Test Group", "Test Case ID", "No. of Sub-Cases", "Priority"],
  ["Authentication & Login",          "LT-TC-001", 14, "Critical"],
  ["Role-Based Access Control",       "LT-TC-002", 10, "Critical"],
  ["Vehicle Field Validation",        "LT-TC-003",  9, "High"],
  ["Location Field Validation",       "LT-TC-004", 10, "High"],
  ["Date & Time Validation",          "LT-TC-005", 12, "High"],
  ["Transport & Carrier Validation",  "LT-TC-006", 12, "High"],
  ["Reason & Approver Validation",    "LT-TC-007",  8, "High"],
  ["Successful Submission",           "LT-TC-008",  9, "Critical"],
  ["Initiator View & Manage",         "LT-TC-009", 15, "High"],
  ["Approver — Approve Flow",         "LT-TC-010", 10, "Critical"],
  ["Approver — Reject Flow",          "LT-TC-011",  6, "High"],
  ["Resubmit After Rejection",        "LT-TC-012",  5, "High"],
  ["Security Officer — Gate OUT",     "LT-TC-013", 15, "Critical"],
  ["Security Officer — Gate IN",      "LT-TC-014", 10, "Critical"],
  ["Recipient",                       "LT-TC-015",  5, "High"],
  ["Notifications System",            "LT-TC-016",  6, "High"],
  ["Print Gate Pass",                 "LT-TC-017",  5, "Medium"],
  ["Status Tracking & Timeline",      "LT-TC-018",  5, "High"],
  ["Search & Filter",                 "LT-TC-019",  6, "High"],
  ["Usability Testing",               "LT-TC-020", 14, "Medium"],
  ["Performance Testing",             "LT-TC-021",  9, "Medium"],
  ["Security Testing",                "LT-TC-022", 13, "Critical"],
  ["Compatibility Testing",           "LT-TC-023", 12, "High"],
  [""],
  ["TOTAL TEST CASES", "", testCases.length, ""],
];

const wsSummary = XLSX.utils.aoa_to_sheet(summaryData);
wsSummary["!cols"] = [{ wch: 38 }, { wch: 14 }, { wch: 16 }, { wch: 12 }];
XLSX.utils.book_append_sheet(wb, wsSummary, "Summary");

// Output path
const outPath = path.join(__dirname, "..", "DIMO_LT_TestCases_v1.0.xlsx");
XLSX.writeFile(wb, outPath);
console.log("✅  Excel file generated:", outPath);
console.log("📊  Total sub-cases:", testCases.length);
