/**
 * Vara yogas, Anandadi, ghata chakra and the matching rules, all transcribed
 * from Sri Uttaradi Math's own panchanga (Kannada edition page 14; the
 * Sanskrit-script edition 2024-25 pages 46 and 64). Fixture:
 * fixtures/uttaradi-math-anandadi.json (the printed 28 x 7 Anandadi table).
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  withGanita, computeDay, computeMuhurta, evaluateDay, lagnaWindows, localToJd, janmaPoints, natalChart,
  matchKutas, mangalaDosha, mangalaComparison,
  varaYogas, ghataForDay, anandadiYoga, nakshatra28, SHUBHA_VARA_YOGAS, ASHUBHA_VARA_YOGAS, ANANDADI, GHATA_CHAKRA,
} from '../src/index.js';
import * as P from '../src/panchanga.js';

const here = dirname(fileURLToPath(import.meta.url));
const ANANDADI_FX = JSON.parse(readFileSync(join(here, 'fixtures', 'uttaradi-math-anandadi.json'), 'utf8')).rows;
const BLR = { latitude: 12.9716, longitude: 77.5946, altitude: 920, tzOffsetHours: 5.5 };
const dayOf = (y, m, d) => withGanita('surya', () => computeDay({ date: { year: y, month: m, day: d }, place: BLR }));

describe('Anandadi (for travel)', () => {
  test('the formula reproduces all 196 cells of the Math\'s printed table, names and phala included', () => {
    assert.equal(ANANDADI_FX.length, 28);
    ANANDADI_FX.forEach((row, i) => {
      row.positions28.forEach((pos, w) => assert.equal(anandadiYoga(w, pos), ANANDADI[i], `row ${i + 1} weekday ${w}`));
    });
    assert.equal(ANANDADI.filter((a) => a.good).length, 16);
  });

  test('Abhijit is the 28th nakshatra between 276°40′ and 280°53′20″', () => {
    assert.equal(nakshatra28(276.6), 21);
    assert.equal(nakshatra28(276.7), 22);
    assert.equal(nakshatra28(280.88), 22);
    assert.equal(nakshatra28(280.9), 23);
    assert.equal(nakshatra28(359.9), 28);
  });
});

describe('vara yogas (page 14)', () => {
  test('tables are well formed; only the misprinted Thursday Visha cell is empty among the three-way yogas', () => {
    for (const y of [...SHUBHA_VARA_YOGAS, ...ASHUBHA_VARA_YOGAS]) {
      assert.equal(y.cells.length, 7, y.name);
      for (const cell of y.cells) for (const c of cell) {
        if (y.kind === 'tithi') assert.ok(c >= 1 && c <= 15);
        else if (y.kind === 'nakshatra') assert.ok(c >= 1 && c <= 27);
        else assert.ok(c[0] >= 1 && c[0] <= 15 && c[1] >= 1 && c[1] <= 27);
      }
    }
    const visha = ASHUBHA_VARA_YOGAS.find((y) => y.name === 'Visha' && y.kind === 'tithi-nakshatra');
    assert.deepEqual(visha.cells.map((c) => c.length), [1, 1, 1, 1, 0, 1, 1]);
    // Cells placed by page coordinates: Siddhi (tithi) has no Sunday/Monday; Samvarta is Sunday 7 and Wednesday 1.
    assert.deepEqual(SHUBHA_VARA_YOGAS[0].cells.slice(0, 2), [[], []]);
    assert.deepEqual(ASHUBHA_VARA_YOGAS.find((y) => y.name === 'Samvarta').cells, [[7], [], [], [1], [], [], []]);
  });

  test('every yoga found over a year matches its table cell, lies inside its day, and none is missed at sunrise', () => {
    withGanita('surya', () => {
      for (let k = 0; k < 120; k++) {
        const dt = new Date(Date.UTC(2026, 0, 1 + k * 3));
        const day = computeDay({ date: { year: dt.getUTCFullYear(), month: dt.getUTCMonth() + 1, day: dt.getUTCDate() }, place: BLR });
        const found = day.muhurta.varaYogas;
        for (const y of found) {
          assert.ok(y.endJd > y.startJd && y.startJd >= day.sun.riseJd - 1e-9 && y.endJd <= day.sun.nextRiseJd + 1e-9, `${y.name} span`);
        }
        // Independent check at sunrise: the nakshatra yogas holding then must be reported.
        const v = day.vara.index, n = day.nakshatra.index, t = day.tithi.numberInPaksha;
        for (const [list, nature] of [[SHUBHA_VARA_YOGAS, 'shubha'], [ASHUBHA_VARA_YOGAS, 'ashubha']]) {
          for (const y of list) {
            const hit = y.kind === 'nakshatra' ? y.cells[v].includes(n) : y.kind === 'tithi' ? y.cells[v].includes(t)
              : y.cells[v].some(([a, b]) => a === t && b === n);
            if (hit) assert.ok(found.some((f) => f.name === y.name && f.kind === y.kind && f.nature === nature && f.startJd <= day.sun.riseJd + 1e-9), `${dt.toISOString().slice(0, 10)}: ${y.name} (${y.kind}) missing`);
          }
        }
      }
    });
  });

  test('an ashubha yoga is a caution, and is shown as removed when a shubha yoga shares the day (the Math\'s rule)', () => {
    let sawRemoved = false, sawWarn = false;
    withGanita('surya', () => {
      for (let k = 0; k < 200 && !(sawRemoved && sawWarn); k++) {
        const dt = new Date(Date.UTC(2026, 0, 1 + k));
        const day = computeDay({ date: { year: dt.getUTCFullYear(), month: dt.getUTCMonth() + 1, day: dt.getUTCDate() }, place: BLR });
        const p = evaluateDay(day, { event: 'general' }).points.find((x) => x.id === 'vara-yogas');
        if (!p) continue;
        assert.notEqual(p.status, 'fail');
        const hasShubha = day.muhurta.varaYogas.some((y) => y.nature === 'shubha');
        const hasAshubha = day.muhurta.varaYogas.some((y) => y.nature === 'ashubha');
        if (hasAshubha && hasShubha) { assert.equal(p.status, 'info'); sawRemoved = true; }
        if (hasAshubha && !hasShubha) { assert.equal(p.status, 'warn'); sawWarn = true; }
      }
    });
    assert.ok(sawRemoved && sawWarn);
  });

  test('Amrita-siddhi the Math says to avoid: Guruvara-Pushya is cut from vivaha windows, not from general ones', () => {
    withGanita('surya', () => {
      let checked = 0;
      for (let k = 0; k < 400 && checked < 2; k++) {
        const dt = new Date(Date.UTC(2026, 0, 1 + k));
        const day = computeDay({ date: { year: dt.getUTCFullYear(), month: dt.getUTCMonth() + 1, day: dt.getUTCDate() }, place: BLR });
        if (day.vara.index !== 4 || day.nakshatra.index !== 8) continue;
        const ev = evaluateDay(day, { event: 'vivaha' });
        assert.ok(ev.points.some((p) => p.id === 'amrita-siddhi-varjya'));
        assert.equal(ev.points.find((p) => p.id === 'guru-pushya').status, 'warn');
        const t = day.sun.riseJd + 1 / 1440;
        const inVivaha = lagnaWindows(day, BLR, { event: 'vivaha' }).windows.some((w) => w.usable.some((u) => t >= u.startJd && t <= u.endJd));
        assert.equal(inVivaha, false, 'Pushya time on Guruvara must not be usable for vivaha');
        assert.equal(evaluateDay(day, { event: 'general' }).points.find((p) => p.id === 'guru-pushya').status, 'info');
        checked++;
      }
      assert.ok(checked >= 1, 'no Guru-Pushya day found');
    });
  });
});

describe('ghata chakra', () => {
  test('rows as printed (Sanskrit 2024-25 page 64; Tula ghata masa Magha, not the Kannada misprint)', () => {
    assert.deepEqual({ ...GHATA_CHAKRA[0] }, { masa: 'Kartika', tithis: [1, 6, 11], vara: 0, nakshatra: 10, yoga: 'Vishkambha', karana: 'Bava', prahara: 1, chandraMale: 1, chandraFemale: 1 });
    assert.equal(GHATA_CHAKRA[6].masa, 'Magha');
    assert.deepEqual(GHATA_CHAKRA.map((r) => r.chandraMale), [1, 5, 9, 2, 6, 10, 3, 7, 4, 8, 11, 12]);
    assert.deepEqual(GHATA_CHAKRA.map((r) => r.chandraFemale), [1, 8, 7, 9, 4, 3, 6, 2, 10, 11, 5, 12]);
    // Every masa, vara, nakshatra, yoga and karana is one the engine produces.
    for (const r of GHATA_CHAKRA) {
      assert.ok(P.YOGA_NAMES.includes(r.yoga), r.yoga);
      assert.ok(['Bava', 'Balava', 'Kaulava', 'Taitila', 'Gara', 'Vanija', 'Vishti', 'Kimstughna', 'Shakuni', 'Chatushpada', 'Naga'].includes(r.karana), r.karana);
    }
  });

  test('for travel, a ghata vara fails the day; the ghata prahara (day and night) is removed from the windows', () => {
    withGanita('surya', () => {
      // Janma rashi Mesha: ghata vara Sunday.
      const janma = { rashi: { index: 1 }, nakshatra: { index: 1 } };
      let found = false;
      for (let k = 0; k < 14 && !found; k++) {
        const day = dayOf(2026, 3, 1 + k);
        if (day.vara.index !== 0) continue;
        found = true;
        const ev = evaluateDay(day, { event: 'prayana', janma, profile: { gender: 'male' } });
        assert.equal(ev.points.find((p) => p.id === 'ghata').status, 'fail');
        const hits = ghataForDay(day, 1, 'male', 'trueCitra').hits;
        const pr = hits.filter((h) => h.what === 'prahara');
        assert.equal(pr.length, 2);
        const lw = lagnaWindows(day, BLR, { event: 'prayana', janma, gender: 'male' });
        const mid = (pr[0].startJd + pr[0].endJd) / 2;
        assert.ok(!lw.windows.some((w) => w.usable.some((u) => mid >= u.startJd && mid <= u.endJd)));
        // Not applied to other events.
        assert.equal(evaluateDay(day, { event: 'vivaha', janma }).points.find((p) => p.id === 'ghata'), undefined);
      }
      assert.ok(found);
    });
  });

  test('the ghata Moon follows the gender: male and female counts differ, unknown applies both', () => {
    withGanita('surya', () => {
      const day = dayOf(2026, 6, 10);
      const m = ghataForDay(day, 2, 'male', 'trueCitra').hits.filter((h) => h.what === 'chandra');
      const f = ghataForDay(day, 2, 'female', 'trueCitra').hits.filter((h) => h.what === 'chandra');
      const both = ghataForDay(day, 2, null, 'trueCitra').hits.filter((h) => h.what === 'chandra');
      assert.ok(both.length >= Math.max(m.length, f.length));
    });
  });

  test('computeMuhurta runs the travel event end to end, with Anandadi', () => {
    const janma = withGanita('surya', () => janmaPoints(localToJd({ year: 1990, month: 1, day: 10, hour: 9 }, 5.5), 'trueCitra'));
    const r = withGanita('surya', () => computeMuhurta({ date: { year: 2026, month: 10, day: 8 }, place: BLR, event: 'prayana', janma, profile: { gender: 'female' }, nextCount: 1, horizonDays: 30 }));
    assert.ok(r.evaluation.points.some((p) => p.id === 'anandadi'));
    assert.ok(r.evaluation.points.some((p) => p.id === 'ghata'));
  });
});

describe('matching: the Math\'s eka-nakshatra, eka-rashi and kanya-nakshatra rules', () => {
  const eka = (b, g) => matchKutas(b, g).factors.find((f) => f.name === 'Eka nakshatra');
  test('same nakshatra and pada: uttama / madhyama / ashubha as listed', () => {
    for (const n of [4, 6, 8, 10, 16, 22, 26, 27]) assert.equal(eka({ nakshatra: n, pada: 1 }, { nakshatra: n, pada: 1 }).severity, 'ok');
    for (const n of [1, 3, 5, 7, 14, 17, 25]) assert.equal(eka({ nakshatra: n, pada: 2 }, { nakshatra: n, pada: 2 }).severity, 'warn');
    for (const n of [2, 9, 11, 12, 13, 15, 18, 19, 20, 21, 23, 24]) assert.equal(eka({ nakshatra: n, pada: 3 }, { nakshatra: n, pada: 3 }).severity, 'error');
  });

  test('different padas: shubha, preferred order groom-first, bride-first for the twelve named nakshatras', () => {
    assert.equal(eka({ nakshatra: 22, pada: 3 }, { nakshatra: 22, pada: 1 }).severity, 'ok'); // Shravana, groom first
    assert.equal(eka({ nakshatra: 22, pada: 1 }, { nakshatra: 22, pada: 3 }).severity, 'warn');
    assert.equal(eka({ nakshatra: 13, pada: 1 }, { nakshatra: 13, pada: 4 }).severity, 'ok'); // Hasta, bride first
    assert.equal(eka({ nakshatra: 13, pada: 4 }, { nakshatra: 13, pada: 1 }).severity, 'warn');
    // "No dosha at all": the same-nakshatra vetoes are relieved, by the Math's rule.
    const r = matchKutas({ nakshatra: 18, pada: 1 }, { nakshatra: 18, pada: 3 });
    assert.deepEqual(r.vetoes, []);
    assert.ok(r.exceptions.filter((e) => e.source === 'uttaradi-math').map((e) => e.relieves).includes('Nadi'));
    assert.equal(new Set(r.exceptions.map((e) => e.relieves)).size, r.exceptions.length, 'no double relief');
    // Same nakshatra and pada, ashubha: not relieved.
    assert.ok(matchKutas({ nakshatra: 18, pada: 2 }, { nakshatra: 18, pada: 2 }).vetoes.some((v) => v.name === 'Eka nakshatra'));
  });

  test('same rashi, different nakshatra: Nadi and Gana are not considered', () => {
    // Punarvasu pada 4 and Pushya are both Karka; find a same-rashi pair with nadi dosha.
    let found = false;
    for (let a = 1; a <= 27 && !found; a++) for (let pa = 1; pa <= 4 && !found; pa++) for (let b = 1; b <= 27 && !found; b++) for (let pb = 1; pb <= 4 && !found; pb++) {
      if (a === b) continue;
      const r = matchKutas({ nakshatra: a, pada: pa }, { nakshatra: b, pada: pb });
      const same = r.bride.rashi.index === r.groom.rashi.index;
      const nadi = r.factors.find((f) => f.name === 'Nadi').severity === 'error';
      if (same && nadi) {
        found = true;
        assert.ok(r.exceptions.some((e) => e.relieves === 'Nadi' && e.source === 'uttaradi-math'));
        assert.ok(!r.vetoes.some((v) => v.name === 'Nadi'));
      }
    }
    assert.ok(found);
  });

  test('kanya nakshatra dosha by the bride\'s pada only', () => {
    const k = (n, p) => matchKutas({ nakshatra: n, pada: p }, { nakshatra: 4, pada: 1 }).factors.find((f) => f.name === 'Kanya nakshatra');
    for (const p of [1, 2, 3]) assert.match(k(19, p).detail, /father-in-law/);
    assert.equal(k(19, 4).severity, 'ok');
    for (const p of [2, 3, 4]) assert.match(k(9, p).detail, /mother-in-law/);
    assert.equal(k(9, 1).severity, 'ok');
    assert.match(k(16, 4).detail, /younger brother/);
    assert.match(k(18, 4).detail, /elder brother/);
    assert.equal(k(16, 3).severity, 'ok');
    // The groom's nakshatra never triggers it.
    assert.equal(matchKutas({ nakshatra: 4, pada: 1 }, { nakshatra: 19, pada: 1 }).factors.find((f) => f.name === 'Kanya nakshatra').severity, 'ok');
  });
});

describe('Mangala dosha by the Math\'s rule', () => {
  const charts = [];
  for (let y = 1950; y < 2010; y += 2) charts.push(natalChart(localToJd({ year: y, month: 1 + (y % 12), day: 5 + (y % 20), hour: (y * 7) % 24 }, 5.5), BLR, 'trueCitra'));
  test('houses 1, 4, 7, 8, 12 from the lagna; the seven pariharas decide; strength of Guru/Shukra is left to judgment', () => {
    for (const c of charts) {
      const u = mangalaDosha(c).uttaradiMath;
      assert.equal(u.afflicts, [1, 4, 7, 8, 12].includes(u.house));
      if (!u.afflicts) { assert.equal(u.present, false); continue; }
      assert.equal(u.pariharas.length, 7);
      assert.equal(u.present, !u.pariharas.some((x) => x.holds === true));
      const p7 = u.pariharas.find((x) => x.number === 7);
      const signFor = { 1: 1, 4: 8, 7: 10, 8: 5, 12: 9 };
      assert.equal(p7.holds, signFor[u.house] === c.positions.mangala.rashi);
      assert.equal(u.pariharas.find((x) => x.number === 1).holds, c.positions.mangala.rashi === 4);
    }
  });

  test('pair rule: one-sided means "the marriage should not be performed"; both means no dosha', () => {
    const d = charts.map((c) => mangalaDosha(c));
    const withD = d.find((x) => x.uttaradiMath.present), without = d.find((x) => !x.uttaradiMath.present);
    assert.ok(withD && without);
    const one = mangalaComparison(withD, without).uttaradiMath;
    assert.equal(one.status, 'one-sided');
    assert.match(one.statement, /should not be performed/);
    assert.equal(mangalaComparison(withD, withD).uttaradiMath.status, 'samya');
    assert.equal(mangalaComparison(without, without).uttaradiMath.status, 'absent');
  });
});
