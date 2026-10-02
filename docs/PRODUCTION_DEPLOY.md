# Chosen Time Tables — Production Deploy Checklist

**Stack:** Vercel (React/Vite) · Firebase Auth · Firestore · Storage · Cloud Functions · Paystack

---

## 1. Firebase project

- [ ] Create Firebase project (production; optional separate staging project)
- [ ] Enable **Authentication → Email/Password**
- [ ] Create **Firestore** database (production mode)
- [ ] Enable **Storage**
- [ ] Upgrade to Blaze plan (required for Cloud Functions + outbound Paystack calls)
- [ ] Register web app → copy config into Vercel env (`VITE_FIREBASE_*`)

### Authorized domains (Auth)

- [ ] `localhost`
- [ ] Your Vercel domain (e.g. `chosen-timetables.vercel.app`)
- [ ] Custom domain if any

---

## 2. Firestore rules & indexes

```bash
firebase deploy --only firestore:rules
```

- [ ] Deploy `firestore/firestore.rules`
- [ ] Confirm school isolation (user A cannot read school B)
- [ ] Confirm writes require `schoolIsActive`
- [ ] Platform collections remain admin-SDK / Functions only (`allow read, write: if false` on client)

### Suggested composite indexes (create if console prompts)

- `schools` ordered by `createdAt`
- `schools/{id}/payments` by `reference` / `createdAt`
- `schools/{id}/timetables` by `createdAt`
- `platform/auditLogs/entries` by `createdAt`

---

## 3. Storage rules

Create `storage.rules` (example):

```
rules_version = '2';
service firebase.storage {
  match /b/{bucket}/o {
    match /schools/{schoolId}/{allPaths=**} {
      allow read: if request.auth != null;
      allow write: if request.auth != null
        && request.resource.size < 5 * 1024 * 1024
        && request.resource.contentType.matches('image/.*');
    }
  }
}
```

- [ ] Deploy storage rules
- [ ] Test logo upload for school member only

---

## 4. Cloud Functions

```bash
cd functions
npm install
npm run build
firebase deploy --only functions
```

### Secrets / params

| Name | Purpose |
|------|---------|
| `PAYSTACK_SECRET_KEY` | Server-only Paystack secret |
| `PAYSTACK_PUBLIC_KEY` | Optional public key |
| `PAYSTACK_WEBHOOK_SECRET` | Webhook HMAC (often same as secret) |
| `APP_URL` | Frontend origin for callbacks |
| `PLATFORM_ADMIN_UIDS` | Comma-separated bootstrap admin UIDs |

```bash
firebase functions:secrets:set PAYSTACK_SECRET_KEY
# set others via params / .env for emulator
```

### Deployed functions

- [ ] `initPayment`
- [ ] `verifyPayment`
- [ ] `paystackWebhook`
- [ ] `listSchools` / `getSchoolAdmin` / `suspendSchool` / `activateSchool`
- [ ] `getPlatformSettings` / `updatePlatformSettings` / `listPlatformAudit`
- [ ] `health`

### Paystack dashboard

- [ ] Webhook URL: `https://<region>-<project>.cloudfunctions.net/paystackWebhook`
- [ ] Event: `charge.success`
- [ ] Test with test keys, then switch to live keys

---

## 5. Platform admin bootstrap

1. Register your user in the app
2. Copy Firebase Auth UID
3. Firestore → create `platform/settings`:

```json
{
  "adminUids": ["YOUR_UID"],
  "appUrl": "https://your-production-domain.com"
}
```

4. Open `/platform` and confirm access
5. Paste Paystack keys in Settings (secrets stored masked)

---

## 6. Vercel frontend

```bash
# Root of repo
pnpm install
pnpm build   # vite → dist/
```

### Vercel project settings

| Setting | Value |
|---------|--------|
| Framework | Vite |
| Root / build | As configured (`client` root in vite.config) |
| Build command | `pnpm build` or `npm run build` |
| Output directory | `dist` |
| Node | 20.x |

### Environment variables (Vercel)

```
VITE_FIREBASE_API_KEY=
VITE_FIREBASE_AUTH_DOMAIN=
VITE_FIREBASE_PROJECT_ID=
VITE_FIREBASE_STORAGE_BUCKET=
VITE_FIREBASE_MESSAGING_SENDER_ID=
VITE_FIREBASE_APP_ID=
```

**Never** set `PAYSTACK_SECRET_KEY` or any secret with `VITE_` prefix.

- [ ] Preview deploy
- [ ] Production deploy
- [ ] Custom domain + HTTPS

---

## 7. Smoke test (production)

End-to-end on a **test school**:

- [ ] Register / login / logout / password reset
- [ ] Create school (trial)
- [ ] Departments, teachers, classes, learning areas, periods
- [ ] Availability matrix
- [ ] Allocations → HOD submit → approve
- [ ] Generate timetable → conflicts panel
- [ ] Lock lesson → regenerate preserving locks
- [ ] Master / class / teacher views
- [ ] Export PDF + CSV
- [ ] Exam + remedial sessions
- [ ] Reports (class summary + workload)
- [ ] Billing init (test mode) → verify / webhook
- [ ] Platform: search school, suspend, confirm workspace blocked, activate
- [ ] Cross-school: confirm cannot read another school’s data

---

## 8. Security final checks

- [ ] No secrets in frontend bundle (`grep -r sk_live dist` should be empty)
- [ ] Firestore rules deny unauthenticated and cross-school access
- [ ] Suspended schools cannot write
- [ ] Platform settings secrets never returned unmasked
- [ ] Paystack amount verified server-side
- [ ] Webhook signature validated

---

## 9. Operations

- [ ] Firebase billing alerts
- [ ] Vercel deployment notifications
- [ ] Backup strategy (Firestore exports schedule)
- [ ] Support contact for suspended schools
- [ ] Document how to rotate Paystack keys (`/platform` → Settings)

---

## 10. Go-live

- [ ] Switch Paystack to **live** keys
- [ ] Update webhook to production Functions URL
- [ ] Announce URL to pilot schools
- [ ] Monitor Functions logs for first payments

---

## Quick command summary

```bash
# Frontend
pnpm install && pnpm build

# Firebase
firebase login
firebase use <project-id>
firebase deploy --only firestore:rules,functions,storage

# Vercel
vercel --prod
```

## Known production follow-ups

1. User invite via Cloud Function (Admin SDK) so admin session does not switch
2. Storage rules tightened to membership check (custom claims or token)
3. Firestore query indexes as usage grows
4. Optional: custom domain email for password reset templates
EOF
