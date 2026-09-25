/**
 * Ashtakuta / Dashakuta matrimony matching.
 *
 * DESIGN DECISION, taken deliberately and recorded here because it is the
 * thing most likely to be "helpfully" undone later:
 *
 *   This module DOES NOT produce a single overall match percentage.
 *
 * It returns fourteen factors (the twelve kutas and qualifiers, plus the Sri
 * Uttaradi Math's eka-nakshatra and kanya-nakshatra rules), each with its own
 * points, maximum and severity,
 * plus a separate list of classical exceptions. That follows sudhyk's
 * Ahoratra, which computes the kutas and declines to reduce a marriage to one
 * number. VedAstro does reduce it (to a rounded %), and doing so throws away
 * exactly the information an elder actually decides on - Rajju and Nadi are
 * vetoes, not deductions, and averaging them into a percentage hides them.
 *
 * Two further design notes, both copied from sudhyk over VedAstro:
 *   - `points` is fractional, not boolean. Gana can yield 3 of 6.
 *   - Exceptions are returned SEPARATELY and never mutate the primary result.
 *     VedAstro computes its score before applying exceptions, so its
 *     exceptions cannot affect the number at all.
 *
 * Input is (nakshatra, pada) per party and nothing else - the classical South
 * Indian method needs no full chart.
 */
import { NAKSHATRA_NAMES, RASHI_NAMES } from './panchanga.js';

/* ------------------------------------------------------------- reference tables */

// Nakshatra -> rashi (moon sign). Each rashi spans 2.25 nakshatras, so the
// mapping depends on the PADA, not the nakshatra alone.
function rashiOfNakshatraPada(nak, pada) {
  // 27 nakshatras x 4 padas = 108 quarters; 9 quarters per rashi.
  const quarter = (nak - 1) * 4 + (pada - 1);
  return Math.floor(quarter / 9) + 1;
}

const NADI = ['adi', 'madhya', 'antya'];
/** Nadi cycles adi/madhya/antya across the 27 nakshatras in a fixed pattern. */
const NADI_BY_NAKSHATRA = [
  0, 1, 2, 2, 1, 0, 0, 1, 2, 2, 1, 0, 0, 1, 2, 2, 1, 0, 0, 1, 2, 2, 1, 0, 0, 1, 2,
];

const GANA = ['deva', 'manushya', 'rakshasa'];
const GANA_BY_NAKSHATRA = [
  0, 1, 2, 1, 0, 1, 0, 0, 2, 2, 1, 1, 0, 2, 0, 2, 0, 2, 2, 1, 1, 0, 2, 2, 1, 1, 0,
];

const YONI_BY_NAKSHATRA = [
  'horse', 'elephant', 'sheep', 'serpent', 'serpent', 'dog', 'cat', 'sheep', 'cat',
  'rat', 'rat', 'cow', 'buffalo', 'tiger', 'buffalo', 'tiger', 'deer', 'deer',
  'dog', 'monkey', 'mongoose', 'monkey', 'lion', 'horse', 'lion', 'cow', 'elephant',
];

/** Rajju body-part groups. Same rajju between partners is the adverse case. */
const RAJJU_BY_NAKSHATRA = [
  'pada', 'kati', 'nabhi', 'kantha', 'shiro', 'kantha', 'nabhi', 'kati', 'pada',
  'pada', 'kati', 'nabhi', 'kantha', 'shiro', 'kantha', 'nabhi', 'kati', 'pada',
  'pada', 'kati', 'nabhi', 'kantha', 'shiro', 'kantha', 'nabhi', 'kati', 'pada',
];

const VARNA_BY_RASHI = [
  'kshatriya', 'vaishya', 'shudra', 'brahmin', 'kshatriya', 'vaishya',
  'shudra', 'brahmin', 'kshatriya', 'vaishya', 'shudra', 'brahmin',
];
const VARNA_RANK = { shudra: 1, vaishya: 2, kshatriya: 3, brahmin: 4 };

const RASHI_LORD = [
  'mangala', 'shukra', 'budha', 'chandra', 'surya', 'budha',
  'shukra', 'mangala', 'guru', 'shani', 'shani', 'guru',
];

/** Vedha (piercing) nakshatra pairs - mutually adverse. */
const VEDHA_PAIRS = [
  [1, 18], [2, 17], [3, 16], [4, 15], [5, 23], [6, 22], [7, 21], [8, 20], [9, 19],
  [10, 27], [11, 26], [12, 25], [13, 24], [14, 14],
];

const MAHENDRA_COUNTS = new Set([4, 7, 10, 13, 16, 19, 22, 25]);

/* --------------------------------------------------------------- factors */

const mk = (name, points, max, severity, detail) => ({ name, points, max, severity, detail });

function varnaKuta(b, g) {
  const br = VARNA_BY_RASHI[rashiOfNakshatraPada(b.nakshatra, b.pada) - 1];
  const gr = VARNA_BY_RASHI[rashiOfNakshatraPada(g.nakshatra, g.pada) - 1];
  // Favourable when the groom's varna is equal to or higher than the bride's.
  const ok = VARNA_RANK[gr] >= VARNA_RANK[br];
  return mk('Varna', ok ? 1 : 0, 1, ok ? 'ok' : 'warn',
    `bride ${br}, groom ${gr}`);
}

function vashyaKuta(b, g) {
  // Simplified classical grouping by rashi pair; full table is a 12x12 matrix.
  const br = rashiOfNakshatraPada(b.nakshatra, b.pada);
  const gr = rashiOfNakshatraPada(g.nakshatra, g.pada);
  const group = (r) =>
    [1, 5].includes(r) ? 'quadruped'
      : [2, 7, 8, 10].includes(r) ? 'quadruped'
      : [3, 6, 11].includes(r) ? 'human'
      : [4, 12].includes(r) ? 'water'
      : 'insect';
  const same = group(br) === group(gr);
  return mk('Vashya', same ? 2 : 0, 2, same ? 'ok' : 'warn',
    `bride ${RASHI_NAMES[br - 1]} (${group(br)}), groom ${RASHI_NAMES[gr - 1]} (${group(gr)})`);
}

/** Tara / Dina kuta - reciprocal nakshatra counts must both be favourable. */
function taraKuta(b, g) {
  const fwd = (((g.nakshatra - b.nakshatra + 27) % 27) + 1) % 9;
  const rev = (((b.nakshatra - g.nakshatra + 27) % 27) + 1) % 9;
  const badTaras = new Set([3, 5, 7, 0]); // Vipat, Pratyak, Vadha, and 9->0
  const fwdOk = !badTaras.has(fwd) || fwd === 0;
  const revOk = !badTaras.has(rev) || rev === 0;
  const both = fwdOk && revOk;
  const points = both ? 3 : fwdOk || revOk ? 1.5 : 0;
  return mk('Tara', points, 3, both ? 'ok' : points > 0 ? 'warn' : 'error',
    `counts ${fwd || 9} and ${rev || 9}`);
}

function yoniKuta(b, g) {
  const by = YONI_BY_NAKSHATRA[b.nakshatra - 1];
  const gy = YONI_BY_NAKSHATRA[g.nakshatra - 1];
  const enemies = [
    ['cow', 'tiger'], ['elephant', 'lion'], ['horse', 'buffalo'],
    ['dog', 'deer'], ['serpent', 'mongoose'], ['cat', 'rat'], ['monkey', 'sheep'],
  ];
  const isEnemy = enemies.some(([a, c]) => (by === a && gy === c) || (by === c && gy === a));
  const same = by === gy;
  const points = same ? 4 : isEnemy ? 0 : 2;
  return mk('Yoni', points, 4, same ? 'ok' : isEnemy ? 'error' : 'warn',
    `bride ${by}, groom ${gy}${isEnemy ? ' (natural enemies)' : ''}`);
}

function grahaMaitriKuta(b, g) {
  const bl = RASHI_LORD[rashiOfNakshatraPada(b.nakshatra, b.pada) - 1];
  const gl = RASHI_LORD[rashiOfNakshatraPada(g.nakshatra, g.pada) - 1];
  const friends = {
    surya: ['chandra', 'mangala', 'guru'],
    chandra: ['surya', 'budha'],
    mangala: ['surya', 'chandra', 'guru'],
    budha: ['surya', 'shukra'],
    guru: ['surya', 'chandra', 'mangala'],
    shukra: ['budha', 'shani'],
    shani: ['budha', 'shukra'],
  };
  const same = bl === gl;
  const mutual = friends[bl]?.includes(gl) && friends[gl]?.includes(bl);
  const oneWay = friends[bl]?.includes(gl) || friends[gl]?.includes(bl);
  const points = same || mutual ? 5 : oneWay ? 3 : 0;
  return mk('Graha Maitri', points, 5, points === 5 ? 'ok' : points > 0 ? 'warn' : 'error',
    `lords ${bl} and ${gl}`);
}

function ganaKuta(b, g) {
  const bg = GANA[GANA_BY_NAKSHATRA[b.nakshatra - 1]];
  const gg = GANA[GANA_BY_NAKSHATRA[g.nakshatra - 1]];
  let points;
  if (bg === gg) points = 6;
  else if ((bg === 'deva' && gg === 'manushya') || (bg === 'manushya' && gg === 'deva')) points = 5;
  else if (bg === 'rakshasa' && gg === 'manushya') points = 0;
  else if (bg === 'manushya' && gg === 'rakshasa') points = 3;
  else points = 1; // deva/rakshasa either way
  return mk('Gana', points, 6, points >= 5 ? 'ok' : points > 0 ? 'warn' : 'error',
    `bride ${bg}, groom ${gg}`);
}

function rashiKuta(b, g) {
  const br = rashiOfNakshatraPada(b.nakshatra, b.pada);
  const gr = rashiOfNakshatraPada(g.nakshatra, g.pada);
  const fwd = ((gr - br + 12) % 12) + 1;
  const rev = ((br - gr + 12) % 12) + 1;
  // 6/8 and 2/12 axes are the classical bhakoot doshas.
  const bad = (fwd === 6 && rev === 8) || (fwd === 8 && rev === 6) ||
              (fwd === 2 && rev === 12) || (fwd === 12 && rev === 2);
  return mk('Rashi', bad ? 0 : 7, 7, bad ? 'error' : 'ok',
    `bride ${RASHI_NAMES[br - 1]}, groom ${RASHI_NAMES[gr - 1]} (${fwd}/${rev} axis)`);
}

function nadiKuta(b, g) {
  const bn = NADI[NADI_BY_NAKSHATRA[b.nakshatra - 1]];
  const gn = NADI[NADI_BY_NAKSHATRA[g.nakshatra - 1]];
  const same = bn === gn;
  return mk('Nadi', same ? 0 : 8, 8, same ? 'error' : 'ok',
    `bride ${bn}, groom ${gn}${same ? ' (same nadi - nadi dosha)' : ''}`);
}

/* ------------------------------------------ non-scoring qualifiers (max 0) */

/**
 * These four carry NO points, in both sudhyk's and VedAstro's implementations.
 * They are vetoes and qualifiers. `severity` is the only signal - there is
 * deliberately no `applies` boolean here, because sudhyk's `applies` field is
 * semantically inconsistent across kutas (true means GOOD for Mahendra,
 * Stree Deergha and Rajju, but BAD for Vedha) and porting that would invert
 * three of the four.
 */
function mahendra(b, g) {
  const count = ((g.nakshatra - b.nakshatra + 27) % 27) + 1;
  const ok = MAHENDRA_COUNTS.has(count);
  return mk('Mahendra', 0, 0, ok ? 'ok' : 'warn',
    ok ? `groom's nakshatra is the ${ordinal(count)} from bride's - favourable`
       : `groom's nakshatra is the ${ordinal(count)} from bride's - not among the 4th, 7th, 10th, 13th, 16th, 19th, 22nd or 25th`);
}

function streeDeergha(b, g) {
  const distance = (g.nakshatra - b.nakshatra + 27) % 27;
  const severity = distance > 18 ? 'ok' : distance >= 9 ? 'warn' : 'error';
  const label = distance > 18 ? 'full' : distance >= 9 ? 'partial' : 'near';
  return mk('Stree Deergha', 0, 0, severity,
    `distance ${distance} (${label})`);
}

function rajju(b, g) {
  const br = RAJJU_BY_NAKSHATRA[b.nakshatra - 1];
  const gr = RAJJU_BY_NAKSHATRA[g.nakshatra - 1];
  const same = br === gr;
  return mk('Rajju', 0, 0, same ? 'error' : 'ok',
    same ? `both ${br} rajju - rajju dosha` : `bride ${br}, groom ${gr}`);
}

function vedha(b, g) {
  const hit = VEDHA_PAIRS.some(
    ([x, y]) => (b.nakshatra === x && g.nakshatra === y) || (b.nakshatra === y && g.nakshatra === x)
  );
  return mk('Vedha', 0, 0, hit ? 'error' : 'ok',
    hit ? 'vedha (mutual piercing) present' : 'no vedha');
}

/* ------------------------------------ Sri Uttaradi Math's own matching rules */

/**
 * From the Math's panchanga (its Sanskrit-script edition 2024-25, page 46:
 * "ಏಕನಕ್ಷತ್ರ, ಏಕರಾಶಿ ವಿಚಾರ" and "ಕನ್ಯಾನಕ್ಷತ್ರ ದೋಷವಿಚಾರ", Kannada language
 * in Devanagari). Quoted in every result's detail.
 */
export const UM_MATCH_TEXT = Object.freeze({
  ekaNakshatra: 'ಫಲ - ವಧೂ-ವರ ನಕ್ಷತ್ರವು ಇವುಗಳಲ್ಲಿ ಒಂದಾದರೆ: ಉತ್ತಮ - ರೋಹಿಣೀ, ಆರ್ದ್ರಾ, ಪುಷ್ಯ, ಮಘಾ, ವಿಶಾಖಾ, ಶ್ರವಣಾ, ಉತ್ತರಾಭಾದ್ರಪದಾ, ರೇವತೀ; ಮಧ್ಯಮ - ಅಶ್ವಿನೀ, ಕೃತ್ತಿಕಾ, ಮೃಗಶಿರಾ, ಪುನರ್ವಸು, ಚಿತ್ರಾ, ಅನುರಾಧಾ, ಪೂರ್ವಾಭಾದ್ರಪದಾ; ಅಶುಭ - ಉಳಿದ ನಕ್ಷತ್ರಗಳಲ್ಲಿ ಒಂದಾದರೆ. ಹೀಗಿದ್ದರೂ ವಧೂ ವರ ನಕ್ಷತ್ರ ಒಂದಾಗಿ ಪಾದವು ಭಿನ್ನವಾಗಿದ್ದು ವರನ ನಕ್ಷತ್ರಪಾದವು ಮೊದಲನೆಯದಾದರೆ ಶುಭ. ಆದರೆ ಅಶ್ವಿನೀ, ಕೃತ್ತಿಕಾ, ರೋಹಿಣೀ, ಮೃಗಶಿರಾ, ಆರ್ದ್ರಾ, ಪುಷ್ಯ, ಮಘಾ, ಹಸ್ತ, ಸ್ವಾತೀ, ವಿಶಾಖಾ, ಪೂರ್ವಾಷಾಢಾ, ಶತತಾರಕಾ ಈ ನಕ್ಷತ್ರಗಳು ವಧುವಿನದಾಗಿದ್ದು ಪುರುಷನಕ್ಷತ್ರಕ್ಕಿಂತ ಮೊದಲನೆಯದಾದರೆ ಶುಭ.',
  ekaNakshatraEn: "Same nakshatra for bride and groom - uttama: Rohini, Ardra, Pushya, Magha, Vishakha, Shravana, Uttara Bhadrapada, Revati; madhyama: Ashwini, Krittika, Mrigashira, Punarvasu, Chitra, Anuradha, Purva Bhadrapada; ashubha: any other. Even so, when the nakshatra is the same but the padas differ and the groom's pada comes first, it is shubha. But for Ashwini, Krittika, Rohini, Mrigashira, Ardra, Pushya, Magha, Hasta, Swati, Vishakha, Purva Ashadha and Shatabhisha it is shubha when the bride's comes first.",
  ekaRashi: 'ಏಕರಾಶಿಯಾಗಿದ್ದು ನಕ್ಷತ್ರಭೇದವುಳ್ಳ ವಧೂ ವರ ವಿಷಯದಲ್ಲಿ ನಾಡಿ ಮತ್ತು ಗಣದೋಷಗಳನ್ನು ಗಮನಿಸಬೇಕಾಗಿಲ್ಲ. ಅದರಂತೆ ವಧೂ ವರ ನಕ್ಷತ್ರವು ಒಂದೇ ಆಗಿ ಪಾದವು ಭಿನ್ನವಾಗಿದ್ದರೆ ಶುಭ. ಯಾವುದೇ ದೋಷವೂ ಇಲ್ಲ.',
  ekaRashiEn: 'For a bride and groom of the same rashi but different nakshatras, Nadi and Gana doshas need not be considered. Likewise, when their nakshatra is the same and the padas differ, it is shubha - there is no dosha at all.',
  kanya: 'ಕನ್ಯಾನಕ್ಷತ್ರವು ಮೂಲ 1, 2, 3ನೇ ಪಾದಗಳಾದರೆ ಮಾವನಿಗೆ; ಆಶ್ಲೇಷಾ 2, 3, 4ನೇ ಪಾದಗಳಾದರೆ ಅತ್ತೆಗೆ; ವಿಶಾಖಾ 4ನೇ ಪಾದವಾದರೆ ಗಂಡನ ತಮ್ಮನಿಗೆ; ಜ್ಯೇಷ್ಠಾನಕ್ಷತ್ರ 4ನೇ ಪಾದವಾದರೆ ಗಂಡನ ಅಣ್ಣನಿಗೆ ಅನಿಷ್ಟ.',
  kanyaEn: "Kanya nakshatra dosha: if the bride's nakshatra is Mula padas 1-3 it is harmful to the father-in-law; Ashlesha padas 2-4, to the mother-in-law; Vishakha pada 4, to the husband's younger brother; Jyeshtha pada 4, to the husband's elder brother.",
});
const UM_MATCH_SOURCE = 'Sri Uttaradi Math panchanga (Sanskrit-script edition 2024-25, page 46)';

const EKA_UTTAMA = new Set([4, 6, 8, 10, 16, 22, 26, 27]);
const EKA_MADHYAMA = new Set([1, 3, 5, 7, 14, 17, 25]);
/** For these twelve, the BRIDE's pada coming first is the shubha order. */
const EKA_BRIDE_FIRST = new Set([1, 3, 4, 5, 6, 8, 10, 13, 15, 16, 20, 24]);

function ekaNakshatra(b, g) {
  if (b.nakshatra !== g.nakshatra) {
    return mk('Eka nakshatra', 0, 0, 'ok', 'different nakshatras - not applicable');
  }
  const n = b.nakshatra, name = NAKSHATRA_NAMES[n - 1];
  const basis = ` (${UM_MATCH_SOURCE}: "${UM_MATCH_TEXT.ekaNakshatraEn}" "${UM_MATCH_TEXT.ekaRashiEn}")`;
  if (b.pada !== g.pada) {
    const brideFirst = EKA_BRIDE_FIRST.has(n);
    const preferred = brideFirst ? b.pada < g.pada : g.pada < b.pada;
    const who = brideFirst ? "bride's" : "groom's";
    return mk('Eka nakshatra', 0, 0, preferred ? 'ok' : 'warn',
      `both ${name}, padas differ (bride ${b.pada}, groom ${g.pada}) - shubha, no dosha. ` +
      (preferred ? `The ${who} pada comes first, the order the Math names as shubha for ${name}.`
        : `The Math names the ${who} pada coming first as the shubha order for ${name}; here it is the other way.`) + basis);
  }
  const cls = EKA_UTTAMA.has(n) ? 'uttama' : EKA_MADHYAMA.has(n) ? 'madhyama' : 'ashubha';
  return mk('Eka nakshatra', 0, 0, cls === 'uttama' ? 'ok' : cls === 'madhyama' ? 'warn' : 'error',
    `both ${name}, same pada ${b.pada} - ${cls}` + basis);
}

function kanyaNakshatra(b) {
  const rules = [[19, [1, 2, 3], 'the father-in-law'], [9, [2, 3, 4], 'the mother-in-law'], [16, [4], "the husband's younger brother"], [18, [4], "the husband's elder brother"]];
  const hit = rules.find(([n, padas]) => b.nakshatra === n && padas.includes(b.pada));
  return mk('Kanya nakshatra', 0, 0, hit ? 'warn' : 'ok',
    hit ? `bride ${NAKSHATRA_NAMES[b.nakshatra - 1]} pada ${b.pada} - harmful (anishta) to ${hit[2]} (${UM_MATCH_SOURCE}: "${UM_MATCH_TEXT.kanyaEn}")`
      : "bride's nakshatra and pada carry no kanya nakshatra dosha");
}

/* ------------------------------------------------------------ exceptions */

/**
 * Classical neutralisations. Returned SEPARATELY - they never mutate the
 * factor list, and they are only evaluated when the factor they relieve has
 * actually failed.
 */
function exceptions(byName, b, g) {
  const out = [];
  const sev = (n) => byName.get(n)?.severity;

  // Sri Uttaradi Math: same nakshatra with different padas - "no dosha at
  // all"; same nakshatra and pada, uttama - the same-nakshatra doshas do not
  // apply; same rashi with different nakshatras - Nadi and Gana are not
  // considered. Checked first, and marked with their source.
  if (b.nakshatra === g.nakshatra && (b.pada !== g.pada || EKA_UTTAMA.has(b.nakshatra))) {
    for (const f of ['Nadi', 'Rajju', 'Stree Deergha', 'Vedha', 'Gana']) {
      if (sev(f) === 'error' || sev(f) === 'warn') {
        out.push({ relieves: f, source: 'uttaradi-math', text: `${f} is not a dosha here - same nakshatra ${b.pada !== g.pada ? 'with different padas ("no dosha at all")' : '(uttama)'} (${UM_MATCH_SOURCE})` });
      }
    }
  } else if (b.nakshatra !== g.nakshatra && rashiOfNakshatraPada(b.nakshatra, b.pada) === rashiOfNakshatraPada(g.nakshatra, g.pada)) {
    for (const f of ['Nadi', 'Gana']) {
      if (sev(f) === 'error' || sev(f) === 'warn') {
        out.push({ relieves: f, source: 'uttaradi-math', text: `${f} is not considered - same rashi, different nakshatras (${UM_MATCH_SOURCE}: "${UM_MATCH_TEXT.ekaRashiEn}")` });
      }
    }
  }

  const has = (f) => out.some((e) => e.relieves === f);
  if (!has('Stree Deergha') && sev('Stree Deergha') === 'error' && sev('Rashi') === 'ok' && sev('Graha Maitri') === 'ok') {
    out.push({ relieves: 'Stree Deergha', text: 'adverse Stree Deergha is neutralised by favourable Rashi and Graha Maitri' });
  }
  if (!has('Rajju') && sev('Rajju') === 'error' && sev('Graha Maitri') === 'ok' && sev('Rashi') === 'ok' &&
      sev('Tara') === 'ok' && sev('Mahendra') === 'ok') {
    out.push({ relieves: 'Rajju', text: 'adverse Rajju is neutralised by favourable Graha Maitri, Rashi, Tara and Mahendra' });
  }
  if (!has('Nadi') && sev('Nadi') === 'error' && sev('Rashi') === 'ok' && sev('Rajju') === 'ok') {
    out.push({ relieves: 'Nadi', text: 'adverse Nadi is neutralised by favourable Rashi and Rajju' });
  }
  return out;
}

/* ---------------------------------------------------------------- public */

/**
 * Match two birth points.
 * @param {{nakshatra:number,pada:number}} bride
 * @param {{nakshatra:number,pada:number}} groom
 */
export function matchKutas(bride, groom) {
  validate(bride, 'bride');
  validate(groom, 'groom');

  const factors = [
    nadiKuta(bride, groom),
    rashiKuta(bride, groom),
    ganaKuta(bride, groom),
    grahaMaitriKuta(bride, groom),
    yoniKuta(bride, groom),
    taraKuta(bride, groom),
    vashyaKuta(bride, groom),
    varnaKuta(bride, groom),
    mahendra(bride, groom),
    streeDeergha(bride, groom),
    rajju(bride, groom),
    vedha(bride, groom),
    ekaNakshatra(bride, groom),
    kanyaNakshatra(bride),
  ];

  const byName = new Map(factors.map((f) => [f.name, f]));
  const exc = exceptions(byName, bride, groom);

  const scored = factors.filter((f) => f.max > 0);
  const obtained = scored.reduce((s, f) => s + f.points, 0);
  const maximum = scored.reduce((s, f) => s + f.max, 0); // 36

  // Vetoes are reported as their own list so a caller cannot miss them by
  // reading a number. An exception relieving a veto removes it from here.
  const relieved = new Set(exc.map((e) => e.relieves));
  const vetoes = factors
    .filter((f) => f.severity === 'error' && !relieved.has(f.name))
    .map((f) => ({ name: f.name, detail: f.detail }));

  return {
    bride: describe(bride),
    groom: describe(groom),
    factors,
    exceptions: exc,
    vetoes,
    // Deliberately NOT a verdict. See the module header.
    points: { obtained, maximum },
    note:
      'Kaalachakra reports each factor and does not reduce a match to a ' +
      'single verdict. Rajju, Nadi, Vedha and Stree Deergha carry no points by ' +
      'design - they are qualifiers, and a points total cannot express them.',
  };
}

function describe(p) {
  const rashi = rashiOfNakshatraPada(p.nakshatra, p.pada);
  return {
    nakshatra: { index: p.nakshatra, name: NAKSHATRA_NAMES[p.nakshatra - 1], pada: p.pada },
    rashi: { index: rashi, name: RASHI_NAMES[rashi - 1] },
    nadi: NADI[NADI_BY_NAKSHATRA[p.nakshatra - 1]],
    gana: GANA[GANA_BY_NAKSHATRA[p.nakshatra - 1]],
    yoni: YONI_BY_NAKSHATRA[p.nakshatra - 1],
    rajju: RAJJU_BY_NAKSHATRA[p.nakshatra - 1],
  };
}

/** 1 -> "1st", 2 -> "2nd", 11 -> "11th". */
function ordinal(n) {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}

function validate(p, who) {
  if (!p || !Number.isInteger(p.nakshatra) || p.nakshatra < 1 || p.nakshatra > 27) {
    throw new RangeError(`${who}.nakshatra must be an integer 1..27`);
  }
  if (!Number.isInteger(p.pada) || p.pada < 1 || p.pada > 4) {
    throw new RangeError(`${who}.pada must be an integer 1..4`);
  }
}

export { rashiOfNakshatraPada };
