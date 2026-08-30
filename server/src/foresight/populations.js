/**
 * Population-specific signal weights.
 *
 * The first two backtests failed for a structural reason, not a tuning one: a
 * single weight set was applied to two populations whose exit mechanics are
 * opposites.
 *
 *  - Founder-owned businesses transact when the *owner* wants liquidity, so
 *    long tenure, concentrated ownership and succession talk matter.
 *  - Venture-backed businesses transact when *investors* need liquidity, so
 *    fund age, a stalled growth curve and no fresh round matter — and being
 *    bootstrapped is definitionally irrelevant.
 *
 * Under one blended profile, AgriWebb (venture-backed, recently raised,
 * expanding) scored −1 and then sold. Its signals were read through the wrong
 * model, not measured wrongly.
 *
 * A weight of 0 means "carries no information for this population" and is
 * distinct from a negative weight.
 */

export const POPULATIONS = ["founder_owned", "vc_backed"];

/** @type {Record<string, Record<string, number>>} signal key -> signed weight */
export const POPULATION_WEIGHTS = {
  // Owner-driven liquidity: the classic PE buyout target.
  founder_owned: {
    founder_tenure_window: 1.1,
    no_institutional_capital: 0.9,
    concentrated_ownership: 0.8,
    first_finance_hire: 1.0,
    corp_dev_hire: 1.2,
    advisor_engaged: 1.6,
    registry_share_transfer: 1.3,
    succession_language: 1.4,
    hiring_velocity_decay: 0.6,
    exec_departures: 0.5,
    funding_dormancy: 0.5,
    profitable_and_stable: 0.4,
    recent_large_raise: -1.4,
    founder_recently_appointed: -1.0,
    aggressive_expansion: -0.7,
  },

  // Investor-driven liquidity: a fund needs to return capital.
  vc_backed: {
    // A stalled growth curve is the strongest tell that the venture path has
    // closed and a sale is the remaining route.
    hiring_velocity_decay: 1.4,
    // Years without a new round means the last one is ageing and the fund clock
    // is running, which is exit pressure rather than self-sufficiency.
    funding_dormancy: 1.3,
    advisor_engaged: 1.8,
    corp_dev_hire: 1.4,
    exec_departures: 0.9,
    first_finance_hire: 1.0,
    registry_share_transfer: 1.0,
    succession_language: 0.7,
    founder_tenure_window: 0.5,
    profitable_and_stable: 0.3,
    concentrated_ownership: 0.2,
    // Being bootstrapped cannot describe a venture-backed company; treat any
    // such claim as uninformative rather than letting it distort the score.
    no_institutional_capital: 0,
    // A fresh round removes near-term pressure, but far less strongly than the
    // founder-owned profile assumed: it also marks the company as exit-bound.
    recent_large_raise: -0.6,
    founder_recently_appointed: -0.8,
    aggressive_expansion: -0.2,
  },
};

export const DEFAULT_POPULATION = "founder_owned";

export function isKnownPopulation(population) {
  return POPULATIONS.includes(population);
}

/**
 * Signed weight for a signal within a population.
 * Returns 0 for signals that carry no information there.
 */
export function weightFor(signalKey, population = DEFAULT_POPULATION) {
  const profile = POPULATION_WEIGHTS[population] ?? POPULATION_WEIGHTS[DEFAULT_POPULATION];
  return profile[signalKey] ?? 0;
}

/**
 * Infer which population a company belongs to from its own signals.
 *
 * Deliberately evidence-driven: capital structure is observable, so the model
 * should not have to be told. Falls back to founder_owned, which is the
 * conservative choice for a PE buyout screen.
 */
export function inferPopulation(signals) {
  const present = new Set(
    (Array.isArray(signals) ? signals : [])
      .filter((s) => s?.present === true && s?.key)
      .map((s) => s.key)
  );

  // Direct evidence of institutional capital settles it.
  if (present.has("recent_large_raise")) return "vc_backed";
  // Explicit absence of institutional capital settles the other way.
  if (present.has("no_institutional_capital")) return "founder_owned";
  return DEFAULT_POPULATION;
}
