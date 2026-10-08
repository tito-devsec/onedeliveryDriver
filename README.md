# One Delivery — Driver App

**"From Anywhere To You"** — the driver partner app for the One Delivery platform.

Built with **Expo SDK 54 · React Native 0.81 · Expo Router · Socket.io · React Query · react-native-maps**. Talks to the **One Delivery Express/MySQL backend** (REST + Socket.io + JWT) — the same backend that powers the customer app and admin panel.

---

## What it does

| Feature | Details |
|---|---|
| Auth | Email + password against `/api/auth/*`, JWT access + refresh, secure token storage, auto-refresh on 401 |
| Bolt-style registration | 4-step wizard: personal info → driver docs → vehicle → payout → submits to `/api/driver/apply` |
| Application review → GO LIVE | Home shows **"Application in review"**; once admin approves, it auto-switches to the **GO LIVE** button, and the driver is notified by push + email/SMS |
| Live location | GPS tracked while online, pushed to backend (`PUT /rides/driver/location`) and streamed over Socket.io so customers see the vehicle move in real time |
| Real-time requests | Socket `ride:new`/`new_ride_request` + 8s polling fallback; animated 25-second accept countdown |
| Live navigation | Google Directions route drawn on the map, live ETA/distance, plus one-tap hand-off to Google/Apple Maps turn-by-turn |
| Status progression | accepted → going_to_shop → picked_up → on_the_way → delivered, each notifying the customer |
| Earnings | Balance, total earnings, trips, today/week breakdown, payout history |
| Chat | Real-time customer chat over Socket.io |
| Push | Expo push token registered to `/api/notifications/token`; backend delivers via FCM (service account) / Expo |

OTP/phone verification is **intentionally off** for now (email/password auth). The environment is wired so it can be switched on later — see "Enabling OTP later" below.

---

## Quick start (development)

```bash
cp .env.example .env      # then edit values
npm install
npx expo start --clear
```

Run on a device with **Expo Go** (for quick UI) or a **development build** (required for maps + location + push to fully work):

```bash
npx expo run:android      # or: npm run android
npx expo run:ios          # macOS only
```

### `.env`

```env
EXPO_PUBLIC_API_URL=https://api.onedelivery.co.tz/api
EXPO_PUBLIC_SOCKET_URL=https://api.onedelivery.co.tz
EXPO_PUBLIC_GOOGLE_MAPS_ANDROID_KEY=...
EXPO_PUBLIC_GOOGLE_MAPS_IOS_KEY=...
EXPO_PUBLIC_GOOGLE_DIRECTIONS_KEY=...
EXPO_PUBLIC_ENABLE_OTP=false
```

> Android emulator reaches your local machine at `http://10.0.2.2:<port>`. A physical device must use your LAN IP or the deployed HTTPS URL.

---

## Project structure

```
app/
  _layout.tsx              # providers + auth/application-state routing guard
  index.tsx                # entry redirect
  (auth)/welcome.tsx       # branded hero (assets/welcome.png) + Sign in / Register
  (auth)/login.tsx         # email + password
  register/index.tsx       # 4-step Bolt-style registration → /api/driver/apply
  (tabs)/home.tsx          # map + GO LIVE + "Application in review" + live requests
  (tabs)/orders.tsx        # active + completed deliveries
  (tabs)/earnings.tsx      # earnings dashboard
  (tabs)/profile.tsx       # driver/vehicle/payout + sign out
  delivery/[id].tsx        # active delivery: live route, navigation, status
  chat/[id].tsx            # real-time customer chat
components/                # ui primitives, form controls, ride-request modal
context/AuthContext.tsx    # session, driver profile + application status
hooks/                     # location, ride requests, earnings, push
lib/                       # api (axios+JWT), socket, directions, storage
constants/ types/          # brand tokens + API types
assets/welcome.png         # ← swap with your own hero image any time
```

---

## Replacing the welcome image

The welcome screen loads `assets/welcome.png`. Drop in any image (the One Delivery van image is already there). Keep it roughly landscape; it's shown as a cover-fit hero.

---

## Enabling OTP later

Everything is structured so phone OTP can be added without rearchitecting:

- **App:** `EXPO_PUBLIC_ENABLE_OTP` flag exists. Add a `verify.tsx` step in `register/` and call new backend endpoints.
- **Backend:** `messaging.service.js` already has a provider-agnostic `sendSms()` (Africa's Talking / Twilio). Set `OTP_ENABLED=true` + provider creds, add `/api/auth/request-otp` and `/api/auth/verify-otp`, and reuse `sendSms()`.

See `DEPLOYMENT_GUIDE_DRIVER.md` for full hosting, APK/AAB and iOS build instructions.
