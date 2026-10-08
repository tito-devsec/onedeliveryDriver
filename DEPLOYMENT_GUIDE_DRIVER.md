# One Delivery — Deployment Guide (Backend VPS + Driver App APK / AAB / iOS)

This single guide takes you from zero to a **live backend on a Hostinger VPS** and **published driver apps** for Android (APK for testing, AAB for Play Store) and iOS (App Store).

Three parts:

1. **Part A —** Host the backend on a Hostinger VPS (Ubuntu)
2. **Part B —** Build the Android APK and AAB
3. **Part C —** Build & publish the iOS app to the App Store

> Throughout, replace `onedelivery.co.tz` / `api.onedelivery.co.tz` with your real domain, and replace every `CHANGE_ME...` value.

---
---

# PART A — Host the backend on a Hostinger VPS

The backend is a Node.js (Express) API using **MySQL + Redis + Socket.io**, with **Cloudinary** for uploads, **Snippe** for payments, and **Firebase** for push notifications.

## A0. Buy & access the VPS

1. In Hostinger → **VPS** → choose a plan (2 vCPU / 4 GB RAM is comfortable; 1 vCPU / 2 GB works to start).
2. Choose OS template: **Ubuntu 24.04 LTS** (or Ubuntu 22.04). *Don't* pick a CyberPanel/control-panel template — a clean Ubuntu is simpler for Node.
3. Set a root password and note the VPS **public IP** (e.g. `203.0.113.10`).
4. SSH in from your computer:

```bash
ssh root@203.0.113.10
```

## A1. Point your domain at the VPS

In your DNS provider (or Hostinger's DNS for the domain), create **A records**:

| Type | Name | Value |
|---|---|---|
| A | `api` | `203.0.113.10` |
| A | `admin` | `203.0.113.10` |
| A | `@` (or `www`) | `203.0.113.10` |

DNS can take 5–60 minutes to propagate. Check with `ping api.onedelivery.co.tz`.

## A2. Create a non-root user (recommended)

```bash
adduser deploy
usermod -aG sudo deploy
# copy your SSH access to the new user, then continue as 'deploy'
su - deploy
```

## A3. Install Node.js 20, MySQL, Redis, Nginx, PM2

```bash
# System update
sudo apt update && sudo apt upgrade -y

# Node.js 20 LTS
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs

# Build tools (for native modules)
sudo apt install -y build-essential git

# MySQL
sudo apt install -y mysql-server
sudo systemctl enable --now mysql

# Redis
sudo apt install -y redis-server
sudo systemctl enable --now redis-server

# Nginx (reverse proxy + TLS)
sudo apt install -y nginx
sudo systemctl enable --now nginx

# PM2 (process manager)
sudo npm install -g pm2

# Verify
node -v && npm -v && mysql --version && redis-cli ping   # expect: PONG
```

## A4. Secure MySQL and create the database

```bash
sudo mysql_secure_installation     # set a root password, answer Y to the prompts
sudo mysql -u root -p
```

Inside the MySQL shell (use a strong password):

```sql
CREATE DATABASE onedelivery CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE USER 'onedelivery_user'@'localhost' IDENTIFIED BY 'CHANGE_ME_STRONG_DB_PASSWORD';
GRANT ALL PRIVILEGES ON onedelivery.* TO 'onedelivery_user'@'localhost';
FLUSH PRIVILEGES;
EXIT;
```

## A5. Secure Redis with a password

```bash
sudo nano /etc/redis/redis.conf
```

Find the `# requirepass foobared` line, uncomment it and set a password:

```
requirepass CHANGE_ME_REDIS_PASSWORD
```

Then:

```bash
sudo systemctl restart redis-server
redis-cli -a 'CHANGE_ME_REDIS_PASSWORD' ping   # expect: PONG
```

## A6. Upload the backend code

Option 1 — Git (recommended): push `onedelivery-backend` to a private repo, then:

```bash
cd ~
git clone https://github.com/youraccount/onedelivery-backend.git
cd onedelivery-backend
```

Option 2 — SCP from your machine (run locally, not on the VPS):

```bash
scp -r ./onedelivery-backend deploy@203.0.113.10:~/onedelivery-backend
```

## A7. Configure environment & secrets

The provided `.env` already has your temporary Cloudinary / Snippe / Google keys and freshly generated JWT secrets. On the server:

```bash
cd ~/onedelivery-backend
nano .env
```

Set the real values for these (everything else can stay for now):

```env
NODE_ENV=production
PORT=4000

DB_HOST=127.0.0.1
DB_NAME=onedelivery
DB_USER=onedelivery_user
DB_PASS=CHANGE_ME_STRONG_DB_PASSWORD        # same as A4

REDIS_HOST=127.0.0.1
REDIS_PORT=6379
REDIS_PASSWORD=CHANGE_ME_REDIS_PASSWORD     # same as A5

API_URL=https://api.onedelivery.co.tz
CLIENT_URL=https://onedelivery.co.tz
CORS_ORIGIN=https://onedelivery.co.tz,https://admin.onedelivery.co.tz

FIREBASE_SERVICE_ACCOUNT_PATH=./secrets/firebase-service-account.json
```

Confirm the Firebase key is present (it ships in `secrets/`):

```bash
ls -l secrets/firebase-service-account.json
```

> **Email/SMS:** leave `SMTP_*` blank and `OTP_ENABLED=false` for now. Driver-approval emails/SMS turn on automatically once you fill `SMTP_*` (e.g. a Hostinger Email/Gmail SMTP) — no code change needed. OTP is ready to wire later.

## A8. Install dependencies & run the database migration

```bash
npm install --omit=dev
npm run db:migrate     # creates all tables from src/config/schema.sql
```

(If a seed script exists: `npm run db:seed` to add an admin user / sample data.)

## A9. Start with PM2

```bash
pm2 start src/server.js --name onedelivery-api
pm2 save
pm2 startup            # run the command it prints, to auto-start on reboot
pm2 logs onedelivery-api   # watch logs; you should see "OneDelivery API v2 running on port 4000"
```

Quick local test on the VPS:

```bash
curl http://localhost:4000/api/health
# {"status":"ok","db":"connected","redis":"connected",...}
```

## A10. Nginx reverse proxy (HTTP → Node, with WebSocket support)

```bash
sudo nano /etc/nginx/sites-available/onedelivery
```

Paste (this proxies `api.` to Node and forwards Socket.io upgrades):

```nginx
server {
    listen 80;
    server_name api.onedelivery.co.tz;

    client_max_body_size 15M;   # allow document/photo uploads

    location / {
        proxy_pass http://127.0.0.1:4000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;          # WebSocket
        proxy_set_header Connection "upgrade";           # WebSocket
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_read_timeout 600s;
    }
}
```

Enable it and reload:

```bash
sudo ln -s /etc/nginx/sites-available/onedelivery /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx
```

## A11. Free HTTPS with Let's Encrypt

```bash
sudo apt install -y certbot python3-certbot-nginx
sudo certbot --nginx -d api.onedelivery.co.tz
# choose "redirect HTTP to HTTPS" when asked
```

Certbot auto-renews. Test:

```bash
curl https://api.onedelivery.co.tz/api/health
```

## A12. Firewall

```bash
sudo ufw allow OpenSSH
sudo ufw allow 'Nginx Full'
sudo ufw enable
sudo ufw status
```

> MySQL (3306) and Redis (6379) are **not** opened — they're only reached locally by the API. Keep it that way.

## A13. Snippe webhook

In your Snippe dashboard set the webhook URL to:

```
https://api.onedelivery.co.tz/api/payment/webhook
```

(The backend verifies the HMAC signature using `SNIPPE_WEBHOOK_SECRET`.)

## A14. (Optional) serve the admin panel

If you have the admin SPA build, the server already serves `../../admin/dist` in production. Put the built admin files there, or host the admin separately on `admin.onedelivery.co.tz` with its own Nginx block.

## A15. Updating the backend later

```bash
cd ~/onedelivery-backend
git pull            # or re-upload
npm install --omit=dev
npm run db:migrate  # safe: schema uses CREATE TABLE IF NOT EXISTS
pm2 restart onedelivery-api
```

### Backend is now live at `https://api.onedelivery.co.tz` ✅

Point the driver app's `.env`:

```env
EXPO_PUBLIC_API_URL=https://api.onedelivery.co.tz/api
EXPO_PUBLIC_SOCKET_URL=https://api.onedelivery.co.tz
```

---
---

# PART B — Build the Android app (APK + AAB)

We use **EAS Build** (Expo's cloud build service). You don't need Android Studio.

## B0. One-time prerequisites

```bash
# Install the EAS CLI globally
npm install -g eas-cli

# Create a free Expo account if you don't have one, then log in
eas login
```

## B1. Link the project to your Expo account

```bash
cd onedelivery-driver-app
eas init        # creates/links an EAS project and prints a projectId
```

Open `app.json` and set the `projectId` it gives you:

```json
"extra": { "eas": { "projectId": "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx" } }
```

## B2. Put production values in `.env`

Before a production build, make sure `.env` points at your **live HTTPS** backend and has real Google Maps keys:

```env
EXPO_PUBLIC_API_URL=https://api.onedelivery.co.tz/api
EXPO_PUBLIC_SOCKET_URL=https://api.onedelivery.co.tz
EXPO_PUBLIC_GOOGLE_MAPS_ANDROID_KEY=YOUR_REAL_ANDROID_KEY
EXPO_PUBLIC_GOOGLE_MAPS_IOS_KEY=YOUR_REAL_IOS_KEY
EXPO_PUBLIC_GOOGLE_DIRECTIONS_KEY=YOUR_REAL_DIRECTIONS_KEY
```

> In Google Cloud Console enable **Maps SDK for Android**, **Maps SDK for iOS**, and **Directions API**, and restrict the keys to your app's package/bundle ID.

## B3. Build an APK (for direct install / testing)

The `eas.json` already has a `preview` profile set to `buildType: apk`:

```bash
eas build --platform android --profile preview
```

When it finishes (~10–20 min), EAS prints a download URL. Download the `.apk`, send it to a phone, enable "Install unknown apps", and install. Great for distributing to test drivers without the Play Store.

## B4. Build an AAB (for the Play Store)

The `production` profile is set to `buildType: app-bundle`:

```bash
eas build --platform android --profile production
```

This produces a `.aab`. EAS will offer to generate and securely store your **Android Keystore** the first time — say **yes** (let EAS manage it). Download the `.aab`.

## B5. Publish to Google Play

1. Create a **Google Play Console** account (one-time $25): <https://play.google.com/console>
2. **Create app** → fill the listing (name "One Delivery Driver", description, category Maps & Navigation / Business).
3. Upload required assets: app icon (512×512), feature graphic (1024×500), at least 2 screenshots.
4. Complete **Data safety**, **Content rating**, **Privacy policy URL** (host a simple privacy page — Play requires it for location/background-location apps; you must justify background location use).
5. **Production** → **Create new release** → upload the `.aab` → roll out.

Optional automated submit (after configuring a Play service account in `eas.json`):

```bash
eas submit --platform android --profile production --latest
```

> **Background location note:** Google reviews apps that request `ACCESS_BACKGROUND_LOCATION`. In the Play Console you must record a short screen capture showing why the driver app needs location in the background (live trip tracking) or the release will be rejected.

---
---

# PART C — Build & publish the iOS app

iOS requires an **Apple Developer account** ($99/year): <https://developer.apple.com/programs/>. You do **not** need a Mac — EAS builds iOS in the cloud — but you **do** need the paid Apple account.

## C1. Prerequisites

```bash
npm install -g eas-cli
eas login
```

Make sure `app.json` has your iOS bundle id (already set):

```json
"ios": { "bundleIdentifier": "com.onedelivery.driver", "buildNumber": "1" }
```

## C2. Build for iOS

```bash
cd onedelivery-driver-app
eas build --platform ios --profile production
```

EAS will ask to log in with your **Apple ID** and will automatically:
- create the App ID,
- generate the distribution certificate & provisioning profile,
- build a signed `.ipa`.

Just answer the prompts (let EAS manage credentials). When done, EAS gives you the `.ipa` and stores the credentials.

## C3. Create the app in App Store Connect

1. Go to <https://appstoreconnect.apple.com> → **My Apps** → **+** → **New App**.
2. Platform iOS, name **One Delivery Driver**, primary language, bundle ID `com.onedelivery.driver`, SKU (any unique string).
3. Fill the listing: description, keywords, support URL, **privacy policy URL**, category (Navigation / Business).
4. Add screenshots for the required device sizes (6.7" and 6.5" iPhone at minimum) and a 1024×1024 icon (no alpha).
5. **App Privacy** → declare data collection (location, contact info) and that location is used for delivery tracking.

## C4. Submit the build

Automated (fill the `submit.production.ios` block in `eas.json` with your Apple ID, App Store Connect app ID, and Team ID first):

```bash
eas submit --platform ios --profile production --latest
```

Or manually upload the `.ipa` via **Transporter** (free Mac app) — but `eas submit` from any OS is easier.

## C5. TestFlight then release

1. After submit, the build appears in **App Store Connect → TestFlight** in ~10–30 min (after Apple processing).
2. Add internal testers (your drivers) via TestFlight to trial it immediately.
3. When ready, go to the app's **App Store** tab → select the build → **Submit for Review**. Apple review typically takes 1–3 days.

> **iOS background location:** in App Store Connect's review notes, explain that the app tracks driver location during active deliveries (matching the `UIBackgroundModes: location` and the usage-description strings already in `app.json`).

---
---

# How the approval → "GO LIVE" flow works end to end

1. Driver registers in the app → account created (`/api/auth/register`), then the 4-step form submits the application (`/api/driver/apply`). Status becomes **pending**.
2. The Home screen shows **"Application in review"** and quietly polls `/api/driver/application` every ~12s.
3. Admin opens the admin panel → **Driver Applications** → **Approve**.
4. Backend (`reviewDriverApplication`): sets the user's role to `driver`, creates the `driver_profiles` row with `is_approved = 1`, and notifies the driver via:
   - **Push** (FCM service account / Expo push), and
   - **Email + SMS** via `messaging.service.js` (once `SMTP_*` / SMS provider are configured — otherwise a silent no-op).
5. On the driver's phone the poll (or push tap) refreshes status → Home swaps the review card for the **GO LIVE** button.
6. Tap **GO LIVE** → `PUT /rides/driver/online`, Socket.io `driver:online`, GPS starts streaming → driver receives requests and the customer sees the vehicle move live.

---

# Troubleshooting

| Symptom | Fix |
|---|---|
| App "Network error" | `.env` `EXPO_PUBLIC_API_URL` must be the HTTPS URL on a real device; `10.0.2.2` only works on the Android emulator. Confirm `curl https://api.onedelivery.co.tz/api/health`. |
| Sockets not connecting | Ensure the Nginx block has the `Upgrade`/`Connection "upgrade"` headers (Part A10). |
| Map is blank | Google Maps key missing/unrestricted, or Maps SDK not enabled in Google Cloud. Use a **development build**, not Expo Go, for maps. |
| Push not received | Use an EAS **development/production build** (not Expo Go) and set the `projectId` in `app.json`. |
| Uploads fail (413) | Raise `client_max_body_size` in Nginx (set to 15M in Part A10). |
| `db:migrate` errors | Check `DB_*` values and that the MySQL user has privileges (Part A4). |
| Approval email/SMS not sending | Expected until you set `SMTP_*` (email) and `OTP_ENABLED`/`SMS_PROVIDER` creds. Push still works. |

---

**One Delivery — From Anywhere To You.**
