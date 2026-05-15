/**
 * Statistical primitives used by the Insights screen and Intelligence Engine.
 *
 * Every function here is pure on `number[]` and free of side effects. The
 * derivations and rationale for each formula live in `docs/INSIGHTS_FORMULAS.md`
 * — keep that doc in sync when you change a formula here.
 *
 * Design rules:
 *   - Right-skewed financial data → prefer **median + MAD** over mean + stddev.
 *   - Small samples (N < 30) → use **Student-t** instead of normal approximation.
 *   - Every function returns a numerically safe value on degenerate inputs
 *     (empty array, all-zero, all-identical) so callers don't have to guard.
 */

// ─── Mean / median / spread ─────────────────────────────────────────────────

/**
 * Arithmetic mean. Returns 0 on empty input.
 *
 * Formula:  x̄ = (1/N) · Σ xᵢ
 *
 * Used for totals and per-day averages. NOT used as the centre of a spending
 * distribution — see §2.1 of INSIGHTS_FORMULAS.md for why median is preferred.
 */
export function mean(xs: number[]): number {
  if (xs.length === 0) return 0;
  let sum = 0;
  for (const x of xs) sum += x;
  return sum / xs.length;
}

/**
 * Sample median. Returns 0 on empty input.
 *
 * Formula (sorted sample x_(1) ≤ … ≤ x_(N)):
 *   N odd  → x_((N+1)/2)
 *   N even → ½ · (x_(N/2) + x_(N/2 + 1))
 *
 * The "typical value" estimator we use for spending — robust to the single
 * ₱40,000 rent charge that would yank a mean far from where most days sit.
 */
export function median(xs: number[]): number {
  if (xs.length === 0) return 0;
  const sorted = [...xs].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[mid - 1] + sorted[mid]) / 2
    : sorted[mid];
}

/**
 * Sample standard deviation (Bessel-corrected, divides by N − 1).
 * Returns 0 for N < 2.
 *
 * Formula:  s = √( (1/(N − 1)) · Σ (xᵢ − x̄)² )
 *
 * Used only as a scale parameter for confidence-interval math. For spending
 * "spread" we prefer MAD (next) — a single outlier can move s arbitrarily far
 * via the squared deviation, while MAD shifts by at most one rank.
 */
export function stddev(xs: number[]): number {
  if (xs.length < 2) return 0;
  const m = mean(xs);
  let acc = 0;
  for (const x of xs) {
    const d = x - m;
    acc += d * d;
  }
  return Math.sqrt(acc / (xs.length - 1));
}

/**
 * Median Absolute Deviation. Returns 0 on empty input.
 *
 * Formula:  MAD = median( |xᵢ − median(x)| )
 *
 * Robust scale estimator. Multiply by 1.4826 (see {@link madSigma}) to make it
 * a consistent estimator of σ under a normal model — the constant is the
 * reciprocal of the 75th percentile of the standard normal (Φ⁻¹(0.75) ≈ 0.6745
 * → 1/0.6745 ≈ 1.4826). Reference: Huber (1981) §6.2.
 */
export function mad(xs: number[]): number {
  if (xs.length === 0) return 0;
  const med = median(xs);
  const deviations = xs.map((x) => Math.abs(x - med));
  return median(deviations);
}

/**
 * MAD scaled to estimate σ under a normal model. Returns 0 on empty input.
 *
 * Formula:  σ̂_MAD = 1.4826 · MAD(x)
 *
 * The constant 1.4826 = 1 / Φ⁻¹(0.75) makes σ̂_MAD a **consistent** estimator
 * of σ for normally distributed data while keeping the breakdown point of MAD
 * (50%, vs 0% for sample stddev). Used as the denominator in the modified
 * z-score (see {@link robustZScore}).
 */
export function madSigma(xs: number[]): number {
  return 1.4826 * mad(xs);
}

/**
 * Coefficient of variation. Returns 0 if mean is 0.
 *
 * Formula:  CV = s / x̄
 *
 * Unit-free measure of relative spread. "Is ₱50 of swing a lot?" → depends on
 * the average; CV gives a scale-free answer. We use CV ≤ 0.25 as the
 * "amount-stable enough to call recurring" threshold for subscription
 * detection (see §3.11 of INSIGHTS_FORMULAS.md).
 */
export function coefficientOfVariation(xs: number[]): number {
  const m = mean(xs);
  if (m === 0) return 0;
  return stddev(xs) / m;
}

/**
 * Robust analogue of CV: scale = MAD, centre = median. Returns 0 if median
 * is 0 (degenerate; signal not meaningful).
 *
 * Formula:  rCV = MAD(x) / median(x)
 */
export function robustCV(xs: number[]): number {
  const med = median(xs);
  if (med === 0) return 0;
  return mad(xs) / med;
}

// ─── Outlier detection ──────────────────────────────────────────────────────

/**
 * Iglewicz-Hoaglin modified z-score for a single observation against a sample.
 *
 * Formula:  M = (x − median(sample)) / (1.4826 · MAD(sample))
 *
 * Returns `null` when MAD = 0 (sample has no spread — z-score undefined; caller
 * must apply a fallback rule, see §3.6 of INSIGHTS_FORMULAS.md).
 *
 * Outlier cutoff: |M| > 3.5 (Iglewicz & Hoaglin 1993). Conservative on heavy
 * -tailed data — false-positive rate under a true normal is ≈0.05% per obs.
 */
export function robustZScore(x: number, sample: number[]): number | null {
  if (sample.length === 0) return null;
  const sigma = madSigma(sample);
  if (sigma === 0) return null;
  return (x - median(sample)) / sigma;
}

// ─── Confidence intervals ───────────────────────────────────────────────────

/**
 * Student-t 97.5th percentile values for df = 1..30. Used to build two-sided
 * 95% confidence intervals on small samples. Above df = 30 we fall back to
 * the normal approximation (1.96), which is within ~3% of the true t value.
 *
 * Source: standard t-table (NIST/SEMATECH §1.3.6.7.2).
 */
const T_TABLE_975: number[] = [
  // df = 1..30
  12.706, 4.303, 3.182, 2.776, 2.571, 2.447, 2.365, 2.306, 2.262, 2.228, 2.201,
  2.179, 2.16, 2.145, 2.131, 2.12, 2.11, 2.101, 2.093, 2.086, 2.08, 2.074,
  2.069, 2.064, 2.06, 2.056, 2.052, 2.048, 2.045, 2.042,
];

/**
 * Look up t_{0.975, df}. Returns 1.96 for df ≥ 30 (normal approximation).
 */
export function tCritical95(df: number): number {
  if (df < 1) return 12.706; // degenerate; widest reasonable value
  if (df > 30) return 1.96;
  return T_TABLE_975[df - 1];
}

export type ConfidenceInterval = {
  mean: number;
  margin: number;
  low: number;
  high: number;
  /** True if the t-distribution was used (N < 30); false for the normal approx. */
  usedT: boolean;
};

/**
 * Two-sided 95% confidence interval on the **mean** of a sample.
 *
 * Formula:
 *   N ≥ 30 (CLT regime):  x̄ ± 1.96 · (s / √N)
 *   N < 30  (small N):    x̄ ± t_{0.975, N−1} · (s / √N)
 *
 * Returns a zero-width CI centred at the mean when N < 2 (single observation;
 * no spread can be estimated). Callers should still gate on sample size — a
 * mathematically defined CI on N = 2 is rarely informative.
 */
export function ci95(xs: number[]): ConfidenceInterval {
  const m = mean(xs);
  const n = xs.length;
  if (n < 2) {
    return { mean: m, margin: 0, low: m, high: m, usedT: n < 30 };
  }
  const s = stddev(xs);
  const se = s / Math.sqrt(n);
  const usedT = n < 30;
  const t = usedT ? tCritical95(n - 1) : 1.96;
  const margin = t * se;
  return { mean: m, margin, low: m - margin, high: m + margin, usedT };
}

// ─── Linear regression ──────────────────────────────────────────────────────

export type RegressionResult = {
  /** Slope (β̂). Positive = trending up over time. */
  slope: number;
  /** Intercept (α̂). */
  intercept: number;
  /** Coefficient of determination, R² ∈ [0, 1]. Higher = better fit. */
  r2: number;
  /** Sample size used. */
  n: number;
};

/**
 * Ordinary least-squares regression of `y` against its **index** (i = 1..N).
 *
 * Formulas (for points (i, yᵢ), ī = (N+1)/2):
 *   β̂ = Σ(i − ī)(yᵢ − ȳ) / Σ(i − ī)²
 *   α̂ = ȳ − β̂ · ī
 *   R² = 1 − Σ(yᵢ − ŷᵢ)² / Σ(yᵢ − ȳ)²
 *
 * Returns slope = 0, r² = 0 on N < 3 (slope is undefined for N < 2 and
 * trivially perfect for N = 2). Used for the 6-month net trend — R² ≥ 0.6
 * is the threshold below which we suppress directional ("trending up")
 * language in chips.
 */
export function linearRegression(ys: number[]): RegressionResult {
  const n = ys.length;
  if (n < 3) {
    return { slope: 0, intercept: n > 0 ? ys[0] : 0, r2: 0, n };
  }
  const xs = Array.from({ length: n }, (_, i) => i + 1);
  const xMean = mean(xs);
  const yMean = mean(ys);
  let num = 0;
  let den = 0;
  for (let i = 0; i < n; i++) {
    const dx = xs[i] - xMean;
    const dy = ys[i] - yMean;
    num += dx * dy;
    den += dx * dx;
  }
  const slope = den === 0 ? 0 : num / den;
  const intercept = yMean - slope * xMean;

  // Coefficient of determination via residual sum of squares.
  let ssRes = 0;
  let ssTot = 0;
  for (let i = 0; i < n; i++) {
    const yHat = intercept + slope * xs[i];
    ssRes += (ys[i] - yHat) ** 2;
    ssTot += (ys[i] - yMean) ** 2;
  }
  const r2 = ssTot === 0 ? 0 : Math.max(0, 1 - ssRes / ssTot);
  return { slope, intercept, r2, n };
}

// ─── Concentration ──────────────────────────────────────────────────────────

/**
 * Herfindahl-Hirschman Index. Returns 0 on empty input.
 *
 * Formula:  HHI = Σ sᵢ², where sᵢ = amountᵢ / Σ amountⱼ
 *
 * Range: [1/K, 1] for K non-zero categories. HHI = 1 → all spend in one
 * category. HHI = 1/K → perfectly uniform across K categories.
 *
 * Used as the "concentration risk" signal — HHI ≥ 0.45 unlocks the
 * concentration coach message. More honest than just inspecting the top
 * share because two users with the same top share can have very different
 * distributions in the tail.
 */
export function hhi(amounts: number[]): number {
  const total = amounts.reduce((s, a) => s + Math.max(0, a), 0);
  if (total <= 0) return 0;
  let acc = 0;
  for (const a of amounts) {
    if (a > 0) {
      const share = a / total;
      acc += share * share;
    }
  }
  return acc;
}

// ─── Chi-squared goodness-of-fit ────────────────────────────────────────────

/**
 * Critical values for χ² at α = 0.05 (95% confidence) for small df. Used to
 * test "is this DoW / TOD pattern statistically distinguishable from
 * uniform?"
 *
 * Source: NIST/SEMATECH §1.3.6.7.4 (Critical Values of the Chi-Square
 * Distribution).
 *
 * Indexed by df: 1..10. Above df = 10 we extrapolate using the
 * Wilson-Hilferty approximation (rare in our usage; DoW is df=6, TOD is df=3).
 */
const CHI2_CRITICAL_95: Record<number, number> = {
  1: 3.84,
  2: 5.99,
  3: 7.81,
  4: 9.49,
  5: 11.07,
  6: 12.59,
  7: 14.07,
  8: 15.51,
  9: 16.92,
  10: 18.31,
};

export function chi2Critical95(df: number): number {
  if (df < 1) return Infinity;
  if (CHI2_CRITICAL_95[df]) return CHI2_CRITICAL_95[df];
  // Wilson-Hilferty: χ²_α ≈ df · (1 − 2/(9·df) + z_α · √(2/(9·df)))³
  const z = 1.645; // z_{0.95} one-sided
  const inner = 1 - 2 / (9 * df) + z * Math.sqrt(2 / (9 * df));
  return df * inner ** 3;
}

export type Chi2Result = {
  /** χ² test statistic. */
  chi2: number;
  /** Degrees of freedom (bucketCount − 1). */
  df: number;
  /** Critical value at α = 0.05. Reject uniformity when chi2 > critical. */
  critical: number;
  /** True when observed pattern is significantly non-uniform at 95%. */
  significant: boolean;
  /** Lowest expected count across buckets — if < 5 the test is unreliable. */
  minExpected: number;
};

/**
 * One-sample chi-squared goodness-of-fit test against the **uniform** null.
 *
 * Formula:  χ² = Σ (Oᵢ − Eᵢ)² / Eᵢ,  Eᵢ = totalObserved / k
 *
 * `df = k − 1` where `k` is the bucket count. Reject "uniform" at α = 0.05
 * when χ² > critical.
 *
 * Validity caveat: the test assumes Eᵢ ≥ 5 per bucket. We surface `minExpected`
 * so callers can suppress the verdict when the assumption is violated; this
 * is a NIST-recommended safety check.
 */
export function chi2Uniform(observed: number[]): Chi2Result {
  const k = observed.length;
  const total = observed.reduce((s, v) => s + v, 0);
  if (k === 0 || total === 0) {
    return {
      chi2: 0,
      df: Math.max(0, k - 1),
      critical: Infinity,
      significant: false,
      minExpected: 0,
    };
  }
  const expected = total / k;
  let chi2 = 0;
  for (const o of observed) {
    const d = o - expected;
    chi2 += (d * d) / expected;
  }
  const df = k - 1;
  const critical = chi2Critical95(df);
  return {
    chi2,
    df,
    critical,
    significant: chi2 > critical && expected >= 5,
    minExpected: expected,
  };
}

// ─── Sample size adequacy for a proportion ──────────────────────────────────

/**
 * Standard error of a sample proportion.
 *
 * Formula:  SE(p) = √( p(1 − p) / N )
 *
 * Used to decide when a "share of spend" claim (e.g. "Food is 42% of your
 * spend") is precise enough to quote. The worst-case SE at p = 0.5 with the
 * insights donut gate of N = 10 is √(0.25/10) ≈ 0.158 → a ±31pp margin; we
 * therefore avoid quoting a percentage in chips when N < 25 (gets the worst-
 * case margin under ±20pp).
 */
export function proportionSE(p: number, n: number): number {
  if (n <= 0) return Infinity;
  const clamped = Math.min(1, Math.max(0, p));
  return Math.sqrt((clamped * (1 - clamped)) / n);
}
