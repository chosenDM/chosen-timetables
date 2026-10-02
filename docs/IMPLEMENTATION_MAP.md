# Chosen Time Tables — Implementation Map

**Product:** Chosen Time Tables by Chosen Digital Solutions  
**Target Architecture:** Vercel (React/Vite) + Firebase Auth + Firestore + Storage + Cloud Functions + Paystack  
**Brand:** Blue `#1461C4` · Orange `#F57231` · Green `#2F7419`  
**Pricing:** Monthly KSh 200 · Lifetime KSh 3,000

---

## EXISTING → PRESERVE → MIGRATE → FIX → COMPLETE → TEST

### PRESERVE (working logic to keep)
- `shared/timetable-engine.ts` — greedy + constrained-first + scoring + conflict reporting + doubles + locked entries
- `shared/pdf.ts` — dependency-free PDF builder concept
- `client/src/components/TimetableGrid.tsx` — grid component
- Data model concepts from legacy Drizzle schema
- Brand colours, product name, school-isolation principle
- Conflict explanation style and hard-constraint checks

### MIGRATE
| Old | New |
|-----|-----|
| Manus OAuth | Firebase Authentication (email/password) |
| MySQL / TiDB + Drizzle | Cloud Firestore |
| Express + tRPC | Client Firestore (secure rules) + Cloud Functions for privileged ops |
| Local/server storage | Firebase Storage |
| JWT / cookies | Firebase Auth tokens + custom claims where needed |

### FIX / IMPROVE
- Timetable engine: add backtracking / conflict-directed rescheduling (currently one-pass)
- Manual edit validation (never bypass hard constraints)
- HOD department isolation
- Full failure explanations with remedies
- Workload calculation from real entries

### COMPLETE (missing or partial)
- Full school modules UI (departments, teachers, classes, learning areas, periods, availability matrix, allocations with HOD workflow)
- Timetable versioning, lock/unlock, safe regeneration
- Exam timetable + Remedial timetable (full flow + PDF/CSV)
- Paystack (init, verify, webhook, activation) via Cloud Functions
- Platform owner admin (schools list, suspend/activate, audit, secure settings)
- Firestore + Storage security rules
- Reports (real data)
- Mobile-responsive layouts
- Audit logging

---

## PHASES

### PHASE 1 — Firebase Foundation (CURRENT)
- [ ] Project structure + package.json
- [ ] Firebase client SDK config
- [ ] Auth: register / login / logout / reset / protected routes
- [ ] Firestore data models + TypeScript types
- [ ] Security rules skeleton
- [ ] Cloud Functions skeleton
- [ ] Shared engine + PDF preserved
- [ ] Basic App shell + routing + brand theme

### PHASE 2 — Data & Core Modules
- School profile, departments, teachers, classes, learning areas, periods
- Availability matrix
- Subject allocation + HOD submit/review/approve/reject workflow

### PHASE 3 — Timetable Engine & Views
- Improve engine (reconciliation)
- Master / Class / Teacher / Summary views
- Manual edit + lock + versioning + regenerate
- PDF + CSV exports

### PHASE 4 — Exam, Remedial, Reports
- Full exam & remedial modules
- Reports from real data

### PHASE 5 — Billing & Platform Admin
- Paystack complete flow
- Trial handling
- Platform admin dashboard + suspension + audit + secure keys

### PHASE 6 — Security, QA, Production
- Rules testing, cross-school isolation, role tests
- Mobile + desktop QA
- End-to-end test with sample school
- Vercel deploy + Firebase production config

---

## Firestore Structure (target)

```
schools/{schoolId}
  - name, slug, schoolType, academicYear, term, county, contactEmail, phone, logoUrl
  - plan (trial|monthly|lifetime), paymentStatus, accountStatus (active|suspended)
  - createdAt, updatedAt, ...

schools/{schoolId}/users/{userId}
schools/{schoolId}/departments/{departmentId}
schools/{schoolId}/teachers/{teacherId}
schools/{schoolId}/classes/{classId}
schools/{schoolId}/learningAreas/{learningAreaId}
schools/{schoolId}/periods/{periodId}
schools/{schoolId}/allocations/{allocationId}
schools/{schoolId}/availability/{availabilityId}
schools/{schoolId}/timetables/{timetableId}
  schools/{schoolId}/timetables/{timetableId}/entries/{entryId}
schools/{schoolId}/timetableVersions/{versionId}
schools/{schoolId}/examTimetables/{examId}
schools/{schoolId}/remedialTimetables/{remedialId}
schools/{schoolId}/reports/{reportId}
schools/{schoolId}/auditLogs/{logId}

platform/
  settings/{doc}
  auditLogs/{logId}
  schools index / stats
```

Authorization is derived from Firebase Auth UID + school membership document + role.  
Never trust client-supplied schoolId / role / departmentId.
