import { useAppDimensions } from "../utils/useAppDimensions";
import { Image } from "expo-image";
import { useState } from "react";
import { FlatList } from "react-native";
import { XStack, YStack } from "tamagui";
import { resolveServerUrl } from "../services/testServer";
import { Icon } from "./Icon";

type PhotoCarouselProps = {
  photos: string[];
  height: number;
  width?: number;
  borderRadius?: number;
};

/** Swipeable photo pager with progress bars, used on full profiles. */
export function PhotoCarousel({ photos, height, width: widthProp, borderRadius = 0 }: PhotoCarouselProps) {
  const { width: windowWidth } = useAppDimensions();
  const width = widthProp ?? windowWidth;
  const [index, setIndex] = useState(0);

  if (!photos.length) {
    return (
      <YStack width={width} height={height} borderRadius={borderRadius} backgroundColor="$backgroundSoft" alignItems="center" justifyContent="center">
        <Icon name="image-outline" size={48} color="textMuted" />
      </YStack>
    );
  }

  return (
    <YStack width={width} height={height} borderRadius={borderRadius} overflow="hidden" backgroundColor="$backgroundSoft">
      <FlatList
        data={photos}
        keyExtractor={(uri, i) => `${uri}-${i}`}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        onMomentumScrollEnd={(event) => setIndex(Math.round(event.nativeEvent.contentOffset.x / width))}
        renderItem={({ item, index: i }) => (
          <Image
            source={{ uri: resolveServerUrl(item) }}
            style={{ width, height }}
            contentFit="cover"
            transition={150}
            cachePolicy="memory-disk"
            accessibilityLabel={`Photo ${i + 1} of ${photos.length}`}
          />
        )}
      />
      {photos.length > 1 ? (
        <XStack position="absolute" top={10} left={10} right={10} gap={4} pointerEvents="none">
          {photos.map((uri, i) => (
            <YStack
              key={`${uri}-bar-${i}`}
              flex={1}
              height={4}
              borderRadius={2}
              backgroundColor={i === index ? "rgba(255,255,255,0.95)" : "rgba(255,255,255,0.4)"}
            />
          ))}
        </XStack>
      ) : null}
    </YStack>
  );
}
