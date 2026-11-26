import { useState } from 'react';
import { MuseInput } from '../components/MuseInput';
import { Text, YStack } from 'tamagui';
import { Screen } from '../components/Screen';
import { ScreenHeader } from '../components/ScreenHeader';
import { PrimaryButton, SecondaryButton } from '../components/MuseButton';
import { callFunction } from '../services/firebase';

export function EventAdminScreen() {
  const [fields, setFields] = useState({
    id: '',
    title: '',
    category: '',
    city: '',
    venue: '',
    start: '',
    end: '',
    timezone: 'Asia/Kolkata',
    cover: '',
    coverLicense: ''
  });
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  async function save(status: string) {
    setBusy(true);
    try {
      const result = await callFunction<{ id: string }>('saveEventRoom', {
        ...fields,
        ...(fields.id.trim() ? { id: fields.id.trim() } : { id: null }),
        status
      });
      setFields((previous) => ({ ...previous, id: result.id }));
      setMessage(`Saved as ${status}. Share https://www.paire.in/events/?id=${result.id}`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Unable to save this room.');
    } finally {
      setBusy(false);
    }
  }
  return (
    <Screen scroll>
      <ScreenHeader title="Manage event room" />
      <YStack gap="$3" padding="$4">
        <Text>
          Leave ID blank for a new room. To edit an existing room, enter its ID and load its
          details. Enter start and end as ISO dates with a UTC offset. Optional covers use a
          licensed site asset in /event-covers/. Record its license or permission.
        </Text>
        {(Object.keys(fields) as (keyof typeof fields)[]).map((key) => (
          <YStack key={key}>
            <Text>{key}</Text>
            <MuseInput
              accessibilityLabel={key}
              value={fields[key]}
              onChangeText={(value) => setFields((previous) => ({ ...previous, [key]: value }))}
            />
          </YStack>
        ))}
        <SecondaryButton
          disabled={busy || !fields.id.trim()}
          onPress={async () => {
            setBusy(true);
            try {
              const { status, ...data } = await callFunction<typeof fields & { status: string }>(
                'getAdminEventRoom',
                { id: fields.id.trim() }
              );
              setFields(data);
              setMessage('Current status: ' + status);
            } catch (error) {
              setMessage(error instanceof Error ? error.message : 'Unable to load room.');
            } finally {
              setBusy(false);
            }
          }}
        >
          Load existing room
        </SecondaryButton>
        {(['draft', 'published', 'closed'] as const).map((status) => (
          <PrimaryButton key={status} disabled={busy} onPress={() => void save(status)}>
            {{ draft: 'Save unpublished', published: 'Publish room', closed: 'Close room' }[status]}
          </PrimaryButton>
        ))}
        <Text accessibilityLiveRegion="polite" selectable>
          {message}
        </Text>
      </YStack>
    </Screen>
  );
}
