import { useEffect, useMemo } from 'react';
import { Gesture, type GestureType } from 'react-native-gesture-handler';
import {
  cancelAnimation,
  useAnimatedReaction,
  useDerivedValue,
  useSharedValue,
  withDecay,
  type SharedValue,
} from 'react-native-reanimated';

import type { RendererSize, RendererType } from '../types';
import type { ScoreScrollState, ScrollAxis } from './types';

const EMPTY_SIZE: RendererSize = { width: 0, height: 0 };

export function useScoreScroll({
  contentSize,
  externalScrollOffset,
  rendererType,
  scrollEnabled,
  simultaneousGestures,
  viewportSize,
}: {
  contentSize: RendererSize;
  /** Controlled offset — pan/clamping write it instead of the internal one.
   * Must be the same SharedValue for the hook's lifetime. */
  externalScrollOffset?: SharedValue<number>;
  rendererType: RendererType;
  scrollEnabled: boolean;
  /** Gestures of other detectors the pan runs alongside instead of cancelling. */
  simultaneousGestures?: readonly GestureType[];
  viewportSize: RendererSize;
}): ScoreScrollState {
  const internalScrollOffset = useSharedValue(0);
  const scrollOffset = externalScrollOffset ?? internalScrollOffset;
  const viewportSizeValue = useSharedValue<RendererSize>(EMPTY_SIZE);
  const contentSizeValue = useSharedValue<RendererSize>(EMPTY_SIZE);
  const panStartOffset = useSharedValue(0);
  const axis = getScrollAxis(rendererType);

  useEffect(() => {
    viewportSizeValue.value = viewportSize;
  }, [viewportSize, viewportSizeValue]);

  useEffect(() => {
    contentSizeValue.value = contentSize;
  }, [contentSize, contentSizeValue]);

  const maxScrollValue = useDerivedValue(
    () =>
      getMaxScroll(
        rendererType,
        viewportSizeValue.value,
        contentSizeValue.value
      ),
    [contentSizeValue, rendererType, viewportSizeValue]
  );

  useAnimatedReaction(
    () => maxScrollValue.value,
    (nextMaxScroll) => {
      const nextOffset = clampOffset(scrollOffset.value, nextMaxScroll);

      if (nextOffset !== scrollOffset.value) {
        scrollOffset.value = nextOffset;
      }
    },
    [maxScrollValue, scrollOffset]
  );

  // One finger scrolls. A second finger cancels an active pan (maxPointers),
  // and running alongside `simultaneousGestures` keeps the pan's activation
  // from cancelling a pinch that has begun, so the pinch can still take over.
  const panGesture = useMemo(
    () =>
      Gesture.Pan()
        .enabled(scrollEnabled)
        .maxPointers(1)
        .simultaneousWithExternalGesture(...(simultaneousGestures ?? []))
        .onStart(() => {
          cancelAnimation(scrollOffset);
          panStartOffset.value = scrollOffset.value;
        })
        .onUpdate((event) => {
          const nextMaxScroll = maxScrollValue.value;
          const translation =
            rendererType === 'infiniteScore'
              ? event.translationX
              : event.translationY;

          scrollOffset.value = clampOffset(
            panStartOffset.value - translation,
            nextMaxScroll
          );
        })
        .onEnd((event, success) => {
          // A cancelled pan (a second finger landed) stops where it is instead of flinging.
          if (!success) {
            return;
          }

          const nextMaxScroll = maxScrollValue.value;
          const velocity =
            rendererType === 'infiniteScore'
              ? event.velocityX
              : event.velocityY;

          scrollOffset.value =
            nextMaxScroll > 0
              ? withDecay({
                  clamp: [0, nextMaxScroll],
                  velocity: -velocity,
                })
              : 0;
        }),
    [
      maxScrollValue,
      panStartOffset,
      rendererType,
      scrollEnabled,
      scrollOffset,
      simultaneousGestures,
    ]
  );

  return {
    axis,
    contentSize: contentSizeValue,
    panGesture,
    scrollOffset,
    viewportSize: viewportSizeValue,
  };
}

export function getScrollAxis(rendererType: RendererType): ScrollAxis {
  'worklet';

  return rendererType === 'infiniteScore' ? 'horizontal' : 'vertical';
}

export function getMaxScroll(
  rendererType: RendererType,
  viewportSize: RendererSize,
  contentSize: RendererSize
): number {
  'worklet';

  return getScrollAxis(rendererType) === 'horizontal'
    ? Math.max(0, contentSize.width - viewportSize.width)
    : Math.max(0, contentSize.height - viewportSize.height);
}

export function clampOffset(offset: number, maxOffset: number): number {
  'worklet';

  return Math.min(Math.max(offset, 0), maxOffset);
}

export function createClampedScrollOffset(
  scrollOffset: number,
  rendererType: RendererType,
  viewportSize: RendererSize,
  contentSize: RendererSize
): number {
  'worklet';

  return clampOffset(
    scrollOffset,
    getMaxScroll(rendererType, viewportSize, contentSize)
  );
}
