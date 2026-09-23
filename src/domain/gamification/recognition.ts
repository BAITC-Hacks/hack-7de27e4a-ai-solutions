import type { GamificationState, MentorshipRecord, ThanksRecord } from "./types";

export class RecognitionError extends Error {
  constructor(
    message: string,
    readonly code: "SELF_THANKS" | "DUPLICATE_THANKS" | "NOT_A_PARTICIPANT",
  ) {
    super(message);
    this.name = "RecognitionError";
  }
}

export interface ThanksInput {
  threadId: string;
  fromEmployeeId: string;
  toEmployeeId: string;
  at: string;
}

/**
 * Благодарность отправляет только вторая сторона треда, одна на тред, себе — никогда.
 * Без Skill Exchange эта функция просто не вызывается, и начисления равны нулю.
 */
export function recordThanks(state: GamificationState, input: ThanksInput): GamificationState {
  if (input.fromEmployeeId === input.toEmployeeId) {
    throw new RecognitionError("Нельзя поблагодарить самого себя", "SELF_THANKS");
  }
  const duplicate = state.thanks.some(
    (record) =>
      record.threadId === input.threadId && record.fromEmployeeId === input.fromEmployeeId,
  );
  if (duplicate) {
    throw new RecognitionError("В этом треде благодарность уже отправлена", "DUPLICATE_THANKS");
  }
  const record: ThanksRecord = { id: `${input.threadId}:${input.fromEmployeeId}`, ...input };
  return { ...state, thanks: [...state.thanks, record] };
}

export function recordMentorship(
  state: GamificationState,
  record: MentorshipRecord,
): GamificationState {
  if (state.mentorships.some((item) => item.id === record.id)) return state;
  return { ...state, mentorships: [...state.mentorships, record] };
}
