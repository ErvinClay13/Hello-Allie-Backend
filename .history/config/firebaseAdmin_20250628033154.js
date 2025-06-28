import admin from "firebase-admin";
import path from "path";
import { fileURLToPath } from "url";

// This resolves __dirname in ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Path to service account key JSON file
const serviceAccountPath = path.join(__dirname, "hello-allie-service-account.json");


if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccountPath),
  });
}

const db = admin.firestore();

export default db;
