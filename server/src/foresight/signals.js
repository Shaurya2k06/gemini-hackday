/**
 * Ownership-transition signal taxonomy.
 *
 * Zoron's screener answers "who matches my filters?". Foresight answers a
 * different question: "who is likely to become available, and when?".
 *
 * Each signal is a weak, publicly observable indicator that a privately held
 * company is drifting toward a transaction. No single one means much; the thesis
 * is that a *combination* carries predictive weight, and that the weights should
 * ultimately be learned from a firm's own closed deals rather than asserted.
 *
 * Weights below are priors, deliberately conservative, and are the thing a
 * backtest is meant to falsify.
 */

/** Direction: `positive` raises transition likelihood, `negative` lowers it. */
export const SIGNALS = {
  founder_tenure_window: {
    weight: 1.1,
    direction: "positive",
    description:
      "Founder has led the business 8-15 years — the window where succession, fatigue, and wealth concentration converge.",
  },
  no_institutional_capital: {
    weight: 0.9,
    direction: "positive",
    description:
      "No VC or PE on the cap table, so a sale is the only realistic liquidity route for the owners.",
  },
  concentrated_ownership: {
    weight: 0.8,
    direction: "positive",
    description:
      "Sole founder, family, or a very small shareholder group — a decision to sell needs few consents.",
  },
  first_finance_hire: {
    weight: 1.0,
    direction: "positive",
    description:
      "First CFO or Head of Finance appointed, often to prepare reporting for a diligence process.",
  },
  corp_dev_hire: {
    weight: 1.2,
    direction: "positive",
    description:
      "Head of Corporate Development or M&A hired, which frequently precedes a formal process.",
  },
  advisor_engaged: {
    weight: 1.6,
    direction: "positive",
    description:
      "Investment bank, corporate finance boutique, or M&A advisor publicly associated with the company.",
  },
  registry_share_transfer: {
    weight: 1.3,
    direction: "positive",
    description:
      "Company registry filings show share transfers, new holding structures, or charge changes.",
  },
  succession_language: {
    weight: 1.1,
    direction: "positive",
    description:
      "Founder publicly discusses succession, stepping back, retirement, or 'next chapter'.",
  },
  hiring_velocity_decay: {
    weight: 0.6,
    direction: "positive",
    description:
      "Headcount growth has flattened or reversed after a sustained expansion — often pre-transaction consolidation.",
  },
  exec_departures: {
    weight: 0.5,
    direction: "positive",
    description: "Multiple senior leaders departed within a short window.",
  },
  funding_dormancy: {
    weight: 0.5,
    direction: "positive",
    description:
      "Many years since any external raise, indicating self-funded operation and no venture timeline.",
  },
  profitable_and_stable: {
    weight: 0.4,
    direction: "positive",
    description:
      "Profitable with steady revenue — attractive and saleable, and the owner has no funding pressure.",
  },
  recent_large_raise: {
    weight: 1.4,
    direction: "negative",
    description:
      "Just raised significant institutional capital, so investors expect a multi-year hold, not a sale.",
  },
  founder_recently_appointed: {
    weight: 1.0,
    direction: "negative",
    description:
      "Founder or CEO started recently and is early in their tenure, making an exit unlikely.",
  },
  aggressive_expansion: {
    weight: 0.7,
    direction: "negative",
    description:
      "Actively scaling headcount, entering new markets, or investing heavily in growth.",
  },
};

export const SIGNAL_KEYS = Object.freeze(Object.keys(SIGNALS));

/** Signals whose presence lowers transition likelihood. */
export const NEGATIVE_SIGNAL_KEYS = Object.freeze(
  SIGNAL_KEYS.filter((key) => SIGNALS[key].direction === "negative")
);

/**
 * Base rate of privately held SMEs undergoing a control transaction per year.
 *
 * Deliberately explicit: transition scores are near-meaningless without it.
 * Even a strong score leaves a company more likely *not* to transact, so the
 * product must report lift against this rather than a bare probability.
 */
export const ANNUAL_BASE_RATE = 0.03;

/** Default horizon a score refers to when none is supplied, in months. */
export const DEFAULT_HORIZON_MONTHS = 6;

/**
 * Base rate over an arbitrary horizon.
 *
 * The horizon must travel with the score. An earlier version hard-coded six
 * months while backtests evaluated a multi-year window, which made the score
 * and its own evaluation answer different questions — a company correctly
 * scored "not selling within six months" was counted as a miss for selling
 * three years later.
 */
export function baseRateForHorizon(horizonMonths = DEFAULT_HORIZON_MONTHS) {
  const months = Number(horizonMonths);
  if (!Number.isFinite(months) || months <= 0) {
    throw new Error(`Invalid horizonMonths "${horizonMonths}" — must be a positive number.`);
  }
  // Linear scaling understates compounding over long spans, but stays honest at
  // the ranges that matter and never exceeds a plausible ceiling.
  return Math.min(0.75, ANNUAL_BASE_RATE * (months / 12));
}

/** Retained for callers that want the default-horizon base rate directly. */
export const HORIZON_BASE_RATE = baseRateForHorizon(DEFAULT_HORIZON_MONTHS);

export function isKnownSignal(key) {
  return Object.prototype.hasOwnProperty.call(SIGNALS, key);
}
