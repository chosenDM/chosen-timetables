# Chosen Time Tables — Delivery Status

**Stage:** Production deploy checklist — complete

## This stage delivered

- [x] `docs/PRODUCTION_DEPLOY.md` — full go-live checklist
- [x] `storage.rules` — image uploads under `schools/{schoolId}/`
- [x] Steps for Firebase, Functions secrets, Paystack webhook, Vercel env, smoke tests, security checks

## Product status overview

| Area | Status |
|------|--------|
| Auth (email/password) | Done |
| School modules | Done |
| Availability + Allocations | Done |
| Timetable engine + backtracking | Done |
| PDF/CSV exports | Done |
| Exam + Remedial | Done |
| Reports | Done |
| Billing (Paystack Functions) | Done (configure secrets) |
| Platform admin | Done (bootstrap admin UID) |
| Users management | Done |
| Suspended school gate | Done |
| Production checklist | Done |

## Before first real customer

1. Deploy rules + functions + storage
2. Set Paystack secrets + webhook
3. Bootstrap `platform/settings.adminUids`
4. Deploy frontend to Vercel with `VITE_FIREBASE_*`
5. Run smoke test list in PRODUCTION_DEPLOY.md
