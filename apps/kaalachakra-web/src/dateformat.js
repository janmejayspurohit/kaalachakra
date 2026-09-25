/**
 * Date formatting - the patterns the app can display a date in.
 *
 * Kept apart from the settings PROVIDER, which is JSX, so this can be tested
 * directly under node. The weekday patterns do real calendar arithmetic and
 * an off-by-one there is invisible on inspection: "Tue, 23 Sep 2026" looks
 * exactly as plausible as "Wed, 23 Sep 2026". That is not something to verify
 * by reading.
 */
const FORMAT_IDS = [
  // Day first - the Indian and most-of-the-world convention.
  { id: 'dd-mm-yyyy', label: 'dd-mm-yyyy' },
  { id: 'dd/mm/yyyy', label: 'dd/mm/yyyy' },
  { id: 'dd.mm.yyyy', label: 'dd.mm.yyyy' },
  { id: 'd mmm yyyy', label: 'd mmm yyyy' },
  { id: 'dd mmm yyyy', label: 'dd mmm yyyy' },
  { id: 'dd mmmm yyyy', label: 'dd mmmm yyyy' },
  { id: 'ddd, dd mmm yyyy', label: 'ddd, dd mmm yyyy' },
  { id: 'dddd, dd mmmm yyyy', label: 'dddd, dd mmmm yyyy' },
  // Month first - the US convention. `mm/dd/yyyy` is included because it is
  // what a US reader will assume they are looking at ANYWAY; offering it
  // explicitly is safer than leaving them to misread `09/10` as 9 October.
  { id: 'mm/dd/yyyy', label: 'mm/dd/yyyy' },
  { id: 'mmm dd, yyyy', label: 'mmm dd, yyyy' },
  { id: 'mmmm dd, yyyy', label: 'mmmm dd, yyyy' },
  // Year first - sortable.
  { id: 'yyyy-mm-dd', label: 'yyyy-mm-dd (ISO)' },
  { id: 'yyyy/mm/dd', label: 'yyyy/mm/dd' },
];

/**
 * The date the menu's examples are rendered from.
 *
 * 3 September, chosen so that EVERY pattern in the list renders differently -
 * which is the only way a menu of examples helps anyone choose. Two
 * constraints pull against each other:
 *   - `dd/mm` and `mm/dd` must look different, so day and month must differ;
 *   - `d mmm` and `dd mmm` differ only in the zero pad, so the day must be a
 *     single digit.
 * 03/09 versus 09/03 satisfies both. A sample with a two-digit day showed
 * "23 Sep 2026" for both padded and unpadded, offering the reader the same
 * string twice under two names; a sample like 01-02-2026 would collapse the
 * day-first and month-first rows instead. A test asserts all thirteen remain
 * distinct, so this cannot quietly regress when a pattern is added.
 */
const FORMAT_SAMPLE = '2026-09-03';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const MONTHS_FULL = ['January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'];
const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const DAYS_FULL = ['Sunday', 'Monday', 'Tuesday', 'Wednesday',
  'Thursday', 'Friday', 'Saturday'];

/**
 * Day of the week for a proleptic Gregorian y/m/d.
 *
 * Built with setUTCFullYear rather than `new Date(Date.UTC(y, ...))` because
 * that constructor maps years 0-99 onto 1900-1999. This app's range starts at
 * 1900, but the ephemeris routes accept back to 1200 and a weekday that is
 * silently right-for-the-wrong-century is worse than one that throws.
 */
function weekdayIndex(y, m, d) {
  const dt = new Date(Date.UTC(2000, m - 1, d));
  dt.setUTCFullYear(y);
  return dt.getUTCDay();
}

/**
 * Format a date for display.
 *
 * Accepts an ISO `YYYY-MM-DD` string (what every API route returns) or a Date.
 * Returns '—' for null rather than throwing or printing "Invalid Date", since
 * several fields are legitimately absent (moonrise at high latitude, an
 * aradhana that falls outside the year).
 */
export function formatDate(value, format = 'dd-mm-yyyy') {
  if (value === null || value === undefined || value === '') return '—';

  let y, m, d;
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) return '—';
    y = value.getFullYear(); m = value.getMonth() + 1; d = value.getDate();
  } else {
    const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(value));
    if (!match) return String(value);
    y = Number(match[1]); m = Number(match[2]); d = Number(match[3]);
  }

  const p = (n) => String(n).padStart(2, '0');
  switch (format) {
    case 'dd/mm/yyyy': return `${p(d)}/${p(m)}/${y}`;
    case 'dd.mm.yyyy': return `${p(d)}.${p(m)}.${y}`;
    case 'd mmm yyyy': return `${d} ${MONTHS[m - 1]} ${y}`;
    case 'dd mmm yyyy': return `${p(d)} ${MONTHS[m - 1]} ${y}`;
    case 'dd mmmm yyyy': return `${p(d)} ${MONTHS_FULL[m - 1]} ${y}`;
    case 'ddd, dd mmm yyyy':
      return `${DAYS[weekdayIndex(y, m, d)]}, ${p(d)} ${MONTHS[m - 1]} ${y}`;
    case 'dddd, dd mmmm yyyy':
      return `${DAYS_FULL[weekdayIndex(y, m, d)]}, ${p(d)} ${MONTHS_FULL[m - 1]} ${y}`;
    case 'mm/dd/yyyy': return `${p(m)}/${p(d)}/${y}`;
    case 'mmm dd, yyyy': return `${MONTHS[m - 1]} ${p(d)}, ${y}`;
    case 'mmmm dd, yyyy': return `${MONTHS_FULL[m - 1]} ${p(d)}, ${y}`;
    case 'yyyy-mm-dd': return `${y}-${p(m)}-${p(d)}`;
    case 'yyyy/mm/dd': return `${y}/${p(m)}/${p(d)}`;
    case 'dd-mm-yyyy':
    default: return `${p(d)}-${p(m)}-${y}`;
  }
}

/**
 * The format menu, with each row's example rendered by the formatter itself.
 *
 * Defined here, at the foot of the file, because it calls `formatDate` - a
 * function declaration, so it is hoisted, but keeping the call below the
 * definition means the dependency is visible rather than implied.
 */
export const DATE_FORMATS = FORMAT_IDS.map((f) => ({
  ...f,
  example: formatDate(FORMAT_SAMPLE, f.id),
}));
