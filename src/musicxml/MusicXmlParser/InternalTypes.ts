import type {
  DynamicAttachment,
  GraceNote,
  Measure,
  NoteAttachment,
  ScoreDefaults,
  Slur,
  Staff,
  Tie,
  TupletGroup,
} from '../../state';

export type PartInfo = {
  id: string;
  name?: string;
};

export type StaffBuild = {
  id: string;
  name?: string;
  order: number;
  defaultClef?: Staff['defaultClef'];
  measures: Measure[];
};

type ActiveSpanner = {
  itemId: string;
};

export type PendingGraceNotes = {
  notes: GraceNote[];
  slash: boolean;
};

export type PendingDynamic = Pick<
  DynamicAttachment,
  'dynamic' | 'placement'
> & {
  /** Divisions from the start of the measure being parsed. */
  position: number;
};

export type ParserState = {
  scoreId: string;
  divisions: number;
  defaults: ScoreDefaults;
  attachments: NoteAttachment[];
  ties: Tie[];
  slurs: Slur[];
  tuplets: TupletGroup[];
  /** Keyed by MusicXML staff number; consumed by that staff's next note
   * starting at or after their position. */
  pendingDynamics: Map<string, PendingDynamic[]>;
  /** Keyed by MusicXML voice name; consumed by that voice's next note. */
  pendingGraceNotes: Map<string, PendingGraceNotes>;
  activeTies: Map<string, ActiveSpanner>;
  activeSlurs: Map<string, ActiveSpanner>;
  activeTuplets: Map<string, TupletGroup>;
  /** The part's ending from its start measure until it stops. */
  openEnding?: { label: string; printed: boolean };
};
