// app.config.js — dynamic Expo configuration.
//
// WHY THIS FILE EXISTS:
// A static app.json cannot interpolate environment variables. With app.json
// alone, the literal string "$EXPO_PUBLIC_GOOGLE_MAPS_ANDROID_KEY" was being
// written verbatim into AndroidManifest.xml, which breaks Google Maps (gray
// map / authorization failure) in the built app. This file resolves the Maps
// keys (and attaches the FCM google-services.json when present) at build time.
//
// Expo reads app.json first, then passes its contents to this function as
// `config`. We override only the env-dependent fields and return it.

const fs = require('fs');
const path = require('path');

// Maps keys come from the environment (EAS env vars or a local .env).
// The previous committed fallback key has been removed — never hardcode keys.
// Set them with:  eas env:create --name EXPO_PUBLIC_GOOGLE_MAPS_ANDROID_KEY ...
const ANDROID_MAPS_KEY = process.env.EXPO_PUBLIC_GOOGLE_MAPS_ANDROID_KEY || '';
const IOS_MAPS_KEY     = process.env.EXPO_PUBLIC_GOOGLE_MAPS_IOS_KEY || '';

if (!ANDROID_MAPS_KEY) {
  console.warn(
    '[app.config] EXPO_PUBLIC_GOOGLE_MAPS_ANDROID_KEY is not set — the map will be gray in the built app.'
  );
}

module.exports = ({ config }) => {
  // `config` is the resolved contents of app.json (the "expo" object).
  config.android = config.android || {};
  config.android.config = config.android.config || {};
  config.android.config.googleMaps = { apiKey: ANDROID_MAPS_KEY };

  config.ios = config.ios || {};
  config.ios.config = { ...(config.ios.config || {}), googleMapsApiKey: IOS_MAPS_KEY };

  // Firebase client config — Android needs it for push tokens, and it carries the
  // OAuth "Web client" ID that Google sign-in uses (present once Google sign-in is
  // enabled under Firebase → Authentication before downloading the file).
  config.extra = config.extra || {};
  const gsPath = path.join(__dirname, 'google-services.json');
  if (fs.existsSync(gsPath)) {
    config.android.googleServicesFile = './google-services.json';
    const gs = JSON.parse(fs.readFileSync(gsPath, 'utf8'));
    const oauthClients = [
      ...gs.client.flatMap((c) => c.oauth_client || []),
      ...gs.client.flatMap((c) => c.services?.appinvite_service?.other_platform_oauth_client || []),
    ];
    const webClient = oauthClients.find((o) => o.client_type === 3);
    if (webClient) config.extra.googleWebClientId = webClient.client_id;
  }
  if (process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID) config.extra.googleWebClientId = process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID;

  return config;
};
