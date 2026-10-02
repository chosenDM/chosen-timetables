# Chosen Time Tables — Handover Prompt

Copy this prompt when continuing work with another developer or AI assistant.

---

## Handover prompt (paste as-is)

```
You are continuing work on Chosen Time Tables by Chosen Digital Solutions.

PRODUCT
- School timetable management & generation for Kenyan schools (CBC-oriented)
- Brand: Blue #1461C4 · Orange #F57231 · Green #2F7419
- Pricing: Monthly KSh 200 · Lifetime KSh 3,000

ARCHITECTURE (DO NOT REVERT)
- Frontend: React + Vite + TypeScript + Tailwind → deploy on Vercel
- Auth: Firebase Authentication (email/password)
- Database: Cloud Firestore
- Files: Firebase Storage
- Server: Firebase Cloud Functions (Paystack, platform admin)
- Payments: Paystack (secret key ONLY in Functions — never VITE_)

PROJECT LAYOUT
- client/          React app
- functions/       Cloud Functions (billing + platform)
- shared/          timetable-engine.ts, pdf.ts, types.ts
- firestore/       firestore.rules
- storage.rules
- docs/            PRODUCTION_DEPLOY.md, PAYSTACK.md, PLATFORM_ADMIN.md

WHAT IS ALREADY WORKING
- Auth: register, login, logout, password reset, protected routes
- School: profile, logo, departments, teachers, classes, learning areas, periods
- Availability matrix (available / preferred / unavailable)
- Allocations + HOD workflow (draft → submitted → under_review → approved/rejected)
- Timetable engine with hard constraints + constrained-first + BACKTRACKING
- Master / class / teacher views, lock/unlock, regenerate preserving locks
- PDF + CSV exports
- Exam + remedial modules
- Reports: class summary + teacher workload
- Users management (roles)
- Billing UI + initPayment / verifyPayment / paystackWebhook
- Platform admin at /platform (list/search schools, suspend/activate, settings, audit)
- Suspended school gate (data retained)
- Production checklist in docs/PRODUCTION_DEPLOY.md

CRITICAL RULES
1. Do not rewrite the timetable engine from scratch — improve it if needed.
2. Never put PAYSTACK_SECRET_KEY or secrets in frontend / VITE_ vars.
3. Never trust client-supplied schoolId or role alone — derive from Auth + membership docs.
4. School A must never read/write School B data.
5. Suspended schools: block workspace, do not delete data.
6. Only approved allocations feed generation (explicit rule).
7. Do not use mock data on required screens.
8. Do not declare features complete unless the full flow works.

KNOWN FOLLOW-UPS (optional)
- User invite via Cloud Function (Admin SDK) so admin session does not switch on createUser
- Drag-drop timetable editor with hard-constraint validation
- Richer timetable version restore UI
- Emulator rule tests before production
- Live Firebase + Vercel deploy (operator task)

BEFORE CHANGING CODE
1. Read docs/PRODUCTION_DEPLOY.md, docs/PAYSTACK.md, docs/PLATFORM_ADMIN.md, STATUS.md
2. Preserve shared/timetable-engine.ts behaviour unless fixing a real bug
3. Test generation + exports after engine changes
4. Keep brand colours and product name

DEFINITION OF DONE FOR NEW WORK
- End-to-end flow works with real Firestore data
- No secrets exposed
- No cross-school leakage
- Mobile-usable for the screens you touch
```

---

## Context for the next session

| Topic | Location |
|-------|----------|
| Install & run | `docs/INSTALLATION.md` |
| Go-live | `docs/PRODUCTION_DEPLOY.md` |
| Paystack | `docs/PAYSTACK.md` |
| Platform admin bootstrap | `docs/PLATFORM_ADMIN.md` |
| Status snapshot | `STATUS.md` |
| Engine | `shared/timetable-engine.ts` |
| Functions entry | `functions/src/index.ts` |

**Company:** Chosen Digital Solutions  
**Product:** Chosen Time Tables
