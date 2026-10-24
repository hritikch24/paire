import type { DiwaliPlan } from "../data/diwali";

/** Diwali Together lives in the browser app; native builds are unchanged. */
export type DiwaliSheetProps = { visible: boolean; onClose: () => void; onSaved: (plan: DiwaliPlan) => void; onWithdrawn?: () => void; initialVibe?: string | null };
export function DiwaliSheet(_props: DiwaliSheetProps) { return null; }
export function DiwaliSettingsSection(_props: { onEdit: () => void }) { return null; }
export async function shareDiwaliInvite(): Promise<void> { return; }
