import type { AppData } from '../lib/data'
import { fmtLat, fmtLon, fmtTime } from '../lib/format'
import MissionCheck from './MissionCheck'

const LINKS = {
  horizons: 'https://ssd.jpl.nasa.gov/horizons/',
  lola: 'https://pds-geosciences.wustl.edu/missions/lro/lola.htm',
  lolaGdr: 'http://imbrium.mit.edu/DATA/LOLA_GDR/',
  pgda: 'https://pgda.gsfc.nasa.gov/products/69',
  quickmap: 'https://quickmap.lroc.asu.edu/',
  repoValidation: 'docs/VALIDATION.md',
}

export default function About({ data }: { data: AppData }) {
  const v = data.validation
  return (
    <article className="about prose" aria-labelledby="about-title">
      <h2 id="about-title">About LunaWindow: data and methodology</h2>
      <p className="lede">
        Every number in this tool comes from free NASA data and is checked against independent NASA references. Here is exactly how, and
        where it can be wrong.
      </p>

      <h3>How it works</h3>
      <ol>
        <li>
          <b>Where are the Sun and Earth?</b> We asked NASA/JPL Horizons (DE441) for the sub-solar and sub-Earth points on the Moon every
          hour from 2023 to 2031, in the Moon’s body-fixed frame (shipped every 6 h and interpolated back to hourly in the browser, adding
          no measurable error). From these the browser computes the Sun’s and Earth’s azimuth and elevation for any lunar coordinate,
          including libration (Earth’s monthly wobble in the lunar sky).
        </li>
        <li>
          <b>Where is the real horizon?</b> At the south pole the Sun skims the horizon, often less than 2° up, so a smooth-sphere horizon
          is misleading. We cast rays every 0.5° of azimuth out to {data.sites.maxDistanceKm} km over LRO LOLA laser-altimetry terrain, on a
          curved Moon, for an observer {data.sites.observerHeightM} m above the ground.
        </li>
        <li>
          <b>What does it mean for a mission?</b> Visibility is evaluated on hourly samples. From the resulting windows we derive the
          percentages, the longest darkness and blackout, interruptions, and the mission-window search.
        </li>
      </ol>

      <h3>Two visibility models (switch in the header)</h3>
      <table>
        <thead>
          <tr>
            <th scope="col">Model</th>
            <th scope="col">Sun or Earth counts as visible when…</th>
            <th scope="col">Use it for</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>Terrain-aware (default)</td>
            <td>the upper edge of its disc is above the LRO LOLA terrain horizon in that direction (240 m terrain for listed sites)</td>
            <td>realistic sunlight and line of sight at the south pole, where terrain decides</td>
          </tr>
          <tr>
            <td>Geometric 0°</td>
            <td>
              its centre is above the smooth geometric horizon (elevation above 0°). Local terrain obstruction is not included, and
              partially visible discs are not resolved
            </td>
            <td>the simplified reference model, comparable with standard ephemeris tools</td>
          </tr>
        </tbody>
      </table>
      <h3>Sampling and time resolution</h3>
      <p>
        Positions are evaluated every hour. Each sample covers the following hour (half-open intervals), so a duration is the number of
        qualifying samples × 1 h. Rise and set times are therefore reported as a one-hour window (“between 03:00 and 04:00 UTC”), never to
        the minute. All times are stored in UTC; the header can show local time instead.
      </p>

      <h3>Datasets</h3>
      <table>
        <thead>
          <tr>
            <th scope="col">Data</th>
            <th scope="col">Used for</th>
            <th scope="col">Provider</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>
              <a href={LINKS.horizons}>Horizons System API</a>, DE441
            </td>
            <td>Sun and Earth positions, hourly 2023–2031 (retrieved 2026-11-14)</td>
            <td>NASA JPL</td>
          </tr>
          <tr>
            <td>
              <a href={LINKS.lolaGdr}>LOLA gridded topography</a>: LDEM_75S_240M, LDEM_16
            </td>
            <td>Terrain horizons; the polar map hillshade</td>
            <td>NASA LRO / LOLA team, via the PDS</td>
          </tr>
          <tr>
            <td>
              <a href={LINKS.pgda}>Lunar polar illumination maps</a> (AVGVISIB, 120 m)
            </td>
            <td>Map overlays; validation of our sunlight and Earth-visibility percentages</td>
            <td>NASA GSFC PGDA (Mazarico et al. 2011, Icarus 211)</td>
          </tr>
          <tr>
            <td>Landing-site coordinates</td>
            <td>The curated site list (each site shows its source)</td>
            <td>LROC, NASA Apollo records, Artemis III site studies, ISRO, JAXA</td>
          </tr>
        </tbody>
      </table>

      <h3>Validation</h3>
      <p>
        <b>Positions.</b> Our Sun and Earth elevations match JPL Horizons’ own topocentric values to within{' '}
        <b className="num">{v.worstElevationErrorDeg.toFixed(4)}°</b> over {v.period}, across five sites. For scale, the Sun’s disc is 0.53°
        wide.
      </p>
      {v.illumination && (
        <>
          <p>
            <b>Sunlight and Earth visibility.</b> These are compared with the LOLA team’s long-term maps. {v.illumination.note}.
          </p>
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th scope="col">Site</th>
                  <th scope="col">Sunlit, ours</th>
                  <th scope="col">Sunlit, LOLA team</th>
                  <th scope="col">Earth visible, ours</th>
                  <th scope="col">Earth visible, LOLA team</th>
                </tr>
              </thead>
              <tbody>
                {v.illumination.sites.map((s) => (
                  <tr key={s.site}>
                    <td>{s.site}</td>
                    <td className="num">{s.oursSunPct} %</td>
                    <td className="num">{s.pgdaSunPct} %</td>
                    <td className="num">{s.oursEarthPct} %</td>
                    <td className="num">{s.pgdaEarthPct} %</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
      <MissionCheck v={v} />

      <h3>Supported sites and dates</h3>
      <p>
        Dates: {fmtTime(data.eph.meta.startMs, 'utc', false)} to {fmtTime(data.eph.endMs, 'utc', false)} (UTC). Dates outside this range are
        adjusted with an explanation. Custom coordinates are supported with coarser in-browser terrain.
      </p>
      <div className="table-scroll">
        <table>
          <thead>
            <tr>
              <th scope="col">Site</th>
              <th scope="col">Latitude</th>
              <th scope="col">Longitude</th>
              <th scope="col">Source</th>
            </tr>
          </thead>
          <tbody>
            {data.sites.sites.map((x) => (
              <tr key={x.id}>
                <td>
                  {x.name}
                  {x.verify ? ' (needs verification)' : ''}
                </td>
                <td className="num">{fmtLat(x.lat)}</td>
                <td className="num">{fmtLon(x.lon)}</td>
                <td>{x.source}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <h3>Assumptions</h3>
      <ul>
        <li>The Moon is a sphere of radius 1737.4 km, carrying LOLA terrain. There is no atmosphere, so no refraction.</li>
        <li>The observer is 2 m above the ground (a lander’s solar panels and antenna).</li>
        <li>
          The Sun or Earth counts as visible while any part of its disc clears the terrain. Visible % is the disc area above the horizon.
        </li>
        <li>Power assumes a vertical, sun-tracking panel with 30 % efficient cells. There is no thermal, dust or degradation model.</li>
        <li>An “Earth link” means Earth is above the terrain. A ground station on Earth must also see the Moon at the same time.</li>
      </ul>

      <h3>Limitations and known uncertainty</h3>
      <p>Geometric or terrain-aware visibility does not by itself establish:</p>
      <ul>
        <li>guaranteed solar-panel power generation or sufficient battery capacity;</li>
        <li>successful radio communication (a ground station must also see the Moon, with link margin);</li>
        <li>safe landing conditions, slope or surface stability;</li>
        <li>thermal survivability or radiation protection;</li>
        <li>access to lunar water ice.</li>
      </ul>
      <ul>
        <li>
          Terrain resolution is 240 m for curated polar sites, 960 m for custom polar points and about 7.6 km elsewhere. Nearby slopes and
          boulders are not resolved, so the horizon can be off by a few tenths of a degree. Near the pole that shifts sunrise or sunset by
          roughly 1–3 hours.
        </li>
        <li>
          The ephemeris covers 2023-01-01 00:00 to 2031-12-31 18:00 UTC at 1-hour steps (the last shipped 6-hourly row). Times outside are
          never extrapolated. Sun directions agree with JPL Horizons within 0.001° and Earth directions within 0.006°.
        </li>
        <li>
          Hourly sampling, checked against 10-minute sampling at all nine polar sites over 2023–2031: the share of time with sunlight or
          Earth in view changes by at most 0.01 percentage points. Over those nine years it misses 13 brief sunlight changes (none longer
          than 50 minutes) and one 30-minute Earth change, and every other rise or set falls within its reported one-hour window.
        </li>
        <li>
          “Sun visible” means any part of the disc clears the terrain. The comparison table also reports the full disc, partial disc only,
          and disc-weighted sunlight, so partial sunlight is never counted as full power.
        </li>
        <li>
          On the 5 m terrain sites, the sunlight and Earth line-of-sight layers are computed for the selected time every 80 m. Compared with
          a native 5 m reference, horizon errors are 0.01–0.04° median and about 0.7° at the 95th percentile inside the inner 6 × 6 km; the
          1 km band at each crop edge is illustrative. The permanently shadowed region map (NASA PGDA, 20 m) is static context.
        </li>
        <li>Earth line of sight is geometric. It is not a radio link budget and does not guarantee communication.</li>
        <li>Coordinates marked “Needs verification” still need a primary-source check.</li>
      </ul>
      <p className="muted">The full tables are in the repository at {LINKS.repoValidation}.</p>
    </article>
  )
}
