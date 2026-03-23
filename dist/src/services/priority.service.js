"use strict";
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
Object.defineProperty(exports, "__esModule", { value: true });
exports.calculatePriorityScore = calculatePriorityScore;
function calculatePriorityScore(student, application, academicYear) {
    let score = 0;
    // ── 1. Distance from campus (max 40 pts) ──────────────────────────────────
    score += distanceScore(student.distanceKm);
    // ── 2. Cost-sharing eligibility (max 25 pts) ─────────────────────────────
    if (student.costSharingEligible) {
        score += 25;
    }
    // ── 3. Academic year seniority (max 25 pts) ───────────────────────────────
    // Year 1 = 5 pts, Year 2 = 10 pts, ..., Year 5+ = 25 pts
    score += Math.min(student.academicYear, 5) * 5;
    // ── 4. Early submission bonus (max 10 pts) ────────────────────────────────
    // Decays by 1 point for every 3 days after the application window opened
    const daysSinceOpen = daysBetween(academicYear.applicationOpen, application.submittedAt);
    const timebonus = Math.max(0, 10 - Math.floor(daysSinceOpen / 3));
    score += timebonus;
    return Math.round(score * 10) / 10; // Round to 1 decimal place
}
/**
 * Distance scoring table
 *
 * >100 km → 40 pts
 *  >50 km → 30 pts
 *  >20 km → 20 pts
 *  >10 km → 10 pts
 *  ≤10 km →  5 pts
 */
function distanceScore(distanceKm) {
    if (distanceKm > 100)
        return 40;
    if (distanceKm > 50)
        return 30;
    if (distanceKm > 20)
        return 20;
    if (distanceKm > 10)
        return 10;
    return 5;
}
function daysBetween(from, to) {
    const ms = to.getTime() - from.getTime();
    return Math.max(0, Math.floor(ms / (1000 * 60 * 60 * 24)));
}
