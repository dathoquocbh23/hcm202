export type Question =
  | { id: string; kind: 'fill'; text: string; answerId: string; hint: string }
  | { id: string; kind: 'abc'; text: string; options: Record<'A' | 'B' | 'C', string>; correctOption: 'A' | 'B' | 'C'; hint: string };

export interface AnswerCard { id: string; code: string; text: string }
export interface DecoyCard { id: string; text: string }
export interface QuestionSet {
  id: string;
  title: string;
  reviewStatus?: string;
  answers: AnswerCard[];
  decoys: DecoyCard[];
  questions: Question[];
}

export type SkillId =
  | 'hint' | 'narrow' | 'second-chance' | 'extra-time'
  | 'double-strike' | 'rush' | 'confusion' | 'pierce'
  | 'nullify' | 'steal';

export interface SkillCard { id: string; kind: SkillId; acquiredTurn: number }

export type GamePhase =
  | 'question' | 'attack-skill' | 'defense-skill' | 'reaction'
  | 'answer' | 'second-answer' | 'reveal' | 'reward'
  | 'steal-cancel' | 'overflow' | 'sudden' | 'completed';

export interface GameEvent {
  id: string;
  at: number;
  turn: number;
  type: string;
  text: string;
  teamId?: string;
  hp?: Record<string, number>;
  /** Structured detail so viewers can animate the event without parsing text. */
  skill?: SkillId;
  damage?: number;
  outcome?: 'correct' | 'wrong' | 'timeout';
}

/** One answered question, kept so the result page can review every turn. */
export interface AnswerRecord {
  turn: number;
  questionId: string;
  teamId: string;
  submitted: string | null;
  outcome: 'correct' | 'wrong' | 'timeout';
  damage: number;
  skills: { kind: SkillId; cancelled: boolean }[];
  sudden?: boolean;
}

export interface GameState {
  phase: GamePhase;
  phaseDeadline: number | null;
  paused: boolean;
  pausedRemainingMs: number | null;
  answerRemainingMs?: number | null;
  startedAt: number;
  lastActiveAt: number;
  elapsedActiveMs: number;
  teamIds: [string, string];
  attackerId: string;
  defenderId: string;
  hp: Record<string, number>;
  hands: Record<string, SkillCard[]>;
  questionDeck: string[];
  questionDiscard: string[];
  skillDeck: SkillCard[];
  skillDiscard: SkillCard[];
  answerBoard: string[];
  activeDecoys: string[];
  removedAnswers: string[];
  candidates: string[];
  activeQuestionId: string | null;
  attackSkill: SkillCard | null;
  defenseSkill: SkillCard | null;
  cancelledSkillId: string | null;
  reactionsDone: string[];
  firstWrongId: string | null;
  submittedAnswerId: string | null;
  answerCorrect: boolean | null;
  rewardCard: SkillCard | null;
  rewardOwnerId: string | null;
  rewardRecipientId: string | null;
  turn: number;
  attackCounts: Record<string, number>;
  correctCounts: Record<string, number>;
  defendedCounts: Record<string, number>;
  winnerId: string | null;
  victoryReason: 'knockout' | 'limit' | 'sudden' | null;
  suddenUsed: string[];
  events: GameEvent[];
  /** Missing on matches stored before answers were recorded. */
  answerLog?: AnswerRecord[];
}

export interface Team {
  id: string;
  name: string;
  color: 'red' | 'yellow' | 'green' | 'blue';
  status: 'pending' | 'approved' | 'rejected';
  ready: boolean;
  tokenHash: string;
  lastSeen: number;
  joinedAt: number;
}

export interface Match {
  id: string;
  round: 'semifinal-a' | 'semifinal-b' | 'final';
  teamIds: [string, string] | null;
  setId: string | null;
  status: 'pending' | 'active' | 'completed';
  game: GameState | null;
  /** Final only: when the admin invited both winners to the lobby. */
  invitedAt?: number | null;
}

export interface Room {
  code: string;
  title: string;
  createdAt: number;
  joinLocked: boolean;
  practiceReuse: boolean;
  teams: Team[];
  matches: Match[];
  sets: QuestionSet[];
  events: GameEvent[];
  revision: number;
  displayTokenHash: string;
  processedCommands: string[];
}

export type Viewer = { role: 'admin' } | { role: 'team'; teamId: string } | { role: 'display' };

export type GameCommand =
  | { type: 'choose-question'; questionId: string }
  | { type: 'play-skill'; cardId: string }
  | { type: 'pass' }
  | { type: 'answer'; answerId: string }
  | { type: 'nullify'; targetCardId: string }
  | { type: 'steal' }
  | { type: 'discard'; cardId: string }
  | { type: 'pause' }
  | { type: 'resume' };
