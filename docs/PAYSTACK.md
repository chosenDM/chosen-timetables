# Paystack integration

## Functions

| Function | Type | Purpose |
|----------|------|---------|
| `initPayment` | Callable | Create pending payment + Paystack transaction; return `authorization_url` |
| `verifyPayment` | Callable | Verify reference after redirect; activate plan |
| `paystackWebhook` | HTTP | Handle `charge.success`; activate plan (duplicate-safe) |

## Security

- `PAYSTACK_SECRET_KEY` is **only** in Cloud Functions config / Secret Manager.
- Client never receives or stores the secret.
- Client never decides “payment successful” — always server-side verify.
- Webhook validates `x-paystack-signature` (HMAC SHA-512).
- Activation is **idempotent** (status `paid` short-circuits duplicates).
- Amount mismatch rejects activation.

## Configure secrets

```bash
# Firebase Functions params (v2)
firebase functions:secrets:set PAYSTACK_SECRET_KEY
# or params:
firebase functions:config:set  # legacy; prefer defineString + .env for emulators

# For local emulator, create functions/.env:
PAYSTACK_SECRET_KEY=sk_test_xxx
PAYSTACK_PUBLIC_KEY=pk_test_xxx
PAYSTACK_WEBHOOK_SECRET=sk_test_xxx   # often same as secret for signature
APP_URL=http://localhost:3000
```

Deploy:

```bash
cd functions && npm install && npm run build
firebase deploy --only functions
```

## Paystack dashboard

1. Settings → API Keys — copy test/live secret.
2. Settings → Webhooks — URL:
   `https://<region>-<project-id>.cloudfunctions.net/paystackWebhook`
3. Subscribe to event: **charge.success**.

## Flow

```
User clicks Pay
  → initPayment (auth + membership check)
  → pending payment doc in schools/{id}/payments
  → redirect to Paystack authorization_url
User pays
  → redirect to /app/billing?reference=...&schoolId=...
  → verifyPayment → activate plan
  AND/OR
  → paystackWebhook charge.success → activate plan
```

## Plans (KES)

| Plan | Amount |
|------|--------|
| Monthly | KSh 200 (20000 kobo) |
| Lifetime | KSh 3,000 (300000 kobo) |

## Test

Use Paystack test cards (e.g. `4084084084084081`) with any future expiry and CVV.
