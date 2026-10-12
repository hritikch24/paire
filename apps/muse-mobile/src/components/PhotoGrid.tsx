import { useAppDimensions } from "../utils/useAppDimensions";
import { Image } from "expo-image";
import { useState } from "react";
import { Pressable } from "react-native";
import { Spinner, Text, XStack, YStack, useTheme } from "tamagui";
import { resolveServerUrl } from "../services/testServer";
import { MAX_PHOTOS } from "../utils/profile";
import { ActionSheet } from "./ActionSheet";
import { Icon } from "./Icon";

type PhotoGridProps = {
  photos: string[];
  uploading: boolean;
  onAdd: () => void;
  onRemove: (index: number) => void;
  onMakeMain: (index: number) => void;
};

/** 3×2 grid of photo slots. The first photo is the main one shown on cards. */
export function PhotoGrid({ photos, uploading, onAdd, onRemove, onMakeMain }: PhotoGridProps) {
  const theme = useTheme();
  const { width } = useAppDimensions();
  const [selected, setSelected] = useState<number | null>(null);
  const slotWidth = Math.floor((Math.min(width, 520) - 32 - 16) / 3);
  const slotHeight = Math.round(slotWidth * 1.3);

  return (
    <>
      <XStack flexWrap="wrap" gap="$2">
        {Array.from({ length: MAX_PHOTOS }, (_, index) => {
          const uri = photos[index];
          const isNextEmpty = index === photos.length;
          if (uri) {
            return (
              <Pressable
                key={uri}
                testID={`photo-slot-${index}`}
                accessibilityRole="button"
                accessibilityLabel={index === 0 ? "Main photo, options" : `Photo ${index + 1}, options`}
                onPress={() => setSelected(index)}
              >
                <YStack width={slotWidth} height={slotHeight} borderRadius="$4" overflow="hidden">
                  <Image source={{ uri: resolveServerUrl(uri) }} style={{ width: slotWidth, height: slotHeight }} contentFit="cover" transition={150} />
                  {index === 0 ? (
                    <YStack position="absolute" left={6} bottom={6} backgroundColor="$primary" borderRadius={999} paddingHorizontal="$2" paddingVertical={2}>
                      <Text color="$primaryForeground" fontSize="$1" fontWeight="700">
                        Main
                      </Text>
                    </YStack>
                  ) : null}
                  <YStack position="absolute" right={6} top={6} width={26} height={26} borderRadius={13} backgroundColor="rgba(0,0,0,0.55)" alignItems="center" justifyContent="center">
                    <Icon name="ellipsis-horizontal" size={16} color="#FFFFFF" />
                  </YStack>
                </YStack>
              </Pressable>
            );
          }
          return (
            <Pressable
              key={`empty-${index}`}
              testID={isNextEmpty ? "photo-add" : undefined}
              accessibilityRole="button"
              accessibilityLabel="Add a photo"
              disabled={uploading}
              onPress={onAdd}
            >
              <YStack
                width={slotWidth}
                height={slotHeight}
                borderRadius="$4"
                borderWidth={1.5}
                borderStyle="dashed"
                borderColor={isNextEmpty ? "$primary" : "$border"}
                backgroundColor="$backgroundStrong"
                alignItems="center"
                justifyContent="center"
              >
                {uploading && isNextEmpty ? (
                  <Spinner color={theme.primary?.val} />
                ) : (
                  <YStack width={30} height={30} borderRadius={15} backgroundColor={isNextEmpty ? "$primary" : "$backgroundSoft"} alignItems="center" justifyContent="center">
                    <Icon name="add" size={20} color={isNextEmpty ? "primaryForeground" : "textMuted"} />
                  </YStack>
                )}
              </YStack>
            </Pressable>
          );
        })}
      </XStack>
      <ActionSheet
        visible={selected !== null}
        onClose={() => setSelected(null)}
        options={[
          ...(selected !== null && selected > 0
            ? [{ label: "Make main photo", icon: "star-outline" as const, onPress: () => onMakeMain(selected) }]
            : []),
          {
            label: "Remove photo",
            icon: "trash-outline" as const,
            destructive: true,
            onPress: () => selected !== null && onRemove(selected)
          }
        ]}
      />
    </>
  );
}
