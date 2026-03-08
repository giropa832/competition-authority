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

import type {
  CompetitionAuthorityDimensions,
  CompetitionCategory,
  CompetitionTier,
  CompetitionAuthority,
  CompetitionResult,
  Competition,
  MedalLevel,
  MedalBreakdown,
  Evoo,
  RankedEvoo,
  CountryRankedEvoo,
  VarietyRankedEvoo,
  CategoryRankedEvoo,
} from "./types.js";

// ---- Internal utilities ----

/** Generates a URL-safe slug from text (no accents, lowercase, hyphens). */
function slugify(text: string): string {
  return text
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

// ---- Constants ----

/** Medal points by award type (for award-based competitions) */
export const PM_MAP: Record<MedalLevel, number> = {
  gran_prestige_gold: 10.0,
  gold_especial: 8.5,
  gold: 7.0,
  silver: 5.0,
  bronze: 3.0,
};

/** Mapping from existing AwardLevel to MedalLevel */
export const AWARD_TO_MEDAL: Record<string, MedalLevel> = {
  best_of_show: "gran_prestige_gold",
  best_of_class: "gold_especial",
  gold: "gold",
  silver: "silver",
  bronze: "bronze",
  finalist: "bronze", // Finalists count as Bronze (MP=3.0)
};

/**
 * Anchors for hybrid A+C method for numeric competitions.
 * Percentile → continuous MP with interpolation.
 * - Base zone (p30-p70): linear interpolation
 * - Upper zone (p70-p100): concave interpolation (t^1.5) between anchors
 */
export const PM_ANCHORS: [number, number][] = [
  [30, 3.0],    // bronze
  [50, 5.0],    // silver
  [70, 7.0],    // gold
  [85, 8.5],    // gold_especial
  [95, 9.70],   // gran_prestige_gold (NOT 10.0; p100 reserved)
  [100, 10.0],  // absolute maximum (only the highest score in the distribution)
];

/** Southern hemisphere countries */
const SOUTHERN_HEMISPHERE_COUNTRIES = new Set([
  "AR", "CL", "AU", "ZA", "UY", "BR", "NZ", "PE", "PY", "BO",
  "MZ", "AO", "NA", "BW", "ZW", "MG",
]);

/** Minimum CA threshold to contribute to the main ranking */
const AC_THRESHOLD = 40;

// ---- CA calculation functions ----

/**
 * Interpolates continuous MP based on percentile using hybrid A+C method.
 * - < p30: returns null (does not count)
 * - p30-p70: linear interpolation between anchors
 * - p70+: concave interpolation (t^1.5) between successive anchors
 * Returns MP rounded to 2 decimal places.
 */
export function interpolatePM(percentile: number): number | null {
  if (percentile < 30) return null;

  // Find the segment [lower_anchor, upper_anchor]
  for (let i = 0; i < PM_ANCHORS.length - 1; i++) {
    const [pLow, pmLow] = PM_ANCHORS[i];
    const [pHigh, pmHigh] = PM_ANCHORS[i + 1];

    if (percentile >= pLow && percentile <= pHigh) {
      const t = (percentile - pLow) / (pHigh - pLow);

      // Base zone (p30-p70): linear interpolation
      // Upper zone (p70+): concave curve t^1.5
      const tAdjusted = pLow >= 70 ? Math.pow(t, 1.5) : t;

      const pm = pmLow + tAdjusted * (pmHigh - pmLow);
      return Math.round(pm * 100) / 100;
    }
  }

  // percentile >= 100
  return 10.0;
}

/**
 * Classifies a continuous MP to its closest equivalent MedalLevel.
 * Used to display the "equivalent medal" in the UI.
 */
export function pmToMedalLevel(pm: number): MedalLevel {
  if (pm >= 9.1) return "gran_prestige_gold";
  if (pm >= 7.75) return "gold_especial";
  if (pm >= 6.0) return "gold";
  if (pm >= 4.0) return "silver";
  return "bronze";
}

/**
 * Calculates Competition Authority (CA) from dimensions D1-D5.
 * - Category A (international): CA = D1 + D2 + D3 + D4 + D5 (max 100)
 * - Category B (national_excellence): CA = (D1 + D2_without_D2.4 + D4 + D5) × (100/77) (max 100)
 *   Excludes D3 and D2.4 (geographic diversity, irrelevant for nationals)
 *   Max possible: D1(30) + D2withoutD2.4(27) + D4(15) + D5(5) = 77
 */
export function calculateAC(
  dimensions: CompetitionAuthorityDimensions,
  category: CompetitionCategory
): number {
  const d1 =
    dimensions.d1.coiPanel +
    dimensions.d1.panelSize +
    dimensions.d1.blindProtocol +
    dimensions.d1.coiTastingSheet +
    dimensions.d1.preselection;

  const d2 =
    dimensions.d2.coiTraining +
    dimensions.d2.panelChief +
    dimensions.d2.independence +
    dimensions.d2.geoDiversity;

  const d4 =
    dimensions.d4.sampleAuth +
    dimensions.d4.labAnalysis +
    dimensions.d4.entryLimit;

  const d5 =
    dimensions.d5.editions +
    dimensions.d5.institutionalBacking +
    dimensions.d5.methodologyPublication;

  if (category === "international") {
    const d3 = dimensions.d3
      ? dimensions.d3.countries +
        dimensions.d3.samples +
        dimensions.d3.southernHemisphere +
        dimensions.d3.marketVisibility
      : 0;
    return Math.min(d1 + d2 + d3 + d4 + d5, 100);
  }

  // national_excellence: without D3, without D2.4, scaled to 100
  const d2WithoutGeo = d2 - dimensions.d2.geoDiversity;
  const subtotal = d1 + d2WithoutGeo + d4 + d5; // max 77
  return Math.min(Math.round((subtotal * (100 / 77)) * 100) / 100, 100);
}

/**
 * Classifies the tier of a competition based on its CA and category.
 */
export function classifyTier(
  acScore: number,
  category: CompetitionCategory
): CompetitionTier {
  if (category === "international") {
    if (acScore >= 80) return "tier_1";
    if (acScore >= 60) return "tier_2";
    if (acScore >= 40) return "tier_3";
    return "unclassified";
  }

  // national_excellence
  if (acScore >= 75) return "ne_tier_1";
  if (acScore >= 55) return "ne_tier_2";
  return "unclassified";
}

// ---- Correction factors ----

/**
 * Medal Inflation Factor (MIF).
 * Penalizes competitions with gold rate above 30%.
 * MIF = 1 - max(0, (gold_rate - 0.30) × 1.4), floor at 0.2
 */
export function calculateFIM(goldRate: number): number {
  if (goldRate <= 0.3) return 1.0;
  const fim = 1.0 - (goldRate - 0.3) * 1.4;
  return Math.max(0.2, Math.round(fim * 10000) / 10000);
}

/**
 * Determines the hemisphere of a country from its ISO alpha-2 code.
 */
export function getHemisphere(countryCode: string): "northern" | "southern" {
  return SOUTHERN_HEMISPHERE_COUNTRIES.has(countryCode.toUpperCase())
    ? "southern"
    : "northern";
}

/**
 * Hemisphere Factor (HF).
 * 1.0 if the oil and competition are in the same hemisphere, 0.85 otherwise.
 */
export function calculateFH(
  evooCountry: string,
  competitionCountry: string
): number {
  // INT (international, e.g.: Mario Solinas/COI) is considered northern hemisphere
  const compCountry = competitionCountry === "INT" ? "ES" : competitionCountry;
  return getHemisphere(evooCountry) === getHemisphere(compCountry) ? 1.0 : 0.85;
}

// ---- Percentiles for numeric competitions ----

/**
 * Calculates the percentile of a score within the published distribution.
 * Returns a value in [0, 100].
 */
export function scoreToPercentile(
  score: number,
  distribution: number[]
): number {
  if (distribution.length === 0) return 0;
  const count = distribution.filter((s) => s <= score).length;
  return (count / distribution.length) * 100;
}

// ---- MP resolution ----

/**
 * Resolves the MP of a result based on its type.
 * - "award": maps AwardLevel → MedalLevel → discrete MP (from PM_MAP)
 * - "numeric": score → percentile → continuous MP (hybrid A+C method)
 * Returns null if the result does not reach the minimum threshold.
 */
export function resolvePM(
  result: CompetitionResult,
  distribution?: number[]
): { pm: number; medalLevel: MedalLevel } | null {
  if (result.scoreType === "award" && result.award) {
    const medalLevel = AWARD_TO_MEDAL[result.award];
    if (!medalLevel) return null;
    return { pm: PM_MAP[medalLevel], medalLevel };
  }

  if (result.scoreType === "numeric" && result.score != null) {
    if (!distribution || distribution.length === 0) {
      // Without distribution: cannot calculate percentile → does not count
      return null;
    }
    const percentile = scoreToPercentile(result.score, distribution);

    // Hybrid A+C method: continuous interpolation
    const pm = interpolatePM(percentile);
    if (pm == null) return null; // < p30

    // Classify to equivalent medal level (for the UI)
    const medalLevel = pmToMedalLevel(pm);
    return { pm, medalLevel };
  }

  return null;
}

// ---- EVOO score calculation ----

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
export function calculateEvooScore(
  evoo: Evoo,
  authorities: CompetitionAuthority[],
  competitions: Competition[],
  distributions: Map<string, number[]>, // key: "competitionId:season"
  season?: string // optional: filter results to a single season
): {
  score: number;
  scoreNE: number;
  scoreAuxiliar: number;
  medalCount: number;
  breakdown: MedalBreakdown[];
} {
  let mainScore = 0;
  let scoreNE = 0;
  let scoreAuxiliar = 0;
  const breakdown: MedalBreakdown[] = [];

  const compMap = new Map(competitions.map((c) => [c.id, c]));

  // Exact map: "competitionId:season" → authority
  const authExactMap = new Map(
    authorities.map((a) => [`${a.competitionId}:${a.season}`, a])
  );

  // Fallback map: "competitionId" → most recent authority
  // (a competition's authority does not change drastically between seasons)
  const authFallbackMap = new Map<string, CompetitionAuthority>();
  for (const a of authorities) {
    const existing = authFallbackMap.get(a.competitionId);
    if (!existing || a.season > existing.season) {
      authFallbackMap.set(a.competitionId, a);
    }
  }

  // Fallback distribution map: "competitionId" → most recent distribution
  const distFallbackMap = new Map<string, number[]>();
  const distFallbackSeasons = new Map<string, string>();
  for (const [key, dist] of distributions) {
    const [compId, season] = key.split(":");
    const existingSeason = distFallbackSeasons.get(compId) ?? "";
    if (season > existingSeason) {
      distFallbackMap.set(compId, dist);
      distFallbackSeasons.set(compId, season);
    }
  }

  const resultsToScore = season
    ? evoo.results.filter((r) => r.season === season)
    : evoo.results;

  for (const result of resultsToScore) {
    // Find authority: first exact match competitionId:season, then fallback by competitionId
    const authKey = `${result.competition}:${result.season}`;
    const auth = authExactMap.get(authKey) ?? authFallbackMap.get(result.competition);
    const comp = compMap.get(result.competition);

    if (!auth || !comp) continue;

    // Get distribution: first exact match, then fallback
    const distKey = `${result.competition}:${result.season}`;
    const distribution = distributions.get(distKey) ?? distFallbackMap.get(result.competition);

    // Resolve MP
    const resolved = resolvePM(result, distribution);
    if (!resolved) continue;

    const { pm, medalLevel } = resolved;
    const ac = auth.acScore;
    const fh = calculateFH(evoo.producer.country, comp.country);
    const isNE = auth.category === "national_excellence";

    // MIF: 1.0 for numeric competitions (Section 5.5)
    // The percentile already corrects for inflation, no double penalty needed
    const fim = result.scoreType === "numeric" ? 1.0 : calculateFIM(auth.goldRate);

    const total = Math.round(ac * pm * fh * fim * 10000) / 10000;
    const inRanking = ac >= AC_THRESHOLD;

    breakdown.push({
      competitionId: result.competition,
      competitionName: comp.name,
      season: result.season,
      medalLevel,
      pm,
      ac,
      fh,
      fim,
      total,
      inRanking,
      isNE,
    });

    if (!inRanking) {
      scoreAuxiliar += total;
    } else if (isNE) {
      // NE scores: separate from global ranking (Section 4.2)
      scoreNE += total;
    } else {
      // International with CA >= 40: main score
      mainScore += total;
    }
  }

  return {
    score: Math.round(mainScore * 10000) / 10000,
    scoreNE: Math.round(scoreNE * 10000) / 10000,
    scoreAuxiliar: Math.round(scoreAuxiliar * 10000) / 10000,
    medalCount: breakdown.filter((b) => b.inRanking && !b.isNE).length,
    breakdown,
  };
}

// ---- Ranking builders ----

/**
 * Builds the full EVOO ranking sorted by score descending.
 * Only includes EVOOs with at least one result in competitions with CA >= 40.
 */
export function buildRanking(
  evoos: Evoo[],
  authorities: CompetitionAuthority[],
  competitions: Competition[],
  distributions: Map<string, number[]>,
  season?: string
): RankedEvoo[] {
  const scored = evoos
    .map((evoo) => {
      const { score, scoreNE, scoreAuxiliar, medalCount, breakdown } =
        calculateEvooScore(evoo, authorities, competitions, distributions, season);
      return {
        ...evoo,
        score,
        scoreNE,
        scoreAuxiliar,
        medalCount,
        breakdown,
        position: 0,
      } satisfies RankedEvoo;
    })
    .filter((a) => a.score > 0); // Only EVOOs with international score > 0

  // Sort by score descending, tiebreak by medalCount, then alphabetical
  scored.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    if (b.medalCount !== a.medalCount) return b.medalCount - a.medalCount;
    return a.name.localeCompare(b.name);
  });

  // Assign positions
  scored.forEach((evoo, index) => {
    evoo.position = index + 1;
  });

  return scored;
}

/**
 * Scores ALL EVOOs without filtering by score > 0 (includes NE-only).
 * Used as the base for building country rankings.
 * Does not assign global positions (position = 0 for NE-only).
 */
export function scoreAllEvoos(
  evoos: Evoo[],
  authorities: CompetitionAuthority[],
  competitions: Competition[],
  distributions: Map<string, number[]>,
  season?: string
): RankedEvoo[] {
  const globalRanking = buildRanking(evoos, authorities, competitions, distributions, season);
  const globalPositionMap = new Map(globalRanking.map((a) => [a.id, a.position]));

  return evoos
    .map((evoo) => {
      const { score, scoreNE, scoreAuxiliar, medalCount, breakdown } =
        calculateEvooScore(evoo, authorities, competitions, distributions, season);
      return {
        ...evoo,
        score,
        scoreNE,
        scoreAuxiliar,
        medalCount,
        breakdown,
        position: globalPositionMap.get(evoo.id) ?? 0,
      } satisfies RankedEvoo;
    })
    .filter((a) => a.score > 0 || a.scoreNE > 0);
}

/**
 * Builds the ranking for a country using combined score (international + NE).
 * Includes NE-only EVOOs that don't appear in the global ranking.
 */
export function buildCountryRanking(
  allScoredEvoos: RankedEvoo[],
  countryCode: string
): CountryRankedEvoo[] {
  const countryEvoos = allScoredEvoos
    .filter((a) => a.producer.country === countryCode)
    .map((evoo) => ({
      ...evoo,
      combinedScore: Math.round((evoo.score + evoo.scoreNE) * 10000) / 10000,
      countryPosition: 0,
    }) satisfies CountryRankedEvoo);

  // Sort by combinedScore desc, medalCount desc, name asc
  countryEvoos.sort((a, b) => {
    if (b.combinedScore !== a.combinedScore) return b.combinedScore - a.combinedScore;
    if (b.medalCount !== a.medalCount) return b.medalCount - a.medalCount;
    return a.name.localeCompare(b.name);
  });

  // Assign positions within the country
  countryEvoos.forEach((evoo, index) => {
    evoo.countryPosition = index + 1;
  });

  return countryEvoos;
}

/**
 * Builds the ranking for a variety using combined score (international + NE).
 * Includes NE-only EVOOs that don't appear in the global ranking.
 * Optionally filters by country for variety+country rankings.
 */
export function buildVarietyRanking(
  allScoredEvoos: RankedEvoo[],
  varietySlug: string,
  countryCode?: string
): VarietyRankedEvoo[] {
  let varietyEvoos = allScoredEvoos
    .filter((a) => a.varieties.some((v) => slugify(v) === varietySlug));

  // Optional country filter
  if (countryCode) {
    varietyEvoos = varietyEvoos.filter((a) => a.producer.country === countryCode);
  }

  const ranked = varietyEvoos.map((evoo) => ({
    ...evoo,
    combinedScore: Math.round((evoo.score + evoo.scoreNE) * 10000) / 10000,
    varietyPosition: 0,
  }) satisfies VarietyRankedEvoo);

  // Sort by combinedScore desc, medalCount desc, name asc
  ranked.sort((a, b) => {
    if (b.combinedScore !== a.combinedScore) return b.combinedScore - a.combinedScore;
    if (b.medalCount !== a.medalCount) return b.medalCount - a.medalCount;
    return a.name.localeCompare(b.name);
  });

  // Assign positions within the variety
  ranked.forEach((evoo, index) => {
    evoo.varietyPosition = index + 1;
  });

  return ranked;
}

/**
 * Builds the ranking for a category using combined score (international + NE).
 * Includes NE-only EVOOs that don't appear in the global ranking.
 * Optionally filters by country.
 *
 * @param hasTag - Predicate that determines if an EVOO belongs to a category.
 *   Must be provided by the consumer (e.g., based on your own tag derivation logic).
 */
export function buildCategoryRanking(
  allScoredEvoos: RankedEvoo[],
  categorySlug: string,
  hasTag: (evoo: Evoo | RankedEvoo, tag: string) => boolean,
  countryCode?: string
): CategoryRankedEvoo[] {
  let categoryEvoos = allScoredEvoos.filter((a) =>
    hasTag(a, categorySlug)
  );

  if (countryCode) {
    categoryEvoos = categoryEvoos.filter(
      (a) => a.producer.country === countryCode
    );
  }

  const ranked = categoryEvoos.map((evoo) => ({
    ...evoo,
    combinedScore: Math.round((evoo.score + evoo.scoreNE) * 10000) / 10000,
    categoryPosition: 0,
  }) satisfies CategoryRankedEvoo);

  ranked.sort((a, b) => {
    if (b.combinedScore !== a.combinedScore)
      return b.combinedScore - a.combinedScore;
    if (b.medalCount !== a.medalCount) return b.medalCount - a.medalCount;
    return a.name.localeCompare(b.name);
  });

  ranked.forEach((evoo, index) => {
    evoo.categoryPosition = index + 1;
  });

  return ranked;
}
