// The Expo push token this device registered with the backend; removed again on sign-out
// so a shared phone stops getting the previous account's notifications.
let registered: string | null = null;

export const setRegisteredPushToken = (token: string | null) => { registered = token; };
export const getRegisteredPushToken = () => registered;
