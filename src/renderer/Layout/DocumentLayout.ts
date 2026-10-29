import type { MeasuredScore } from '../measure';
import type { RendererPoint, ScoreLayoutOptions, ScoreOptions } from '../types';
import type {
  GroupLayoutContext,
  GroupLayoutResult,
  MeasureLayoutPlan,
  MeasuredGroupMeasure,
  SystemLayoutPlan,
} from '../layout';
import { getSystemGap } from './LayoutMetrics';
import {
  resolveSystemVerticalLayout,
  resolveUniformSystemVerticalLayouts,
} from './VerticalSpacing';

// Extra space above a system that starts a page (options.layout.pageBreaks),
// on top of the system gap, where the app draws the page edge.
export const PAGE_BREAK_GAP = 96;

type LineBreaks = ReturnType<NonNullable<ScoreLayoutOptions['lineBreaks']>>;
type LineBreakStarts = Exclude<LineBreaks, readonly number[]>;

type DocumentLine = {
  measures: MeasuredGroupMeasure[];
  intrinsicWidth: number;
  widthRatio: number;
};

export function resolveDocumentEvenMeasureWidth(
  measuredScore: MeasuredScore,
  availableWidth: number
): {
  measuresPerFullLine: number;
  equalMeasureWidth: number;
} {
  const widestMeasure = Math.max(measuredScore.maxIntrinsicNoteWidth, 1);

  if (availableWidth <= 0) {
    return {
      measuresPerFullLine: 1,
      equalMeasureWidth: widestMeasure,
    };
  }

  const measuresPerFullLine = Math.max(
    1,
    Math.floor(availableWidth / widestMeasure)
  );

  return {
    measuresPerFullLine,
    equalMeasureWidth: availableWidth / measuresPerFullLine,
  };
}

export function layoutDocumentEvenGroup(
  group: GroupLayoutContext,
  origin: RendererPoint,
  availableWidth: number,
  equalMeasureWidth: number,
  measuresPerFullLine: number,
  options: ScoreOptions
): GroupLayoutResult {
  const systems: SystemLayoutPlan[] = [];
  const measures: MeasureLayoutPlan[] = [];

  if (group.measures.length === 0) {
    return {
      groupId: group.groupId,
      systems,
      measures,
      nextY: origin.y,
    };
  }

  let cursorY = origin.y;
  const systemGap = getSystemGap(options.spacing.staffGap);
  const chunks: MeasuredGroupMeasure[][] = [];

  for (
    let startIndex = 0;
    startIndex < group.measures.length;
    startIndex += measuresPerFullLine
  ) {
    chunks.push(
      group.measures.slice(startIndex, startIndex + measuresPerFullLine)
    );
  }

  // Layouts sharing their staff offsets and height put every staff on a fixed
  // grid: system N's first staff sits exactly N pitches below system 0's.
  const uniformVerticalLayouts = options.spacing.uniformSystemPitch
    ? resolveUniformSystemVerticalLayouts(
        chunks,
        group.staves.length,
        options.spacing.staffGap,
        options.text.lyricScale
      )
    : undefined;

  for (const [systemIndex, chunk] of chunks.entries()) {
    const verticalLayout =
      uniformVerticalLayouts?.[systemIndex] ??
      resolveSystemVerticalLayout(
        chunk,
        group.staves.length,
        options.spacing.staffGap,
        options.text.lyricScale
      );
    let cursorX = origin.x;

    systems.push({
      groupId: group.groupId,
      systemIndex,
      x: origin.x,
      y: cursorY,
      width:
        chunk.length === measuresPerFullLine
          ? availableWidth
          : chunk.length * equalMeasureWidth,
      height: verticalLayout.height,
      staffCount: group.staves.length,
      staffYOffsets: verticalLayout.staffYOffsets,
      measureIndices: chunk.map((measure) => measure.measureIndex),
    });

    for (const measure of chunk) {
      measures.push({
        groupId: group.groupId,
        measureIndex: measure.measureIndex,
        x: cursorX,
        y: cursorY,
        width: equalMeasureWidth,
        height: verticalLayout.height,
        staffYOffsets: verticalLayout.staffYOffsets,
        staffLyrics: verticalLayout.staffLyrics,
        systemIndex,
      });

      cursorX += equalMeasureWidth;
    }

    cursorY += verticalLayout.height + systemGap;
  }

  return {
    groupId: group.groupId,
    systems,
    measures,
    nextY: cursorY,
  };
}

export function layoutDocumentGroup(
  group: GroupLayoutContext,
  origin: RendererPoint,
  availableWidth: number,
  options: ScoreOptions
): GroupLayoutResult {
  const systems: SystemLayoutPlan[] = [];
  const measures: MeasureLayoutPlan[] = [];

  if (group.measures.length === 0) {
    return {
      groupId: group.groupId,
      systems,
      measures,
      nextY: origin.y,
    };
  }

  const lineBreaks = options.layout.lineBreaks;
  const pageBreaks = new Set(options.layout.pageBreaks ?? []);
  const lines = lineBreaks
    ? splitDocumentLinesAt(
        group.measures,
        lineBreaks(
          group.measures.map((measure) => ({
            measureIndex: measure.measureIndex,
            width: getMeasureLineWidth(measure),
          })),
          Math.max(
            ...group.measures.map((measure) => measure.systemStartWidth)
          ),
          availableWidth
        )
      )
    : splitDocumentLines(group.measures, availableWidth, pageBreaks);
  const unbrokenPage = group.measures.find(
    (measure, position) =>
      position > 0 &&
      pageBreaks.has(measure.measureIndex) &&
      !lines.some((line) => line.measures[0] === measure)
  );

  if (unbrokenPage) {
    throw new Error(
      `options.layout.lineBreaks must start a line at every page break; measure index ${unbrokenPage.measureIndex} does not`
    );
  }

  let cursorY = origin.y;
  const systemGap =
    options.layout.systemGap ?? getSystemGap(options.spacing.staffGap);

  for (const [systemIndex, line] of lines.entries()) {
    if (systemIndex > 0 && pageBreaks.has(line.measures[0]!.measureIndex)) {
      cursorY += PAGE_BREAK_GAP;
    }

    const lineWidth =
      availableWidth > 0
        ? Math.min(
            availableWidth,
            Math.max(line.intrinsicWidth, availableWidth * line.widthRatio)
          )
        : line.intrinsicWidth;
    const stretchRatio = lineWidth / line.intrinsicWidth;
    const verticalLayout = resolveSystemVerticalLayout(
      line.measures,
      group.staves.length,
      options.spacing.staffGap,
      options.text.lyricScale
    );
    let cursorX = origin.x;

    systems.push({
      groupId: group.groupId,
      systemIndex,
      x: origin.x,
      y: cursorY,
      width: lineWidth,
      height: verticalLayout.height,
      staffCount: group.staves.length,
      staffYOffsets: verticalLayout.staffYOffsets,
      measureIndices: line.measures.map((measure) => measure.measureIndex),
    });

    for (const [lineMeasureIndex, measure] of line.measures.entries()) {
      const width =
        (getMeasureLineWidth(measure) +
          (lineMeasureIndex === 0 ? measure.systemStartWidth : 0)) *
        stretchRatio;

      measures.push({
        groupId: group.groupId,
        measureIndex: measure.measureIndex,
        x: cursorX,
        y: cursorY,
        width,
        height: verticalLayout.height,
        staffYOffsets: verticalLayout.staffYOffsets,
        staffLyrics: verticalLayout.staffLyrics,
        systemIndex,
      });

      cursorX += width;
    }

    cursorY += verticalLayout.height + systemGap;
  }

  return {
    groupId: group.groupId,
    systems,
    measures,
    nextY: cursorY,
  };
}

function splitDocumentLines(
  measures: MeasuredGroupMeasure[],
  availableWidth: number,
  pageBreaks: Set<number>
): DocumentLine[] {
  const lines: DocumentLine[] = [];
  let lineMeasures: MeasuredGroupMeasure[] = [];
  let lineWidth = 0;

  for (const measure of measures) {
    const measureWidth = getMeasureLineWidth(measure);

    if (lineMeasures.length === 0) {
      lineMeasures = [measure];
      lineWidth = measureWidth + measure.systemStartWidth;
      continue;
    }

    if (
      pageBreaks.has(measure.measureIndex) ||
      (availableWidth > 0 && lineWidth + measureWidth > availableWidth)
    ) {
      lines.push({
        measures: lineMeasures,
        intrinsicWidth: lineWidth,
        widthRatio: 1,
      });
      lineMeasures = [measure];
      lineWidth = measureWidth + measure.systemStartWidth;
      continue;
    }

    lineMeasures.push(measure);
    lineWidth += measureWidth;
  }

  if (lineMeasures.length > 0) {
    lines.push({
      measures: lineMeasures,
      intrinsicWidth: lineWidth,
      widthRatio: 1,
    });
  }

  return lines;
}

function splitDocumentLinesAt(
  measures: MeasuredGroupMeasure[],
  lineBreaks: LineBreaks
): DocumentLine[] {
  // Array.isArray does not narrow a readonly array out of a union.
  const lineStarts: readonly number[] = Array.isArray(lineBreaks)
    ? lineBreaks
    : (lineBreaks as LineBreakStarts).starts;
  const widthRatios = Array.isArray(lineBreaks)
    ? undefined
    : (lineBreaks as LineBreakStarts).widthRatios;

  if (
    lineStarts[0] !== 0 ||
    lineStarts.some(
      (start, index) =>
        !Number.isInteger(start) ||
        start >= measures.length ||
        (index > 0 && start <= lineStarts[index - 1]!)
    )
  ) {
    throw new Error(
      `options.layout.lineBreaks must return integer measure positions that start at 0, strictly increase and stay below ${
        measures.length
      }; got [${lineStarts.join(', ')}]`
    );
  }

  if (
    widthRatios &&
    (widthRatios.length !== lineStarts.length ||
      widthRatios.some((ratio) => !(ratio > 0 && ratio <= 1)))
  ) {
    throw new Error(
      `options.layout.lineBreaks must return one width ratio in (0, 1] per line; got [${widthRatios.join(
        ', '
      )}] for ${lineStarts.length} lines`
    );
  }

  return lineStarts.map((start, index) => {
    const lineMeasures = measures.slice(start, lineStarts[index + 1]);

    return {
      measures: lineMeasures,
      intrinsicWidth: lineMeasures.reduce(
        (width, measure) => width + getMeasureLineWidth(measure),
        lineMeasures[0]!.systemStartWidth
      ),
      widthRatio: widthRatios ? widthRatios[index]! : 1,
    };
  });
}

function getMeasureLineWidth(measure: MeasuredGroupMeasure): number {
  return Math.max(measure.intrinsicWidth, 1);
}
