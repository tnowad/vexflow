import type { Direction, MeasureLeftModifiers, Tempo } from '../../state';
import type { ParserState, PendingDynamic } from './InternalTypes';
import {
  dynamicsFromElement,
  mapDurationType,
  otherDynamicsText,
} from './mappers';
import {
  attr,
  childText,
  childrenNamed,
  numberText,
  optionalChild,
  textOf,
  type XmlElement,
} from './XmlOrder';

export type ParsedDirection = {
  /** 0-based; unvalidated, NaN for a non-numeric `<staff>`. */
  staffIndex: number;
  directions: Direction[];
  marks: Pick<MeasureLeftModifiers, 'tempo' | 'repetition'>;
};

/**
 * `measurePosition` is where the direction appears among the measure's
 * notes, in divisions from the measure start; its `<offset>` moves it from
 * there. Text directions keep the result as `position`, and dynamics wait for
 * the first note of their staff that starts at or after it.
 */
export function parseDirection(
  direction: XmlElement,
  state: ParserState,
  measurePosition: number
): ParsedDirection {
  const position = Math.max(
    0,
    measurePosition + (numberText(direction, 'offset') ?? 0)
  );
  const wholeNotePosition = { num: position, den: state.divisions * 4 };
  const explicitPlacement = attr(direction, 'placement');
  const dynamicPlacement =
    explicitPlacement === 'above' || explicitPlacement === 'below'
      ? explicitPlacement
      : undefined;
  const placement = dynamicPlacement ?? 'above';
  const staffNumber = childText(direction, 'staff') ?? '1';
  const directions: Direction[] = [];
  const marks: ParsedDirection['marks'] = {};
  const soundTempo = optionalChild(direction, 'sound')?.attributes.tempo;
  const tempo = soundTempo ? parseTempo(soundTempo) : undefined;

  childrenNamed(direction, 'direction-type').forEach((type) => {
    childrenNamed(type, 'metronome').forEach((metronome) => {
      marks.tempo ??= parseMetronomeMark(metronome);
    });

    (['segno', 'coda'] as const).forEach((sign) => {
      if (
        childrenNamed(type, sign).some(
          (element) => attr(element, 'print-object') !== 'no'
        )
      ) {
        marks.repetition = sign;
      }
    });

    childrenNamed(type, 'words').forEach((words, index) => {
      const text = textOf(words);

      if (text) {
        directions.push({
          id: `direction-text-${directions.length.toString()}-${index.toString()}`,
          type: 'text',
          text,
          placement,
          position: wholeNotePosition,
        });
      }
    });

    childrenNamed(type, 'dynamics').forEach((dynamics) => {
      const parsedDynamics = dynamicsFromElement(dynamics);
      const otherText = otherDynamicsText(dynamics);

      if (parsedDynamics.length) {
        addPendingDynamics(
          state,
          staffNumber,
          parsedDynamics.map((dynamic) => ({
            dynamic,
            placement: dynamicPlacement,
            position,
          }))
        );
      }

      if (otherText) {
        directions.push({
          id: `direction-text-${directions.length.toString()}`,
          type: 'text',
          text: otherText,
          placement,
          position: wholeNotePosition,
        });
      }
    });
  });

  if (tempo) {
    state.defaults.tempo ??= tempo;
    directions.push({
      id: `direction-tempo-${directions.length.toString()}`,
      type: 'tempo',
      tempo,
      placement,
    });
  }

  return { staffIndex: Number(staffNumber) - 1, directions, marks };
}

/** Only a `beat-unit = per-minute` mark with a numeric rate is drawn. */
function parseMetronomeMark(
  metronome: XmlElement
): MeasureLeftModifiers['tempo'] {
  const beatUnit = childText(metronome, 'beat-unit');
  const bpm = Number(childText(metronome, 'per-minute'));

  if (attr(metronome, 'print-object') === 'no' || !beatUnit || !(bpm > 0)) {
    return undefined;
  }

  const dots = childrenNamed(metronome, 'beat-unit-dot').length;

  return {
    bpm,
    beatUnit: {
      length: mapDurationType(beatUnit),
      ...(dots ? { dots: dots as 1 | 2 | 3 } : {}),
    },
  };
}

function parseTempo(value: string): Tempo {
  return {
    bpm: Number(value),
    beatUnit: { length: 'q' },
  };
}

function addPendingDynamics(
  state: ParserState,
  staffNumber: string,
  dynamics: PendingDynamic[]
) {
  const pending = state.pendingDynamics.get(staffNumber) ?? [];
  state.pendingDynamics.set(staffNumber, [...pending, ...dynamics]);
}
