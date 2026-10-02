# Platform Admin

**URL:** `/platform` (requires sign-in + platform admin UID)

## Bootstrap first admin

1. Sign up in the app and copy your Firebase Auth UID (Firebase Console → Authentication).
2. Either:
   - Set env `PLATFORM_ADMIN_UIDS=your-uid` on Cloud Functions, **or**
   - In Firestore create `platform/settings` with:
     ```json
     { "adminUids": ["your-firebase-uid"] }
     ```

## Capabilities

| Feature | Function |
|---------|----------|
| List / search schools + stats | `listSchools` |
| School detail | `getSchoolAdmin` |
| Suspend (data retained) | `suspendSchool` |
| Activate | `activateSchool` |
| Integration keys (masked) | `getPlatformSettings` / `updatePlatformSettings` |
| Audit log | `listPlatformAudit` |

Suspended schools keep all data; school users should be blocked from workspace (enforce via rules / client check on `accountStatus`).
