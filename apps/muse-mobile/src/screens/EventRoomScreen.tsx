import { Image } from 'react-native';
import { useState, useCallback, useEffect } from 'react';
import { useAuthStore } from '../store/authStore';
import { MuseInput } from '../components/MuseInput';
import { Text, YStack } from 'tamagui';
import { useQuery } from '@tanstack/react-query';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { PrimaryButton, SecondaryButton } from '../components/MuseButton';
import { Screen } from '../components/Screen';
import { ScreenHeader } from '../components/ScreenHeader';
import { callFunction } from '../services/firebase';
import type { AppStackParamList } from '../navigation/types';
import type { DiscoverProfile } from '../types/models';

export function EventRoomScreen({
  route,
  navigation
}: NativeStackScreenProps<AppStackParamList, 'EventRoom'>) {
  const { id } = route.params;
  const uid = useAuthStore((state) => state.user?.uid);
  const room = useQuery({
    queryKey: ['event-room', id, uid],
    staleTime: 0,
    queryFn: () =>
      callFunction<{
        title: string;
        joined: boolean;
        open: boolean;
        closesAt: number;
        timezone: string;
      }>('getEventRoom', { id })
  });
  const [cards, setCards] = useState<DiscoverProfile[]>([]);
  const [after, setAfter] = useState<string | null>(null);
  const [joined, setJoined] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    try {
      await fn();
    } catch {
      setCards([]);
      setMessage('This action is unavailable. Check your connection or reopen the room.');
    } finally {
      setBusy(false);
    }
  };
  const page = useCallback(
    async (cursor: string | null) => {
      let preview = {};
      try {
        const intent = JSON.parse(sessionStorage.getItem('paire.eventIntent') ?? 'null');
        if (!cursor && intent?.id === id)
          preview = { deck: intent.deck ?? null, slot: intent.slot };
        const resume = sessionStorage.getItem('paire.resume.' + uid + '.' + id);
        if (!cursor && resume) preview = { ...preview, resume };
      } catch {
        /* An ordinary shared link has no saved card. */
      }
      const result = await callFunction<{ profiles: DiscoverProfile[]; after: string | null }>(
        'getEventMembers',
        { id, after: cursor, ...preview }
      );
      setCards(result.profiles);
      setAfter(result.after);
      setMessage(result.profiles.length ? '' : 'No eligible profiles on this page.');
    },
    [id, uid]
  );
  useEffect(() => {
    if (!room.data?.joined || !room.data.open) return;
    setJoined(true);
    void page(null).catch(() => setMessage('Could not load profiles. Reopen the room to retry.'));
  }, [room.data?.joined, room.data?.open, page]);
  const [note, setNote] = useState('');
  const [passes, setPasses] = useState<string[]>([]);
  const card = cards[0];
  return (
    <Screen scroll>
      <ScreenHeader title={room.data?.title ?? 'Event room'} />
      <YStack padding="$4" gap="$3">
        {room.data ? (
          <Text>
            {room.data.open ? 'Room closes ' : 'Room closed '}
            {new Date(room.data.closesAt).toLocaleString(undefined, {
              timeZone: room.data.timezone
            })}{' '}
            · {room.data.timezone}
          </Text>
        ) : null}
        <Text>
          Joining makes your profile visible to eligible room members and includes an anonymous
          placeholder in the guest preview.
        </Text>
        {room.isError ? (
          <SecondaryButton onPress={() => void room.refetch()}>Retry room details</SecondaryButton>
        ) : null}
        {!joined ? (
          <PrimaryButton
            disabled={busy || !room.data?.open}
            onPress={() =>
              void run(async () => {
                await callFunction('setEventParticipation', { id, join: true });
                setJoined(true);
                await page(null);
              })
            }
          >
            {room.data?.open === false ? 'Room closed' : 'Join this room'}
          </PrimaryButton>
        ) : (
          <>
            {card ? (
              <>
                {card.photoUrls?.[0] ? (
                  <Image
                    accessible
                    accessibilityLabel={card.displayName + ' profile photo'}
                    source={{ uri: card.photoUrls[0] }}
                    resizeMode="contain"
                    style={{ width: '100%', height: 220 }}
                  />
                ) : null}
                <Text fontSize="$6">
                  {card.displayName}, {card.age}
                </Text>
                <Text>{card.bio}</Text>
                <MuseInput
                  accessibilityLabel="Note with like"
                  placeholder={card.requiresNote ? 'A note is required' : 'Optional note'}
                  maxLength={140}
                  value={note}
                  onChangeText={setNote}
                />
                {(['like', 'nope'] as const).map((type) => (
                  <SecondaryButton
                    key={type}
                    disabled={busy}
                    onPress={() =>
                      void run(async () => {
                        const result = await callFunction<{ matched: boolean }>('swipe', {
                          eventId: id,
                          targetUid: card.uid,
                          type,
                          ...(type === 'like' && note.trim() ? { note: note.trim() } : {})
                        });
                        setNote('');
                        if (type === 'nope') setPasses((p) => [card.uid, ...p].slice(0, 3));
                        setCards((previous) => previous.slice(1));
                        setMessage(
                          result.matched
                            ? 'Mutual match. Open Matches to read your chat.'
                            : type === 'like'
                              ? 'Like sent.'
                              : 'Passed.'
                        );
                      })
                    }
                  >
                    {type === 'like' ? 'Send like' : 'Pass'}
                  </SecondaryButton>
                ))}
              </>
            ) : null}
            {passes.length ? (
              <SecondaryButton
                disabled={busy}
                onPress={() =>
                  void run(async () => {
                    const targetUid = passes[0];
                    setPasses((p) => p.slice(1));
                    const result = await callFunction<{ profile: DiscoverProfile }>('undoSwipe', {
                      targetUid,
                      eventId: id
                    });
                    setMessage('Profile restored. Choose whether to pass or like.');
                    setCards((p) => [result.profile, ...p.filter((c) => c.uid !== targetUid)]);
                  })
                }
              >
                Rewind previous pass · free
              </SecondaryButton>
            ) : null}
            {!card && after ? (
              <SecondaryButton disabled={busy} onPress={() => void run(() => page(after))}>
                More profiles
              </SecondaryButton>
            ) : null}
          </>
        )}
        <SecondaryButton
          disabled={busy}
          onPress={() =>
            void run(async () => {
              await callFunction('setEventParticipation', { id, join: false });
              setJoined(false);
              setPasses([]);
              void room.refetch();
              setCards([]);
              setMessage('You left this room.');
            })
          }
        >
          Leave room
        </SecondaryButton>
        <SecondaryButton
          onPress={() => {
            try {
              sessionStorage.setItem('paire.paymentEvent', id);
              if (card) sessionStorage.setItem('paire.resume.' + uid + '.' + id, card.uid);
            } catch {
              /* Optional return context. */
            }
            navigation.navigate('Premium');
          }}
        >
          View messaging access
        </SecondaryButton>
        <Text accessibilityLiveRegion="polite">{message}</Text>
        <Text>Reading is free. Each sender needs Plus or Unlimited Chat.</Text>
      </YStack>
    </Screen>
  );
}
