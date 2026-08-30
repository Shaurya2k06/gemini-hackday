/**
 * In-process result store.
 *
 * Zoron payloads are large — an enriched 10-company shortlist is tens of
 * kilobytes of JSON. Rather than pushing that through the host's context on
 * every tool call, results are kept here and surfaced as `zoron://` resources,
 * with tools returning a compact summary plus an ID.
 *
 * Scope is a single MCP session (one server process). Nothing is persisted.
 */

const DEFAULT_LIMITS = {
  mandates: 50,
  shortlists: 25,
  dossiers: 100,
};

/** Insertion-ordered map with a hard cap; evicts least-recently-used entries. */
class BoundedMap {
  #map = new Map();
  #limit;

  constructor(limit) {
    this.#limit = limit;
  }

  set(key, value) {
    // Re-inserting moves the key to the most-recent position.
    if (this.#map.has(key)) this.#map.delete(key);
    this.#map.set(key, value);
    while (this.#map.size > this.#limit) {
      const oldest = this.#map.keys().next().value;
      this.#map.delete(oldest);
    }
    return value;
  }

  get(key) {
    if (!this.#map.has(key)) return undefined;
    // Touch: mark as recently used so it survives eviction.
    const value = this.#map.get(key);
    this.#map.delete(key);
    this.#map.set(key, value);
    return value;
  }

  has(key) {
    return this.#map.has(key);
  }

  keys() {
    return [...this.#map.keys()];
  }

  get size() {
    return this.#map.size;
  }
}

export class ResultStore {
  #mandates;
  #shortlists;
  #dossiers;
  #counters = { mandate: 0, shortlist: 0 };

  constructor(limits = {}) {
    const merged = { ...DEFAULT_LIMITS, ...limits };
    this.#mandates = new BoundedMap(merged.mandates);
    this.#shortlists = new BoundedMap(merged.shortlists);
    this.#dossiers = new BoundedMap(merged.dossiers);
  }

  #nextId(kind) {
    this.#counters[kind] += 1;
    return `${kind === "mandate" ? "m" : "s"}${this.#counters[kind]}`;
  }

  // --- mandates -----------------------------------------------------------

  putMandate({ structured, pills = [], intent = null, accumulatedText = "" }) {
    const id = this.#nextId("mandate");
    this.#mandates.set(id, {
      id,
      structured,
      pills,
      intent,
      accumulatedText,
      createdAt: Date.now(),
    });
    return id;
  }

  getMandate(id) {
    return this.#mandates.get(id);
  }

  // --- shortlists ---------------------------------------------------------

  putShortlist({
    structured,
    cards = [],
    otherCards = [],
    dataSource = null,
    heavySearchRan = null,
    pipelineStages = null,
    message = null,
    rawQuery = "",
  }) {
    const id = this.#nextId("shortlist");
    this.#shortlists.set(id, {
      id,
      structured,
      cards,
      otherCards,
      dataSource,
      heavySearchRan,
      pipelineStages,
      message,
      rawQuery,
      customColumns: [],
      createdAt: Date.now(),
    });
    return id;
  }

  getShortlist(id) {
    return this.#shortlists.get(id);
  }

  /** Domains already present, used to avoid duplicates when expanding. */
  shortlistDomains(id) {
    const entry = this.getShortlist(id);
    if (!entry) return [];
    return entry.cards
      .map((card) => card?.fields?.domain ?? card?.domain)
      .filter(Boolean);
  }

  /** Append newly discovered cards, continuing rank numbering from the tail. */
  appendToShortlist(id, newCards) {
    const entry = this.getShortlist(id);
    if (!entry) return undefined;
    const startRank = entry.cards.length + 1;
    const renumbered = newCards.map((card, i) => ({ ...card, rank: startRank + i }));
    entry.cards = [...entry.cards, ...renumbered];
    return entry;
  }

  /** Replace cards wholesale — used when a custom column is merged in. */
  replaceShortlistCards(id, cards, { columnLabel = null } = {}) {
    const entry = this.getShortlist(id);
    if (!entry) return undefined;
    entry.cards = cards;
    if (columnLabel && !entry.customColumns.includes(columnLabel)) {
      entry.customColumns.push(columnLabel);
    }
    return entry;
  }

  findCard(shortlistId, domain) {
    const entry = this.getShortlist(shortlistId);
    if (!entry) return undefined;
    const target = normalizeDomain(domain);
    return entry.cards.find(
      (card) => normalizeDomain(card?.fields?.domain ?? card?.domain) === target
    );
  }

  // --- dossiers -----------------------------------------------------------

  putDossier(domain, payload) {
    const key = normalizeDomain(domain);
    this.#dossiers.set(key, { domain: key, ...payload, createdAt: Date.now() });
    return key;
  }

  getDossier(domain) {
    return this.#dossiers.get(normalizeDomain(domain));
  }

  // --- diagnostics --------------------------------------------------------

  stats() {
    return {
      mandates: this.#mandates.size,
      shortlists: this.#shortlists.size,
      dossiers: this.#dossiers.size,
      shortlistIds: this.#shortlists.keys(),
      mandateIds: this.#mandates.keys(),
    };
  }
}

export function normalizeDomain(domain) {
  return String(domain ?? "")
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, "")
    .replace(/^www\./, "")
    .replace(/\/.*$/, "");
}
