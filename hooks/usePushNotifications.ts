import { useEffect, useRef } from 'react';
import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import Constants from 'expo-constants';
import { useRouter } from 'expo-router';
import { post } from '../lib/api';
import { COLORS } from '../constants';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
  }),
});

// Shared with the shop app and the backend (pushes target this channel; it is also
// the app's default FCM channel). A channel's sound can't change once it exists on
// a phone, hence the new id for the OneDelivery chime.
const ANDROID_CHANNEL_ID = 'onedelivery_alerts';

async function ensureAndroidChannel() {
  if (Platform.OS !== 'android') return;
  await Notifications.setNotificationChannelAsync(ANDROID_CHANNEL_ID, {
    name: 'Trips & updates',
    importance: Notifications.AndroidImportance.MAX,
    vibrationPattern: [0, 250, 250, 250],
    lightColor: COLORS.primary,
    sound: 'onedelivery_notification.wav',
  });
}

async function registerForPush(): Promise<string | null> {
  if (!Device.isDevice) return null;
  await ensureAndroidChannel();

  const { status: existing } = await Notifications.getPermissionsAsync();
  let finalStatus = existing;
  if (existing !== 'granted') {
    const { status } = await Notifications.requestPermissionsAsync();
    finalStatus = status;
  }
  if (finalStatus !== 'granted') return null;

  const projectId =
    Constants?.expoConfig?.extra?.eas?.projectId ??
    Constants?.easConfig?.projectId;
  try {
    const token = (
      await Notifications.getExpoPushTokenAsync(
        projectId ? { projectId } : undefined
      )
    ).data;
    return token;
  } catch {
    return null;
  }
}

export function usePushNotifications(enabled: boolean) {
  const router = useRouter();
  const receivedRef = useRef<Notifications.EventSubscription | undefined>(undefined);
  const responseRef = useRef<Notifications.EventSubscription | undefined>(undefined);

  // Create the channel at launch so pushes always ring with the OneDelivery sound
  useEffect(() => { ensureAndroidChannel().catch(() => {}); }, []);

  useEffect(() => {
    if (!enabled) return;

    registerForPush().then((token) => {
      if (token) {
        post('/notifications/token', { token, type: 'expo' }).catch(() => {});
      }
    });

    responseRef.current = Notifications.addNotificationResponseReceivedListener(
      (response) => {
        const data = response.notification.request.content.data as {
          screen?: string;
          rideId?: string;
          type?: string;
        };
        if (data?.screen === 'driver_home' || data?.type === 'driver_approved') {
          router.replace('/(tabs)/home');
        } else if (data?.rideId) {
          router.push('/(tabs)/home');
        }
      }
    );

    return () => {
      receivedRef.current?.remove();
      responseRef.current?.remove();
    };
  }, [enabled, router]);
}
