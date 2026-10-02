export type Level = 'HIGH' | 'MED' | 'LOW';
export type Priority = 'P1' | 'P2' | 'P3' | 'P4';

// เมทริกซ์ Impact × Urgency (CLAUDE.md)
//            Urgency HIGH  MED  LOW
// Impact HIGH       P1    P2   P3
//        MED        P2    P3   P4
//        LOW        P3    P4   P4
const MATRIX: Record<Level, Record<Level, Priority>> = {
  HIGH: { HIGH: 'P1', MED: 'P2', LOW: 'P3' },
  MED: { HIGH: 'P2', MED: 'P3', LOW: 'P4' },
  LOW: { HIGH: 'P3', MED: 'P4', LOW: 'P4' },
};

export const LEVELS: Level[] = ['HIGH', 'MED', 'LOW'];

export function calcPriority(impact: Level, urgency: Level): Priority {
  return MATRIX[impact][urgency];
}
