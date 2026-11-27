import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Text, XStack, YStack } from 'tamagui';
import { Pressable, Image } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { AppStackParamList } from '../navigation/types';
import type { DiscoverProfile } from '../types/models';
import { fetchFeedPage } from '../services/discoveryService';
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
function DiscoverPicks({ navigation }: Pick<Props, 'navigation'>) {
  const uid = useAuthStore((s) => s.user?.uid);
  const active = useWebScreenActive();
  const query = useQuery({
    queryKey: ['explore-discover-picks', uid],
    staleTime: 0,
    gcTime: 0,
    enabled: Boolean(uid && active),
    retry: false,
    queryFn: async () => {
      let page = await fetchFeedPage(null);
      for (let i = 1; i < 3 && !page.profiles.length && page.cursor; i++)
        page = await fetchFeedPage(page.cursor);
      return page.profiles.slice(0, 3);
    }
  });
  return (
    <YStack gap="$2">
      <Text accessibilityRole="header" fontWeight="700" fontSize="$6">
        People from Discover
      </Text>
      {query.isFetching ? <Text accessibilityLiveRegion="polite">Finding profiles…</Text> : null}
      {query.isError ? (
        <SecondaryButton onPress={() => void query.refetch()}>
          Retry loading profiles
        </SecondaryButton>
      ) : null}
      {query.data?.length === 0 ? (
        <Text color="$textMuted">You’re caught up with the people available in Discover.</Text>
      ) : null}
      {active &&
        !query.isFetching &&
        !query.isError &&
        query.data?.map((profile) => (
          <Pressable
            key={profile.uid}
            testID="explore-profile"
            accessibilityRole="button"
            accessibilityLabel={'View ' + profile.displayName + '’s profile'}
            onPress={() => navigation.navigate('ProfileView', { source: 'explore', profile })}
          >
            <XStack
              backgroundColor="$backgroundStrong"
              borderWidth={1}
              borderColor="$border"
              borderRadius={18}
              alignItems="center"
              gap="$3"
              padding="$3"
            >
              {profile.photoUrls[0] ? (
                <Image
                  accessible={false}
                  source={{ uri: profile.photoUrls[0] }}
                  style={{ width: 64, height: 76, borderRadius: 12 }}
                />
              ) : (
                <YStack
                  width={64}
                  height={76}
                  alignItems="center"
                  justifyContent="center"
                  borderRadius={12}
                  backgroundColor="$primarySoft"
                >
                  <Text color="$primary" fontSize="$7">
                    {profile.displayName.slice(0, 1)}
                  </Text>
                </YStack>
              )}
              <YStack flex={1} gap="$1">
                <Text fontSize="$5" fontWeight="700">
                  {profile.displayName}, {profile.age}
                </Text>
                {profile.bio ? (
                  <Text color="$textMuted" numberOfLines={2}>
                    {profile.bio}
                  </Text>
                ) : null}
              </YStack>
              <Icon name="chevron-forward" size={18} color="primary" />
            </XStack>
          </Pressable>
        ))}
      <SecondaryButton onPress={() => navigation.navigate('Tabs', { screen: 'Discover' })}>
        Open full Discover
      </SecondaryButton>
    </YStack>
  );
}
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
          <Text fontWeight="700">{after ? 'No more open rooms' : 'No open event rooms yet'}</Text>
          <Text color="$textMuted">Published events will appear here.</Text>
        </YStack>
      ) : null}
      {query.data?.rooms.length === 0 && !after ? <DiscoverPicks navigation={navigation} /> : null}
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
  const [busy, setBusy] = useState(false),
    [message, setMessage] = useState('');
  const profileCity = useAuthStore((s) => s.profile?.city);
  const homeCity = cities.find((c) => c.toLowerCase() === profileCity?.trim().toLowerCase());
  const [allCities, setAllCities] = useState(false);
  const orderedCities = homeCity ? [homeCity, ...cities.filter((c) => c !== homeCity)] : cities;
  const key = ['discovery-intro', uid, mode];
  const invoke = (action: string, ticket?: string, city?: string) =>
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
  async function act(action: string, city?: string) {
    setBusy(true);
    setMessage('');
    try {
      await client.cancelQueries({ queryKey: key });
      let next = await invoke(action, data?.ticket, city);
      if ((action === 'join' || action === 'pass') && next.state === 'waiting')
        next = await invoke('check');
      client.setQueryData(key, next);
    } catch (e) {
      setMessage(e instanceof Error ? e.message : 'Please try again.');
    } finally {
      setBusy(false);
    }
  }
  return (
    <YStack gap="$3">
      {query.isLoading ? <Text>Finding your profile cards…</Text> : null}
      {query.isError ? (
        <SecondaryButton onPress={() => void query.refetch()}>Retry introductions</SecondaryButton>
      ) : null}
      {data?.state === 'off' ? (
        <>
          <Text color="$textMuted">
            {metro
              ? 'Tap a city to join its circle for 24 hours. Your station and route stay private.'
              : 'Opt in for 24 hours to meet someone who shares a profile vibe. You both choose whether to connect.'}
          </Text>
          {metro ? (
            <XStack flexWrap="wrap" gap="$2">
              {(allCities ? orderedCities : orderedCities.slice(0, 3)).map((c) => (
                <Pressable
                  key={c}
                  accessibilityRole="button"
                  disabled={busy}
                  accessibilityLabel={'Join ' + c + ' circle'}
                  onPress={() => void act('join', c)}
                >
                  <YStack
                    paddingHorizontal="$3"
                    justifyContent="center"
                    minHeight={44}
                    borderRadius={16}
                    borderWidth={1}
                    borderColor="$border"
                    backgroundColor="$backgroundStrong"
                  >
                    <Text>{c}</Text>
                  </YStack>
                </Pressable>
              ))}
              <Pressable
                accessibilityRole="button"
                aria-expanded={allCities}
                onPress={() => setAllCities(!allCities)}
                style={{ minHeight: 44, justifyContent: 'center', paddingHorizontal: 8 }}
              >
                <Text color="$primary">{allCities ? 'Fewer cities' : 'More cities'}</Text>
              </Pressable>
            </XStack>
          ) : (
            <PrimaryButton disabled={busy} onPress={() => void act('join')}>
              Turn on vibe matches
            </PrimaryButton>
          )}
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
            <Text accessibilityLiveRegion="polite">
              {metro ? 'No eligible circle profile yet.' : 'No shared-vibe introduction yet.'} New
              introductions appear here automatically.
            </Text>
          </YStack>
        </>
      ) : null}
      {busy && data?.state === 'off' ? (
        <Text accessibilityLiveRegion="polite">Finding your introduction…</Text>
      ) : null}
      {data?.state === 'off' || data?.state === 'waiting' ? (
        <DiscoverPicks navigation={navigation} />
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
