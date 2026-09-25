import React, { useEffect, useRef, useState } from 'react';

/**
 * Live clock, second resolution.
 *
 * ACCURACY: the tick is scheduled to land on the next real second boundary
 * (1000 - now.getMilliseconds()) and is re-derived from the wall clock after
 * every fire, so it cannot accumulate drift. A plain setInterval(fn, 1000)
 * would drift - timers fire late under load, and each late fire shifts every
 * subsequent one - which shows up as the display skipping or repeating a
 * second over a long session.
 *
 * Deliberately NOT requestAnimationFrame: that runs ~60x a second to update a
 * field that changes once a second, and its frames do not align to the second
 * boundary, so the displayed second can lag by up to a frame.
 *
 * The digits use tabular figures so a centred clock does not shift sideways
 * as the numbers change.
 */
export default function Clock() {
  const [now, setNow] = useState(() => new Date());
  const timer = useRef(0);

  useEffect(() => {
    let cancelled = false;

    const schedule = () => {
      const d = new Date();
      if (!cancelled) setNow(d);
      // Aim just past the boundary so rounding never lands us a millisecond
      // early and repeats the same second.
      const delay = 1000 - d.getMilliseconds() + 5;
      timer.current = setTimeout(schedule, delay);
    };

    schedule();
    return () => { cancelled = true; clearTimeout(timer.current); };
  }, []);

  const p = (n) => String(n).padStart(2, '0');
  const time = `${p(now.getHours())}:${p(now.getMinutes())}:${p(now.getSeconds())}`;

  const zone = new Intl.DateTimeFormat(undefined, { timeZoneName: 'short' })
    .formatToParts(now).find((x) => x.type === 'timeZoneName')?.value ?? '';

  const date = new Intl.DateTimeFormat(undefined, {
    weekday: 'short', day: '2-digit', month: 'short', year: 'numeric',
  }).format(now);

  return (
    <div className="clock" aria-live="off">
      <div className="clock-time">{time}</div>
      <div className="clock-date">{date} · {zone}</div>
    </div>
  );
}
