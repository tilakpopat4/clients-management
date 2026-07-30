// Firebase Cloud Messaging Service Worker for background device push notifications
importScripts('https://www.gstatic.com/firebasejs/9.23.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/9.23.0/firebase-messaging-compat.js');

firebase.initializeApp({
  apiKey: "AIzaSyChdcAiC6eDCMHxJLAtPwaNEG9q6_15cwc",
  authDomain: "gen-lang-client-0510777303.firebaseapp.com",
  projectId: "gen-lang-client-0510777303",
  storageBucket: "gen-lang-client-0510777303.firebasestorage.app",
  messagingSenderId: "521759239139",
  appId: "1:521759239139:web:cb170748315744323f0ed6"
});

const messaging = firebase.messaging();

messaging.onBackgroundMessage((payload) => {
  console.log('[firebase-messaging-sw.js] FCM Background message received:', payload);
  
  const notificationTitle = payload.notification?.title || `🚨 Overdue Payment Reminder (FCM Device Push)`;
  const notificationOptions = {
    body: payload.notification?.body || 'A client payment cycle requires immediate attention.',
    icon: '/app_logo_icon.png',
    badge: '/icon.svg',
    data: payload.data || {},
    tag: payload.data?.tag || 'fcm-payment-reminder',
    renotify: true,
    requireInteraction: true
  };

  self.registration.showNotification(notificationTitle, notificationOptions);
});

self.addEventListener('notificationclick', (event) => {
  console.log('[firebase-messaging-sw.js] Notification click received:', event.notification);
  event.notification.close();

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if (client.url && 'focus' in client) {
          return client.focus();
        }
      }
      if (clients.openWindow) {
        return clients.openWindow('/');
      }
    })
  );
});
