import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Text, XStack, YStack } from 'tamagui';
import { Pressable, Image } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { AppStackParamList } from '../navigation/types';
import type { DiscoverProfile } from '../types/models';
import { callFunction } from '../services/firebase';
import { Screen } from '../components/Screen';
import { ScreenHeader } from '../components/ScreenHeader';
import { PrimaryButton, SecondaryButton } from '../components/MuseButton';
import { Icon } from '../components/Icon';
import { useWebScreenActive } from '../hooks/useWebScreenActive';
import { useAuthStore } from '../store/authStore';

type Props = NativeStackScreenProps<AppStackParamList, 'ExploreDiscovery'>;
type Room = {
  id: string;
  title: string;
  city: string;
  category: string;
  timezone: string;
  closesAt: number;
};
type Cursor = { id: string; time: number } | null;
const cities = [
  'Delhi NCR',
  'Mumbai',
  'Bengaluru',
  'Hyderabad',
  'Chennai',
  'Kolkata',
  'Pune',
  'Kochi',
  'Jaipur',
  'Lucknow',
  'Ahmedabad',
  'Nagpur'
];
type Intro = {
  state: 'off' | 'waiting' | 'intro' | 'matched';
  shared?: string[];
  profile?: DiscoverProfile;
  city?: string;
  ticket?: string;
  accepted?: boolean;
  matchId?: string;
};
function Rooms({ navigation }: Pick<Props, 'navigation'>) {
  const [after, setAfter] = useState<Cursor>(null);
  const query = useQuery({
    queryKey: ['discovery-events', after],
    queryFn: () => callFunction<{ rooms: Room[]; after: Cursor }>('listDiscoveryEvents', { after }),
    staleTime: 15000
  });
  return (
    <YStack gap="$3">
      <Text color="$textMuted">
        Open a community room to see the occasion and closing time. Joining is your choice.
      </Text>
      {query.isLoading ? <Text accessibilityLiveRegion="polite">Loading rooms…</Text> : null}
      {query.isError ? (
        <SecondaryButton onPress={() => void query.refetch()}>Retry loading events</SecondaryButton>
      ) : null}
      {query.data?.rooms.length === 0 ? (
        <YStack
          backgroundColor="$backgroundStrong"
          borderWidth={1}
          borderColor="$border"
          borderRadius={22}
          padding="$4"
          gap="$2"
        >
          <Text fontWeight="700">No open rooms on this page</Text>
          <Text color="$textMuted">
            Published rooms appear here while discovery is open. A shared event link also opens its
            listing directly.
          </Text>
        </YStack>
      ) : null}
      {query.data?.rooms.map((room) => (
        <Pressable
          key={room.id}
          accessibilityRole="button"
          onPress={() => navigation.navigate('EventRoom', { id: room.id })}
        >
          <YStack
            borderWidth={1}
            borderColor="$border"
            backgroundColor="$backgroundStrong"
            borderRadius={20}
            padding="$4"
            gap="$1"
          >
            <Text color="$primary" fontSize="$2">
              {room.category} · {room.city}
            </Text>
            <Text fontWeight="700" fontSize="$6">
              {room.title}
            </Text>
            <Text color="$textMuted">
              Closes{' '}
              {new Date(room.closesAt).toLocaleString(undefined, { timeZone: room.timezone })} ·{' '}
              {room.timezone}
            </Text>
          </YStack>
        </Pressable>
      ))}
      {query.data?.after ? (
        <SecondaryButton onPress={() => setAfter(query.data!.after)}>More rooms</SecondaryButton>
      ) : null}
      {after ? <SecondaryButton onPress={() => setAfter(null)}>First page</SecondaryButton> : null}
    </YStack>
  );
}
function Introductions({
  mode,
  navigation
}: {
  mode: 'vibes' | 'metro';
  navigation: Props['navigation'];
}) {
  const uid = useAuthStore((s) => s.user?.uid),
    active = useWebScreenActive(),
    metro = mode === 'metro';
  const [city, setCity] = useState('Delhi NCR'),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState('');
  const key = ['discovery-intro', uid, mode];
  const invoke = (action: string, ticket?: string) =>
    callFunction<Intro>('discoveryIntroduction', { mode, action, city, ticket });
  const query = useQuery({
    queryKey: key,
    enabled: Boolean(uid && active) && !busy,
    queryFn: async () => {
      const current = await invoke('status');
      return current.state === 'waiting' ? invoke('check') : current;
    },
    retry: false,
    refetchInterval: (q) =>
      active && !busy && ['waiting', 'intro'].includes(q.state.data?.state ?? '') ? 120000 : false
  });
  const client = useQueryClient(),
    data = query.data,
    card = data?.profile;
  async function act(action: string) {
    setBusy(true);
    setMessage('');
    try {
      await client.cancelQueries({ queryKey: key });
      let next = await invoke(action, data?.ticket);
      if (action === 'join' && next.state === 'waiting') next = await invoke('check');
      client.setQueryData(key, next);
    } catch (e) {
      setMessage(e instanceof Error ? e.message : 'Please try again.');
    } finally {
      setBusy(false);
    }
  }
  return (
    <YStack gap="$3">
      <Text color="$textMuted" lineHeight={23}>
        {metro
          ? 'Choose a city to meet other adults who opted into its Metro circle. Your station, train and route stay private.'
          : 'Let a shared profile vibe start the introduction. Paire pairs two opted-in people who fit each other’s discovery preferences.'}
      </Text>
      {query.isLoading ? <Text>Checking your introductions…</Text> : null}
      {query.isError ? (
        <SecondaryButton onPress={() => void query.refetch()}>Retry introductions</SecondaryButton>
      ) : null}
      {data?.state === 'off' ? (
        <>
          {metro ? (
            <XStack flexWrap="wrap" gap="$2">
              {cities.map((c) => (
                <Pressable
                  key={c}
                  accessibilityRole="radio"
                  accessibilityState={{ checked: c === city }}
                  onPress={() => setCity(c)}
                >
                  <YStack
                    justifyContent="center"
                    minHeight={44}
                    borderRadius={16}
                    borderWidth={1}
                    borderColor={c === city ? '$primary' : '$border'}
                    backgroundColor={c === city ? '$primarySoft' : '$backgroundStrong'}
                    paddingHorizontal="$3"
                  >
                    <Text>{c}</Text>
                  </YStack>
                </Pressable>
              ))}
            </XStack>
          ) : null}
          <Text>
            Join for 24 hours. You both decide whether to connect after seeing the introduction.
          </Text>
          <PrimaryButton disabled={busy} onPress={() => void act('join')}>
            {metro ? 'Join ' + city + ' circle' : 'Turn on vibe matches'}
          </PrimaryButton>
          {!metro ? (
            <SecondaryButton onPress={() => navigation.navigate('EditProfile')}>
              Edit my profile vibes
            </SecondaryButton>
          ) : null}
        </>
      ) : null}
      {data?.state === 'waiting' ? (
        <>
          <YStack padding="$4" borderRadius={22} backgroundColor="$primarySoft" gap="$2">
            <Text fontWeight="700">{metro ? data.city + ' circle' : 'Vibe matches are on'}</Text>
            <Text>
              No introduction ready yet. Both people need to opt in and meet each other’s
              preferences.
            </Text>
          </YStack>
          <PrimaryButton disabled={busy} onPress={() => void act('check')}>
            Check for an introduction
          </PrimaryButton>
        </>
      ) : null}
      {data?.state === 'intro' && card ? (
        <YStack
          backgroundColor="$backgroundStrong"
          borderRadius={24}
          borderColor="$border"
          borderWidth={1}
          padding="$4"
          gap="$3"
        >
          {card.photoUrls[0] ? (
            <Image
              source={{ uri: card.photoUrls[0] }}
              accessibilityLabel={card.displayName + ' profile photo'}
              style={{ height: 190, width: '100%', borderRadius: 14 }}
              resizeMode="cover"
            />
          ) : null}
          <Text fontSize="$7" fontWeight="700">
            {card.displayName}, {card.age}
          </Text>
          <Text color="$primary">
            {data.shared?.length
              ? 'Shared vibes · ' + data.shared.join(' · ')
              : 'Both joined ' + data.city}
          </Text>
          {card.bio ? <Text>{card.bio}</Text> : null}
          {data.accepted ? (
            <Text accessibilityLiveRegion="polite">
              You chose to connect. They can decide in their own time.
            </Text>
          ) : (
            <PrimaryButton disabled={busy} onPress={() => void act('continue')}>
              I'd like to connect
            </PrimaryButton>
          )}
          <SecondaryButton disabled={busy} onPress={() => void act('pass')}>
            Pass on this introduction
          </SecondaryButton>
          <Pressable
            accessibilityRole="button"
            style={{ minHeight: 44, justifyContent: 'center' }}
            onPress={() =>
              navigation.navigate('Report', { targetUid: card.uid, name: card.displayName })
            }
          >
            <Text color="$textMuted">Report profile</Text>
          </Pressable>
        </YStack>
      ) : null}
      {data?.state === 'matched' && data.matchId ? (
        <PrimaryButton onPress={() => navigation.navigate('Chat', { matchId: data.matchId! })}>
          You both chose to connect · Open match
        </PrimaryButton>
      ) : null}
      {data?.state === 'matched' ? (
        <SecondaryButton disabled={busy} onPress={() => void act('check')}>
          Find another introduction
        </SecondaryButton>
      ) : null}
      {(data && data.state !== 'off') || query.isError ? (
        <SecondaryButton disabled={busy} onPress={() => void act('leave')}>
          Leave {metro ? 'Metro circle' : 'vibe matching'}
        </SecondaryButton>
      ) : null}
      <Text accessibilityLiveRegion="polite" color="$primary">
        {message}
      </Text>
      <Text color="$textMuted" fontSize="$2">
        Introductions are free. Each sender needs Plus or Unlimited Chat to message a mutual match.
      </Text>
    </YStack>
  );
}
export function ExploreDiscoveryScreen({ navigation, route }: Props) {
  const mode = route.params.mode,
    title = mode === 'events' ? 'Event rooms' : mode === 'metro' ? 'Metro circles' : 'Vibe match';
  return (
    <Screen scroll header={<ScreenHeader title={title} />}>
      <YStack padding="$4" gap="$4">
        <XStack>
          <YStack
            width={52}
            height={52}
            borderRadius={17}
            backgroundColor="$primarySoft"
            alignItems="center"
            justifyContent="center"
          >
            <Icon
              name={
                mode === 'events'
                  ? 'ticket-outline'
                  : mode === 'metro'
                    ? 'train-outline'
                    : 'sparkles-outline'
              }
              size={25}
              color="primary"
            />
          </YStack>
        </XStack>
        <Text accessibilityRole="header" fontSize={30} lineHeight={36} fontWeight="700">
          {mode === 'events'
            ? 'Find an open room.'
            : mode === 'metro'
              ? 'Meet through your city.'
              : 'Start with a shared vibe.'}
        </Text>
        {mode === 'events' ? (
          <Rooms navigation={navigation} />
        ) : (
          <Introductions key={mode} mode={mode} navigation={navigation} />
        )}
      </YStack>
    </Screen>
  );
}
