/**
 * What a dasha period means - the classical significations, plus the part of
 * the reading that is specific to THIS chart.
 *
 * TWO KINDS OF STATEMENT LIVE HERE AND THEY ARE KEPT APART.
 *
 * 1. The KARAKATVA of each graha - what Shani or Shukra signifies - is
 *    classical, stable, and the same for everyone. It is the "this is what a
 *    Shani period is about" layer.
 *
 * 2. Whether that period runs well or badly for a PARTICULAR person is not a
 *    property of the graha at all. It depends on where the graha sits in
 *    their chart, its dignity, and which houses it rules from their lagna. A
 *    tool that prints "Shani dasha: hardship" for everybody is not reading a
 *    chart, it is reading a calendar.
 *
 * So the output gives the general significations AND the chart-specific
 * facts that modify them, labelled as such, and it does not collapse the two
 * into a verdict. Predicting events is not something this engine does; the
 * classical position is that a dasha gives the SCOPE within which the rest of
 * the chart operates, and that is what is reported.
 */
import { RASHI_LORD, houseFrom } from './chart.js';

/**
 * Per-graha significations for a mahadasha.
 *
 * `favourable` and `unfavourable` are the domains the tradition associates
 * with the period going well or badly - NOT a prediction that they will.
 * `avoid` collects what the texts specifically counsel against undertaking
 * during the period. `scope` is the range of matters the period is held to
 * bring into play, which is the honest form of "what may happen".
 */
export const MAHADASHA_MEANING = Object.freeze({
  surya: {
    years: 6,
    theme: 'Authority, self and recognition',
    signifies:
      'Surya is the atmakaraka - the significator of the self, the father, ' +
      'vitality, government and visible position. A Surya period turns on ' +
      'standing: how one is seen, and by whom.',
    favourable: [
      'Recognition, promotion, and dealings with government or authority',
      'Matters involving the father, and inheritance of position rather than wealth',
      'Undertakings that need a single person to be visibly responsible',
      'Health regimens that rebuild vitality',
    ],
    unfavourable: [
      'Partnerships requiring one to defer, since the period pushes towards self-assertion',
      'Situations where ego is already the friction',
    ],
    avoid: [
      'Open confrontation with superiors or authority - the period sharpens it rather than resolving it',
      'Relying on others to carry responsibility that is visibly yours',
    ],
    scope: [
      'Change in status, title or public position',
      'Matters concerning the father or a father-figure',
      'Questions of health and stamina, particularly the heart and eyes',
      'Dealings with state, licence or formal authority',
    ],
    duration: 'Six years - the shortest mahadasha, so its effects tend to be sharp rather than prolonged.',
  },
  chandra: {
    years: 10,
    theme: 'Mind, mother and the emotional life',
    signifies:
      'Chandra signifies the manas - the mind and its moods - along with the ' +
      'mother, the home, the public, and liquids. A Chandra period is felt ' +
      'inwardly before it is visible outwardly.',
    favourable: [
      'Matters of home, residence, land and the domestic base',
      'Relationships with the mother and with women generally',
      'Public-facing work, hospitality, nurture and care',
      'Travel, particularly over or near water',
    ],
    unfavourable: [
      'Decisions taken at emotional peaks, which the period supplies more of',
      'Work requiring sustained detachment',
    ],
    avoid: [
      'Binding commitments made in a strongly felt moment',
      'Neglecting rest - the period draws on emotional rather than physical reserves',
    ],
    scope: [
      'Change of residence or of the domestic arrangement',
      'Matters concerning the mother',
      'Fluctuation of mood, and with it of judgement',
      'Public visibility, favourable or otherwise',
    ],
    duration: 'Ten years, and the mood of the period changes with Chandra\'s own strength in the chart more than any other dasha.',
  },
  mangala: {
    years: 7,
    theme: 'Energy, conflict and property',
    signifies:
      'Mangala signifies force, courage, siblings, land and anything cut or ' +
      'burned - including surgery. A Mangala period is decisive; whether it ' +
      'is decisively good or decisively costly is the question.',
    favourable: [
      'Property, land and construction',
      'Competitive undertakings, athletics, engineering, military and police matters',
      'Any effort that has stalled and needs force applied to it',
      'Surgery that is genuinely required',
    ],
    unfavourable: [
      'Negotiations needing patience rather than pressure',
      'Partnerships already carrying friction, which the period tends to bring to a head',
    ],
    avoid: [
      'Litigation and quarrels entered into impulsively',
      'Speculation with borrowed money',
      'Ignoring accidents and injuries - the period raises exposure to both',
    ],
    scope: [
      'Disputes, litigation, and their resolution one way or the other',
      'Property acquired or lost',
      'Matters concerning younger siblings',
      'Injury, fever, or surgical intervention',
    ],
    duration: 'Seven years, and typically the most eventful of the shorter dashas.',
  },
  budha: {
    years: 17,
    theme: 'Intellect, commerce and communication',
    signifies:
      'Budha signifies speech, learning, trade, analysis and all forms of ' +
      'intermediation. A Budha period rewards skill and adaptability, and it ' +
      'takes its colour strongly from the grahas it sits with.',
    favourable: [
      'Education, examinations, writing and research',
      'Trade, brokerage, accountancy and negotiation',
      'Anything requiring one to hold several threads at once',
      'Contracts and documentation',
    ],
    unfavourable: [
      'Undertakings requiring conviction rather than analysis',
      'Situations where the flexible answer is the wrong answer',
    ],
    avoid: [
      'Signing what has not been read - the period increases both the volume of documents and the cost of a careless one',
      'Over-thinking a decision past the point where it needed making',
    ],
    scope: [
      'Study, qualification and skill acquisition',
      'Commercial expansion, or commercial overreach',
      'Matters of speech: negotiation, publication, and their consequences',
      'Nervous and digestive complaints',
    ],
    duration: 'Seventeen years - long enough to build a career within, and Budha takes the character of whatever it associates with.',
  },
  guru: {
    years: 16,
    theme: 'Wisdom, expansion and dharma',
    signifies:
      'Guru is the great benefic - signifying teachers, children, wealth ' +
      'honestly got, law, and dharma. A Guru period is generally the most ' +
      'protective in the cycle, which is not the same as the easiest.',
    favourable: [
      'Marriage, children and family expansion',
      'Higher study, teaching, law and advisory work',
      'Religious and charitable undertakings; pilgrimage',
      'Growth of wealth and of standing together',
    ],
    unfavourable: [
      'Undertakings that depend on austerity or sharp retrenchment',
      'Situations where expansion is itself the problem',
    ],
    avoid: [
      'Taking the period\'s protection as licence - Guru expands what is there, including debt and complacency',
      'Overcommitment, financial or otherwise',
    ],
    scope: [
      'Marriage, the birth of children, and growth of the family',
      'Advancement through learning or through a teacher',
      'Gain of wealth, property or reputation',
      'Weight gain and liver-related complaints, the physical form of the same expansion',
    ],
    duration: 'Sixteen years. Widely held the most favourable mahadasha, with the caveat that Guru magnifies whatever it governs in the chart.',
  },
  shukra: {
    years: 20,
    theme: 'Relationship, comfort and art',
    signifies:
      'Shukra signifies the spouse, pleasure, art, vehicles, luxury and all ' +
      'refinement. It is the longest mahadasha and often the most materially ' +
      'comfortable stretch of a life.',
    favourable: [
      'Marriage and partnership',
      'Art, music, design and anything made to be beautiful',
      'Acquisition of vehicles, jewellery and comforts',
      'Diplomacy, and work depending on charm or taste',
    ],
    unfavourable: [
      'Ascetic or renunciate undertakings',
      'Work requiring sustained hardship',
    ],
    avoid: [
      'Indulgence taken for contentment - the classical caution against a Shukra period is excess, not scarcity',
      'Entanglements outside a commitment, which the period increases the opportunity for',
    ],
    scope: [
      'Marriage, or its difficulty',
      'Material comfort, vehicles and property of the pleasant kind',
      'Artistic recognition',
      'Complaints of the reproductive and urinary systems, and of over-indulgence',
    ],
    duration: 'Twenty years - the longest. Its length means it often covers the whole of a working prime.',
  },
  shani: {
    years: 19,
    theme: 'Discipline, delay and karma coming due',
    signifies:
      'Shani signifies time itself - labour, endurance, old age, servants, ' +
      'the poor, and consequences arriving on schedule. A Shani period is ' +
      'the tradition\'s teacher, and it teaches by subtraction.',
    favourable: [
      'Anything built slowly and meant to last',
      'Labour, agriculture, mining, iron, and work with the marginalised',
      'Discipline, renunciation, and sustained practice',
      'Matters requiring patience over cleverness',
    ],
    unfavourable: [
      'Quick gains and short-horizon speculation',
      'Undertakings depending on favour, charm or momentum',
    ],
    avoid: [
      'Shortcuts, in work or in obligation - Shani is the graha that returns them',
      'Abandoning a commitment because it has become slow; delay is the period\'s method, not its verdict',
    ],
    scope: [
      'Delay, obstruction, and what is learned from both',
      'Responsibility increasing faster than reward',
      'Separation, bereavement, and the matters of old age',
      'Chronic rather than acute complaints; bones, joints, teeth, and the nervous system',
    ],
    duration: 'Nineteen years, the longest test in the cycle. Its reputation is for hardship; its classical description is for durable results built through it.',
  },
  rahu: {
    years: 18,
    theme: 'Ambition, the foreign and the unconventional',
    signifies:
      'Rahu is a chhaya graha - it has no body and no dignity, and it takes ' +
      'the character of its dispositor and its house. It signifies ambition, ' +
      'foreignness, illusion and sudden, disproportionate outcomes.',
    favourable: [
      'Foreign travel, foreign residence and foreign connections',
      'Unconventional, novel or technological fields',
      'Rapid material rise, particularly outside established structures',
      'Research into what is hidden',
    ],
    unfavourable: [
      'Anything requiring transparent dealing and conventional credentials',
      'Situations already prone to deception',
    ],
    avoid: [
      'Gain that cannot be explained - Rahu\'s classical signature is the shortcut that works until it does not',
      'Intoxicants and addictive patterns, which the period is specifically said to strengthen',
      'Mistaking sudden magnification for durable achievement',
    ],
    scope: [
      'Sudden rise, and equally sudden reversal',
      'Foreign lands, foreigners, and matters outside one\'s own tradition',
      'Deception - practised, or suffered',
      'Undiagnosed, obscure or psychosomatic complaints',
    ],
    duration: 'Eighteen years. Rahu amplifies whatever it touches, so the reading depends more on its placement than on Rahu itself.',
  },
  ketu: {
    years: 7,
    theme: 'Detachment, endings and insight',
    signifies:
      'Ketu is the headless node - signifying moksha, detachment, sudden ' +
      'loss and sudden knowing. What a Ketu period removes is usually what ' +
      'was no longer serving, which is not a comfort while it is happening.',
    favourable: [
      'Spiritual practice, retreat and study of the abstract',
      'Medicine, healing and the occult',
      'Letting go of what has run its course',
      'Work requiring intuition rather than method',
    ],
    unfavourable: [
      'New worldly ventures needing sustained attachment to succeed',
      'Undertakings where ambivalence is fatal',
    ],
    avoid: [
      'Forcing continuation of what the period is ending',
      'Major material commitments entered without conviction',
    ],
    scope: [
      'Sudden endings - of work, of association, of place',
      'Turn towards spiritual practice or withdrawal',
      'Insight arriving without apparent cause',
      'Obscure ailments, and accidents of the sudden kind',
    ],
    duration: 'Seven years. Often experienced as unsettled outwardly and clarifying inwardly.',
  },
});

/* ------------------------------------------- functional nature by lagna */

/**
 * Whether a graha is a functional benefic or malefic FOR THIS LAGNA.
 *
 * This is the part most "what does my dasha mean" material omits, and it is
 * the part that decides the answer. Shani is a natural malefic, but for a
 * Tula lagna it rules the 4th and 5th - a kendra and a trikona - and is the
 * yogakaraka, the single most auspicious graha in that chart. The same
 * nineteen years read completely differently.
 *
 * The rules applied are Parashari and standard:
 *   - lords of the trikonas (1, 5, 9) are benefic;
 *   - a natural MALEFIC lording a kendra (1, 4, 7, 10) becomes benefic, and a
 *     natural BENEFIC lording one loses its benefic power - kendradhipatya;
 *   - a graha lording both a kendra and a trikona is a YOGAKARAKA;
 *   - lords of 3, 6 and 11 are malefic;
 *   - lords of 2 and 7 are marakas, the houses of death-dealing.
 *
 * Rahu and Ketu rule no sign, so they have no functional nature of their own
 * and take that of their dispositor and house. That is returned explicitly
 * rather than being silently treated as neutral.
 */
const KENDRAS = [1, 4, 7, 10];
const TRIKONAS = [1, 5, 9];
const DUSTHANAS = [6, 8, 12];
const NATURAL_BENEFIC = new Set(['guru', 'shukra']);

export function functionalNature(lagnaRashi, graha) {
  if (graha === 'rahu' || graha === 'ketu') {
    return {
      graha,
      nature: 'takes-on',
      lordships: [],
      yogakaraka: false,
      maraka: false,
      reasons: [
        'Rahu and Ketu rule no rashi, so they have no functional nature of ' +
        'their own. They give the results of their dispositor and of the ' +
        'house they occupy.',
      ],
      agreement: 'settled',
    };
  }

  // Which houses this graha lords, counted from the lagna.
  const lordships = [];
  for (let rashi = 1; rashi <= 12; rashi += 1) {
    if (RASHI_LORD[rashi - 1] === graha) lordships.push(houseFrom(rashi, lagnaRashi));
  }
  lordships.sort((a, b) => a - b);

  const kendra = lordships.filter((h) => KENDRAS.includes(h));
  const trikona = lordships.filter((h) => TRIKONAS.includes(h));
  const dusthana = lordships.filter((h) => DUSTHANAS.includes(h));
  const maraka = lordships.filter((h) => h === 2 || h === 7);
  const upachayaMalefic = lordships.filter((h) => h === 3 || h === 6 || h === 11);

  // The 1st is both a kendra and a trikona, so lordship of the lagna alone
  // must not qualify - otherwise every lagna lord would read as a yogakaraka.
  // Requiring a kendra AND a trikona other than the 1st yields exactly the
  // canonical six, which a test asserts.
  const isYogakaraka = kendra.some((k) => k !== 1) && trikona.some((t) => t !== 1);

  const reasons = [];
  if (isYogakaraka) {
    reasons.push(`Rules both a kendra (${ordinalList(kendra)}) and a trikona (${ordinalList(trikona)}), which makes it the yogakaraka for this lagna - the single most auspicious graha in the chart.`);
  } else {
    if (trikona.length) reasons.push(`Rules the ${ordinalList(trikona)}, a trikona, which is benefic.`);
    if (kendra.length && !NATURAL_BENEFIC.has(graha)) {
      reasons.push(`Rules the ${ordinalList(kendra)}, a kendra. A natural malefic lording a kendra becomes benefic.`);
    }
    if (kendra.length && NATURAL_BENEFIC.has(graha)) {
      reasons.push(`Rules the ${ordinalList(kendra)}, a kendra. A natural benefic lording a kendra loses benefic power (kendradhipatya dosha).`);
    }
    if (upachayaMalefic.length) reasons.push(`Rules the ${ordinalList(upachayaMalefic)}, which is held malefic.`);
    if (dusthana.length) reasons.push(`Rules the ${ordinalList(dusthana)}, a dusthana.`);
  }
  if (maraka.length) {
    reasons.push(`Also lords the ${ordinalList(maraka)} - a maraka sthana. Maraka lordship is about the timing of difficulty, and is read alongside the rest, never on its own.`);
  }

  /*
   * A graha usually lords TWO houses, and they often point opposite ways.
   * Shani for a Mesha lagna rules the 10th - a kendra, which makes a natural
   * malefic benefic - and the 11th, which is held malefic. Resolving that to
   * a flat "benefic" by whichever check ran first would be this engine
   * picking a side by accident of code order. Both indications are counted
   * and a genuinely divided lordship is reported as MIXED, with the reasons
   * already listed above saying which pull comes from where.
   */
  const beneficPull =
    trikona.length > 0 || (kendra.length > 0 && !NATURAL_BENEFIC.has(graha));
  const maleficPull = dusthana.length > 0 || upachayaMalefic.length > 0;

  let nature;
  if (isYogakaraka) nature = 'yogakaraka';
  else if (beneficPull && maleficPull) nature = 'mixed';
  else if (beneficPull) nature = 'benefic';
  else if (maleficPull) nature = 'malefic';
  else nature = 'neutral';

  return {
    graha, nature, lordships,
    yogakaraka: isYogakaraka,
    maraka: maraka.length > 0,
    reasons,
    // The Parashari rules above are standard, but authorities differ on how
    // much weight kendradhipatya carries and on whether the 8th lord is
    // redeemed when it also lords the lagna.
    agreement: 'varies',
    caveat:
      'Functional nature is assigned by the Parashari rules of house ' +
      'lordship. Authorities differ on how heavily kendradhipatya weighs and ' +
      'on when a dusthana lord is redeemed by its other lordship.',
  };
}

function ordinalList(hs) {
  return hs.map(ordinal).join(' and ');
}

function ordinal(n) {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}

/**
 * How each functional nature reads in a sentence.
 *
 * A map rather than interpolating the bare value, which produced "is a
 * functional mixed". The label is prose and the value is an enum; they are
 * not the same thing and should not be made to stand in for each other.
 */
const NATURE_PHRASE = Object.freeze({
  yogakaraka: 'is the yogakaraka',
  benefic: 'is a functional benefic',
  malefic: 'is a functional malefic',
  mixed: 'is functionally mixed',
  neutral: 'is functionally neutral',
  'takes-on': 'rules no rashi, so it gives the results of its dispositor and house',
});

/* ---------------------------------------------------------- the outlook */

/**
 * Everything the engine can say about one mahadasha FOR ONE CHART.
 *
 * The general significations, plus the chart-specific facts that modify them,
 * kept separate and labelled. No verdict and no score: whether a period is
 * "good" is not a computable property, and a tool that prints one is
 * pretending to a certainty the tradition itself does not claim.
 */
export function dashaOutlook(chart, graha) {
  const meaning = MAHADASHA_MEANING[graha];
  if (!meaning) throw new RangeError(`unknown dasha lord: ${graha}`);

  const p = chart.positions[graha];
  const fn = functionalNature(chart.lagna.rashi, graha);

  const strengths = [];
  const weaknesses = [];

  if (p.dignity === 'uccha') strengths.push(`${graha} is exalted (uccha) in ${p.rashiName}, its strongest placement.`);
  if (p.dignity === 'swakshetra') strengths.push(`${graha} is in its own rashi (${p.rashiName}), which is strong and stable.`);
  if (p.dignity === 'neecha') weaknesses.push(`${graha} is debilitated (neecha) in ${p.rashiName}, its weakest placement.`);
  if (p.retrograde && graha !== 'rahu' && graha !== 'ketu') {
    strengths.push(`${graha} is vakri (retrograde), which the texts hold to intensify rather than weaken its results.`);
  }

  if (KENDRAS.includes(p.house)) strengths.push(`It occupies the ${ordinal(p.house)}, a kendra, which gives it a direct hand in affairs.`);
  if (TRIKONAS.includes(p.house) && p.house !== 1) strengths.push(`It occupies the ${ordinal(p.house)}, a trikona, which is auspicious.`);
  if (DUSTHANAS.includes(p.house)) weaknesses.push(`It occupies the ${ordinal(p.house)}, a dusthana, so its results tend to come through difficulty.`);

  return {
    graha,
    years: meaning.years,
    theme: meaning.theme,
    signifies: meaning.signifies,
    favourable: meaning.favourable,
    unfavourable: meaning.unfavourable,
    avoid: meaning.avoid,
    scope: meaning.scope,
    duration: meaning.duration,

    /** The part that is about THIS chart and nobody else's. */
    inThisChart: {
      placement: {
        rashiName: p.rashiName,
        house: p.house,
        degreeInRashi: p.degreeInRashi,
        dignity: p.dignity,
        retrograde: p.retrograde,
        navamsaName: p.navamsaName,
      },
      functional: fn,
      strengths,
      weaknesses,
      summary:
        `For a ${chart.lagna.rashiName} lagna, ${graha} ${NATURE_PHRASE[fn.nature]}` +
        `${fn.lordships.length ? `, lording the ${ordinalList(fn.lordships)}` : ''}` +
        `, and sits in the ${ordinal(p.house)} in ${p.rashiName}` +
        `${p.dignity ? ` (${p.dignity})` : ''}.`,
    },

    disclaimer:
      'These are the classical significations of the dasha lord and the ' +
      'computed facts of its placement in this chart. They describe the ' +
      'SCOPE a period opens, which is what the tradition claims for a dasha - ' +
      'not a forecast of events. A full reading weighs the whole chart, the ' +
      'running antardasha and the transits together, and is the astrologer\'s ' +
      'work rather than the engine\'s.',
  };
}

/**
 * The flavour of an antardasha: the sub-lord acting within the main lord.
 *
 * Classical rule of thumb, and stated as one: the mahadasha lord sets the
 * subject of the period and the antardasha lord sets how it proceeds. Where
 * the two are mutual friends the sub-period runs smoothly; where they are
 * enemies it is where the friction in the mahadasha concentrates.
 */
export function antardashaNote(mahaGraha, antarGraha) {
  const maha = MAHADASHA_MEANING[mahaGraha];
  const antar = MAHADASHA_MEANING[antarGraha];
  if (!maha || !antar) return null;
  return {
    maha: mahaGraha,
    antar: antarGraha,
    statement: mahaGraha === antarGraha
      ? `${mahaGraha} in its own antardasha - the period at its most characteristic, and usually its most pronounced.`
      : `${maha.theme.toLowerCase()} is the subject of these years; within this sub-period it proceeds through ${antar.theme.toLowerCase()}.`,
    mahaTheme: maha.theme,
    antarTheme: antar.theme,
  };
}
