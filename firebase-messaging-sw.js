importScripts('https://www.gstatic.com/firebasejs/9.22.1/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/9.22.1/firebase-messaging-compat.js');

firebase.initializeApp({
  apiKey: "AIzaSyBbfgRnpUo4BYquhX2sBAyok2WX3fsfnMM",
  authDomain: "chunda-news.firebaseapp.com",
  projectId: "chunda-news",
  storageBucket: "chunda-news.firebasestorage.app",
  messagingSenderId: "872760222820",
  appId: "1:872760222820:web:5e316ef1eb27d5a7046b71"
});

const messaging = firebase.messaging();

messaging.onBackgroundMessage(payload => {
  const title = payload.notification?.title || "ताज़ा समाचार Alert";
  const options = {
    body: payload.notification?.body || "चूंडा क्षेत्र न्यूज़ पर नई खबर देखें।",
    icon: "https://cdn-icons-png.flaticon.com/512/2965/2965879.png",
    badge: "https://cdn-icons-png.flaticon.com/512/2965/2965879.png"
  };
  self.registration.showNotification(title, options);
});