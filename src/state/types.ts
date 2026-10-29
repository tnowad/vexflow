export type Id = string;

export type Clef =
  | 'treble'
  | 'bass'
  | 'alto'
  | 'tenor'
  | 'soprano'
  | 'mezzo-soprano'
  | 'baritone-c'
  | 'baritone-f'
  | 'subbass'
  | 'french'
  | 'percussion'
  | 'tab';

export type Step = 'C' | 'D' | 'E' | 'F' | 'G' | 'A' | 'B';

export type Accidental =
  | 'bbb'
  | 'bb'
  | 'b'
  | 'n'
  | '#'
  | '##'
  | '###'
  | 'x'
  | 'quarter-flat'
  | 'quarter-sharp';

export type NoteLength =
  | 'long'
  | 'breve'
  | 'w'
  | 'h'
  | 'q'
  | '8'
  | '16'
  | '32'
  | '64'
  | '128';

export type StemDirection = 'up' | 'down' | 'auto';

export type Notehead =
  | 'x'
  | 'circle-x'
  | 'diamond'
  | 'circle'
  | 'square'
  | 'triangle'
  | 'triangle-down'
  | 'slash';

export type Barline =
  | 'single'
  | 'double'
  | 'end'
  | 'repeat-begin'
  | 'repeat-end'
  | 'final'
  | 'heavy-light'
  | 'none';

export type Articulation =
  | 'staccato'
  | 'tenuto'
  | 'accent'
  | 'marcato'
  | 'staccatissimo'
  | 'fermata'
  | 'open'
  | 'stopped';

export type Dynamic =
  | 'ppp'
  | 'pp'
  | 'p'
  | 'mp'
  | 'mf'
  | 'f'
  | 'ff'
  | 'fff'
  | 'fp'
  | 'sf'
  | 'sfp'
  | 'sfz'
  | 'rf'
  | 'rfz'
  | 'fz'
  | 'n';

export type KeyMode =
  | 'major'
  | 'minor'
  | 'dorian'
  | 'phrygian'
  | 'lydian'
  | 'mixolydian'
  | 'locrian';

export type VoiceTimingMode = 'strict' | 'soft' | 'free';

export type StaffGroupRole = 'grandStaff' | 'choir' | 'section' | 'custom';
export type StaffGroupSymbol = 'brace' | 'bracket' | 'line';

export interface Fraction {
  num: number;
  den: number;
}

export interface Pitch {
  step: Step;
  octave: number;
  accidental?: Accidental;
  notehead?: Notehead;
  /** Draws the notehead in parentheses (a ghost note). */
  parenthesized?: boolean;
}

export interface DurationValue {
  length: NoteLength;
  dots?: 0 | 1 | 2 | 3;
}

export interface KeySignature {
  tonic: Step;
  accidental?: 'b' | '#';
  mode?: KeyMode;
}

export interface Meter {
  beats: number;
  beatUnit: number;
  /** Omitted = VexFlow's default for the meter: numerators divisible by 3 group in threes, else 2/beatUnit above a quarter (5/8 → 2/8), else 1/beatUnit (5/4 → 1/4). */
  beamGroups?: Fraction[];
}

export interface Tempo {
  bpm: number;
  beatUnit?: DurationValue;
  text?: string;
}

export interface Note {
  id: Id;
  type: 'note';
  pitch: Pitch;
  duration: DurationValue;
  voiceId: Id;
  targetStaffId?: Id;
  stemDirection?: StemDirection;
}

export interface Rest {
  id: Id;
  type: 'rest';
  duration: DurationValue;
  voiceId: Id;
  targetStaffId?: Id;
  kind?: 'visible' | 'spacer' | 'hidden';
  /**
   * 0 = bottom line … 4 = top line of the five-line geometry; undefined = the
   * middle line.
   */
  staffLine?: 0 | 1 | 2 | 3 | 4;
}

export interface Chord {
  id: Id;
  type: 'chord';
  pitches: Pitch[];
  duration: DurationValue;
  voiceId: Id;
  targetStaffId?: Id;
  stemDirection?: StemDirection;
}

export type VoiceItem = Note | Rest | Chord;

export interface Voice {
  id: Id;
  name?: string;
  index: number;
  timingMode?: VoiceTimingMode;
  items: VoiceItem[];
}

export interface MeasureState {
  clef?: Clef;
  /** Octave the clef transposes by (MusicXML `<clef-octave-change>`), drawn as the 8 below or above a treble or bass clef. Notes keep their pitch and are drawn an octave away from where `clef` alone puts them. Set together with `clef`. */
  clefOctaveChange?: -1 | 1;
  meter?: Meter;
  keySignature?: KeySignature;
  tempo?: Tempo;
}

export interface MeasureLeftModifiers {
  /** undefined = shown on the first measure only; false hides it there too. */
  showClef?: boolean;
  /** undefined = hidden. */
  showMeter?: boolean;
  /** undefined = hidden; never drawn on a percussion clef. */
  showKeySignature?: boolean;
  /** undefined = 'single'; only 'single', 'repeat-begin', 'heavy-light' and 'none' render here. */
  startBarline?: Barline;
  /** Ending (volta) bracket over this measure, drawn on the top stave of the system. */
  volta?: Volta;
  /** Metronome mark (beat unit = bpm) drawn above this measure on the top stave of the system. */
  tempo?: { bpm: number; beatUnit: DurationValue };
  /** Segno or coda sign drawn above the start of this measure on the top stave of the system. */
  repetition?: 'segno' | 'coda';
}

/** `type` says which hooks this measure's part of the bracket has: 'begin' starts it with a left hook and its label, 'end' closes it with a right hook, 'mid' is the line alone. */
export interface Volta {
  label: string;
  type: 'begin' | 'mid' | 'end' | 'begin-end';
}

export interface MeasureRightModifiers {
  /** undefined = 'single'; 'repeat-begin' draws as a single line. 'none' is invisible: the next measure in the system draws no start barline either. */
  endBarline?: Barline;
}

export interface TextDirection {
  id: Id;
  type: 'text';
  text: string;
  /** undefined = 'above'. */
  placement?: 'above' | 'below';
  /**
   * Where in the measure the text applies, in whole notes from its start.
   * Drawn at the item starting there, else between the items around it;
   * undefined draws it on the first drawn item of the first voice.
   */
  position?: Fraction;
}

/** Not drawn; the tempo reaches the renderer through `MeasureState`. */
export interface TempoDirection {
  id: Id;
  type: 'tempo';
  tempo: Tempo;
  placement?: 'above' | 'below';
}

export type Direction = TextDirection | TempoDirection;

export interface Measure {
  id: Id;
  number: number;

  state?: MeasureState;

  leftModifiers?: MeasureLeftModifiers;
  rightModifiers?: MeasureRightModifiers;

  directions?: Direction[];
  voices: Voice[];
}

export type StaffLines = 1 | 3 | 5;

export interface Staff {
  id: Id;
  name?: string;
  shortName?: string;
  order: number;
  defaultClef: Clef;
  /**
   * Visible staff lines (default 5). Fewer lines hide the outer lines
   * symmetrically around the middle one while notes keep the 5-line pitch
   * geometry, so a one-line staff's line is `ONE_LINE_STAFF_PITCH`.
   */
  lines?: StaffLines;
  transposition?: number;
  measures: Measure[];
}

export interface StaffGroup {
  id: Id;
  staffIds?: Id[];
  role: StaffGroupRole;
  symbol?: StaffGroupSymbol;
}

export interface ScoreMetadata {
  title?: string;
  subtitle?: string;
  composer?: string;
  lyricist?: string;
  arranger?: string;
  copyright?: string;
}

export interface ScoreDefaults {
  meter: Meter;
  keySignature?: KeySignature;
  tempo?: Tempo;
}

export interface AttachmentBase {
  id: Id;
  ownerId: Id;
}

export interface ArticulationAttachment extends AttachmentBase {
  type: 'articulation';
  articulation: Articulation;
  /** undefined = 'above'. */
  placement?: 'above' | 'below';
  /** Chord pitches the mark belongs to, as indices into `Chord.pitches`;
   * undefined = the whole owner. Engraved once per owner either way; indices
   * on a `note` owner or out of range are tolerated and ignored. */
  pitchIndices?: number[];
}

export interface DynamicAttachment extends AttachmentBase {
  type: 'dynamic';
  dynamic: Dynamic;
  /** undefined = 'below'. */
  placement?: 'above' | 'below';
}

export interface LyricAttachment extends AttachmentBase {
  type: 'lyric';
  text: string;
  /** Verse order below the owner, ascending; undefined sorts first. */
  verse?: number;
}

/** Free text drawn above or below the owner (a note, chord or rest), e.g. a
 * sticking letter or a fingering. */
export interface AnnotationAttachment extends AttachmentBase {
  type: 'annotation';
  text: string;
  placement?: 'above' | 'below';
}

export interface GraceNote {
  pitch: Pitch;
  duration: DurationValue;
}

export interface GraceNoteAttachment extends AttachmentBase {
  type: 'grace';
  /** Played before the owner, in order. */
  notes: GraceNote[];
  /** Acciaccatura slash through the (first) stem. */
  slash?: boolean;
}

export type NoteAttachment =
  | ArticulationAttachment
  | DynamicAttachment
  | LyricAttachment
  | AnnotationAttachment
  | GraceNoteAttachment;

export interface Tie {
  id: Id;
  fromNoteId: Id;
  toNoteId: Id;
}

export interface Slur {
  id: Id;
  fromNoteId: Id;
  toNoteId: Id;
}

export interface TupletGroup {
  id: Id;
  voiceId: Id;
  itemIds: Id[];
  ratio: Fraction;
  bracketed?: boolean;
  placement?: 'above' | 'below';
}

export interface Score {
  id: Id;
  metadata?: ScoreMetadata;
  defaults: ScoreDefaults;
  staves: Staff[];
  staffGroups?: StaffGroup[];
  attachments?: NoteAttachment[];
  ties?: Tie[];
  slurs?: Slur[];
  tuplets?: TupletGroup[];
}
