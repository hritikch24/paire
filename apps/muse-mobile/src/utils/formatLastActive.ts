export function formatLastActive(lastActiveAt?: number) {
  if (!lastActiveAt) return "";
  const diffMs = Date.now() - lastActiveAt;
  const minute = 60 * 1000;
  const hour = 60 * minute;
  const day = 24 * hour;
  const week = 7 * day;

  if (diffMs < 2 * minute) return "Active now";
  if (diffMs < hour) return "Active recently";
  if (diffMs < day) return "Active today";
  if (diffMs < week) return "Active this week";
  return "Active recently";
}
