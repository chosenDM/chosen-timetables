# Pre-deploy checklist (before GitHub / Vercel)

## 1. Firebase Console

1. Project: `chosen-pos` (or yours)
2. **Authentication** → Email/Password enabled
3. **Firestore** created
4. **Storage** created (for logos)
5. Copy web config into local `.env` (`VITE_FIREBASE_*` only — never secret keys)

## 2. Platform admin access (fixes Access Denied)

In **Firestore** → create/edit document:

`platform/settings`

Fields:

| Field | Type | Example |
|-------|------|---------|
| `adminUids` | array | `["YOUR_FIREBASE_AUTH_UID"]` |
| `adminEmails` | array | `["you@email.com"]` |
| `termlyPriceKes` | number | `500` |
| `yearlyPriceKes` | number | `1400` |
| `lifetimePriceKes` | number | `5000` |

Find your UID: Authentication → Users → click your user → User UID.

## 3. Deploy backend

```bash
cd functions
npm install
npm run build
cd ..
firebase deploy --only firestore:rules,storage,functions
```

Optional secrets (recommended for live Paystack):

```bash
firebase functions:config:set paystack.secret_key="sk_live_..." 
# or use Google Cloud Secret Manager / env for 2nd gen:
# firebase functions:secrets:set PAYSTACK_SECRET_KEY
```

Also set `APP_URL` to your Vercel URL when live.

## 4. Local frontend test

```bash
cp .env.example .env   # fill VITE_FIREBASE_* only
pnpm install           # or npm install
pnpm dev               # http://localhost:3000
```

### Smoke tests

1. Register → create school  
2. Add departments, teachers, classes, learning areas, periods  
3. Allocations → approve → Timetables → Generate  
4. Preview class/teacher/master; PDF for **one** class on trial  
5. Second class PDF → upgrade message  
6. Open `/platform` as admin → schools list, Grant plan, settings  
7. Billing shows Termly / Yearly / Lifetime prices from settings  

## 5. Then GitHub → Vercel

- Push repo (do **not** commit `.env` or secret keys)
- Vercel: set `VITE_FIREBASE_*` env vars
- Point Firebase Auth authorized domains to your Vercel domain
- Set Functions `APP_URL` to production URL
- Redeploy functions after env changes

## Notes

- Timetable generation & preview work on **free trial**
- Only **one free class PDF** until paid / manually granted plan
- Platform admin is **UID or email** on `platform/settings`, not school role


## Security (tightened)

After pulling this build, **redeploy rules**:

```bash
firebase deploy --only firestore:rules,storage
```

Changes:
- School `plan` / `paymentStatus` / trial PDF fields cannot be changed from the client
- School docs readable only by members (or creator via `createdByUid`)
- Storage logos: only principal / timetable_admin of that school can upload
- Payments + subscriptionHistory: client write denied
