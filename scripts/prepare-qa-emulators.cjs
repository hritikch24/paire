// Builds an isolated emulator workspace. Never reads/copies real provider secrets.
const fs = require("node:fs");
const path = require("node:path");
const qaCurve = require("node:crypto").createECDH("prime256v1");
const qaPublicKey = qaCurve.generateKeys("base64url");
const root = path.resolve(__dirname, "..");
const destination = process.argv[2];
if (!destination || !/^\/tmp\/muse-(verify|uiqa)\.[A-Za-z0-9]+$/.test(destination) || !fs.statSync(destination).isDirectory()) throw new Error("Provide a fresh /tmp/muse-verify.XXXXXX or /tmp/muse-uiqa.XXXXXX workspace.");
const config = JSON.parse(fs.readFileSync(path.join(root, "firebase.verify.json"), "utf8"));
const functions = path.join(destination, "functions");
fs.mkdirSync(functions); // Fail rather than replace any existing workspace.
fs.copyFileSync(path.join(root, "firebase/functions/package.json"), path.join(functions, "package.json"));
fs.cpSync(path.join(root, "firebase/functions/lib"), path.join(functions, "lib"), { recursive: true });
fs.symlinkSync(path.join(root, "firebase/functions/node_modules"), path.join(functions, "node_modules"), "dir");
fs.cpSync(path.join(root, "firebase/rules"), path.join(destination, "rules"), { recursive: true });
fs.writeFileSync(path.join(functions, ".env"), `WEB_PUSH_VAPID_PUBLIC_KEY=${qaPublicKey}\nMUSE_VERIFICATION_ENABLED=false\nMUSE_BILLING_ENABLED=false\nMUSE_BILLING_SANDBOX=false\nDIDIT_WORKFLOW_ID=\nDIDIT_APPLICATION_ID=\nJAAS_APP_ID=\nJAAS_KEY_ID=\n`);
const secrets = ["WEB_PUSH_VAPID_PRIVATE_KEY","ANTHROPIC_API_KEY", "DIDIT_API_KEY", "DIDIT_WEBHOOK_SECRET", "REVENUECAT_SECRET_KEY", "REVENUECAT_WEBHOOK_AUTH", "REVENUECAT_WEBHOOK_SIGNING_SECRET", "JAAS_PRIVATE_KEY", "RAZORPAY_KEY_SECRET", "RAZORPAY_WEBHOOK_SECRET"];
fs.writeFileSync(path.join(functions, ".secret.local"), secrets.map((name) => `${name}=disabled\n`).join(""), { mode: 0o600 });
config.functions = [{ source: "functions", codebase: "default" }];
config.firestore.rules = "rules/firestore.rules";
config.firestore.indexes = "rules/firestore.indexes.json";
config.storage.rules = "rules/storage.rules";
if (process.argv[3] === "--default-ports") {
  Object.assign(config.emulators.auth, { port: 9099 });
  Object.assign(config.emulators.firestore, { port: 8080, websocketPort: 9150 });
  Object.assign(config.emulators.functions, { port: 5001 });
  Object.assign(config.emulators.storage, { port: 9199 });
  Object.assign(config.emulators.hub, { port: 4400 });
  Object.assign(config.emulators.logging, { port: 4500 });
}
fs.writeFileSync(path.join(destination, "firebase.json"), JSON.stringify(config, null, 2) + "\n");
