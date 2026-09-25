export function scoreInterests(current: string[], candidate: string[]) {
  if (!current.length || !candidate.length) return 0;
  const currentSet = new Set(current);
  let overlap = 0;
  for (const interest of candidate) {
    if (currentSet.has(interest)) overlap += 1;
  }
  return overlap / Math.max(currentSet.size, candidate.length);
}
