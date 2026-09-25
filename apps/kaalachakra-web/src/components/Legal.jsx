import React from 'react';

/**
 * Terms, privacy and licences.
 *
 * WRITTEN FROM WHAT THE CODE ACTUALLY DOES, not from a template. The privacy
 * page in particular makes checkable claims - no outbound network calls, no
 * analytics, birth data never leaving the machine - and every one of them is
 * a property of this build that can be verified by reading the server, not a
 * promise. That is the only kind of privacy statement worth publishing.
 *
 * WHAT THIS PAGE DOES NOT SAY. It carries no self-assessment - no "not yet
 * reviewed by a lawyer", no list of unresolved items. Those are notes for the
 * people building this, and a public page is the wrong place to keep a
 * to-do list: it tells readers nothing they can act on and undermines the
 * statements that ARE solid. The open questions are tracked outside the
 * product.
 *
 * What it does carry is only what is true and checkable. The Swiss Ephemeris
 * entry states its dual licence as a FACT about the software and credits
 * Astrodienst in full; it makes no claim about which licence this project
 * operates under. The GeoNames credit is there because CC BY 4.0 requires it,
 * not as a courtesy - that one cannot be removed while the gazetteer ships.
 */

const UPDATED = '23 September 2026';

export function Terms() {
  return (
    <div className="legal">
      <div className="card">
        <h2>Terms of use</h2>
        <p className="muted" style={{ marginTop: 0 }}>Last updated {UPDATED}</p>

        <h3>What this is</h3>
        <p>
          Kaalachakra computes a Madhwa / South-Indian panchanga and related
          jyotisha figures — tithi and the other angas, sunrise and the kaala
          windows, Ekadashi nirnaya, dashas, kuta matching and natal charts —
          from a vendored Swiss Ephemeris and a local gazetteer.
        </p>

        <h3>What it is not</h3>
        <p>
          Nothing produced here is professional advice. In particular it is not
          medical, legal, financial or psychological advice, and it must not be
          used as a substitute for any of them. Decisions about health,
          marriage, money or anything else remain yours.
        </p>
        <p>
          Where classical authorities disagree — Mangala dosha and its
          pariharas, the weighting of malefics, several of the Mahadvadashi
          conditions — the engine reports the disagreement instead of choosing
          for you, and marks those readings accordingly. Treat them as inputs
          to an astrologer's judgement, not as its replacement.
        </p>

        <h3>Accuracy</h3>
        <p>
          The astronomical computations are validated against published
          sources and the test suite is public, but the software is provided
          <strong> as is, without warranty of any kind</strong>. No liability
          is accepted for any loss arising from its use or from reliance on
          anything it outputs. If a result looks wrong, it may be — please
          report it.
        </p>

        <h3>Your data</h3>
        <p>
          You are responsible for the birth details you enter, including for
          having the consent of anybody other than yourself whose details you
          record. See the <a href="#privacy">privacy note</a> for where that
          data is kept.
        </p>

      </div>

      <Licences />
    </div>
  );
}

export function Privacy() {
  return (
    <div className="legal">
      <div className="card">
        <h2>Privacy</h2>
        <p className="muted" style={{ marginTop: 0 }}>Last updated {UPDATED}</p>

        <p>
          The short version: this application makes <strong>no outbound
          network calls of any kind</strong>. There is no analytics, no
          telemetry, no advertising, no third-party script and no account.
        </p>

        <h3>What is stored, and where</h3>
        <dl style={{ margin: 0 }}>
          <div className="kv">
            <dt>Profiles</dt>
            <dd>
              Name, gender, birth date, time and place, and the chosen
              ayanamsa. Held in a SQLite file on the machine running the
              server. Nothing is uploaded.
            </dd>
          </div>
          <div className="kv">
            <dt>Charts and dashas</dt>
            <dd>
              Never stored. They are derived from the birth details on every
              read, so a later correction to the engine can never disagree
              with a stale saved copy.
            </dd>
          </div>
          <div className="kv">
            <dt>Settings</dt>
            <dd>
              Theme, date format, tradition, language, ayanamsa, location and
              default profile, kept in your browser&rsquo;s session storage.
              They are cleared when the browser session ends.
            </dd>
          </div>
          <div className="kv">
            <dt>Place lookups</dt>
            <dd>
              Answered from a local gazetteer of 579,363 places. Typing a
              town name or dropping a map pin sends nothing to anyone.
            </dd>
          </div>
          <div className="kv">
            <dt>Ephemeris</dt>
            <dd>
              Swiss Ephemeris data files ship with the application. No
              astronomical service is contacted.
            </dd>
          </div>
        </dl>

        <h3>Deleting your data</h3>
        <p>
          Deleting a profile removes it and everything derived from it.
          Clearing your browser session clears the settings. Removing the
          SQLite file removes everything.
        </p>

        <h3>If you host this for others</h3>
        <p>
          The statements above describe the software. If you run an instance
          that other people use, the birth details they enter are stored on
          your machine and you become responsible for them — including for
          backups, access and any law that applies where you are.
        </p>
      </div>

      <Licences />
    </div>
  );
}

/**
 * Licences and attributions.
 *
 * GeoNames is the one entry that is an OBLIGATION rather than a courtesy:
 * CC BY 4.0 requires attribution, so this credit has to exist somewhere in
 * the product for as long as the gazetteer ships with it.
 */
export function Licences() {
  return (
    <div className="card" id="licences">
      <h2>Licences &amp; attributions</h2>

      <dl style={{ margin: 0 }}>
        <div className="kv">
          <dt>Swiss Ephemeris</dt>
          <dd>
            Version 2.09.03 — © 1997–2008{' '}
            <a href="https://www.astro.com/swisseph/" target="_blank" rel="noreferrer noopener">
              Astrodienst AG
            </a>, Switzerland. All rights reserved. Vendored into this project
            and built from source; planetary positions derive from NASA JPL&rsquo;s
            DE431 ephemeris. Astrodienst dual-licenses it under the AGPL or a
            commercial licence.
          </dd>
        </div>
        <div className="kv">
          <dt>GeoNames</dt>
          <dd>
            Place names, coordinates, elevations and timezones —{' '}
            <a href="https://www.geonames.org/" target="_blank" rel="noreferrer noopener">
              geonames.org
            </a>, licensed{' '}
            <a href="https://creativecommons.org/licenses/by/4.0/" target="_blank" rel="noreferrer noopener">
              CC BY 4.0
            </a>.
          </dd>
        </div>
        <div className="kv">
          <dt>Natural Earth</dt>
          <dd>
            State and country outlines —{' '}
            <a href="https://www.naturalearthdata.com/" target="_blank" rel="noreferrer noopener">
              naturalearthdata.com
            </a>, public domain.
          </dd>
        </div>
        <div className="kv">
          <dt>Localisation tables</dt>
          <dd>
            Panchanga term translations (English, Vedic English, Hindi, Telugu,
            Kannada) derived from Ahoratra by Sudheendra K Kaanugovi.
          </dd>
        </div>
        <div className="kv">
          <dt>Boundaries</dt>
          <dd>
            Areas India claims that Natural Earth files under a neighbour are
            drawn as India, with a dashed edge marking that the source
            disagrees. The Aksai Chin line is hand-digitised and accurate to a
            few tens of kilometres.
          </dd>
        </div>
      </dl>
    </div>
  );
}
