/**
 * Parihara (remedies), ranked by the severity of what actually afflicts the
 * chart.
 *
 * TWO HONEST BOUNDARIES, stated up front because this is the part of the
 * system where confident invention would do real harm:
 *
 * 1. WHAT THIS MODULE COMPUTES vs WHAT IT LOOKS UP.
 *    The ORDERING is computed - it derives from afflictions this engine
 *    measured (Sade Sati phase, Ashtama Shani, adverse tara, nadi dosha).
 *    That part is as accurate as the chart.
 *    The PRACTICES are a curated catalogue. They are not derived from
 *    anything; they are recorded tradition. Every entry therefore carries
 *    `provenance` and `reviewed`.
 *
 * 2. WHAT I COULD NOT ESTABLISH.
 *    Madhwa (Dvaita) practice is Vishnu-centric, and it is genuinely unclear
 *    from the sources I could reach whether graha-shanti / navagraha
 *    propitiation is accepted in the Madhwa tradition the way it is among
 *    Smartas - several Madhwa authorities hold that fruits come from Hari's
 *    will and not from the grahas themselves, which would make graha-directed
 *    remedies doctrinally wrong for this audience.
 *    Every entry below is therefore either (a) a well-attested Madhwa
 *    devotional practice, or (b) flagged `reviewed: false` pending a Madhwa
 *    authority's sign-off. NOTHING here should be presented to a user as
 *    settled doctrine until that review happens.
 *
 * The UI must render `disclaimer` alongside any remedy list.
 */

export const PARIHARA_DISCLAIMER =
  'Traditional devotional practices recorded in the Madhwa sampradaya, ordered ' +
  'by the severity of the astrological factors found in this chart. Not ' +
  'medical, financial or legal advice, and not a guarantee of any outcome.';

/**
 * Shown above the `suggestions` list.
 *
 * Graha-directed practices are presented as SUGGESTIONS, not as parihara,
 * because it is not established that navagraha propitiation is accepted in
 * Dvaita the way it is among Smartas - several Madhwa positions hold that
 * fruits come from Hari's will and not from the grahas themselves. Labelling
 * them "suggestions" lets the app surface them without asserting doctrine in
 * either direction.
 */
export const SUGGESTION_DISCLAIMER =
  'Suggestions drawn from wider Jyotisha practice, shown for reference. These ' +
  'are graha-directed or not specifically attested in the Madhwa sampradaya, ' +
  'so they are offered as suggestions rather than as parihara. Consult your ' +
  'guru or matha before adopting them.';

/** Back-compat alias. Prefer the two specific constants above. */
export const REMEDY_DISCLAIMER = PARIHARA_DISCLAIMER;

/**
 * The catalogue.
 *
 * `weight` is the base importance (0-100) before chart severity is applied.
 * `triggers` names the afflictions that surface this remedy; an entry with
 * `triggers: ['always']` is standing practice rather than a response.
 */
export const REMEDY_CATALOGUE = Object.freeze([
  {
    id: 'ekadashi-upavasa',
    name: 'Ekadashi upavasa',
    kannada: 'ಏಕಾದಶಿ ಉಪವಾಸ',
    practice:
      'Observe the Ekadashi fast on the Madhwa (Vaishnava) reckoning, and break it ' +
      'within the Dwadashi paarane window.',
    triggers: ['always'],
    weight: 90,
    category: 'vrata',
    provenance:
      'Core Madhwa observance. The Vaishnava arunodaya rule (Dashami must end ' +
      '96 minutes before sunrise) is what makes this date differ from the Smarta one.',
    reviewed: true,
    kind: 'parihara',
  },
  {
    id: 'raghavendra-stotra',
    name: 'Sri Raghavendra Stotra',
    kannada: 'ಶ್ರೀ ರಾಘವೇಂದ್ರ ಸ್ತೋತ್ರ',
    practice:
      'Parayana of the 32-shloka Raghavendra Stotra composed by Appanacharya. ' +
      'Commonly recited daily, or 108 times over a period for a specific difficulty.',
    triggers: ['sadeSati', 'ashtamaShani', 'kantakaShani', 'vadhaTara'],
    weight: 85,
    category: 'stotra',
    provenance:
      'Appanacharya, disciple of Sri Raghavendra Tirtha. Recited by Dvaita ' +
      'Vaishnavas; verified as a 32-shloka Sanskrit composition.',
    reviewed: true,
    kind: 'parihara',
  },
  {
    id: 'hari-vayu-stuti',
    name: 'Hari Vayu Stuti',
    kannada: 'ಹರಿ ವಾಯು ಸ್ತುತಿ',
    practice:
      'Parayana of the Hari Vayu Stuti (Trivikrama Panditacharya), often with ' +
      'the Nakha Stuti prefixed and appended as is the customary procedure.',
    triggers: ['sadeSati', 'ashtamaShani', 'severeAffliction'],
    weight: 80,
    category: 'stotra',
    provenance:
      'Trivikrama Panditacharya. A documented parayana tradition exists with a ' +
      'prescribed procedure.',
    reviewed: true,
    kind: 'parihara',
  },
  {
    id: 'dwadasha-stotra',
    name: 'Dwadasha Stotra',
    kannada: 'ದ್ವಾದಶ ಸ್ತೋತ್ರ',
    practice:
      'Daily parayana of the Dwadasha Stotra of Sri Madhwacharya, traditionally ' +
      'recited during naivedya.',
    triggers: ['always'],
    weight: 75,
    category: 'stotra',
    provenance:
      'Sri Madhwacharya. Eight known commentaries exist, including by ' +
      'Gangodamishra and Chalari Narasimhacharya.',
    reviewed: true,
    kind: 'parihara',
  },
  {
    id: 'mukhyaprana-upasana',
    name: 'Mukhyaprana upasana',
    kannada: 'ಮುಖ್ಯಪ್ರಾಣ ಉಪಾಸನೆ',
    practice:
      'Worship of Mukhyaprana (Hanuman / Bhima / Madhwacharya), traditionally on ' +
      'Saturdays. Recitation of the Hanuman-related stotras of the sampradaya.',
    triggers: ['sadeSati', 'ashtamaShani', 'kantakaShani'],
    weight: 82,
    category: 'upasana',
    provenance:
      'Mukhyaprana (Vayu) is central to Madhwa practice as the chief jiva and ' +
      'the deity worshipped after Vishnu, so the upasana itself is squarely ' +
      'Madhwa. Only the SATURDAY / Saturn-period association is uncertain - it ' +
      'is widely observed, but I could not confirm a textual basis for tying ' +
      'it to Saturn specifically rather than to general practice.',
    reviewed: true,
    kind: 'parihara',
  },
  {
    id: 'tulasi-seva',
    name: 'Tulasi seva',
    kannada: 'ತುಳಸಿ ಸೇವೆ',
    practice: 'Daily watering, pradakshina and archana of Tulasi.',
    triggers: ['always'],
    weight: 60,
    category: 'seva',
    provenance: 'Universal Vaishnava household practice.',
    reviewed: true,
    kind: 'parihara',
  },
  {
    id: 'anna-daana',
    name: 'Anna daana',
    kannada: 'ಅನ್ನ ದಾನ',
    practice: 'Offering food, particularly on days of adverse tara or during Sade Sati.',
    triggers: ['sadeSati', 'ashtamaShani', 'vadhaTara', 'vipatTara'],
    weight: 70,
    category: 'daana',
    provenance: 'Widely prescribed across sampradayas.',
    reviewed: true,
    kind: 'parihara',
  },
  {
    id: 'defer-auspicious',
    name: 'Defer new undertakings',
    kannada: 'ಶುಭ ಕಾರ್ಯ ಮುಂದೂಡಿಕೆ',
    practice:
      'Avoid initiating important new work during the adverse tara, and avoid ' +
      'Rahu Kala, Gulika Kala and Yamaganda for beginnings.',
    triggers: ['vadhaTara', 'vipatTara', 'pratyakTara', 'janmaTara'],
    weight: 65,
    category: 'conduct',
    provenance:
      'Standard muhurta practice; the kaala windows are computed by this engine.',
    reviewed: true,
    kind: 'parihara',
  },
  {
    id: 'chaturmasya-observance',
    name: 'Chaturmasya observance',
    kannada: 'ಚಾತುರ್ಮಾಸ್ಯ ವ್ರತ',
    practice:
      'Observe the four-month Chaturmasya vrata from Ashadha Shukla Dwadashi to ' +
      'Kartika Shukla Dashami, with its four sequential phases.',
    triggers: ['chaturmasyaActive'],
    weight: 78,
    category: 'vrata',
    provenance:
      'Ashadha Shukla Dwadashi to Kartika Shukla Dashami, spanning Shravana, ' +
      'Bhadrapada, Ashvayuja and Kartika.',
    reviewed: true,
    kind: 'parihara',
  },

  /* ---- graha-directed: SUGGESTIONS, not parihara. See SUGGESTION_DISCLAIMER. ---- */
  {
    id: 'shani-graha-shanti',
    name: 'Shani propitiation',
    kannada: 'ಶನಿ ಶಾಂತಿ',
    practice:
      'Graha-directed observances for Saturn - Saturday fast, sesame or black ' +
      'gram daana, lighting a sesame-oil lamp.',
    triggers: ['sadeSati', 'ashtamaShani', 'kantakaShani'],
    weight: 55,
    category: 'graha',
    provenance:
      'Standard across wider Jyotisha practice. NOT established as Madhwa ' +
      'doctrine - Dvaita positions generally attribute fruits to Hari rather ' +
      'than to the grahas.',
    reviewed: false,
    kind: 'suggestion',
  },
  {
    id: 'navagraha-darshana',
    name: 'Navagraha darshana',
    kannada: 'ನವಗ್ರಹ ದರ್ಶನ',
    practice: 'Visiting a navagraha shrine and circumambulating the afflicting graha.',
    triggers: ['sadeSati', 'ashtamaShani', 'severeAffliction'],
    weight: 45,
    category: 'graha',
    provenance: 'Common in South Indian temple practice; not Madhwa-specific.',
    reviewed: false,
    kind: 'suggestion',
  },
  {
    id: 'gemstone',
    name: 'Gemstone (ratna)',
    kannada: 'ರತ್ನ ಧಾರಣೆ',
    practice:
      'Wearing a gemstone associated with a strengthening graha, set and worn ' +
      'per a competent astrologer\'s prescription.',
    triggers: ['severeAffliction'],
    weight: 25,
    category: 'graha',
    provenance:
      'Widely sold, weakly attested, and expensive. Included only for ' +
      'completeness; deliberately ranked last.',
    reviewed: false,
    kind: 'suggestion',
  },
]);

/**
 * Rank remedies for one profile on one day.
 *
 * Score = catalogue weight + severity bonus from the triggers that actually
 * fired. A remedy whose trigger did not fire is omitted entirely rather than
 * shown at low priority - a list padded with irrelevant entries is how
 * remedy advice becomes noise.
 *
 * @param {object} context  output of daySummary(), plus optional flags
 */
export function rankRemedies(context) {
  const fired = collectTriggers(context);

  const scored = [];
  for (const r of REMEDY_CATALOGUE) {
    const matched = r.triggers.filter((t) => fired.has(t));
    if (matched.length === 0) continue;

    // Each firing trigger contributes its own severity, so a day that is both
    // Sade Sati and Vadha tara ranks its remedies above one that is only Sade Sati.
    const bonus = matched.reduce((s, t) => s + (fired.get(t) ?? 0), 0);
    scored.push({
      ...r,
      score: r.weight + bonus,
      firedFor: matched.filter((t) => t !== 'always'),
      needsReview: !r.reviewed,
    });
  }

  scored.sort((a, b) => b.score - a.score || a.name.localeCompare(b.name));

  const rank = (list) => list.map((r, i) => ({ rank: i + 1, ...r }));
  const parihara = scored.filter((r) => r.kind === 'parihara');
  const suggestions = scored.filter((r) => r.kind === 'suggestion');

  return {
    // Attested Madhwa practice.
    parihara: {
      disclaimer: PARIHARA_DISCLAIMER,
      items: rank(parihara),
    },
    // Graha-directed or non-Madhwa-specific. Presented separately and second
    // so the UI cannot blur the distinction.
    suggestions: {
      disclaimer: SUGGESTION_DISCLAIMER,
      items: rank(suggestions),
    },
    unreviewedCount: scored.filter((r) => r.needsReview).length,
  };
}

/** Map computed afflictions to trigger names with a severity weight. */
function collectTriggers(ctx) {
  const fired = new Map([['always', 0]]);

  const shani = ctx?.shani;
  if (shani?.sadeSati?.active) {
    // The peak phase is held to be the heaviest of the three.
    const w = shani.sadeSati.phase === 'peak' ? 30 : 20;
    fired.set('sadeSati', w);
    fired.set('severeAffliction', w);
  }
  if (shani?.ashtamaShani?.active) {
    fired.set('ashtamaShani', 35);
    fired.set('severeAffliction', 35);
  }
  if (shani?.kantakaShani?.active) fired.set('kantakaShani', 15);

  const tara = ctx?.tarabala;
  if (tara) {
    if (tara.name === 'Vadha') fired.set('vadhaTara', 30);
    else if (tara.name === 'Vipat') fired.set('vipatTara', 20);
    else if (tara.name === 'Pratyak') fired.set('pratyakTara', 15);
    else if (tara.name === 'Janma') fired.set('janmaTara', 10);
  }

  if (ctx?.chaturmasyaActive) fired.set('chaturmasyaActive', 25);

  return fired;
}
