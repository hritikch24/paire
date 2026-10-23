#!/usr/bin/env node
/** Explicit owner gift; never creates a payment or records revenue. Uses Firebase CLI credentials. */
import { existsSync, realpathSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';

const { values } = parseArgs({ options: { project: { type: 'string' }, email: { type: 'string' }, reason: { type: 'string' }, confirm: { type: 'boolean', default: false } } });
if (!/^[a-z][a-z0-9-]{4,62}$/.test(values.project ?? '') || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(values.email ?? '') || (values.reason?.trim().length ?? 0) < 10) throw Error('Usage: node scripts/grant-lifetime-plus.mjs --project ID --email EMAIL --reason "Owner-authorized lifetime gift" [--confirm]');
if (process.env.FIRESTORE_EMULATOR_HOST || process.env.FIREBASE_AUTH_EMULATOR_HOST) throw Error('Operational script: unset emulator variables and choose the project explicitly.');
const binary = process.env.PATH.split(':').map(dir => join(dir, 'firebase')).find(existsSync);
if (!binary) throw Error('Firebase CLI is required.');
const require = createRequire(import.meta.url), auth = require(resolve(dirname(realpathSync(binary)), '../auth.js'));
const account = auth.getProjectDefaultAccount(resolve(dirname(fileURLToPath(import.meta.url)), '..'));
if (!account?.tokens?.refresh_token) throw Error('Run firebase login first.');
const token = await auth.getAccessToken(account.tokens.refresh_token, ['https://www.googleapis.com/auth/cloud-platform', 'https://www.googleapis.com/auth/firebase', 'https://www.googleapis.com/auth/userinfo.email', 'openid']);
const headers = { Authorization: `Bearer ${token.access_token}`, 'Content-Type': 'application/json' };
async function request(url, body, missing = false) {
  const response = await fetch(url, { headers, ...(body ? { method: 'POST', body: JSON.stringify(body) } : {}), signal: AbortSignal.timeout(30000) });
  if (missing && response.status === 404) return { fields: {} };
  const data = await response.json(); if (!response.ok) throw Error(`Admin request failed (${response.status}): ${data.error?.message ?? 'unknown'}`); return data;
}
const email = values.email.trim().toLowerCase();
const lookup = await request(`https://identitytoolkit.googleapis.com/v1/projects/${values.project}/accounts:lookup`, { email: [email] });
const member = lookup.users?.find(user => user.email?.toLowerCase() === email);
if (!member?.localId || member.disabled || member.localId.startsWith('support_')) throw Error('An enabled member account with that email is required.');
const uid = member.localId, base = `https://firestore.googleapis.com/v1/projects/${values.project}/databases/(default)/documents`;
const transaction = (await request(`${base}:beginTransaction`, { options: { readWrite: {} } })).transaction;
const decode = value => value?.stringValue ?? value?.booleanValue ?? (value?.integerValue !== undefined ? Number(value.integerValue) : value?.doubleValue);
let committed = false;
try {
  const get = path => request(`${base}/${path}?transaction=${encodeURIComponent(transaction)}`, undefined, true);
  const [profile, moderation, billing, grant] = await Promise.all([get(`users/${uid}`), get(`moderation/${uid}`), get(`billing/${uid}`), get(`lifetimePlusGrants/${uid}`)]);
  if (!profile.name || decode(moderation.fields.status) === 'banned') throw Error('An available profile is required; this gift does not bypass bans.');
  if (decode(grant.fields.status) === 'active') { console.log(JSON.stringify({ project: values.project, email, lifetime: true, alreadyGranted: true })); }
  else {
    const now = Date.now(), expiry = decode(billing.fields.expiresAt), finiteExpiry = typeof expiry === 'number' && Number.isFinite(expiry) ? Math.max(0, expiry) : 0;
    const actor = account.user?.email ?? 'firebase-cli-admin', auditId = `lifetime-gift-${uid}-${now}`;
    const gift = { uid, status: 'active', lifetime: true, source: 'owner-gift', startsAt: now, createdAt: now, amountReportedPaise: 0, currency: 'INR', grantedBy: actor, reason: values.reason.trim(), auditId };
    const audit = { ...gift, action: 'lifetime-goodwill-grant', actorUid: actor };
    console.log(JSON.stringify({ project: values.project, email, lifetime: true, amountCharged: 0, action: values.confirm ? 'grant lifetime access' : 'dry run; use --confirm to grant' }));
    if (values.confirm) {
      const encode = value => typeof value === 'string' ? { stringValue: value } : typeof value === 'boolean' ? { booleanValue: value } : typeof value === 'number' ? { integerValue: String(value) } : { mapValue: { fields: Object.fromEntries(Object.entries(value).map(([key, v]) => [key, encode(v)])) } };
      const write = (path, data, mask) => ({ update: { name: `${base.replace('https://firestore.googleapis.com/v1/', '')}/${path}`, fields: Object.fromEntries(Object.entries(data).map(([key, value]) => [key, encode(value)])) }, ...(mask ? { updateMask: { fieldPaths: mask } } : {}) });
      await request(`${base}:commit`, { transaction, writes: [
        write(`lifetimePlusGrants/${uid}`, gift),
        { ...write(`billingSupportAudit/${auditId}`, audit), currentDocument: { exists: false } },
        write(`billing/${uid}`, { lifetime: true, expiresAt: finiteExpiry, checkedAt: now }, ['lifetime', 'expiresAt', 'checkedAt']),
        write(`moderation/${uid}`, { chatAccess: { unlimited: true, premiumLifetime: true, premiumUntil: finiteExpiry, updatedAt: now } }, ['chatAccess'])
      ] });
      committed = true;
      const [saved, mirror] = await Promise.all([request(`${base}/billing/${uid}`), request(`${base}/moderation/${uid}`)]);
      if (decode(saved.fields.lifetime) !== true || decode(mirror.fields.chatAccess?.mapValue?.fields?.premiumLifetime) !== true || decode(mirror.fields.chatAccess?.mapValue?.fields?.unlimited) !== true) throw Error('Grant committed but readback needs investigation.');
      console.log(JSON.stringify({ lifetime: true, unlimitedLikes: true, messaging: true, paidFeatures: true, expiresAt: null, revenueAdded: 0, auditId, verified: true }));
    }
  }
} finally { if (!committed) await request(`${base}:rollback`, { transaction }); }
