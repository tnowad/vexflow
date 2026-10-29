import type { StaffVerticalBounds } from '../measureBounds';
import type { MeasuredGroupMeasure } from '../layout';
import {
  VEXFLOW_STAVE_BOTTOM_LINE_OFFSET,
  VEXFLOW_STAVE_TOP_LINE_OFFSET,
} from './LayoutMetrics';
import { alignedLyricsHeight, compareVerses } from '../noteModifiers';

const STAFF_ARTIFACT_CLEARANCE = 12;

/** Where a staff's aligned lyrics hang in a system, relative to the stave's y. */
export interface StaffLyricsLayout {
  /** Bottom of the staff's notes and marks in the system; the first line hangs below it. */
  top: number;
  /** Verses in line order. */
  verses: (number | undefined)[];
}

export interface SystemVerticalLayout {
  height: number;
  staffYOffsets: number[];
  /** Per staff; undefined for a staff without aligned lyrics. */
  staffLyrics: (StaffLyricsLayout | undefined)[];
  visibleBottom: number;
  visibleTop: number;
}

export function resolveSystemVerticalLayout(
  measures: MeasuredGroupMeasure[],
  staffCount: number,
  staffGap: number,
  lyricScale: number
): SystemVerticalLayout {
  const { staffBounds, staffLyrics } = resolveSystemStaffBounds(
    measures,
    staffCount,
    lyricScale
  );
  const rawStaffYOffsets = resolveRawStaffYOffsets(staffBounds, staffGap);

  return shiftBelowOrigin(
    rawStaffYOffsets,
    getVisibleTop(staffBounds, rawStaffYOffsets),
    getVisibleBottom(staffBounds, rawStaffYOffsets),
    staffLyrics
  );
}

/**
 * Resolves the vertical layouts of `systems`, one per system, sharing their
 * staff offsets and height. Each inter-staff distance is the largest any
 * system needs and the top shift clears the tallest above-staff content of
 * any system, so staves sit at the same offsets in every system and all
 * systems share one height. Each system keeps its own aligned lyric lines.
 */
export function resolveUniformSystemVerticalLayouts(
  systems: MeasuredGroupMeasure[][],
  staffCount: number,
  staffGap: number,
  lyricScale: number
): SystemVerticalLayout[] {
  const systemStaffBounds = systems.map((measures) =>
    resolveSystemStaffBounds(measures, staffCount, lyricScale)
  );
  const rawStaffYOffsets = resolveWidestStaffYOffsets(
    systemStaffBounds.map(({ staffBounds }) =>
      resolveRawStaffYOffsets(staffBounds, staffGap)
    )
  );
  const rawVisibleTop = Math.min(
    ...systemStaffBounds.map(({ staffBounds }) =>
      getVisibleTop(staffBounds, rawStaffYOffsets)
    )
  );
  const rawVisibleBottom = Math.max(
    ...systemStaffBounds.map(({ staffBounds }) =>
      getVisibleBottom(staffBounds, rawStaffYOffsets)
    )
  );

  return systemStaffBounds.map(({ staffLyrics }) =>
    shiftBelowOrigin(
      rawStaffYOffsets,
      rawVisibleTop,
      rawVisibleBottom,
      staffLyrics
    )
  );
}

function shiftBelowOrigin(
  rawStaffYOffsets: number[],
  rawVisibleTop: number,
  rawVisibleBottom: number,
  staffLyrics: (StaffLyricsLayout | undefined)[]
): SystemVerticalLayout {
  const topShift = rawVisibleTop < 0 ? -rawVisibleTop : 0;
  const staffYOffsets = rawStaffYOffsets.map((offset) => offset + topShift);
  const visibleTop = rawVisibleTop + topShift;
  const visibleBottom = rawVisibleBottom + topShift;

  return {
    height: Math.max(0, visibleBottom),
    staffYOffsets,
    staffLyrics,
    visibleBottom,
    visibleTop,
  };
}

function resolveSystemStaffBounds(
  measures: MeasuredGroupMeasure[],
  staffCount: number,
  lyricScale: number
): {
  staffBounds: StaffVerticalBounds[];
  staffLyrics: (StaffLyricsLayout | undefined)[];
} {
  const contentBounds = resolveStaffBounds(measures, staffCount);
  // Aligned lyrics hang below everything else on their staff in the system,
  // one line per verse.
  const staffLyrics = contentBounds.map((bounds) =>
    bounds.lyricVerses
      ? { top: bounds.bottom, verses: bounds.lyricVerses }
      : undefined
  );
  const staffBounds = contentBounds.map((bounds) => ({
    top: bounds.top,
    bottom:
      bounds.bottom +
      alignedLyricsHeight(bounds.lyricVerses?.length ?? 0, lyricScale),
  }));

  return { staffBounds, staffLyrics };
}

function resolveStaffBounds(
  measures: MeasuredGroupMeasure[],
  staffCount: number
): StaffVerticalBounds[] {
  return Array.from({ length: staffCount }, (_, staffIndex) => {
    const bounds = measures
      .map((measure) => measure.staffBounds[staffIndex])
      .filter((staffBounds): staffBounds is StaffVerticalBounds =>
        Boolean(staffBounds)
      );

    return bounds.reduce(
      (merged, staffBounds) => ({
        top: Math.min(merged.top, staffBounds.top),
        bottom: Math.max(merged.bottom, staffBounds.bottom),
        lyricVerses: mergeVerses(merged.lyricVerses, staffBounds.lyricVerses),
      }),
      defaultStaffBounds()
    );
  });
}

function mergeVerses(
  left: (number | undefined)[] | undefined,
  right: (number | undefined)[] | undefined
): (number | undefined)[] | undefined {
  if (!left || !right) {
    return left ?? right;
  }

  return [...new Set([...left, ...right])].sort(compareVerses);
}

function resolveRawStaffYOffsets(
  staffBounds: StaffVerticalBounds[],
  staffGap: number
): number[] {
  if (staffBounds.length === 0) {
    return [];
  }

  const offsets = [0];

  for (let staffIndex = 1; staffIndex < staffBounds.length; staffIndex++) {
    const previousBounds = staffBounds[staffIndex - 1]!;
    const currentBounds = staffBounds[staffIndex]!;
    const previousOffset = offsets[staffIndex - 1]!;
    const minimumOriginOffset = previousOffset + staffGap;
    const minimumCollisionFreeOffset =
      previousOffset +
      previousBounds.bottom +
      STAFF_ARTIFACT_CLEARANCE -
      currentBounds.top;

    offsets.push(Math.max(minimumOriginOffset, minimumCollisionFreeOffset));
  }

  return offsets;
}

function resolveWidestStaffYOffsets(
  staffYOffsetsBySystem: number[][]
): number[] {
  const staffCount = staffYOffsetsBySystem[0]?.length ?? 0;
  const offsets: number[] = [];

  for (let staffIndex = 0; staffIndex < staffCount; staffIndex++) {
    if (staffIndex === 0) {
      offsets.push(0);
      continue;
    }

    const widestDistance = Math.max(
      ...staffYOffsetsBySystem.map(
        (staffYOffsets) =>
          staffYOffsets[staffIndex]! - staffYOffsets[staffIndex - 1]!
      )
    );

    offsets.push(offsets[staffIndex - 1]! + widestDistance);
  }

  return offsets;
}

function getVisibleTop(
  staffBounds: StaffVerticalBounds[],
  staffYOffsets: number[]
): number {
  if (staffBounds.length === 0) {
    return 0;
  }

  return Math.min(
    ...staffBounds.map((bounds, staffIndex) => {
      return staffYOffsets[staffIndex]! + bounds.top;
    })
  );
}

function getVisibleBottom(
  staffBounds: StaffVerticalBounds[],
  staffYOffsets: number[]
): number {
  if (staffBounds.length === 0) {
    return 0;
  }

  return Math.max(
    ...staffBounds.map((bounds, staffIndex) => {
      return staffYOffsets[staffIndex]! + bounds.bottom;
    })
  );
}

function defaultStaffBounds(): StaffVerticalBounds {
  return {
    top: VEXFLOW_STAVE_TOP_LINE_OFFSET,
    bottom: VEXFLOW_STAVE_BOTTOM_LINE_OFFSET,
  };
}
