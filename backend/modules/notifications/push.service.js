const admin = require("firebase-admin");

let firebaseApp;

function getFirebaseApp() {
  if (firebaseApp) return firebaseApp;

  if (admin.apps.length > 0) {
    firebaseApp = admin.app();
    return firebaseApp;
  }

  const serviceAccountJson = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;

  if (!serviceAccountJson) {
    throw new Error("Firebase service account is not configured.");
  }

  const serviceAccount = JSON.parse(serviceAccountJson);

  firebaseApp = admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
  });

  return firebaseApp;
}

async function sendPush({ token, title, body, data = {} }) {
  if (!token || !title || !body) {
    throw new Error("Push token, title, and body are required.");
  }

  getFirebaseApp();

  const safeData = {};

  for (const [key, value] of Object.entries(data)) {
    if (value !== undefined && value !== null) {
      safeData[key] = String(value);
    }
  }

  return admin.messaging().send({
    token,
    notification: { title, body },
    data: safeData,
  });
}

module.exports = { sendPush };