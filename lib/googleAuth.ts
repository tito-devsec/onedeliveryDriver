import Constants from 'expo-constants';
import { GoogleSignin, isErrorWithCode, isSuccessResponse, statusCodes } from '@react-native-google-signin/google-signin';

// OAuth "Web client" ID of the Firebase project (read from google-services.json in app.config.js).
// The backend verifies the ID token against this same client ID.
export const GOOGLE_WEB_CLIENT_ID: string | undefined = Constants.expoConfig?.extra?.googleWebClientId;

let configured = false;

/** Shows the Google account picker and returns an ID token for the backend, or null if cancelled. */
export async function getGoogleIdToken(): Promise<string | null> {
  if (!GOOGLE_WEB_CLIENT_ID) throw new Error("Google sign-in isn't set up yet.");
  if (!configured) {
    GoogleSignin.configure({ webClientId: GOOGLE_WEB_CLIENT_ID });
    configured = true;
  }
  try {
    await GoogleSignin.hasPlayServices({ showPlayServicesUpdateDialog: true });
    // Clear the previous Google session so the account picker always shows
    await GoogleSignin.signOut().catch(() => {});
    const res = await GoogleSignin.signIn();
    if (!isSuccessResponse(res)) return null;
    if (!res.data.idToken) throw new Error("Google didn't return an ID token.");
    return res.data.idToken;
  } catch (e) {
    if (isErrorWithCode(e)) {
      if (e.code === statusCodes.SIGN_IN_CANCELLED || e.code === statusCodes.IN_PROGRESS) return null;
      if (e.code === statusCodes.PLAY_SERVICES_NOT_AVAILABLE) throw new Error('Google sign-in needs Google Play Services on this phone.');
    }
    throw e;
  }
}
