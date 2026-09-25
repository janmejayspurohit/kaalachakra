/**
 * What each kuta is FOR, and what its score actually claims.
 *
 * The twelve-factor table gives a number and a detail line, which tells you
 * what was computed but not what it means or how much it weighs. A reader
 * seeing "Yoni 2/4 WARN" cannot tell whether that is a serious matter or a
 * rounding error in a system that hands out 36 points.
 *
 * Each entry says:
 *   - `signifies`: what the kuta is traditionally held to measure;
 *   - `weight`: what a full or partial score is worth in context;
 *   - `onShortfall`: what a reduced score is taken to indicate;
 *   - `qualifier`: true for the four factors that carry NO points and are
 *     pass/fail qualifiers instead. This is the distinction most published
 *     "guna milan" tools erase by folding everything into one percentage.
 *
 * Keyed by the EXACT `name` a factor carries in matchKutas(), not by a tidier
 * slug, so there is no mapping table between the two to fall out of step. A
 * test asserts the two key sets are identical.
 *
 * These are summaries of classical positions, not predictions. They describe
 * what the tradition says a factor is about; they do not assert an outcome
 * for a particular couple, which no engine is in a position to do.
 */
export const KUTA_MEANING = {
  'Nadi': {
    title: 'Nadi — constitution and progeny',
    signifies:
      'The three nadis (adi, madhya, antya) classify a nakshatra by humour. ' +
      'Nadi is read as the constitutional axis, and is the factor most ' +
      'directly associated with progeny and the health of children.',
    weight:
      'The heaviest single factor at 8 of 36 points — nearly a quarter of the ' +
      'whole score rests on this one comparison.',
    onShortfall:
      'A shared nadi (nadi dosha) scores zero and is treated by most ' +
      'authorities as a serious objection rather than a deduction, because ' +
      'the concern is progeny rather than compatibility of temperament.',
    qualifier: false,
  },
  'Rashi': {
    title: 'Rashi (Bhakoot) — the moon-sign axis',
    signifies:
      'The distance between the two moon rashis. Certain axes — the 6/8 ' +
      '(shadashtaka) and 2/12 (dwirdwadasha) — are held adverse; the 4/10, ' +
      '5/9, 3/11 and 7/7 axes are favourable.',
    weight:
      '7 of 36 points, the second heaviest, and it is all-or-nothing: an ' +
      'adverse axis scores zero rather than partial credit.',
    onShortfall:
      'A 6/8 axis is associated with ill health and discord, a 2/12 with ' +
      'loss. Both are commonly held to be relieved when Graha Maitri is ' +
      'favourable, which is why the two are read together and never alone.',
    qualifier: false,
  },
  'Gana': {
    title: 'Gana — temperament',
    signifies:
      'Deva, manushya and rakshasa gana describe disposition. The concern is ' +
      'how two temperaments meet day to day, not fortune or longevity.',
    weight: '6 of 36 points.',
    onShortfall:
      'Deva with rakshasa is the sharpest mismatch and scores zero; ' +
      'manushya with rakshasa scores partially. A gana difference is the ' +
      'mildest of the heavy factors and the one most often set aside when ' +
      'Rashi and Graha Maitri are strong.',
    qualifier: false,
  },
  'Graha Maitri': {
    title: 'Graha Maitri — friendship of the rashi lords',
    signifies:
      'Whether the lords of the two moon rashis are friends, neutral or ' +
      'enemies. Read as mental and temperamental affinity — the natural ' +
      'sympathy between the two, as distinct from Gana\'s disposition.',
    weight:
      '5 of 36 points, and disproportionately important for its size: a ' +
      'favourable Graha Maitri is the standard relief for an adverse Rashi ' +
      'kuta, so it can rescue 7 points it does not itself carry.',
    onShortfall:
      'Enemy lords score zero and remove that relief, which is why an ' +
      'adverse Rashi axis with hostile lords is weighed much more heavily ' +
      'than either factor read separately.',
    qualifier: false,
  },
  'Yoni': {
    title: 'Yoni — physical and instinctive compatibility',
    signifies:
      'Each nakshatra carries an animal symbol. Yoni is read as physical ' +
      'and instinctive compatibility, including sexual compatibility.',
    weight: '4 of 36 points.',
    onShortfall:
      'Same yoni scores full; friendly and neutral pairings score in ' +
      'between; the classical enemy pairs (cat and rat, serpent and ' +
      'mongoose, lion and elephant, and the rest) score zero. A middling ' +
      'score means the animals are neither allied nor hostile, which is a ' +
      'much weaker statement than the WARN label suggests.',
    qualifier: false,
  },
  'Tara': {
    title: 'Tara (Dina) — fortune and wellbeing',
    signifies:
      'Counting each nakshatra from the other and reducing by nine gives a ' +
      'tara. Three of the nine — vipat, pratyak and naidhana — are adverse. ' +
      'Read as mutual fortune and day-to-day wellbeing.',
    weight: '3 of 36 points.',
    onShortfall:
      'The count is taken in BOTH directions and each direction scores ' +
      'separately, so a half score means one partner\'s count is adverse ' +
      'and the other\'s is not.',
    qualifier: false,
  },
  'Vashya': {
    title: 'Vashya — mutual influence',
    signifies:
      'Groups the rashis as human, quadruped, wild, aquatic and insect. ' +
      'Read as the natural ascendancy each has over the other — who ' +
      'accommodates whom.',
    weight: '2 of 36 points. One of the two lightest scored factors.',
    onShortfall:
      'A shortfall here is a minor note. It is not held to indicate ' +
      'discord, only an imbalance of influence.',
    qualifier: false,
  },
  'Varna': {
    title: 'Varna — spiritual disposition',
    signifies:
      'The four varnas are assigned by moon rashi and read as spiritual or ' +
      'temperamental grade. The rule is directional: the groom\'s varna ' +
      'should equal or exceed the bride\'s.',
    weight:
      '1 of 36 points — the lightest factor in the system, and worth ' +
      'stating plainly because its social reading attracts weight the ' +
      'classical scoring never gave it.',
    onShortfall:
      'Scoring zero costs a single point out of 36. It is not a veto and ' +
      'no classical authority treats it as one.',
    qualifier: false,
  },
  'Mahendra': {
    title: 'Mahendra — progeny and wellbeing (qualifier)',
    signifies:
      'The groom\'s nakshatra counted from the bride\'s falls on the 4th, ' +
      '7th, 10th, 13th, 16th, 19th, 22nd or 25th. Associated with progeny ' +
      'and the couple\'s prosperity.',
    weight:
      'Carries NO points. It is a favourable indication when present, not a ' +
      'deduction when absent.',
    onShortfall:
      'Absence is the ordinary case — only 8 of 27 counts qualify. It is ' +
      'not an objection and should not be read as one.',
    qualifier: true,
  },
  'Stree Deergha': {
    title: 'Stree Deergha — longevity of the marriage (qualifier)',
    signifies:
      'The distance from the bride\'s nakshatra to the groom\'s. A greater ' +
      'distance is held to support the longevity of the marriage and the ' +
      'wellbeing of the wife.',
    weight:
      'Carries NO points, but is one of the four qualifiers a points total ' +
      'cannot express.',
    onShortfall:
      'A short distance is adverse, and is commonly held to be neutralised ' +
      'when both Rashi and Graha Maitri are favourable — which is exactly ' +
      'the exception this engine applies and reports.',
    qualifier: true,
  },
  'Rajju': {
    title: 'Rajju — the strongest objection (qualifier)',
    signifies:
      'The 27 nakshatras are mapped onto five parts of the body. A shared ' +
      'rajju (rajju dosha) is the gravest objection in the whole system, ' +
      'and its severity depends on WHICH part is shared — shiro (head) ' +
      'being the most serious.',
    weight:
      'Carries NO points and cannot be outvoted by a high total. This is ' +
      'the clearest case for why a percentage is a poor summary: a match ' +
      'can score 30 of 36 and still carry rajju dosha.',
    onShortfall:
      'Different rajju is the required condition and the ordinary case. A ' +
      'shared rajju is raised as a veto rather than a deduction.',
    qualifier: true,
  },
  'Vedha': {
    title: 'Vedha — obstruction (qualifier)',
    signifies:
      'Certain nakshatra pairs are held to obstruct one another. The set of ' +
      'obstructing pairs is fixed and symmetric.',
    weight: 'Carries NO points; it is a pass/fail qualifier.',
    onShortfall:
      'An obstructing pair is a serious objection in the classical texts, ' +
      'on a par with rajju and nadi rather than with the scored factors.',
    qualifier: true,
  },
  'Eka nakshatra': {
    title: 'Eka nakshatra / eka rashi — same star or sign (Sri Uttaradi Math)',
    signifies:
      'The Math\'s own rule for a bride and groom born in the same nakshatra. ' +
      'Same nakshatra and pada: uttama for Rohini, Ardra, Pushya, Magha, Vishakha, ' +
      'Shravana, Uttara Bhadrapada and Revati; madhyama for Ashwini, Krittika, ' +
      'Mrigashira, Punarvasu, Chitra, Anuradha and Purva Bhadrapada; ashubha for ' +
      'the rest. Same nakshatra with different padas: shubha, "no dosha at all", ' +
      'the groom\'s pada preferably first (the bride\'s, for twelve named nakshatras).',
    weight: 'Carries NO points; it is a qualifier.',
    onShortfall:
      'Where the Math finds no dosha, the same-nakshatra objections (nadi, rajju, ' +
      'stree deergha) are listed as relieved, with this rule as the reason. For the ' +
      'same rashi with different nakshatras the Math says nadi and gana doshas ' +
      'need not be considered.',
    qualifier: true,
  },
  'Kanya nakshatra': {
    title: 'Kanya nakshatra dosha — the bride\'s star (Sri Uttaradi Math)',
    signifies:
      'The Math names four bride nakshatra padas as harmful to a relative in the ' +
      'new family: Mula padas 1-3 (father-in-law), Ashlesha padas 2-4 ' +
      '(mother-in-law), Vishakha pada 4 (husband\'s younger brother), Jyeshtha ' +
      'pada 4 (husband\'s elder brother).',
    weight: 'Carries NO points; a caution.',
    onShortfall:
      'It concerns a particular relative, so it is weighed by the family - for ' +
      'instance whether that relative is living - and with an astrologer.',
    qualifier: true,
  },
};

/**
 * Score bands - the STANDARD guna-milan classification.
 *
 * The hinge of the whole scheme is 18 of 36. That is the conventional
 * minimum, below which a match is held insufficient on the points alone, and
 * it is the one boundary every published table agrees on. Bands that do not
 * put a boundary at 18 are not the standard classification, whatever they
 * call their tiers - an evenly-divided 0-10-20-30 looks tidy and puts the
 * accept/reject line in the wrong place.
 *
 * The four tiers, with the terms the tradition uses:
 *   below 18   not recommended on the points
 *   18 - 24    madhyama, average - workable, with the qualifiers deciding
 *   25 - 31    uttama, very good
 *   32 - 36    ati-uttama, excellent
 *
 * Boundaries are inclusive at both ends and cover 0..36 exactly once, with
 * no overlap and no gap; a test asserts that for every integer score, because
 * a band table that double-counts a boundary is the kind of defect nobody
 * notices until the one match that lands on it.
 *
 * `tone` names the severity slot, not a colour. The colours live in the
 * stylesheet so they can differ between the light and dark surfaces, which
 * they must: "deep green" is darker than "light green" on white and BRIGHTER
 * than it on black, because on a dark surface the stronger reading is the
 * one with more contrast, not less.
 */
export const SCORE_BANDS = [
  {
    min: 0, max: 17, label: 'Not recommended', tone: 'critical',
    sanskrit: null,
    meaning: 'Below 18 of 36, the conventional minimum. The scored factors raise a substantial objection of their own, before any qualifier is considered.',
  },
  {
    min: 18, max: 24, label: 'Average', tone: 'warning',
    sanskrit: 'madhyama',
    meaning: '18 is the conventional threshold. A total in this band is ordinarily read as workable, with the qualifiers deciding rather than the points.',
  },
  {
    min: 25, max: 31, label: 'Very good', tone: 'good',
    sanskrit: 'uttama',
    meaning: 'A comfortable total. The scored factors raise no objection of their own.',
  },
  {
    min: 32, max: 36, label: 'Excellent', tone: 'excellent',
    sanskrit: 'ati-uttama',
    meaning: 'Among the highest totals the system produces, and uncommon. It still does not override a qualifier.',
  },
];

export function scoreBand(obtained) {
  return SCORE_BANDS.find((b) => obtained >= b.min && obtained <= b.max) ?? null;
}

export const SCORE_CAVEAT =
  'The 36 points come from eight factors only. Rajju, Nadi dosha, Vedha and ' +
  'Stree Deergha are qualifiers that carry no points, so they cannot move the ' +
  'total no matter how serious they are — a match can score well and still ' +
  'carry a veto. Read the qualifiers first and the total second.';
