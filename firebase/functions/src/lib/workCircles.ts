/** Optional public self-declarations, never employment verification. */
export const WORK_SECTORS = ["corporate", "government", "banking", "healthcare", "education", "business", "creative", "legal", "hospitality", "engineering", "other"] as const;
export type WorkSector = (typeof WORK_SECTORS)[number];
export const isWorkSector = (value: unknown): value is WorkSector => typeof value === "string" && (WORK_SECTORS as readonly string[]).includes(value);
