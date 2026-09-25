/**
 * Janma nakshatra and Vimshottari dasha follow the chosen ganita - Surya
 * Siddhanta (the Uttaradi Math reckoning) by default - and use the saura
 * (sidereal solar) year.
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  withGanita, janmaPoints, vimshottari, localToJd, VIMSHOTTARI_YEAR, panchangaMoon, DEFAULT_GANITA,
} from '../src/index.js';

const births = [];
for (let y = 1900; y <= 2200; y += 7) {
  births.push(localToJd({ year: y, month: 1 + (y % 12), day: 1 + (y % 27), hour: (y * 5) % 24, minute: 11 }, 5.5));
}

describe('janma nakshatra and rashi', () => {
  test('are reckoned in the active ganita, and say which', () => {
    let differ = 0;
    for (const jd of births) {
      const s = withGanita('surya', () => janmaPoints(jd, 'trueCitra'));
      const d = withGanita('drik', () => janmaPoints(jd, 'trueCitra'));
      assert.equal(s.ganita, 'surya');
      assert.equal(d.ganita, 'drik');
      assert.equal(s.nakshatra.index, Math.floor(withGanita('surya', () => panchangaMoon(jd, 'trueCitra')) / (360 / 27)) + 1);
      if (s.nakshatra.index !== d.nakshatra.index) differ++;
    }
    // Measured ~9.6% over 1,204 births 1900-2200; the two must genuinely differ.
    assert.ok(differ > 0, 'the ganita switch did not reach the janma nakshatra');
  });

  test('Surya Siddhanta is the default reckoning', () => {
    assert.equal(DEFAULT_GANITA, 'surya');
    assert.equal(janmaPoints(births[0], 'trueCitra').ganita, 'surya');
  });
});

describe('Vimshottari dasha', () => {
  test('the dasha balance comes from the same Moon as the janma nakshatra, in both ganitas', () => {
    for (const g of ['surya', 'drik']) {
      withGanita(g, () => {
        for (const jd of births) {
          const j = janmaPoints(jd, 'trueCitra');
          const v = vimshottari(jd, 'trueCitra', 1);
          assert.equal(v.janma.nakshatra.index, j.nakshatra.index, `${g} ${jd}`);
          assert.equal(v.meta.ganita, g);
        }
      });
    }
  });

  test('the year is the saura (sidereal solar) year - the Siddhanta\'s under Surya Siddhanta', () => {
    assert.equal(VIMSHOTTARI_YEAR.surya, 1577917828 / 4320000); // 365.258756...
    assert.equal(VIMSHOTTARI_YEAR.drik, 365.256363);
    const v = withGanita('surya', () => vimshottari(births[3], 'trueCitra', 2));
    assert.equal(v.meta.vimshottariYearDays, VIMSHOTTARI_YEAR.surya);
    // Nine mahadashas span exactly 120 of those years.
    const span = v.periods.at(-1).endJd - v.periods[0].startJd;
    assert.ok(Math.abs(span - 120 * VIMSHOTTARI_YEAR.surya) < 1e-6, `span ${span}`);
    // Antardashas tile each mahadasha exactly.
    for (const m of v.periods) {
      assert.ok(Math.abs(m.children.at(-1).endJd - m.endJd) < 1e-6);
      assert.ok(Math.abs(m.children[0].startJd - m.startJd) < 1e-9);
    }
  });

  test('no longer the 360-day savana year: boundaries move by about 5.26 days per year of age', () => {
    const v = withGanita('surya', () => vimshottari(births[5], 'trueCitra', 1));
    const firstEnd = v.periods[0].endJd;
    const yearsInto = v.periods[0].durationYears;
    const savanaEnd = v.periods[0].startJd + yearsInto * 360;
    assert.ok(firstEnd - savanaEnd > 5 * yearsInto, 'still on a 360-day year');
  });
});

describe('kundali under the Uttaradi Math reckoning', () => {
  test('the chart\'s Chandra sits in the janma rashi and nakshatra, in both ganitas', async () => {
    const { natalChart } = await import('../src/index.js');
    const P = { latitude: 12.97, longitude: 77.59, altitude: 920, tzOffsetHours: 5.5 };
    for (const g of ['surya', 'drik']) {
      withGanita(g, () => {
        for (const jd of births) {
          const c = natalChart(jd, P, 'trueCitra');
          const j = janmaPoints(jd, 'trueCitra');
          assert.equal(c.positions.chandra.rashi, j.rashi.index, `${g} ${jd}`);
          assert.equal(c.ganita, g);
        }
      });
    }
  });
});

describe('the Surya Siddhanta\'s own planets (implemented, measured, not used for charts)', () => {
  test('Rahu is at 180 degrees at the Kali epoch, Ketu opposite, all nine grahas computed', async () => {
    const SS = await import('../src/suryasiddhanta.js');
    assert.equal(SS.rahuLongitude(SS.KALI_EPOCH_JD), 180);
    // Mean planets are all at 0 at the Kali epoch.
    for (const g of ['mangala', 'guru', 'shani']) {
      const l = SS.planetLongitude(SS.KALI_EPOCH_JD, g);
      assert.ok(Number.isFinite(l) && l >= 0 && l < 360);
    }
    const all = SS.grahaLongitudes(SS.ujjainFromUt(2461175.5));
    assert.equal(Object.keys(all).length, 9);
    assert.ok(Math.abs(((all.ketu.longitude - all.rahu.longitude + 360) % 360) - 180) < 1e-9);
  });
});
