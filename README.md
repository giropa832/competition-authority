# Competition Authority (CA) Algorithm

Open-source scoring algorithm used by the [Molino y Cata EVOO World Ranking](https://molinoycata.com/ranking) to evaluate Extra Virgin Olive Oils based on their results in international competitions.

## Why open source?

Transparency. Any producer, competition organizer, or consumer can audit exactly how we calculate scores. No black boxes.

## How it works

Each EVOO's score for a competition result is calculated as:

```
P(evoo, competition) = CA × MP × HF × MIF
```

The total score is the sum of all qualifying results:

```
Score = Σ P(evoo, ci) for all competitions where CA >= 40
```

### CA — Competition Authority (0-100)

A composite score evaluating the rigor of each competition across 5 dimensions:

| Dimension | Weight | What it measures |
|---|---|---|
| **D1** Panel Quality | 30 pts | COI coverage, panel size, blind protocol, tasting sheet, preselection |
| **D2** Panel Independence | 30 pts | COI training, panel chief qualifications, independence, geographic diversity |
| **D3** Scope & Reach | 25 pts | Countries represented, sample count, southern hemisphere coverage, market visibility |
| **D4** Sample Verification | 15 pts | Sample authentication, lab analysis, entry limits |
| **D5** Institutional | 5 pts | Edition history, institutional backing, methodology publication |

**International competitions** use all 5 dimensions (max 100).

**National Excellence competitions** exclude D3 and D2.4 (geographic diversity), then normalize to 100: `CA = subtotal × (100/77)`.

Only competitions with **CA >= 40** contribute to the main ranking.

#### Tier classification

| Tier | International | National Excellence |
|---|---|---|
| Tier 1 | CA >= 80 | CA >= 75 |
| Tier 2 | CA >= 60 | CA >= 55 |
| Tier 3 | CA >= 40 | — |

### MP — Medal Points (3-10)

**Award-based competitions** (gold/silver/bronze):

| Award | MP |
|---|---|
| Gran Prestige Gold / Best of Show | 10.0 |
| Gold Especial / Best of Class | 8.5 |
| Gold | 7.0 |
| Silver | 5.0 |
| Bronze / Finalist | 3.0 |

**Numeric-based competitions** (score out of 100): Uses a hybrid percentile method with continuous interpolation. Scores below p30 don't count.

- **p30-p70**: Linear interpolation between anchors
- **p70+**: Concave curve (t^1.5) — increasingly harder to reach higher MP

### HF — Hemisphere Factor (0.85 or 1.0)

Oils competing in the same hemisphere as their origin get HF = 1.0. Cross-hemisphere results get HF = 0.85 (slight penalty for logistic advantage of freshness).

### MIF — Medal Inflation Factor (0.2-1.0)

Penalizes competitions that award gold to more than 30% of entries:

```
MIF = 1 - max(0, (goldRate - 0.30) × 1.4)
```

Floor at 0.2. Numeric competitions get MIF = 1.0 (the percentile mechanism already corrects for inflation).

## Score buckets

| Bucket | Source | Used for |
|---|---|---|
| `score` | International competitions, CA >= 40 | Global ranking |
| `scoreNE` | National Excellence competitions, CA >= 40 | Country rankings (combined with `score`) |
| `scoreAuxiliar` | Any competition with CA < 40 | Informational only |

## Usage

```typescript
import {
  calculateAC,
  calculateEvooScore,
  buildRanking,
  classifyTier,
} from "competition-authority";

// Calculate Competition Authority from dimensions
const ca = calculateAC(dimensions, "international");
const tier = classifyTier(ca, "international");

// Score an EVOO across all its competition results
const { score, scoreNE, breakdown } = calculateEvooScore(
  evoo,
  authorities,
  competitions,
  distributions
);

// Build a full ranking
const ranking = buildRanking(evoos, authorities, competitions, distributions);
```

## API Reference

### Core scoring

- `calculateAC(dimensions, category)` — Competition Authority from D1-D5
- `classifyTier(acScore, category)` — Tier classification
- `interpolatePM(percentile)` — Continuous MP from percentile
- `pmToMedalLevel(pm)` — Equivalent medal level from continuous MP
- `calculateFIM(goldRate)` — Medal Inflation Factor
- `calculateFH(evooCountry, competitionCountry)` — Hemisphere Factor
- `scoreToPercentile(score, distribution)` — Score to percentile
- `resolvePM(result, distribution?)` — Full MP resolution for a result
- `calculateEvooScore(evoo, authorities, competitions, distributions)` — Complete EVOO scoring

### Ranking builders

- `buildRanking(evoos, authorities, competitions, distributions)` — Global ranking
- `scoreAllEvoos(...)` — Score all EVOOs including NE-only
- `buildCountryRanking(allScored, countryCode)` — Country ranking
- `buildVarietyRanking(allScored, varietySlug, countryCode?)` — Variety ranking
- `buildCategoryRanking(allScored, categorySlug, hasTag, countryCode?)` — Category ranking (bring your own tag predicate)

## Testing

```bash
npm install
npm test
```

45 tests covering all scoring functions, correction factors, and ranking builders.

## Full methodology

Read the complete methodology documentation at [molinoycata.com/ranking/methodology](https://molinoycata.com/ranking/methodology).

## License

MIT
