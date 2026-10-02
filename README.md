# Chosen Time Tables

School timetable management and generation system for Kenyan schools (CBC-oriented).

**Company:** Chosen Digital Solutions  
**Brand:** Blue `#1461C4` · Orange `#F57231` · Green `#2F7419`  
**Pricing:** Monthly KSh 200 · Lifetime KSh 3,000

## Architecture

- **Frontend:** Vercel · React + Vite + TypeScript + Tailwind
- **Auth:** Firebase Authentication (email/password)
- **Database:** Cloud Firestore
- **Storage:** Firebase Storage
- **Server:** Firebase Cloud Functions (Paystack, platform admin, privileged ops)
- **Payments:** Paystack

## Status

Phase 1 (Firebase foundation) is in progress.

- Preserved: timetable engine, PDF builder, TimetableGrid, domain model concepts
- New: Firebase Auth flows, protected routes, Firestore types, security rules skeleton, branded shell

See `docs/IMPLEMENTATION_MAP.md` for the full plan.

## Setup

1. Create a Firebase project and enable Authentication (Email/Password), Firestore, Storage.
2. Copy `.env.example` → `.env` and fill public Firebase config.
3. Deploy `firestore/firestore.rules`.
4. Install and run:

```bash
pnpm install   # or npm install
pnpm dev
```

Open http://localhost:3000

## Important security notes

- Never put secret keys in frontend code or `VITE_` variables.
- Authorization is derived from Firebase Auth UID + school membership documents.
- Client-supplied `schoolId` / role / departmentId must never be trusted alone.
- Platform secrets and Paystack secret key live only in Cloud Functions / Secret Manager.

## Legacy

The previous Manus OAuth + MySQL/Drizzle implementation has been replaced.  
Useful engine and PDF logic were ported into `shared/`.

## Production

See [docs/PRODUCTION_DEPLOY.md](docs/PRODUCTION_DEPLOY.md) for the full go-live checklist.
