import { ESTABLISHMENTS, LANDMARKS } from './cards';

export type DeckMode = 'DEMO_ONLY' | 'VERIFIED';

export interface DeckManifest {
  mode: DeckMode;
  /** cardId -> number of physical copies */
  copies: Record<string, number>;
  note: string;
}

/**
 * DEMO_ONLY fixture. The rulebook total (86 establishments + 20 landmarks) is known,
 * but per-card copy counts are NOT verified. These numbers exist only so the system can
 * be played/tested and must never be presented as official.
 */
export const DEMO_DECK: DeckManifest = {
  mode: 'DEMO_ONLY',
  note: 'ชุดทดสอบ: จำนวนสำเนาการ์ดยังไม่ได้รับการยืนยันจาก Rulebook',
  copies: {
    ...Object.fromEntries(ESTABLISHMENTS.map((c) => [c.id, c.color === 'purple' ? 3 : 4])),
    ...Object.fromEntries(LANDMARKS.map((c) => [c.id, 1])),
  },
};

/** Returns the verified manifest, or null while sources are incomplete (see docs/RULE_ISSUES.md). */
export function verifiedDeck(): DeckManifest | null {
  const all = [...ESTABLISHMENTS, ...LANDMARKS];
  if (all.some((c) => c.quantityInDeck == null)) return null;
  return {
    mode: 'VERIFIED',
    note: '',
    copies: Object.fromEntries(all.map((c) => [c.id, c.quantityInDeck as number])),
  };
}
