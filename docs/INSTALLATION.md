# Chosen Time Tables — Installation Guide

## Requirements

- **Node.js** 20 or later
- **pnpm** (recommended) or npm
- A **Firebase** project (free Spark is enough to start; Blaze needed for Cloud Functions + Paystack)
- Optional: **Firebase CLI**, **Git**, **Vercel** account for production

---

## 1. Get the code

```bash
# From the complete ZIP
unzip chosen-time-tables-COMPLETE.zip
cd chosen-time-tables

# Or from GitHub (after you push)
git clone https://github.com/YOUR_USERNAME/chosen-time-tables.git
cd chosen-time-tables
```

---

## 2. Install dependencies

```bash
pnpm install
# or
npm install
```

For Cloud Functions (when you deploy them):

```bash
cd functions
npm install
cd ..
```

---

## 3. Create a Firebase project

1. Open [Firebase Console](https://console.firebase.google.com/)
2. **Add project** → name it (e.g. `chosen-time-tables`)
3. Disable Google Analytics if you do not need it (optional)
4. When the project is ready:

### Authentication
- **Build → Authentication → Get started**
- Sign-in method → **Email/Password** → Enable → Save

### Firestore
- **Build → Firestore Database → Create database**
- Start in **production mode**
- Choose a region close to Kenya if available (e.g. `europe-west` or nearest)

### Storage
- **Build → Storage → Get started**
- Use default rules for now; deploy `storage.rules` later

### Web app config
- Project settings (gear) → **Your apps** → Web (`</>`)
- Register app nickname → Copy the `firebaseConfig` values

---

## 4. Environment file

```bash
cp .env.example .env
```

Edit `.env` with your Firebase **public** config only:

```env
VITE_FIREBASE_API_KEY=...
VITE_FIREBASE_AUTH_DOMAIN=your-project.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=your-project-id
VITE_FIREBASE_STORAGE_BUCKET=your-project.appspot.com
VITE_FIREBASE_MESSAGING_SENDER_ID=...
VITE_FIREBASE_APP_ID=...
```

**Never** put Paystack secret keys or Admin SDK keys in `.env` with a `VITE_` prefix.

---

## 5. Deploy security rules (recommended before real data)

Install Firebase CLI if needed:

```bash
npm install -g firebase-tools
firebase login
firebase use your-project-id
```

If you do not have `firebase.json` yet, initialize:

```bash
firebase init
# Select Firestore, Functions, Storage as needed
# Point rules to firestore/firestore.rules and storage.rules
```

Deploy rules:

```bash
firebase deploy --only firestore:rules,storage
```

---

## 6. Run locally

```bash
pnpm dev
# or
npm run dev
```

Open **http://localhost:3000**

### First-time flow in the browser

1. **Register** an account  
2. **Create school** (School Profile) — you become Principal  
3. Add departments → teachers → classes → learning areas → periods  
4. Set availability (optional)  
5. Create allocations → approve them  
6. **Timetables → Generate**  
7. Export PDF/CSV, try reports, etc.

---

## 7. Cloud Functions (billing + platform admin)

Required for Paystack and `/platform` admin APIs.

```bash
cd functions
npm install
npm run build
cd ..
```

Set secrets (example):

```bash
firebase functions:secrets:set PAYSTACK_SECRET_KEY
# Also configure APP_URL, PLATFORM_ADMIN_UIDS as documented in docs/PAYSTACK.md
```

Deploy:

```bash
firebase deploy --only functions
```

### Bootstrap platform admin

1. Sign up in the app and copy your **Auth UID** (Firebase Console → Authentication → Users)  
2. In Firestore, create document `platform/settings`:

```json
{
  "adminUids": ["YOUR_FIREBASE_AUTH_UID"],
  "appUrl": "http://localhost:3000"
}
```

3. Open **http://localhost:3000/platform**

Details: `docs/PLATFORM_ADMIN.md` and `docs/PAYSTACK.md`.

---

## 8. Production (Vercel + Firebase)

Follow the full checklist:

→ **`docs/PRODUCTION_DEPLOY.md`**

Summary:

1. Deploy Firestore rules, Storage rules, Functions  
2. Push code to **GitHub**  
3. Import repo in **Vercel** → set `VITE_FIREBASE_*` env vars → deploy  
4. Add Vercel domain to Firebase Auth authorized domains  
5. Configure Paystack webhook to your Functions URL  
6. Switch Paystack to live keys when ready  

---

## 9. Useful scripts

| Command | Purpose |
|---------|---------|
| `pnpm dev` | Local frontend (port 3000) |
| `pnpm build` | Production frontend build → `dist/` |
| `pnpm test` | Run tests (engine tests in `shared/`) |
| `cd functions && npm run build` | Compile Cloud Functions |

---

## 10. Troubleshooting

| Problem | What to check |
|---------|----------------|
| Blank page / Firebase errors | `.env` values match Firebase project; restart `pnpm dev` |
| Permission denied on Firestore | Rules deployed; user is school member; school not suspended |
| Generate says no allocations | Approve allocations first (status = approved) |
| Paystack fails | Functions deployed; `PAYSTACK_SECRET_KEY` set; Blaze plan |
| `/platform` access denied | Your UID in `platform/settings.adminUids` or `PLATFORM_ADMIN_UIDS` |
| Logo upload fails | Storage enabled; `storage.rules` deployed |

---

## 11. Project structure (quick map)

```
chosen-time-tables/
├── client/src/          # React UI (pages, components, services)
├── functions/src/       # Paystack + platform admin
├── shared/              # Engine, types, PDF builder
├── firestore/           # Security rules
├── storage.rules
├── docs/                # Install, deploy, Paystack, platform, handover
├── package.json
├── vite.config.ts
└── .env.example
```

---

## Support references

| Doc | Use when |
|-----|----------|
| `docs/INSTALLATION.md` | This file — local setup |
| `docs/PRODUCTION_DEPLOY.md` | Going live |
| `docs/PAYSTACK.md` | Payments |
| `docs/PLATFORM_ADMIN.md` | Admin bootstrap |
| `docs/HANDOVER_PROMPT.md` | Hand off to another developer/AI |
| `STATUS.md` | What is done vs pending |
