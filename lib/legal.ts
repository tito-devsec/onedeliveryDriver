import * as WebBrowser from 'expo-web-browser';

// Public legal pages served by the backend (also used on the Play Store and Google sign-in screen)
const SITE = (process.env.EXPO_PUBLIC_API_URL || 'https://api.onedelivery.co.tz/api').replace(/\/api\/?$/, '');

export const LEGAL_URLS = {
  privacy: `${SITE}/privacy`,
  terms: `${SITE}/terms`,
  deleteAccount: `${SITE}/delete-account`,
};

export const openLegal = (url: string) => WebBrowser.openBrowserAsync(url).catch(() => {});
