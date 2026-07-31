const { initializeApp, applicationDefault } = require('firebase-admin/app');
const { getAuth } = require('firebase-admin/auth');
const admin = require('firebase-admin');

// Requires a service account key file.
// Download from: Firebase Console > Project Settings > Service Accounts > Generate New Private Key
const serviceAccount = require('./service-account-key.json');

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});

const auth = getAuth();

async function deleteGoogleAccounts() {
  let nextPageToken;
  let deleted = 0;

  do {
    const listResult = await auth.listUsers(1000, nextPageToken);
    for (const user of listResult.users) {
      const hasGoogle = user.providerData?.some(p => p.providerId === 'google.com');
      if (hasGoogle) {
        console.log(`Deleting Google user: ${user.email || user.uid}`);
        await auth.deleteUser(user.uid);
        deleted++;
      }
    }
    nextPageToken = listResult.pageToken;
  } while (nextPageToken);

  console.log(`Done. Deleted ${deleted} Google accounts.`);
}

deleteGoogleAccounts().catch(console.error);
