/**
 * Priority Scoring Service
 *
 * Calculates a dorm allocation priority score (0–100) for a student application.
 *
 * Scoring breakdown:
 *  - Distance from campus  : 40 pts  (farther = higher priority)
 *  - Cost-sharing eligible : 25 pts  (eligible = full 25)
 *  - Academic year         : 25 pts  (senior = higher priority, year × 5)
 *  - Early submission      : 10 pts  (decays by 1pt per 3 days after window opens)
 */

interface ScoringStudent {
  studyYear: "I" | "II" | "III" | "IV" | "V";
  hasDisability: boolean;
}

interface ScoringApplication {
  submittedAt: Date;
}

interface ScoringAcademicYear {
  applicationOpenDate: Date;
}

interface PriorityScore {
  basePriorityScore: number;
  disabilityBonusScore: number;
  finalPriorityScore: number;
}

export function calculatePriorityScore(
  student: ScoringStudent,
  application: ScoringApplication,
  academicYear: ScoringAcademicYear
): PriorityScore {
  let baseScore = 0;

  // Year I = 5 pts, Year II = 10 pts, ..., Year V = 25 pts
  const yearToRank: Record<ScoringStudent["studyYear"], number> = {
    I: 1,
    II: 2,
    III: 3,
    IV: 4,
    V: 5,
  };
  baseScore += yearToRank[student.studyYear] * 5;

  // Early submission bonus (max 10 pts)
  // Decays by 1 point for every 3 days after the application window opened
  const daysSinceOpen = daysBetween(academicYear.applicationOpenDate, application.submittedAt);
  const timebonus = Math.max(0, 10 - Math.floor(daysSinceOpen / 3));
  baseScore += timebonus;

  const disabilityBonusScore = student.hasDisability ? 15 : 0;
  const finalScore = baseScore + disabilityBonusScore;

  return {
    basePriorityScore: Math.round(baseScore),
    disabilityBonusScore,
    finalPriorityScore: Math.round(finalScore),
  };
}

function daysBetween(from: Date, to: Date): number {
  const ms = to.getTime() - from.getTime();
  return Math.max(0, Math.floor(ms / (1000 * 60 * 60 * 24)));
}
