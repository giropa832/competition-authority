// Types
export type {
  CompetitionId,
  AwardLevel,
  Competition,
  CompetitionCategory,
  CompetitionTier,
  MedalLevel,
  CompetitionAuthorityDimensions,
  CompetitionAuthority,
  MedalBreakdown,
  Producer,
  CompetitionResult,
  Evoo,
  RankedEvoo,
  CountryRankedEvoo,
  VarietyRankedEvoo,
  CategoryRankedEvoo,
} from "./types.js";

// Algorithm
export {
  // Constants
  PM_MAP,
  AWARD_TO_MEDAL,
  PM_ANCHORS,
  // CA calculation
  calculateAC,
  classifyTier,
  // Medal points
  interpolatePM,
  pmToMedalLevel,
  // Correction factors
  calculateFIM,
  getHemisphere,
  calculateFH,
  // Percentiles
  scoreToPercentile,
  // MP resolution
  resolvePM,
  // Scoring
  calculateEvooScore,
  // Ranking builders
  buildRanking,
  scoreAllEvoos,
  buildCountryRanking,
  buildVarietyRanking,
  buildCategoryRanking,
} from "./authority.js";
