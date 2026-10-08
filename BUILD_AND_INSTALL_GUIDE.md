# One Delivery Driver — Build & Production Install Guide

This guide takes the driver app from a fresh checkout to a working **APK** (for
direct install / sideloading) and **AAB** (for the Google Play Store), and
explains how it connects to the backend. Everything here has been verified
against this exact codebase.

---

## 0. What was fixed (so a production build actually works)

The app compiled, but a cloud build would have shipped **broken** for three
reasons. All are now fixed:

1. **Google Maps key was never resolved.** `app.json` is static JSON and cannot
   read environment variables, so the literal text `$EXPO_PUBLIC_GOOGLE_MAPS_ANDROID_KEY`
   was being written into the Android manifest — producing a gray, non-working
   map. Fixed by adding **`app.config.js`**, which resolves the real key at build
   time. (Verified: the manifest now contains the actual key value.)

2. **Public env vars were missing from cloud builds.** `.env` is gitignored, so
   EAS never received it — meaning the API URL, socket URL and Maps keys were
   `undefined` in production builds. Fixed by mirroring all `EXPO_PUBLIC_*`
   values into **`eas.json`** under each build profile's `env` block.

3. **Socket URL was wrong.** The backend's Socket.io server uses the default path
   and namespace mounted at the host root, but `.env` pointed the client at
   `…/socket`. Fixed: the socket URL is now the host root
   (`https://api.onedelivery.co.tz`).

Also: the Firebase `google-services.json` was misnamed (`google-services (1).json`)
and unreferenced — renamed, wired in via `app.config.js`, and un-ignored so EAS
receives it. A `production-apk` build profile was added so you can produce a
production-config APK in addition to the Play Store AAB.

---

## 1. Prerequisites

- **Node.js 20 or 22 LTS** and npm 10+ (`node -v`, `npm -v`).
- **EAS CLI**: `npm install -g eas-cli` then `eas login` (Expo account `titocode`,
  the project owner in `app.json`).
- For **local** Android builds only (optional): JDK 17 and Android Studio with the
  Android SDK. For cloud builds you need none of this.

---

## 2. Install dependencies

```bash
cd onedelivery-driver-app
npm install
```

This completes cleanly. The deprecation/audit warnings printed are from
transitive packages and are normal for an Expo SDK 54 project — **do not** run
`npm audit fix --force`, as it will pull in breaking versions.

Sanity checks (both pass on this codebase):

```bash
npx tsc --noEmit          # type-check, no errors
npx expo export --platform android   # full Metro bundle, succeeds
```

---

## 3. Configure secrets before a real build

The committed Google Maps key is a shared dev key. For production, replace it in
**two** places (keep them in sync):

- `eas.json` → every profile's `env` block (`EXPO_PUBLIC_GOOGLE_MAPS_*`,
  `EXPO_PUBLIC_GOOGLE_DIRECTIONS_KEY`), and the API/socket URLs.
- `.env` (used for local `expo start` / local builds).

In Google Cloud, the Android key must have **Maps SDK for Android** and
**Directions API** enabled, and ideally be restricted to the app's package name
`com.onedelivery.rider` and SHA-1 (get the SHA-1 from `eas credentials`).

> Tip: instead of plaintext in `eas.json`, you can store these as EAS environment
> variables: `eas env:create --name EXPO_PUBLIC_GOOGLE_MAPS_ANDROID_KEY --value <key>`.

---

## 4. Build the APK (direct install / sideloading)

A production-configured APK:

```bash
eas build --platform android --profile production-apk
```

A staging/internal APK (same thing, staging env):

```bash
eas build --platform android --profile preview
```

When the build finishes, EAS prints a download URL and a QR code. The output is a
single `.apk` file.

---

## 5. Build the AAB (Google Play Store)

```bash
eas build --platform android --profile production
```

This produces an **`.aab`** (Android App Bundle), the format Play requires.
`appVersionSource` is `remote` with `autoIncrement: true`, so EAS manages the
`versionCode` for you — no manual bumping needed between releases.

Submit to Play (after creating the app in Play Console and a service account):

```bash
# place your Play service account JSON at ./google-service-account.json (gitignored)
eas submit --platform android --profile production --latest
```

---

## 6. Local build alternative (no EAS servers)

If you prefer to build on your own machine (requires JDK 17 + Android SDK):

```bash
npx expo prebuild --platform android --clean
cd android

# APK:
./gradlew assembleRelease
# → android/app/build/outputs/apk/release/app-release.apk

# AAB:
./gradlew bundleRelease
# → android/app/build/outputs/bundle/release/app-release.aab
```

A release build must be signed. EAS handles signing automatically; for local
release builds, generate a keystore and configure
`android/app/build.gradle` signing configs (see Expo "Local app production
builds" docs). For quick on-device testing without signing setup, use
`./gradlew assembleDebug`.

---

## 7. Installing the APK on a device (production-ready)

**Option A — direct download (simplest):** open the EAS build URL on the Android
phone, download the APK, tap it, and allow "Install unknown apps" for your
browser/file manager when prompted. This is the normal path for distributing a
driver app outside the Play Store.

**Option B — via USB / ADB:**

```bash
adb install -r app-release.apk     # -r reinstalls/updates in place
```

**First-launch checklist on the device:**

- Grant **Location** ("Allow all the time" for background tracking), **Notifications**,
  and **Camera/Photos** (for document upload).
- The map on the home screen should render tiles (not gray). Gray = the Maps key
  is wrong, not enabled for Android, or restricted to the wrong package/SHA-1.
- Log in / register, then complete the driver application. Going online should
  flip your status (this exercises the Socket.io connection to the backend).

---

## 8. How the app fits the backend

The contract is aligned and verified against `onedelivery-backend`:

- **REST base**: `EXPO_PUBLIC_API_URL` = `https://<host>/api`. The app calls
  `/auth/login`, `/auth/register`, `/auth/refresh`, `/auth/me`, `/auth/logout`,
  `/driver/apply`, `/driver/application`, `/driver/profile`,
  `/notifications/token` — all present in the backend routes.
- **Auth**: backend returns `{ accessToken, refreshToken, user }`; the app stores
  tokens in SecureStore and auto-refreshes on 401 — matches the backend's
  `/auth/refresh` response shape.
- **Realtime**: `EXPO_PUBLIC_SOCKET_URL` = host root (no `/api`, no `/socket`).
  The app emits `driver:online`, `driver:offline`, `driver:location`; the server
  handles exactly these events and authenticates the socket with the JWT.

Backend bring-up (summary — see the backend's own `DEPLOYMENT_GUIDE.md` for full
detail): copy `.env.example` → `.env` and fill MySQL, Redis, JWT secrets, Snippe
keys, etc.; then:

```bash
cd onedelivery-backend
npm install
npm run db:migrate
npm run db:seed-admin   # creates the admin user
npm start
```

> Backend note: the `db:seed` script previously pointed at a missing file; it now
> runs the admin seeder. The `multer@1.x` advisory from `npm audit` is a known
> transitive issue and not a runtime blocker; upgrade to `multer@2` later if you
> want it cleared.

For production push notifications to actually deliver on Android, upload your
**FCM v1 service account** to the EAS project once (`eas credentials` →
Android → Push Notifications). The app uses Expo push tokens, so this is a
one-time deployment step, not a build requirement.

---

## 9. Troubleshooting

**`Failed to upload the project tarball … ECONNRESET`** (your original error):
this is a network drop during upload to Google Cloud Storage, not a code problem.
Retry the build; if it persists, disable VPN / HTTPS-inspecting antivirus, switch
networks (a phone hotspot is a good test), update the CLI (`npm i -g eas-cli`),
and confirm `node_modules` is excluded from the upload (it is, via `.gitignore`).

**Gray map / "Authorization failure":** Maps key not enabled for Maps SDK
Android, or restricted to the wrong package/SHA-1, or not present in the build
profile's `env`. Verify with `npx expo prebuild -p android --clean` then check
`android/app/src/main/AndroidManifest.xml` for the real key value.

**Socket won't connect:** confirm `EXPO_PUBLIC_SOCKET_URL` is the host root and
the backend is reachable over HTTPS/WSS; the JWT must be valid (the socket
middleware rejects missing/expired tokens).

**`expo-doctor` shows 2 failing checks about schema/Directory:** those are network
fetches to Expo's servers; they don't indicate a project defect.
