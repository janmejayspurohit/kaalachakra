/**
 * Dasha level vocabulary, South Indian and North Indian.
 *
 * The two traditions name the SAME nested periods differently, and the
 * mismatch is a trap: "antara" is the SECOND level in neither convention -
 * in the south it is the third, while the north's similarly-spelled
 * "antardasha" is the second. A reader who knows one vocabulary and is shown
 * the other will mis-read the nesting by a whole level rather than simply
 * not recognising a word.
 *
 * The periods themselves are identical - same boundaries, same arithmetic.
 * Only the labels differ, which is why this is a presentation table and not
 * anything the engine knows about.
 */
export const TRADITIONS = [
  { id: 'south', label: 'South Indian' },
  { id: 'north', label: 'North Indian' },
];

const TERMS = {
  south: {
    // level -> [full name, short name for a cramped timeline track]
    1: ['Dasha', 'Dasha'],
    2: ['Bhukti', 'Bhukti'],
    3: ['Antara', 'Antara'],
    4: ['Sookshma', 'Sookshma'],
    5: ['Prana', 'Prana'],
  },
  north: {
    1: ['Mahadasha', 'Maha'],
    2: ['Antardasha', 'Antar'],
    3: ['Pratyantardasha', 'Pratyantar'],
    4: ['Sookshma dasha', 'Sookshma'],
    5: ['Prana dasha', 'Prana'],
  },
};

export const DEFAULT_TRADITION = 'south';

const table = (tradition) => TERMS[tradition] ?? TERMS[DEFAULT_TRADITION];

/** Full name of a dasha level, 1-indexed. */
export function dashaTerm(level, tradition = DEFAULT_TRADITION) {
  return table(tradition)[level]?.[0] ?? `level ${level}`;
}

/** Short name, for a timeline track label where width is scarce. */
export function dashaTermShort(level, tradition = DEFAULT_TRADITION) {
  return table(tradition)[level]?.[1] ?? `L${level}`;
}

/**
 * Lower-case form for use mid-sentence ("Guru dasha, Budha bhukti").
 *
 * Kept as its own function rather than left to each caller's toLowerCase(),
 * so that a term which should stay capitalised can be made an exception in
 * one place if one is ever added.
 */
export function dashaTermLower(level, tradition = DEFAULT_TRADITION) {
  return dashaTerm(level, tradition).toLowerCase();
}
