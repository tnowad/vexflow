import {
  Barline,
  BarlineType,
  Repetition,
  type Stave,
  StaveModifierPosition,
  StaveTempo,
  Volta,
  VoltaType,
} from 'vexflow';

import type {
  Barline as MeasureBarline,
  KeyMode,
  KeySignature,
  Measure,
  MeasureLeftModifiers,
  MeasureState,
  Step,
} from '../state';
import type { ResolvedMeasureState } from './scoreParsing';

export interface ResolvedMeasureModifiers {
  showClef: boolean;
  showMeter: boolean;
  showKeySignature: boolean;
  startBarline: MeasureBarline;
  endBarline: MeasureBarline;
}

/** Fifths of the natural tonic; `#` adds 7, `b` subtracts 7. */
const STEP_FIFTHS: Record<Step, number> = {
  C: 0,
  D: 2,
  E: 4,
  F: -1,
  G: 1,
  A: 3,
  B: 5,
};

/** Fifths offset from the parallel major with the same tonic. */
const MODE_FIFTHS: Record<KeyMode, number> = {
  major: 0,
  mixolydian: -1,
  dorian: -2,
  minor: -3,
  phrygian: -4,
  lydian: 1,
  locrian: -5,
};

/** VexFlow major key specs indexed by fifths + 7. */
const MAJOR_KEY_SPECS = [
  'Cb',
  'Gb',
  'Db',
  'Ab',
  'Eb',
  'Bb',
  'F',
  'C',
  'G',
  'D',
  'A',
  'E',
  'B',
  'F#',
  'C#',
] as const;

const START_BARLINE_TYPES: Partial<Record<MeasureBarline, BarlineType>> = {
  'repeat-begin': BarlineType.REPEAT_BEGIN,
  'none': BarlineType.NONE,
};

const END_BARLINE_TYPES: Record<
  Exclude<MeasureBarline, 'heavy-light'>,
  BarlineType
> = {
  'single': BarlineType.SINGLE,
  'double': BarlineType.DOUBLE,
  'end': BarlineType.END,
  'final': BarlineType.END,
  'repeat-begin': BarlineType.SINGLE,
  'repeat-end': BarlineType.REPEAT_END,
  'none': BarlineType.NONE,
};

const CLEF_OCTAVE_ANNOTATIONS: Record<
  NonNullable<MeasureState['clefOctaveChange']>,
  string
> = {
  '-1': '8vb',
  '1': '8va',
};

/**
 * Resolves the tri-state measure modifiers: `true` shows, `false` hides,
 * `undefined` falls back to the default (clef on the first measure only,
 * meter and key signature hidden, single barlines).
 */
export function resolveMeasureModifiers(
  measure: Pick<Measure, 'leftModifiers' | 'rightModifiers'>,
  measureIndex: number
): ResolvedMeasureModifiers {
  const { leftModifiers, rightModifiers } = measure;

  return {
    showClef: leftModifiers?.showClef ?? measureIndex === 0,
    showMeter: leftModifiers?.showMeter ?? false,
    showKeySignature: leftModifiers?.showKeySignature ?? false,
    startBarline: leftModifiers?.startBarline ?? 'single',
    endBarline: rightModifiers?.endBarline ?? 'single',
  };
}

/** Modifiers of a measure that starts a 'document' system: clef and key signature are always shown. */
export function withSystemStartModifiers(
  modifiers: ResolvedMeasureModifiers
): ResolvedMeasureModifiers {
  return { ...modifiers, showClef: true, showKeySignature: true };
}

export function applyMeasureModifiers(
  stave: Stave,
  modifiers: ResolvedMeasureModifiers,
  resolvedState: ResolvedMeasureState
): Stave {
  const { clef, keySignature, meter } = resolvedState;

  if (modifiers.showClef) {
    stave.addClef(
      clef,
      undefined,
      resolvedState.clefOctaveChange &&
        CLEF_OCTAVE_ANNOTATIONS[resolvedState.clefOctaveChange]
    );
  }

  if (modifiers.showKeySignature && keySignature && clef !== 'percussion') {
    stave.addKeySignature(keySignatureToVFSpec(keySignature));
  }

  if (modifiers.showMeter) {
    stave.addTimeSignature(`${meter.beats}/${meter.beatUnit}`);
  }

  if (modifiers.startBarline === 'heavy-light') {
    setHeavyLightBarline(stave, 0, StaveModifierPosition.BEGIN);
  } else {
    stave.setBegBarType(
      START_BARLINE_TYPES[modifiers.startBarline] ?? BarlineType.SINGLE
    );
  }

  if (modifiers.endBarline === 'heavy-light') {
    setHeavyLightBarline(stave, 1, StaveModifierPosition.END);
  } else {
    stave.setEndBarType(END_BARLINE_TYPES[modifiers.endBarline]);
  }

  // Stave.format pads a lone REPEAT_BEGIN by 0, so its dots would overlap the first note.
  if (
    (modifiers.startBarline === 'repeat-begin' ||
      modifiers.startBarline === 'heavy-light') &&
    stave.getModifiers(StaveModifierPosition.BEGIN).length === 1
  ) {
    const { xMax, paddingRight } = stave.getModifiers()[0]!.getLayoutMetrics()!;

    stave.setNoteStartX(stave.getX() + xMax + paddingRight);
  }

  return stave;
}

/** VexFlow has no thick-thin barline: this one takes REPEAT_BEGIN's spacing and draws its lines without the dots. */
class HeavyLightBarline extends Barline {
  constructor(position: StaveModifierPosition) {
    super(BarlineType.REPEAT_BEGIN);
    this.setPosition(position);
  }

  override draw(): void {
    const stave = this.checkStave();
    const ctx = stave.checkContext();
    this.setRendered();

    const topY = stave.getTopLineTopY();
    const height = stave.getBottomLineBottomY() - topY;

    ctx.fillRect(this.x - 2, topY, 3, height);
    ctx.fillRect(this.x + 3, topY, 1, height);

    // Stave.format moves a REPEAT_BEGIN after the clef and key; the stave still starts with a line.
    if (stave.getX() !== this.x) {
      this.drawVerticalBar(stave, stave.getX());
    }
  }
}

/** Stave keeps its start and end barlines at modifiers 0 and 1. */
function setHeavyLightBarline(
  stave: Stave,
  index: 0 | 1,
  position: StaveModifierPosition
): void {
  stave.getModifiers()[index] = new HeavyLightBarline(position).setStave(stave);
}

// Lowest point of the marks drawn above a stave, above its top line, unless
// options.text.chordSymbolHeight needs more: clear of ScoreFlow's chord
// symbols at their default size, whose 10pt bold baseline is 20 above the
// line (Stave.getYForTopText(1)) and whose capitals reach about 30.
const ABOVE_STAFF_MARKS_BOTTOM = 34;
const ABOVE_STAFF_MARK_GAP = 4;
// How far each mark reaches below its baseline (descent) and in all (height,
// rounded up), from Bravura's glyph bounds in em at the sizes VexFlow draws
// them: the metronome note at 25pt, segno and coda at 30pt. A volta is its
// 1.5-space hook and a 1px line, with the label inside the hook.
const PX_PER_PT = 4 / 3;
const VOLTA_HOOK_HEIGHT = 15;
// VexFlow's Repetition.segno.offsetY and Repetition.coda.offsetY metrics, which
// its CommonJS build does not export.
const SEGNO_OFFSET_Y = 10;
const CODA_OFFSET_Y = 25;

type AboveStaffMarkKind = 'volta' | 'tempo' | 'segno' | 'coda';

const ABOVE_STAFF_MARK_METRICS: Record<
  AboveStaffMarkKind,
  { descent: number; height: number }
> = {
  volta: { descent: 0, height: VOLTA_HOOK_HEIGHT + 1 },
  tempo: {
    descent: 0.141 * 25 * PX_PER_PT,
    height: Math.ceil(0.829 * 25 * PX_PER_PT),
  },
  segno: {
    descent: 0.027 * 30 * PX_PER_PT,
    height: Math.ceil(0.786 * 30 * PX_PER_PT),
  },
  coda: {
    descent: 0.158 * 30 * PX_PER_PT,
    height: Math.ceil(1.056 * 30 * PX_PER_PT),
  },
};

const VOLTA_TYPES: Record<
  NonNullable<MeasureLeftModifiers['volta']>['type'],
  VoltaType
> = {
  'begin': VoltaType.BEGIN,
  'mid': VoltaType.MID,
  'end': VoltaType.END,
  'begin-end': VoltaType.BEGIN_END,
};

export interface AboveStaffMarks {
  volta?: MeasureLeftModifiers['volta'];
  tempo?: MeasureLeftModifiers['tempo'];
  repetition?: MeasureLeftModifiers['repetition'];
}

/** The first volta, metronome mark and segno or coda among the measures a system's top stave draws them for. */
export function resolveAboveStaffMarks(
  measures: readonly (Pick<Measure, 'leftModifiers'> | undefined)[]
): AboveStaffMarks {
  const first = <K extends keyof AboveStaffMarks>(key: K) =>
    measures
      .map((measure) => measure?.leftModifiers?.[key])
      .find((value) => value !== undefined);

  return {
    volta: first('volta'),
    tempo: first('tempo'),
    repetition: first('repetition'),
  };
}

/**
 * Each mark's bottom above the top staff line, stacked upwards: volta,
 * metronome mark, segno or coda, starting above chord symbols that reach
 * `chordSymbolHeight` above the line.
 */
function stackAboveStaffMarks(
  marks: AboveStaffMarks,
  chordSymbolHeight: number
): {
  placed: { kind: AboveStaffMarkKind; bottom: number }[];
  height: number;
} {
  const kinds = [
    marks.volta && 'volta',
    marks.tempo && 'tempo',
    marks.repetition,
  ].filter(Boolean) as AboveStaffMarkKind[];
  let bottom = Math.max(
    ABOVE_STAFF_MARKS_BOTTOM,
    chordSymbolHeight + ABOVE_STAFF_MARK_GAP
  );
  const placed = kinds.map((kind) => {
    const mark = { kind, bottom };

    bottom += ABOVE_STAFF_MARK_METRICS[kind].height + ABOVE_STAFF_MARK_GAP;

    return mark;
  });
  const last = placed[placed.length - 1];

  return {
    placed,
    height: last ? last.bottom + ABOVE_STAFF_MARK_METRICS[last.kind].height : 0,
  };
}

/** How far above the top staff line the marks reach, stacked above chord symbols reaching `chordSymbolHeight`; 0 without marks. */
export function aboveStaffMarksHeight(
  marks: AboveStaffMarks,
  chordSymbolHeight: number
): number {
  return stackAboveStaffMarks(marks, chordSymbolHeight).height;
}

/** Adds the marks to the stave as VexFlow stave modifiers, placed by their y shifts. */
export function applyAboveStaffMarks(
  stave: Stave,
  marks: AboveStaffMarks,
  chordSymbolHeight: number
): Stave {
  const topLineY = stave.getYForLine(0);
  const voltaY = stave.getYForTopText(stave.getNumLines());

  for (const { kind, bottom } of stackAboveStaffMarks(marks, chordSymbolHeight)
    .placed) {
    const baseline = topLineY - bottom - ABOVE_STAFF_MARK_METRICS[kind].descent;

    if (kind === 'volta') {
      stave.addModifier(
        new Volta(
          VOLTA_TYPES[marks.volta!.type],
          marks.volta!.label,
          stave.getX(),
          topLineY - bottom - VOLTA_HOOK_HEIGHT - voltaY
        )
      );
    } else if (kind === 'tempo') {
      stave.addModifier(
        new StaveTempo(
          {
            duration: marks.tempo!.beatUnit.length,
            dots: marks.tempo!.beatUnit.dots,
            bpm: marks.tempo!.bpm,
          },
          stave.getX(),
          baseline - stave.getYForTopText(1)
        )
      );
    } else if (kind === 'segno') {
      stave.addModifier(
        new Repetition(
          Repetition.type.SEGNO_LEFT,
          stave.getX(),
          baseline - voltaY - SEGNO_OFFSET_Y
        )
      );
    } else {
      // VexFlow draws the bare coda glyph only at the stave's right end; shift it back to the start.
      stave.addModifier(
        new Repetition(
          Repetition.type.CODA_RIGHT,
          stave.getX(),
          baseline - voltaY - CODA_OFFSET_Y
        ).setShiftX(-stave.getWidth())
      );
    }
  }

  return stave;
}

/** Major-key VexFlow spec for the key's accidentals, respelt enharmonically beyond 7 sharps/flats. */
export function keySignatureToVFSpec(keySignature: KeySignature): string {
  const { tonic, accidental, mode = 'major' } = keySignature;
  const accidentalFifths = accidental === '#' ? 7 : accidental === 'b' ? -7 : 0;
  const fifths = STEP_FIFTHS[tonic] + accidentalFifths + MODE_FIFTHS[mode];
  const wrapped = fifths > 7 ? fifths - 12 : fifths < -7 ? fifths + 12 : fifths;

  return MAJOR_KEY_SPECS[wrapped + 7]!;
}
