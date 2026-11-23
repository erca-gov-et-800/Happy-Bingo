const fs = require('fs');
const path = require('path');

const {
    initializeApp,
    getApps,
    cert
} = require('firebase-admin/app');

const {
    getFirestore
} = require('firebase-admin/firestore');

const secretCandidates = [
    process.env.FIREBASE_KEY_PATH,
    '/etc/secrets/firebase_key.json',
    path.join(__dirname, 'firebase_key.json')
].filter(Boolean);

const keyPath = secretCandidates.find(candidate =>
    fs.existsSync(path.resolve(candidate))
);

if (!keyPath) {
    throw new Error(
        'Firebase service account file not found. Set FIREBASE_KEY_PATH.'
    );
}

const serviceAccount = require(path.resolve(keyPath));

const app = getApps().length
    ? getApps()[0]
    : initializeApp({
        credential: cert(serviceAccount),
        projectId: serviceAccount.project_id
    });

const db = getFirestore(app);

db.settings({
    ignoreUndefinedProperties: true
});

module.exports = { app, db };
