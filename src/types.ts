// ---- Competition Types ----

/** Competition ID — extensible string to support new competitions */
export type CompetitionId = string;

export type AwardLevel =
  | "best_of_show"
  | "best_of_class"
  | "gold"
  | "silver"
  | "bronze"
  | "finalist";

export interface Competition {
  id: CompetitionId;
  name: string;
  shortName: string;
  website: string;
  country: string;
  scope: "national" | "international";
  scoreType: "numeric" | "award";
  scoreMin?: number;
  scoreMax?: number;
  awardLevels?: Record<string, number>;
  description: string;
}

// ---- Authority / CA Types ----

export type CompetitionCategory = "international" | "national_excellence";

export type CompetitionTier =
  | "tier_1"
  | "tier_2"
  | "tier_3"
  | "ne_tier_1"
  | "ne_tier_2"
  | "unclassified";

export type MedalLevel =
  | "gran_prestige_gold"
  | "gold_especial"
  | "gold"
  | "silver"
  | "bronze";

export interface CompetitionAuthorityDimensions {
  d1: {
    coiPanel: number;        // D1.1 Coverage per sample (0/3/6/10)
    panelSize: number;       // D1.2 Blind tasting protocol (0/2/5/8)
    blindProtocol: number;   // D1.3 Tasting sheet (0/2/4/6)
    coiTastingSheet: number; // D1.4 In-person (0/2/4)
    preselection: number;    // D1.5 No preselection (0/1/2)
  };
  d2: {
    coiTraining: number;
    panelChief: number;
    independence: number;
    geoDiversity: number;
  };
  d3: {
    countries: number;
    samples: number;
    southernHemisphere: number;
    marketVisibility: number;
  } | null; // null for national_excellence
  d4: {
    sampleAuth: number;
    labAnalysis: number;
    entryLimit: number;
  };
  d5: {
    editions: number;
    institutionalBacking: number;
    methodologyPublication: number;
  };
}

export interface CompetitionAuthority {
  competitionId: string;
  season: string;
  category: CompetitionCategory;
  dimensions: CompetitionAuthorityDimensions;
  acScore: number;
  tier: CompetitionTier;
  goldRate: number;
}

/** Score breakdown of an EVOO in a specific competition */
export interface MedalBreakdown {
  competitionId: string;
  competitionName: string;
  medalLevel: MedalLevel | null;
  pm: number;
  ac: number;
  fh: number;
  fim: number;
  total: number; // AC * PM * FH * FIM
  inRanking: boolean; // AC >= 40
  isNE: boolean; // true if competition is national_excellence
}

// ---- Core Domain Types ----

export interface Producer {
  name: string;
  website?: string;
  country: string; // ISO 3166-1 alpha-2
  region?: string;
  subRegion?: string;
}

export interface CompetitionResult {
  competition: CompetitionId;
  season: string; // "2024/2025"
  score?: number;
  scoreMax?: number;
  award?: AwardLevel;
  scoreType: "numeric" | "award";
  category?: string;
  position?: number;
  hemisphere?: "northern" | "southern";
  url?: string;
}

export interface Evoo {
  id: string;
  slug: string;
  name: string;
  producer: Producer;
  varieties: string[];
  type: "monovarietal" | "blend" | "coupage";
  organic: boolean;
  productType: "evoo" | "flavored";
  dop?: string;
  imageUrl?: string;
  results: CompetitionResult[];
}

export interface RankedEvoo extends Evoo {
  /** Main score: sum of P(evoo, competition) for international competitions with CA >= 40 */
  score: number;
  /** National Excellence score: sum of P for NE competitions (complements, does not replace) */
  scoreNE: number;
  /** Auxiliary score: sum of P for competitions with CA < 40 */
  scoreAuxiliar: number;
  /** Position in global ranking (based on international score only) */
  position: number;
  /** Number of international medals/results that count */
  medalCount: number;
  /** Per-competition breakdown: CA, MP, HF, MIF, total */
  breakdown: MedalBreakdown[];
}

/** EVOO ranked within a country, with combined score (international + NE) */
export interface CountryRankedEvoo extends RankedEvoo {
  /** Combined score: score (international) + scoreNE (national excellence) */
  combinedScore: number;
  /** Position within the country ranking */
  countryPosition: number;
}

/** EVOO ranked within a variety, with combined score and variety position */
export interface VarietyRankedEvoo extends RankedEvoo {
  /** Combined score: score (international) + scoreNE (national excellence) */
  combinedScore: number;
  /** Position within the variety ranking (all countries) */
  varietyPosition: number;
}

/** EVOO ranked within a category, with combined score and position */
export interface CategoryRankedEvoo extends RankedEvoo {
  combinedScore: number;
  categoryPosition: number;
}
