// Changes only disposable loopback demo-muse fixtures, never a live project.
const { initializeApp } = require("firebase-admin/app");
const { getFirestore } = require("firebase-admin/firestore");
if (process.env.GCLOUD_PROJECT !== "demo-muse" || !/^127\.0\.0\.1:\d+$/.test(process.env.FIRESTORE_EMULATOR_HOST || "") || !["true", "false"].includes(process.argv[2])) throw new Error("Use a loopback demo-muse emulator and true/false.");
initializeApp({ projectId: "demo-muse" });
const firestore = getFirestore();
firestore.doc("runtime/trust").set({ requireVerification: process.argv[2] === "true", purpose: "emulator-only UI fixtures" })
  .then(() => firestore.terminate())
  .catch((error) => { console.error(error.message); process.exitCode = 1; });
