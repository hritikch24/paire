import { useEffect, useState } from "react";
import { subscribeToMyDuo, subscribeToMyInvite, subscribeToMyRequest } from "../services/duoService";
import { useAuthStore } from "../store/authStore";
import { Duo, DuoInvite, DuoPendingRequest } from "../types/models";

export type DuoState = {
  /** Still loading the first snapshot. */
  loading: boolean;
  duo: Duo | null;
  /** Your friend's uid, once you're a Duo. */
  partnerUid: string | null;
  invite: DuoInvite | null;
  /** A friend's code you entered, waiting on them to confirm. */
  pending: DuoPendingRequest | null;
};

/** Your Duo and any invite code you're waiting on, kept live. */
export function useDuo(): DuoState {
  const uid = useAuthStore((state) => state.user?.uid);
  const [duo, setDuo] = useState<Duo | null | undefined>(undefined);
  const [invite, setInvite] = useState<DuoInvite | null>(null);
  const [pending, setPending] = useState<DuoPendingRequest | null>(null);

  useEffect(() => {
    if (!uid) return;
    const stopDuo = subscribeToMyDuo(uid, setDuo);
    const stopInvite = subscribeToMyInvite(uid, setInvite);
    const stopPending = subscribeToMyRequest(uid, setPending);
    return () => {
      stopDuo();
      stopInvite();
      stopPending();
    };
  }, [uid]);

  return {
    loading: duo === undefined,
    duo: duo ?? null,
    partnerUid: duo?.members.find((member) => member !== uid) ?? null,
    invite,
    pending
  };
}
