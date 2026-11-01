import { randomUUID } from "crypto";
import { db } from "./admin";
import { webPassBenefits } from "./billing";
import { LIMITS } from "./config";
import { dayKey } from "./lib/ids";
import { engagementDiscount, MEMBER_OFFER, MemberDiscount, MemberOffer, memberContext } from "./lib/member-offer";

/** A seven-day offer is issued once. Earned upgrades never reset its expiry or lower its discount. */
export async function getMemberOffer(uid: string, now = Date.now()): Promise<MemberOffer | null> {
  if (now < MEMBER_OFFER.startsAt) return null;
  const benefits = await webPassBenefits(uid, now);
  if (benefits.lifetime || benefits.expiresAt > now) return null;
  const offerRef = db.doc(`memberOffers/${uid}`);
  const days = Array.from({ length: 7 }, (_, i) => db.doc(`limits/${uid}/daily/${dayKey(new Date(now - i * 86400000))}`));
  return db.runTransaction(async tx => {
    const [offer, user, moderation, billing, ...usage] = await tx.getAll(offerRef, db.doc(`users/${uid}`), db.doc(`moderation/${uid}`), db.doc(`billing/${uid}`), ...days);
    if (!user.exists || user.get("onboardingComplete") !== true || moderation.get("status") === "banned" || billing.get("lifetime") === true || Number(billing.get("expiresAt")) > now) return null;
    const prior = offer.exists && offer.get("campaign") === MEMBER_OFFER.campaign ? offer.data()! : null;
    if (prior && (Number(prior.expiresAt) <= now || !(MEMBER_OFFER.discounts as readonly number[]).includes(Number(prior.discountPercent)) || typeof prior.id !== "string" || Number(prior.expiresAt) - Number(prior.startsAt) !== MEMBER_OFFER.durationMs)) return null;
    const activeDays = usage.filter(day => Number(day.get("likes")) > 0 || Number(day.get("supers")) > 0).length;
    const earned = engagementDiscount(Number(usage[0].get("likes")) || 0, Number(usage[0].get("supers")) || 0, activeDays, LIMITS.likesPerDay, LIMITS.supersPerDay);
    const percent = Math.max(Number(prior?.discountPercent) || 0, earned.percent) as MemberDiscount;
    const record = prior ? { ...prior, discountPercent: percent, reason: percent > Number(prior.discountPercent) ? earned.reason : prior.reason } : {
      id: randomUUID(), campaign: MEMBER_OFFER.campaign, discountPercent: percent, reason: earned.reason, startsAt: now, expiresAt: now + MEMBER_OFFER.durationMs
    };
    if (!prior || percent !== Number(prior.discountPercent)) tx.set(offerRef, record);
    return { id: String(record.id), discountPercent: percent, startsAt: Number(record.startsAt), expiresAt: Number(record.expiresAt), reason: String(record.reason), ...memberContext(user.get("city"), user.get("interests")) };
  });
}
