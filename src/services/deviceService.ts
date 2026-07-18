import { LocalNotifications } from '@capacitor/local-notifications';
import { Capacitor } from '@capacitor/core';

export const DeviceService = {
  async init() {
    if (!Capacitor.isNativePlatform()) return;

    // Request permissions
    const perm = await LocalNotifications.requestPermissions();
    if (perm.display !== 'granted') return;

    // Schedule a welcome notification
    const hasNotified = localStorage.getItem('welcome_notified');
    if (!hasNotified) {
      await LocalNotifications.schedule({
        notifications: [
          {
            title: "🚀 Sync 727 - ברוכים הבאים!",
            body: "האפליקציה הותקנה בהצלחה. בהצלחה בעונה!",
            id: 727,
            schedule: { at: new Date(Date.now() + 5000) },
            sound: 'beep.wav'
          }
        ]
      });
      localStorage.setItem('welcome_notified', 'true');
    }
  },
  getRemainingTime() {
    // Mock logic for the demo, could be based on a target date
    return "02:14:45";
  }
};
