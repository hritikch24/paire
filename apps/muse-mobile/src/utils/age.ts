export const MIN_AGE = 18;
export const MAX_AGE = 100;

/** Parses "DD/MM/YYYY" (the birthday input format) into ISO "YYYY-MM-DD", or null if invalid. */
export function parseBirthDate(input: string, now = new Date()): string | null {
  const match = input.trim().match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (!match) return null;
  const [, dd, mm, yyyy] = match;
  const day = Number(dd);
  const month = Number(mm);
  const year = Number(yyyy);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day ||
    year < now.getFullYear() - 120 ||
    date.getTime() > now.getTime()
  ) {
    return null;
  }
  return `${yyyy}-${mm}-${dd}`;
}

/** Age in whole years for an ISO birth date ("YYYY-MM-DD"). */
export function ageFromBirthDate(isoDate: string, now = new Date()): number {
  const [year, month, day] = isoDate.split("-").map(Number);
  let age = now.getFullYear() - year;
  const hadBirthday =
    now.getMonth() + 1 > month || (now.getMonth() + 1 === month && now.getDate() >= day);
  if (!hadBirthday) age -= 1;
  return age;
}

/** Formats ISO "YYYY-MM-DD" back to "DD/MM/YYYY". */
export function formatBirthDate(isoDate?: string): string {
  if (!isoDate) return "";
  const [year, month, day] = isoDate.split("-");
  return day && month && year ? `${day}/${month}/${year}` : "";
}

/** Inserts slashes as the user types digits: "0204" → "02/04". */
export function maskBirthDateInput(raw: string): string {
  const digits = raw.replace(/\D/g, "").slice(0, 8);
  if (digits.length <= 2) return digits;
  if (digits.length <= 4) return `${digits.slice(0, 2)}/${digits.slice(2)}`;
  return `${digits.slice(0, 2)}/${digits.slice(2, 4)}/${digits.slice(4)}`;
}
