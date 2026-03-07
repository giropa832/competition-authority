import { describe, it, expect } from "vitest";
import {
  calculateAC,
  classifyTier,
  interpolatePM,
  pmToMedalLevel,
  calculateFIM,
  getHemisphere,
  calculateFH,
  scoreToPercentile,
  resolvePM,
  calculateEvooScore,
  buildRanking,
  buildCountryRanking,
  buildVarietyRanking,
  buildCategoryRanking,
  PM_MAP,
  AWARD_TO_MEDAL,
} from "../src/authority";
import type {
  CompetitionAuthorityDimensions,
  CompetitionAuthority,
  Competition,
  CompetitionResult,
  AwardLevel,
  Evoo,
} from "../src/types";

// ---- Fixture helpers ----

function makeDimensions(overrides?: Partial<{
  d1: Partial<CompetitionAuthorityDimensions["d1"]>;
  d2: Partial<CompetitionAuthorityDimensions["d2"]>;
  d3: Partial<NonNullable<CompetitionAuthorityDimensions["d3"]>> | null;
  d4: Partial<CompetitionAuthorityDimensions["d4"]>;
  d5: Partial<CompetitionAuthorityDimensions["d5"]>;
}>): CompetitionAuthorityDimensions {
  return {
    d1: { coiPanel: 10, panelSize: 8, blindProtocol: 6, coiTastingSheet: 4, preselection: 2, ...overrides?.d1 },
    d2: { coiTraining: 12, panelChief: 9, independence: 6, geoDiversity: 3, ...overrides?.d2 },
    d3: overrides?.d3 === null ? null : { countries: 6, samples: 4, southernHemisphere: 3, marketVisibility: 4, ...overrides?.d3 },
    d4: { sampleAuth: 7, labAnalysis: 6, entryLimit: 1, ...overrides?.d4 },
    d5: { editions: 2, institutionalBacking: 2, methodologyPublication: 1, ...overrides?.d5 },
  };
}

function makeAuthority(overrides?: Partial<CompetitionAuthority>): CompetitionAuthority {
  return {
    competitionId: "evooleum",
    season: "2024/2025",
    category: "international",
    dimensions: makeDimensions(),
    acScore: 71,
    tier: "tier_2",
    goldRate: 0.25,
    ...overrides,
  };
}

function makeCompetition(overrides?: Partial<Competition>): Competition {
  return {
    id: "evooleum",
    name: "Evooleum",
    shortName: "EVO",
    website: "https://evooleum.com",
    country: "ES",
    scope: "international",
    scoreType: "numeric",
    description: "Test competition",
    ...overrides,
  };
}

function makeEvoo(overrides?: Partial<Evoo>): Evoo {
  return {
    id: "test-evoo-1",
    slug: "test-evoo-1",
    name: "Test EVOO 1",
    producer: { name: "Test Producer", country: "ES" },
    varieties: ["Picual"],
    type: "monovarietal",
    organic: false,
    productType: "evoo",
    results: [],
    ...overrides,
  };
}

// ---- calculateAC tests ----

describe("calculateAC", () => {
  it("calculates AC for international competition summing D1-D5", () => {
    // Mario Solinas: D1(30) + D2(30) + D3(17) + D4(14) + D5(5) = 96
    const dims = makeDimensions();
    expect(calculateAC(dims, "international")).toBe(96);
  });

  it("caps AC at 100 for international", () => {
    const dims = makeDimensions({
      d3: { countries: 10, samples: 10, southernHemisphere: 10, marketVisibility: 10 },
    });
    expect(calculateAC(dims, "international")).toBeLessThanOrEqual(100);
  });

  it("calculates AC for national_excellence without D3, without D2.4, scaled to 100", () => {
    // NE: (D1 + D2_without_geo + D4 + D5) × (100/77)
    // D1=30, D2_without_geo=30-3=27, D4=14, D5=5 → subtotal=76
    // AC = 76 × (100/77) = 98.70...
    const dims = makeDimensions();
    const ac = calculateAC(dims, "national_excellence");
    expect(ac).toBeCloseTo(98.70, 1);
  });

  it("ignores D3 when null for NE", () => {
    const dims = makeDimensions({ d3: null });
    const ac = calculateAC(dims, "national_excellence");
    expect(ac).toBeGreaterThan(0);
  });

  it("calculates Iberoleum NE with real values", () => {
    const dims: CompetitionAuthorityDimensions = {
      d1: { coiPanel: 6, panelSize: 8, blindProtocol: 4, coiTastingSheet: 4, preselection: 1 },
      d2: { coiTraining: 8, panelChief: 9, independence: 6, geoDiversity: 0 },
      d3: null,
      d4: { sampleAuth: 3, labAnalysis: 6, entryLimit: 2 },
      d5: { editions: 2, institutionalBacking: 1, methodologyPublication: 1 },
    };
    const ac = calculateAC(dims, "national_excellence");
    // D1=23, D2_without_geo=23, D4=11, D5=4 → subtotal=61
    // AC = 61 × (100/77) = 79.22
    expect(ac).toBeCloseTo(79.22, 1);
  });

  it("returns 0 when all dimensions are 0", () => {
    const dims: CompetitionAuthorityDimensions = {
      d1: { coiPanel: 0, panelSize: 0, blindProtocol: 0, coiTastingSheet: 0, preselection: 0 },
      d2: { coiTraining: 0, panelChief: 0, independence: 0, geoDiversity: 0 },
      d3: { countries: 0, samples: 0, southernHemisphere: 0, marketVisibility: 0 },
      d4: { sampleAuth: 0, labAnalysis: 0, entryLimit: 0 },
      d5: { editions: 0, institutionalBacking: 0, methodologyPublication: 0 },
    };
    expect(calculateAC(dims, "international")).toBe(0);
  });
});

// ---- classifyTier tests ----

describe("classifyTier", () => {
  it("classifies international tiers correctly", () => {
    expect(classifyTier(96, "international")).toBe("tier_1");
    expect(classifyTier(80, "international")).toBe("tier_1");
    expect(classifyTier(79, "international")).toBe("tier_2");
    expect(classifyTier(60, "international")).toBe("tier_2");
    expect(classifyTier(59, "international")).toBe("tier_3");
    expect(classifyTier(40, "international")).toBe("tier_3");
    expect(classifyTier(39, "international")).toBe("unclassified");
  });

  it("classifies NE tiers correctly", () => {
    expect(classifyTier(80, "national_excellence")).toBe("ne_tier_1");
    expect(classifyTier(75, "national_excellence")).toBe("ne_tier_1");
    expect(classifyTier(74, "national_excellence")).toBe("ne_tier_2");
    expect(classifyTier(55, "national_excellence")).toBe("ne_tier_2");
    expect(classifyTier(54, "national_excellence")).toBe("unclassified");
  });
});

// ---- interpolatePM tests ----

describe("interpolatePM", () => {
  it("returns null for percentile < 30", () => {
    expect(interpolatePM(0)).toBeNull();
    expect(interpolatePM(15)).toBeNull();
    expect(interpolatePM(29)).toBeNull();
    expect(interpolatePM(29.99)).toBeNull();
  });

  it("returns exact values at anchors", () => {
    expect(interpolatePM(30)).toBe(3.0);
    expect(interpolatePM(50)).toBe(5.0);
    expect(interpolatePM(70)).toBe(7.0);
    expect(interpolatePM(85)).toBe(8.5);
    expect(interpolatePM(95)).toBe(9.70);
    expect(interpolatePM(100)).toBe(10.0);
  });

  it("interpolates linearly between p30 and p70", () => {
    const pm40 = interpolatePM(40)!;
    expect(pm40).toBeGreaterThan(3.0);
    expect(pm40).toBeLessThan(5.0);
    // p40 is midway between p30 and p50 → PM ~ 4.0
    expect(pm40).toBe(4.0);

    const pm60 = interpolatePM(60)!;
    expect(pm60).toBeGreaterThan(5.0);
    expect(pm60).toBeLessThan(7.0);
    expect(pm60).toBe(6.0);
  });

  it("interpolates concavely (t^1.5) for p70+", () => {
    const pm77 = interpolatePM(77)!;
    // In concave zone t^1.5: slower progress at the start
    expect(pm77).toBeGreaterThan(7.0);
    expect(pm77).toBeLessThan(8.5);
    // t = (77-70)/(85-70) = 7/15 ≈ 0.467
    // t^1.5 ≈ 0.319
    // PM = 7.0 + 0.319 * 1.5 ≈ 7.48
    expect(pm77).toBeCloseTo(7.48, 1);
  });

  it("returns 10.0 for percentile >= 100", () => {
    expect(interpolatePM(100)).toBe(10.0);
    expect(interpolatePM(150)).toBe(10.0);
  });
});

// ---- pmToMedalLevel tests ----

describe("pmToMedalLevel", () => {
  it("maps PM to medal levels correctly", () => {
    expect(pmToMedalLevel(10.0)).toBe("gran_prestige_gold");
    expect(pmToMedalLevel(9.5)).toBe("gran_prestige_gold");
    expect(pmToMedalLevel(9.1)).toBe("gran_prestige_gold");
    expect(pmToMedalLevel(8.5)).toBe("gold_especial");
    expect(pmToMedalLevel(7.75)).toBe("gold_especial");
    expect(pmToMedalLevel(7.0)).toBe("gold");
    expect(pmToMedalLevel(6.0)).toBe("gold");
    expect(pmToMedalLevel(5.0)).toBe("silver");
    expect(pmToMedalLevel(4.0)).toBe("silver");
    expect(pmToMedalLevel(3.0)).toBe("bronze");
    expect(pmToMedalLevel(1.0)).toBe("bronze");
  });
});

// ---- calculateFIM tests ----

describe("calculateFIM", () => {
  it("returns 1.0 for goldRate <= 0.30", () => {
    expect(calculateFIM(0)).toBe(1.0);
    expect(calculateFIM(0.15)).toBe(1.0);
    expect(calculateFIM(0.30)).toBe(1.0);
  });

  it("penalizes goldRate > 0.30", () => {
    const fim = calculateFIM(0.40);
    // FIM = 1.0 - (0.40 - 0.30) * 1.4 = 1.0 - 0.14 = 0.86
    expect(fim).toBeCloseTo(0.86, 2);
    expect(fim).toBeLessThan(1.0);
  });

  it("has floor at 0.2", () => {
    expect(calculateFIM(0.99)).toBe(0.2);
    expect(calculateFIM(1.0)).toBe(0.2);
  });

  it("is monotonically decreasing for goldRate > 0.30", () => {
    const fim35 = calculateFIM(0.35);
    const fim50 = calculateFIM(0.50);
    const fim70 = calculateFIM(0.70);
    expect(fim35).toBeGreaterThan(fim50);
    expect(fim50).toBeGreaterThan(fim70);
  });
});

// ---- getHemisphere and calculateFH tests ----

describe("getHemisphere", () => {
  it("identifies southern hemisphere countries", () => {
    expect(getHemisphere("AR")).toBe("southern");
    expect(getHemisphere("CL")).toBe("southern");
    expect(getHemisphere("AU")).toBe("southern");
    expect(getHemisphere("ZA")).toBe("southern");
  });

  it("identifies northern hemisphere countries", () => {
    expect(getHemisphere("ES")).toBe("northern");
    expect(getHemisphere("IT")).toBe("northern");
    expect(getHemisphere("GR")).toBe("northern");
    expect(getHemisphere("US")).toBe("northern");
  });

  it("is case-insensitive", () => {
    expect(getHemisphere("ar")).toBe("southern");
    expect(getHemisphere("es")).toBe("northern");
  });
});

describe("calculateFH", () => {
  it("returns 1.0 for same hemisphere", () => {
    expect(calculateFH("ES", "ES")).toBe(1.0);
    expect(calculateFH("AR", "CL")).toBe(1.0);
  });

  it("returns 0.85 for different hemispheres", () => {
    expect(calculateFH("AR", "ES")).toBe(0.85);
    expect(calculateFH("CL", "IT")).toBe(0.85);
  });

  it("treats INT as northern hemisphere (ES)", () => {
    expect(calculateFH("ES", "INT")).toBe(1.0);
    expect(calculateFH("AR", "INT")).toBe(0.85);
  });
});

// ---- scoreToPercentile tests ----

describe("scoreToPercentile", () => {
  it("returns 0 for empty distribution", () => {
    expect(scoreToPercentile(50, [])).toBe(0);
  });

  it("calculates correct percentile for simple distribution", () => {
    const dist = [10, 20, 30, 40, 50, 60, 70, 80, 90, 100];
    expect(scoreToPercentile(50, dist)).toBe(50); // 5 of 10 <= 50
    expect(scoreToPercentile(100, dist)).toBe(100); // 10 of 10 <= 100
    expect(scoreToPercentile(10, dist)).toBe(10); // 1 of 10 <= 10
  });

  it("returns 0 for score less than all", () => {
    const dist = [50, 60, 70];
    expect(scoreToPercentile(10, dist)).toBe(0);
  });

  it("returns 100 for score greater than or equal to max", () => {
    const dist = [50, 60, 70];
    expect(scoreToPercentile(70, dist)).toBe(100);
    expect(scoreToPercentile(80, dist)).toBe(100);
  });
});

// ---- resolvePM tests ----

describe("resolvePM", () => {
  it("resolves award → discrete PM", () => {
    const result: CompetitionResult = {
      competition: "mario_solinas",
      season: "2024/2025",
      scoreType: "award",
      award: "gold",
    };
    const resolved = resolvePM(result);
    expect(resolved).not.toBeNull();
    expect(resolved!.pm).toBe(7.0);
    expect(resolved!.medalLevel).toBe("gold");
  });

  it("maps all award levels correctly", () => {
    for (const [award, medal] of Object.entries(AWARD_TO_MEDAL)) {
      const result: CompetitionResult = {
        competition: "test",
        season: "2024/2025",
        scoreType: "award",
        award: award as AwardLevel,
      };
      const resolved = resolvePM(result);
      expect(resolved).not.toBeNull();
      expect(resolved!.pm).toBe(PM_MAP[medal]);
    }
  });

  it("returns null for numeric without distribution", () => {
    const result: CompetitionResult = {
      competition: "evooleum",
      season: "2024/2025",
      scoreType: "numeric",
      score: 85,
    };
    expect(resolvePM(result)).toBeNull();
    expect(resolvePM(result, [])).toBeNull();
  });

  it("resolves numeric with distribution", () => {
    const result: CompetitionResult = {
      competition: "evooleum",
      season: "2024/2025",
      scoreType: "numeric",
      score: 80,
    };
    // Simple distribution: 80 is at p80 (8 of 10 <= 80)
    const dist = [10, 20, 30, 40, 50, 60, 70, 80, 90, 100];
    const resolved = resolvePM(result, dist);
    expect(resolved).not.toBeNull();
    expect(resolved!.pm).toBeGreaterThan(7.0); // p80 -> concave zone
  });

  it("returns null for numeric with percentile < 30", () => {
    const result: CompetitionResult = {
      competition: "evooleum",
      season: "2024/2025",
      scoreType: "numeric",
      score: 10,
    };
    const dist = [10, 20, 30, 40, 50, 60, 70, 80, 90, 100];
    // Score 10 → p10 → < p30 → null
    expect(resolvePM(result, dist)).toBeNull();
  });
});

// ---- calculateEvooScore tests ----

describe("calculateEvooScore", () => {
  const competitions: Competition[] = [
    makeCompetition({ id: "evooleum", country: "ES", scoreType: "numeric" }),
    makeCompetition({ id: "mario_solinas", country: "INT", scoreType: "award" }),
  ];

  const authorities: CompetitionAuthority[] = [
    makeAuthority({ competitionId: "evooleum", acScore: 71, category: "international", goldRate: 0.25 }),
    makeAuthority({ competitionId: "mario_solinas", acScore: 96, category: "international", goldRate: 0.20 }),
  ];

  const distributions = new Map<string, number[]>([
    ["evooleum:2024/2025", [50, 55, 60, 65, 70, 72, 75, 78, 80, 85, 88, 90]],
  ]);

  it("calculates score for EVOO with award result", () => {
    const evoo = makeEvoo({
      results: [{
        competition: "mario_solinas",
        season: "2024/2025",
        scoreType: "award",
        award: "gold",
      }],
    });

    const result = calculateEvooScore(evoo, authorities, competitions, distributions);
    // P = AC(96) × PM(7.0) × FH(1.0, ES→INT=ES) × FIM(1.0-penalty, rate=0.20<0.30→1.0)
    // P = 96 × 7.0 × 1.0 × 1.0 = 672
    expect(result.score).toBe(672);
    expect(result.scoreNE).toBe(0);
    expect(result.medalCount).toBe(1);
    expect(result.breakdown).toHaveLength(1);
    expect(result.breakdown[0].medalLevel).toBe("gold");
  });

  it("separates international scores from NE", () => {
    const neAuth = makeAuthority({
      competitionId: "iberoleum",
      acScore: 79,
      category: "national_excellence",
      goldRate: 0.20,
    });
    const neComp = makeCompetition({ id: "iberoleum", country: "ES" });

    const evoo = makeEvoo({
      results: [
        { competition: "mario_solinas", season: "2024/2025", scoreType: "award", award: "gold" },
        { competition: "iberoleum", season: "2024/2025", scoreType: "numeric", score: 88 },
      ],
    });

    const allAuth = [...authorities, neAuth];
    const allComp = [...competitions, neComp];
    const allDist = new Map(distributions);
    allDist.set("iberoleum:2024/2025", [50, 55, 60, 65, 70, 72, 75, 78, 80, 85, 88, 90]);

    const result = calculateEvooScore(evoo, allAuth, allComp, allDist);
    expect(result.score).toBeGreaterThan(0); // international
    expect(result.scoreNE).toBeGreaterThan(0); // NE
  });

  it("puts score in auxiliary for competition with AC < 40", () => {
    const lowAuth = makeAuthority({
      competitionId: "low_ac",
      acScore: 30,
      category: "international",
      goldRate: 0.20,
    });
    const lowComp = makeCompetition({ id: "low_ac", country: "ES", scoreType: "award" });

    const evoo = makeEvoo({
      results: [{
        competition: "low_ac",
        season: "2024/2025",
        scoreType: "award",
        award: "gold",
      }],
    });

    const result = calculateEvooScore(evoo, [lowAuth], [lowComp], new Map());
    expect(result.score).toBe(0);
    expect(result.scoreAuxiliar).toBeGreaterThan(0);
  });

  it("uses FIM=1.0 for numeric competitions (Section 5.5)", () => {
    const evoo = makeEvoo({
      results: [{
        competition: "evooleum",
        season: "2024/2025",
        scoreType: "numeric",
        score: 88,
      }],
    });

    const result = calculateEvooScore(evoo, authorities, competitions, distributions);
    // Verify FIM = 1.0 in breakdown
    const bd = result.breakdown[0];
    expect(bd.fim).toBe(1.0);
  });

  it("returns all zeros with no results", () => {
    const evoo = makeEvoo({ results: [] });
    const result = calculateEvooScore(evoo, authorities, competitions, distributions);
    expect(result.score).toBe(0);
    expect(result.scoreNE).toBe(0);
    expect(result.scoreAuxiliar).toBe(0);
    expect(result.medalCount).toBe(0);
    expect(result.breakdown).toHaveLength(0);
  });
});

// ---- buildRanking tests ----

describe("buildRanking", () => {
  const competitions: Competition[] = [
    makeCompetition({ id: "mario_solinas", country: "INT", scoreType: "award" }),
  ];
  const authorities: CompetitionAuthority[] = [
    makeAuthority({ competitionId: "mario_solinas", acScore: 96, goldRate: 0.20 }),
  ];
  const distributions = new Map<string, number[]>();

  it("sorts by score descending and assigns positions", () => {
    const evoos = [
      makeEvoo({
        id: "a1", name: "EVOO Bronze",
        results: [{ competition: "mario_solinas", season: "2024/2025", scoreType: "award", award: "bronze" }],
      }),
      makeEvoo({
        id: "a2", name: "EVOO Gold",
        results: [{ competition: "mario_solinas", season: "2024/2025", scoreType: "award", award: "gold" }],
      }),
    ];

    const ranked = buildRanking(evoos, authorities, competitions, distributions);
    expect(ranked).toHaveLength(2);
    expect(ranked[0].name).toBe("EVOO Gold");
    expect(ranked[0].position).toBe(1);
    expect(ranked[1].name).toBe("EVOO Bronze");
    expect(ranked[1].position).toBe(2);
  });

  it("excludes EVOOs with score 0", () => {
    const evoos = [
      makeEvoo({ id: "a1", results: [] }), // no results → score 0
      makeEvoo({
        id: "a2",
        results: [{ competition: "mario_solinas", season: "2024/2025", scoreType: "award", award: "gold" }],
      }),
    ];

    const ranked = buildRanking(evoos, authorities, competitions, distributions);
    expect(ranked).toHaveLength(1);
    expect(ranked[0].id).toBe("a2");
  });

  it("breaks ties by medalCount then alphabetically", () => {
    const evoos = [
      makeEvoo({
        id: "a1", name: "Zeta",
        results: [{ competition: "mario_solinas", season: "2024/2025", scoreType: "award", award: "gold" }],
      }),
      makeEvoo({
        id: "a2", name: "Alfa",
        results: [{ competition: "mario_solinas", season: "2024/2025", scoreType: "award", award: "gold" }],
      }),
    ];

    const ranked = buildRanking(evoos, authorities, competitions, distributions);
    // Same score and medalCount → alphabetic tiebreak
    expect(ranked[0].name).toBe("Alfa");
    expect(ranked[1].name).toBe("Zeta");
  });
});

// ---- buildCountryRanking tests ----

describe("buildCountryRanking", () => {
  it("filters by country and calculates combinedScore", () => {
    const allScored = [
      { ...makeEvoo({ id: "a1", producer: { name: "P1", country: "ES" } }), score: 500, scoreNE: 100, scoreAuxiliar: 0, medalCount: 2, breakdown: [], position: 1 },
      { ...makeEvoo({ id: "a2", producer: { name: "P2", country: "IT" } }), score: 400, scoreNE: 0, scoreAuxiliar: 0, medalCount: 1, breakdown: [], position: 2 },
      { ...makeEvoo({ id: "a3", producer: { name: "P3", country: "ES" } }), score: 300, scoreNE: 50, scoreAuxiliar: 0, medalCount: 1, breakdown: [], position: 3 },
    ];

    const esRanking = buildCountryRanking(allScored, "ES");
    expect(esRanking).toHaveLength(2);
    expect(esRanking[0].combinedScore).toBe(600); // 500 + 100
    expect(esRanking[0].countryPosition).toBe(1);
    expect(esRanking[1].combinedScore).toBe(350); // 300 + 50
    expect(esRanking[1].countryPosition).toBe(2);
  });
});

// ---- buildVarietyRanking tests ----

describe("buildVarietyRanking", () => {
  it("filters by variety (slug) and assigns positions", () => {
    const allScored = [
      { ...makeEvoo({ id: "a1", varieties: ["Picual"] }), score: 500, scoreNE: 0, scoreAuxiliar: 0, medalCount: 2, breakdown: [], position: 1 },
      { ...makeEvoo({ id: "a2", varieties: ["Arbequina"] }), score: 400, scoreNE: 0, scoreAuxiliar: 0, medalCount: 1, breakdown: [], position: 2 },
      { ...makeEvoo({ id: "a3", varieties: ["Picual", "Hojiblanca"] }), score: 300, scoreNE: 0, scoreAuxiliar: 0, medalCount: 1, breakdown: [], position: 3 },
    ];

    const picualRanking = buildVarietyRanking(allScored, "picual");
    expect(picualRanking).toHaveLength(2);
    expect(picualRanking[0].varietyPosition).toBe(1);
    expect(picualRanking[1].varietyPosition).toBe(2);
  });

  it("optionally filters by country", () => {
    const allScored = [
      { ...makeEvoo({ id: "a1", varieties: ["Picual"], producer: { name: "P1", country: "ES" } }), score: 500, scoreNE: 0, scoreAuxiliar: 0, medalCount: 2, breakdown: [], position: 1 },
      { ...makeEvoo({ id: "a2", varieties: ["Picual"], producer: { name: "P2", country: "IT" } }), score: 400, scoreNE: 0, scoreAuxiliar: 0, medalCount: 1, breakdown: [], position: 2 },
    ];

    const esOnly = buildVarietyRanking(allScored, "picual", "ES");
    expect(esOnly).toHaveLength(1);
    expect(esOnly[0].id).toBe("a1");
  });
});

// ---- buildCategoryRanking tests ----

describe("buildCategoryRanking", () => {
  // Simple hasTag predicate for testing (checks organic field)
  const hasTag = (evoo: Evoo, tag: string): boolean => {
    if (tag === "organic") return evoo.organic;
    return false;
  };

  it("filters by category tag and assigns positions", () => {
    const allScored = [
      {
        ...makeEvoo({ id: "a1", organic: true }),
        score: 500, scoreNE: 0, scoreAuxiliar: 0, medalCount: 2, breakdown: [], position: 1,
      },
      {
        ...makeEvoo({ id: "a2", organic: false }),
        score: 400, scoreNE: 0, scoreAuxiliar: 0, medalCount: 1, breakdown: [], position: 2,
      },
    ];

    const organicRanking = buildCategoryRanking(allScored, "organic", hasTag);
    expect(organicRanking).toHaveLength(1);
    expect(organicRanking[0].id).toBe("a1");
    expect(organicRanking[0].categoryPosition).toBe(1);
  });
});
