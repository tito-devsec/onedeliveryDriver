import * as Speech from 'expo-speech';
import AsyncStorage from '@react-native-async-storage/async-storage';

// Spoken navigation prompts, with a mute switch the driver's choice is kept for
const KEY = 'nav_voice_muted';
let muted = false;
const listeners = new Set<(m: boolean) => void>();

AsyncStorage.getItem(KEY)
  .then((v) => {
    muted = v === '1';
    listeners.forEach((fn) => fn(muted));
  })
  .catch(() => {});

export const isVoiceMuted = () => muted;

export function setVoiceMuted(value: boolean) {
  muted = value;
  if (value) Speech.stop();
  listeners.forEach((fn) => fn(value));
  AsyncStorage.setItem(KEY, value ? '1' : '0').catch(() => {});
}

export function onVoiceMuted(fn: (m: boolean) => void): () => void {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

export function say(text: string) {
  if (muted || !text) return;
  Speech.stop();
  Speech.speak(text, { language: 'en-GB', rate: 0.98 });
}

export function stopSpeaking() {
  Speech.stop();
}
