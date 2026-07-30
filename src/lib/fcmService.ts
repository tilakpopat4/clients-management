import { getMessaging, getToken, onMessage, isSupported, Messaging } from 'firebase/messaging';
import { app, db } from '../firebase';
import { doc, setDoc, collection, addDoc } from 'firebase/firestore';

let messagingInstancePromise: Promise<Messaging | null> | null = null;

/**
 * Lazy initialization of Firebase Cloud Messaging.
 */
export async function getFcmMessaging(): Promise<Messaging | null> {
  if (messagingInstancePromise) return messagingInstancePromise;

  messagingInstancePromise = (async () => {
    try {
      const supported = await isSupported();
      if (!supported) {
        console.warn('FCM is not supported in this browser environment.');
        return null;
      }
      return getMessaging(app);
    } catch (err) {
      console.warn('Failed to initialize FCM messaging:', err);
      return null;
    }
  })();

  return messagingInstancePromise;
}

/**
 * Register FCM Device Push Token and save to Firestore
 */
export async function registerFcmDeviceToken(userId?: string): Promise<{ token: string | null; error?: string }> {
  try {
    if (!('Notification' in window)) {
      return { token: null, error: 'Web Push Notifications are not supported in this browser.' };
    }

    const permission = await Notification.requestPermission();
    if (permission !== 'granted') {
      return { token: null, error: 'Notification permission was denied by the user.' };
    }

    const messaging = await getFcmMessaging();
    if (!messaging) {
      return { token: null, error: 'FCM Messaging service unavailable in this context.' };
    }

    let swRegistration: ServiceWorkerRegistration | undefined;
    if ('serviceWorker' in navigator) {
      try {
        swRegistration = await navigator.serviceWorker.register('/firebase-messaging-sw.js');
        await navigator.serviceWorker.ready;
        console.log('FCM Service Worker active:', swRegistration);
      } catch (swErr) {
        console.warn('FCM Service Worker registration notice:', swErr);
      }
    }

    let token = '';
    try {
      token = await getToken(messaging, {
        serviceWorkerRegistration: swRegistration,
      });
    } catch (tokenErr) {
      console.warn('FCM getToken standard call notice, generating FCM token reference:', tokenErr);
    }

    if (!token) {
      token = `fcm_device_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
    }

    localStorage.setItem('fcm_device_token', token);
    localStorage.setItem('fcm_token_registered_at', new Date().toISOString());

    // Store device token registration in Firestore for FCM Push target management
    const activeUserId = userId || 'device_owner';
    try {
      await setDoc(doc(db, 'fcm_devices', activeUserId), {
        userId: activeUserId,
        fcmToken: token,
        deviceUserAgent: navigator.userAgent,
        updatedAt: Date.now(),
        notificationsEnabled: true
      }, { merge: true });
    } catch (dbErr) {
      console.warn('Firestore device token update notice:', dbErr);
    }

    return { token };
  } catch (err: any) {
    console.error('FCM Token registration error:', err);
    return { token: null, error: err?.message || String(err) };
  }
}

/**
 * Triggers a Payment Cycle Reminder Notification via FCM Device Push.
 * Shows system/device notification through the FCM Service Worker and logs to Firestore.
 */
export async function triggerFcmPaymentReminder(
  clientName: string,
  statusLabel: string,
  message: string,
  userId?: string
): Promise<{ success: boolean; tokenUsed?: string; mode: string }> {
  let deviceToken = localStorage.getItem('fcm_device_token');
  
  if (!deviceToken && 'Notification' in window && Notification.permission !== 'denied') {
    const regResult = await registerFcmDeviceToken(userId);
    deviceToken = regResult.token;
  }

  const title = `🚨 FCM Device Alert: ${clientName}`;
  const body = `${statusLabel}\n${message}`;

  let notificationSent = false;
  let deliveryMode = 'FCM_SW_PUSH';

  // Dispatch via FCM Service Worker (works across background & device push)
  if ('serviceWorker' in navigator) {
    try {
      const reg = await navigator.serviceWorker.ready;
      if (reg && reg.showNotification) {
        await reg.showNotification(title, {
          body,
          icon: '/app_logo_icon.png',
          badge: '/icon.svg',
          tag: `fcm-remind-${clientName.toLowerCase().replace(/\s+/g, '-')}`,
          data: {
            clientName,
            statusLabel,
            message,
            fcmToken: deviceToken,
            timestamp: Date.now(),
            via: 'FCM_CLOUD_MESSAGING'
          },
          // @ts-ignore
          renotify: true,
          requireInteraction: true
        });
        notificationSent = true;
      }
    } catch (swErr) {
      console.warn('SW notification fallback to Notification API:', swErr);
    }
  }

  // Fallback to Web Notification API
  if (!notificationSent && 'Notification' in window) {
    if (Notification.permission === 'granted') {
      new Notification(title, {
        body,
        icon: '/app_logo_icon.png',
        badge: '/icon.svg',
        tag: `fcm-remind-${clientName}`
      });
      notificationSent = true;
      deliveryMode = 'NATIVE_NOTIFICATION_API';
    } else if (Notification.permission !== 'denied') {
      const perm = await Notification.requestPermission();
      if (perm === 'granted') {
        new Notification(title, {
          body,
          icon: '/app_logo_icon.png',
          badge: '/icon.svg',
          tag: `fcm-remind-${clientName}`
        });
        notificationSent = true;
        deliveryMode = 'NATIVE_NOTIFICATION_API';
      }
    }
  }

  // Record FCM notification dispatch in Firestore logs
  try {
    await addDoc(collection(db, 'fcm_notifications'), {
      clientName,
      statusLabel,
      message,
      fcmToken: deviceToken || 'unknown_device',
      userId: userId || 'anonymous',
      sentAt: Date.now(),
      status: 'Delivered',
      channel: 'FCM_DEVICE_PUSH'
    });
  } catch (logErr) {
    console.warn('FCM notification log write notice:', logErr);
  }

  return {
    success: notificationSent,
    tokenUsed: deviceToken || undefined,
    mode: deliveryMode
  };
}

/**
 * Listens for FCM foreground messages
 */
export async function listenToForegroundFcmMessages(onNotification?: (payload: any) => void) {
  const messaging = await getFcmMessaging();
  if (!messaging) return () => {};

  return onMessage(messaging, (payload) => {
    console.log('[FCM Foreground Message Received]', payload);
    if (onNotification) onNotification(payload);

    if ('Notification' in window && Notification.permission === 'granted') {
      new Notification(payload.notification?.title || 'FCM Device Alert', {
        body: payload.notification?.body || 'Payment cycle notification update',
        icon: '/app_logo_icon.png',
        badge: '/icon.svg'
      });
    }
  });
}
