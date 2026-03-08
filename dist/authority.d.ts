/**
 * Competition Authority (CA) Algorithm v2.0
 *
 * Calculates the score of each EVOO based on:
 * P(evoo, competition) = CA x MP x HF x MIF
 *
 * Where:
 * - CA = Competition Authority (0-100), calculated from 5 dimensions (D1-D5)
 * - MP = Medal Points (3-10), based on award type or numeric percentile
 * - HF = Hemisphere Factor (0.85 or 1.0)
 * - MIF = Medal Inflation Factor (0.2-1.0)
 *
 * Annual score = Σ P(evoo, ci) for all ci with CA >= 40
 *
 * @see https://molinoycata.com/ranking/methodology
 */
import type { CompetitionAuthorityDimensions, CompetitionCategory, CompetitionTier, CompetitionAuthority, CompetitionResult, Competition, MedalLevel, MedalBreakdown, Evoo, RankedEvoo, CountryRankedEvoo, VarietyRankedEvoo, CategoryRankedEvoo } from "./types.js";
/** Medal points by award type (for award-based competitions) */
export declare const PM_MAP: Record<MedalLevel, number>;
/** Mapping from existing AwardLevel to MedalLevel */
export declare const AWARD_TO_MEDAL: Record<string, MedalLevel>;
/**
 * Anchors for hybrid A+C method for numeric competitions.
 * Percentile → continuous MP with interpolation.
 * - Base zone (p30-p70): linear interpolation
 * - Upper zone (p70-p100): concave interpolation (t^1.5) between anchors
 */
export declare const PM_ANCHORS: [number, number][];
/**
 * Interpolates continuous MP based on percentile using hybrid A+C method.
 * - < p30: returns null (does not count)
 * - p30-p70: linear interpolation between anchors
 * - p70+: concave interpolation (t^1.5) between successive anchors
 * Returns MP rounded to 2 decimal places.
 */
export declare function interpolatePM(percentile: number): number | null;
/**
 * Classifies a continuous MP to its closest equivalent MedalLevel.
 * Used to display the "equivalent medal" in the UI.
 */
export declare function pmToMedalLevel(pm: number): MedalLevel;
/**
 * Calculates Competition Authority (CA) from dimensions D1-D5.
 * - Category A (international): CA = D1 + D2 + D3 + D4 + D5 (max 100)
 * - Category B (national_excellence): CA = (D1 + D2_without_D2.4 + D4 + D5) × (100/77) (max 100)
 *   Excludes D3 and D2.4 (geographic diversity, irrelevant for nationals)
 *   Max possible: D1(30) + D2withoutD2.4(27) + D4(15) + D5(5) = 77
 */
export declare function calculateAC(dimensions: CompetitionAuthorityDimensions, category: CompetitionCategory): number;
/**
 * Classifies the tier of a competition based on its CA and category.
 */
export declare function classifyTier(acScore: number, category: CompetitionCategory): CompetitionTier;
/**
 * Medal Inflation Factor (MIF).
 * Penalizes competitions with gold rate above 30%.
 * MIF = 1 - max(0, (gold_rate - 0.30) × 1.4), floor at 0.2
 */
export declare function calculateFIM(goldRate: number): number;
/**
 * Determines the hemisphere of a country from its ISO alpha-2 code.
 */
export declare function getHemisphere(countryCode: string): "northern" | "southern";
/**
 * Hemisphere Factor (HF).
 * 1.0 if the oil and competition are in the same hemisphere, 0.85 otherwise.
 */
export declare function calculateFH(evooCountry: string, competitionCountry: string): number;
/**
 * Calculates the percentile of a score within the published distribution.
 * Returns a value in [0, 100].
 */
export declare function scoreToPercentile(score: number, distribution: number[]): number;
/**
 * Resolves the MP of a result based on its type.
 * - "award": maps AwardLevel → MedalLevel → discrete MP (from PM_MAP)
 * - "numeric": score → percentile → continuous MP (hybrid A+C method)
 * Returns null if the result does not reach the minimum threshold.
 */
export declare function resolvePM(result: CompetitionResult, distribution?: number[]): {
    pm: number;
    medalLevel: MedalLevel;
} | null;
/**
 * Calculates the full score of an EVOO for a season.
 *
 * P(evoo, competition) = CA × MP × HF × MIF
 *
 * Score separation:
 * - score (main): Σ P for INTERNATIONAL competitions with CA >= 40
 * - scoreNE: Σ P for NATIONAL_EXCELLENCE competitions with CA >= 40
 *   (complements, does NOT replace the global score — Section 4.2)
 * - scoreAuxiliar: Σ P for competitions with CA < 40 (any category)
 *
 * MIF for numeric competitions = 1.0 (Section 5.5):
 * The percentile mechanism already corrects for inflation.
 */
export declare function calculateEvooScore(evoo: Evoo, authorities: CompetitionAuthority[], competitions: Competition[], distributions: Map<string, number[]>, // key: "competitionId:season"
season?: string): {
    score: number;
    scoreNE: number;
    scoreAuxiliar: number;
    medalCount: number;
    breakdown: MedalBreakdown[];
};
/**
 * Builds the full EVOO ranking sorted by score descending.
 * Only includes EVOOs with at least one result in competitions with CA >= 40.
 */
export declare function buildRanking(evoos: Evoo[], authorities: CompetitionAuthority[], competitions: Competition[], distributions: Map<string, number[]>, season?: string): RankedEvoo[];
/**
 * Scores ALL EVOOs without filtering by score > 0 (includes NE-only).
 * Used as the base for building country rankings.
 * Does not assign global positions (position = 0 for NE-only).
 */
export declare function scoreAllEvoos(evoos: Evoo[], authorities: CompetitionAuthority[], competitions: Competition[], distributions: Map<string, number[]>, season?: string): RankedEvoo[];
/**
 * Builds the ranking for a country using combined score (international + NE).
 * Includes NE-only EVOOs that don't appear in the global ranking.
 */
export declare function buildCountryRanking(allScoredEvoos: RankedEvoo[], countryCode: string): CountryRankedEvoo[];
/**
 * Builds the ranking for a variety using combined score (international + NE).
 * Includes NE-only EVOOs that don't appear in the global ranking.
 * Optionally filters by country for variety+country rankings.
 */
export declare function buildVarietyRanking(allScoredEvoos: RankedEvoo[], varietySlug: string, countryCode?: string): VarietyRankedEvoo[];
/**
 * Builds the ranking for a category using combined score (international + NE).
 * Includes NE-only EVOOs that don't appear in the global ranking.
 * Optionally filters by country.
 *
 * @param hasTag - Predicate that determines if an EVOO belongs to a category.
 *   Must be provided by the consumer (e.g., based on your own tag derivation logic).
 */
export declare function buildCategoryRanking(allScoredEvoos: RankedEvoo[], categorySlug: string, hasTag: (evoo: Evoo | RankedEvoo, tag: string) => boolean, countryCode?: string): CategoryRankedEvoo[];
//# sourceMappingURL=authority.d.ts.map