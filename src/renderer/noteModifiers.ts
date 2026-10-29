import {
  Accidental as VFAccidental,
  Annotation as VFAnnotation,
  AnnotationVerticalJustify,
  Articulation as VFArticulation,
  BoundingBox,
  Dot,
  Font,
  GraceNote as VFGraceNote,
  GraceNoteGroup,
  ModifierPosition,
  Parenthesis,
  StaveNote,
  Stem,
} from 'vexflow';
import type { StemmableNote } from 'vexflow';

import type {
  Articulation,
  Clef,
  Direction,
  DurationValue,
  Dynamic,
  GraceNoteAttachment,
  LyricAttachment,
  NoteAttachment,
  Pitch,
} from '../state';
import { textOptions } from './constants';
import type { ScoreTextOptions } from './types';
import { durationToVF, pitchToVFKey } from './vfKeys';
export type LyricOptions = Pick<ScoreTextOptions, 'lyricScale' | 'alignLyrics'>;

/**
 * Maps library articulation names to VexFlow articulation codes.
 */
export const ARTICULATION_TO_VF_CODE: Record<Articulation, string> = {
  staccato: 'a.',
  staccatissimo: 'av',
  tenuto: 'a-',
  accent: 'a>',
  marcato: 'a^',
  fermata: 'a@',
  open: 'ah',
  stopped: 'a+',
};

/** SMuFL dynamics glyphs, drawn with the music font. */
const DYNAMIC_GLYPHS: Record<Dynamic, string> = {
  ppp: '',
  pp: '',
  p: '',
  mp: '',
  mf: '',
  f: '',
  ff: '',
  fff: '',
  fp: '',
  sf: '',
  sfp: '',
  sfz: '',
  rf: '',
  rfz: '',
  fz: '',
  n: '',
};

const DYNAMIC_FONT_SIZE = 30;

const ANNOTATION_FONT = {
  family: 'Arial, Helvetica, sans-serif',
  size: 10,
  weight: 'bold',
};

const LYRIC_FONT = {
  family: ANNOTATION_FONT.family,
  size: 10,
  weight: 'normal',
};
// Aligned lyric lines: the gap between the lowest note or mark and the top
// of the first line, and between lines (VexFlow stacks annotations 2 apart).
const ALIGNED_LYRIC_GAP = 6;
const LYRIC_LINE_GAP = 2;
// Descenders (g, y, p) reach about a quarter of the font size below the baseline.
const LYRIC_DESCENT_RATIO = 0.25;

function lyricFontPx(lyricScale: number) {
  return Font.convertSizeToPixelValue(LYRIC_FONT.size * lyricScale);
}

/** Baseline of aligned lyric line `line` (0 for the first verse) under content reaching down to `top`. */
export function alignedLyricBaseline(
  top: number,
  line: number,
  lyricScale: number
): number {
  const fontPx = lyricFontPx(lyricScale);

  return top + ALIGNED_LYRIC_GAP + fontPx + line * (fontPx + LYRIC_LINE_GAP);
}

/** How far `lineCount` aligned lyric lines reach below the content above them. */
export function alignedLyricsHeight(
  lineCount: number,
  lyricScale: number
): number {
  return lineCount === 0
    ? 0
    : alignedLyricBaseline(0, lineCount - 1, lyricScale) +
        LYRIC_DESCENT_RATIO * lyricFontPx(lyricScale);
}

/** Verse keys in line order; a lyric without a verse number comes first. */
export function compareVerses(
  left: number | undefined,
  right: number | undefined
): number {
  return (left ?? -Infinity) - (right ?? -Infinity);
}

/**
 * A lyric syllable. Hanging (default) it is a bottom annotation stacked under
 * its note. Aligned it is drawn centred on the note at the baseline the
 * renderer sets for its verse on the system; until then (while measuring)
 * it takes no place, and the system reserves its line instead.
 */
export class Lyric extends VFAnnotation {
  readonly verse: number | undefined;
  readonly aligned: boolean;
  baseline: number | undefined;

  constructor(text: string, verse: number | undefined, aligned: boolean) {
    super(text);
    this.verse = verse;
    this.aligned = aligned;
    this.baseline = undefined;
    this.setVerticalJustification(AnnotationVerticalJustify.BOTTOM);
  }

  setBaseline(y: number): this {
    this.baseline = y;
    return this;
  }

  draw(): void {
    if (!this.aligned) {
      super.draw();
      return;
    }

    if (this.baseline === undefined) {
      return;
    }

    const ctx = this.checkContext();
    const start = this.checkAttachedNote().getModifierStartXY(
      ModifierPosition.ABOVE,
      this.index
    );

    this.setRendered();
    ctx.openGroup('annotation', this.getAttribute('id'));
    this.x = start.x - this.getWidth() / 2;
    this.y = this.baseline;
    this.renderText(ctx, 0, 0);
    ctx.closeGroup();
  }

  getBoundingBox(): BoundingBox {
    if (this.aligned && this.baseline === undefined) {
      const note = this.checkAttachedNote();

      return new BoundingBox(note.getAbsoluteX(), note.getYs()[0]!, 0, 0);
    }

    return super.getBoundingBox();
  }
}

const DIRECTION_FONT = {
  family: ANNOTATION_FONT.family,
  size: 11,
  weight: 'bold',
};

/** `GhostNote`s have no glyphs, so their element box is the origin. */
export function hasNoteHeads(note: StemmableNote): note is StaveNote {
  return 'getNoteHeadBeginX' in note;
}

/**
 * Applies the requested number of augmentation dots to a note.
 */
export function applyDots(note: StaveNote, dots?: 0 | 1 | 2 | 3) {
  for (let i = 0; i < (dots ?? 0); i++) {
    Dot.buildAndAttach([note], { all: true });
  }
}

/**
 * Adds pitch accidentals to the matching keys in a VexFlow note.
 */
function addPitchAccidentals(note: StaveNote, pitches: readonly Pitch[]) {
  pitches.forEach((pitch, index) => {
    if (!pitch.accidental) {
      return;
    }
    // A triple accidental is written as a double and a single side by side: F𝄪♯, B♭𝄫.
    // VexFlow puts the first one added nearest the note.
    if (pitch.accidental === '###' || pitch.accidental === 'bbb') {
      const [nearest, farthest] =
        pitch.accidental === '###' ? ['#', '##'] : ['bb', 'b'];

      note.addModifier(new VFAccidental(nearest), index);
      note.addModifier(new VFAccidental(farthest), index);
      return;
    }

    const type =
      pitch.accidental === 'quarter-flat'
        ? 'db'
        : pitch.accidental === 'quarter-sharp'
        ? 'd#'
        : pitch.accidental;

    note.addModifier(new VFAccidental(type), index);
  });
}

/**
 * Wraps each parenthesized pitch of a note in parentheses.
 */
function applyPitchParentheses(note: StaveNote, pitches: readonly Pitch[]) {
  pitches.forEach((pitch, index) => {
    if (!pitch.parenthesized) {
      return;
    }

    note.addModifier(new Parenthesis(ModifierPosition.LEFT), index);
    note.addModifier(new Parenthesis(ModifierPosition.RIGHT), index);
  });
}

export function decorateStaveNote(
  note: StaveNote,
  pitches: readonly Pitch[],
  duration: DurationValue
) {
  addPitchAccidentals(note, pitches);
  applyPitchParentheses(note, pitches);
  applyDots(note, duration.dots);
}

/** Every attachment a rest can carry: grace notes need a pitched owner. */
export function restAttachments(
  attachments: NoteAttachment[] | undefined
): NoteAttachment[] | undefined {
  return attachments?.filter((attachment) => attachment.type !== 'grace');
}

function verticalJustification(placement: 'above' | 'below') {
  return placement === 'above'
    ? AnnotationVerticalJustify.TOP
    : AnnotationVerticalJustify.BOTTOM;
}

function byVerse(left: LyricAttachment, right: LyricAttachment) {
  return compareVerses(left.verse, right.verse);
}

/**
 * Attaches the owner's marks to a VexFlow note in a fixed order regardless of
 * the attachments' order: articulations, annotations, dynamics, lyrics (by
 * verse), grace notes. Same-side marks stack outward in that order.
 */
export function applyNoteModifiers(
  note: StaveNote,
  clef: Clef,
  attachments: NoteAttachment[] | undefined,
  octaveShift = 0,
  lyrics: LyricOptions = textOptions
) {
  if (!attachments) {
    return;
  }

  for (const attachment of attachments) {
    if (attachment.type === 'articulation') {
      const articulation = new VFArticulation(
        ARTICULATION_TO_VF_CODE[attachment.articulation]
      );

      if (attachment.placement === 'below') {
        articulation.setPosition(ModifierPosition.BELOW);
      }

      note.addModifier(articulation, 0);
    }
  }

  for (const attachment of attachments) {
    if (attachment.type === 'annotation') {
      const annotation = new VFAnnotation(attachment.text);

      annotation.setFont(ANNOTATION_FONT);
      annotation.setVerticalJustification(
        verticalJustification(attachment.placement ?? 'below')
      );
      note.addModifier(annotation, 0);
    }
  }

  for (const attachment of attachments) {
    if (attachment.type === 'dynamic') {
      const dynamic = new VFAnnotation(DYNAMIC_GLYPHS[attachment.dynamic]);

      dynamic.setFontSize(DYNAMIC_FONT_SIZE);
      dynamic.setVerticalJustification(
        verticalJustification(attachment.placement ?? 'below')
      );
      note.addModifier(dynamic, 0);
    }
  }

  attachments
    .filter(
      (attachment): attachment is LyricAttachment => attachment.type === 'lyric'
    )
    .sort(byVerse)
    .forEach((attachment) => {
      const lyric = new Lyric(
        attachment.text,
        attachment.verse,
        lyrics.alignLyrics
      );

      lyric.setFont({
        ...LYRIC_FONT,
        size: LYRIC_FONT.size * lyrics.lyricScale,
      });
      note.addModifier(lyric, 0);
    });

  for (const attachment of attachments) {
    if (attachment.type === 'grace') {
      applyGraceNoteGroup(note, clef, attachment, octaveShift);
    }
  }
}

/**
 * Grace notes stem up unless the owner was built stem-down (auto stems that
 * flip later in `Beam.generateBeams` are not followed); two or more are
 * beamed together, with the acciaccatura slash on the first stem only.
 */
function applyGraceNoteGroup(
  note: StaveNote,
  clef: Clef,
  attachment: GraceNoteAttachment,
  octaveShift: number
) {
  if (attachment.notes.length === 0) {
    return;
  }

  const stemDirection =
    note.getStemDirection() === Stem.DOWN ? Stem.DOWN : Stem.UP;
  const graceNotes = attachment.notes.map((graceNote, index) => {
    const vfGraceNote = new VFGraceNote({
      clef,
      keys: [pitchToVFKey(graceNote.pitch)],
      duration: durationToVF(graceNote.duration),
      slash: index === 0 && attachment.slash === true,
      stemDirection,
      octaveShift,
    });
    decorateStaveNote(vfGraceNote, [graceNote.pitch], graceNote.duration);
    return vfGraceNote;
  });
  const group = new GraceNoteGroup(graceNotes);

  if (graceNotes.length > 1) {
    group.beamNotes();
  }

  note.addModifier(group, 0);
}

// VexFlow's ticks per whole note (Tables.RESOLUTION, which vexflow does not
// export).
const WHOLE_NOTE_TICKS = 16384;
// Ticks closer than this are the same position (VexFlow tuplet ticks are
// fractional).
const SAME_TICK = 1e-6;

/** A direction drawn between two items, moved once the notes are formatted. */
export interface DirectionShift {
  annotation: VFAnnotation;
  note: StemmableNote;
  /** null: toward the end of the note area. */
  next: StemmableNote | null;
  /** How far toward `next`, in [0, 1). */
  fraction: number;
}

/**
 * Adds a staff measure's text directions to its drawn items. A direction
 * with a position goes on the item starting there, searching the voices in
 * order; between items, on the latest one starting before it, to be moved
 * after formatting toward the next item (or the end of the note area) by how
 * far the position lies between them; before every item, on the earliest.
 * Without a position it goes on the first drawn item of the first voice.
 * Tempo directions are not drawn. Returns the moves for placeDirectionShifts.
 */
export function applyMeasureDirections(
  voices: readonly {
    notes: readonly StemmableNote[];
    noteStarts: readonly number[];
  }[],
  directions: readonly Direction[] | undefined
): DirectionShift[] {
  const shifts: DirectionShift[] = [];

  if (!directions?.length) {
    return shifts;
  }

  const drawn = voices.flatMap(({ notes, noteStarts }) =>
    notes
      .map((note, index) => ({ note, start: noteStarts[index]! }))
      .filter(({ note }) => hasNoteHeads(note))
  );
  const measureTicks = Math.max(
    0,
    ...voices.map(({ notes, noteStarts }) =>
      notes.length === 0
        ? 0
        : noteStarts[notes.length - 1]! +
          notes[notes.length - 1]!.getTicks().value()
    )
  );

  for (const direction of directions) {
    if (direction.type !== 'text') {
      continue;
    }

    const annotation = new VFAnnotation(direction.text);

    annotation.setFont(DIRECTION_FONT);
    annotation.setVerticalJustification(
      verticalJustification(direction.placement ?? 'above')
    );

    if (!direction.position) {
      voices[0]?.notes.find(hasNoteHeads)?.addModifier(annotation, 0);
      continue;
    }

    const tick =
      (direction.position.num / direction.position.den) * WHOLE_NOTE_TICKS;
    const exact = drawn.find(({ start }) => Math.abs(start - tick) < SAME_TICK);

    if (exact) {
      exact.note.addModifier(annotation, 0);
      continue;
    }

    let before: (typeof drawn)[number] | undefined;
    let after: (typeof drawn)[number] | undefined;

    for (const candidate of drawn) {
      if (
        candidate.start < tick &&
        (!before || candidate.start > before.start)
      ) {
        before = candidate;
      }

      if (candidate.start > tick && (!after || candidate.start < after.start)) {
        after = candidate;
      }
    }

    if (!before) {
      after?.note.addModifier(annotation, 0);
      continue;
    }

    before.note.addModifier(annotation, 0);

    const endTick = after ? after.start : measureTicks;

    if (tick < endTick) {
      shifts.push({
        annotation,
        note: before.note,
        next: after?.note ?? null,
        fraction: (tick - before.start) / (endTick - before.start),
      });
    }
  }

  return shifts;
}

/** Moves directions placed between items, once the notes are formatted. */
export function placeDirectionShifts(shifts: readonly DirectionShift[]) {
  for (const { annotation, note, next, fraction } of shifts) {
    const from = note.getAbsoluteX();
    const to = next ? next.getAbsoluteX() : note.checkStave().getNoteEndX();
    const shift = fraction * (to - from);
    // setXShift moves a modifier positioned LEFT, as an Annotation is,
    // leftward; the annotation itself is drawn over its note.
    annotation.setXShift(
      annotation.getPosition() === ModifierPosition.LEFT ? -shift : shift
    );
  }
}
