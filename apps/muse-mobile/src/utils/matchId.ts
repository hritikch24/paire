export function createMatchId(uidA: string, uidB: string) {
  const [first, second] = [uidA, uidB].sort();
  return `${first}_${second}`;
}
