import { useMemo, useState } from 'react'
import type { Sample } from '../lib/analysis'
import type { Interval } from '../lib/physics/windows'
import { fmtHours, fmtTime } from '../lib/format'
import { HOUR, useStore } from '../lib/store'
import { runIntervals, signal } from '../lib/visibility'
import { useWidth } from './ui'

interface Props {
  a: Sample[]
  b: Sample[]
  t0: number
  t1: number
}

interface Lane {
  key: string
  label: string
  cls: string
  site: string
  state: string
  iv: Interval[]
}

/** Visibility timeline for Site A and Site B, with an optional "highlight differences" view. */
export default function CompareLanes({ a, b, t0, t1 }: Props) {
  const { s, set, site } = useStore()
  const [diff, setDiff] = useState(false)
  const [picked, setPicked] = useState<{ lane: Lane; iv: Interval } | null>(null)
  const [box, W] = useWidth<HTMLDivElement>()
  const nameA = site(s.siteA).name
  const nameB = site(s.siteB).name

  const lanes = useMemo<Lane[]>(() => {
    const n = Math.min(a.length, b.length)
    const t = (i: number) => a[i].t
    const v = (arr: Sample[], body: 'sun' | 'earth') => (i: number) => signal(arr[i], body, s.vis) > 0
    const runs = (pred: (i: number) => boolean) => runIntervals(n, t, HOUR, pred)
    const aS = v(a, 'sun')
    const aE = v(a, 'earth')
    const bS = v(b, 'sun')
    const bE = v(b, 'earth')
    if (diff)
      return [
        {
          key: 'ds-a',
          label: 'Sun: A only',
          cls: 'lane-a',
          site: `A (${nameA})`,
          state: 'Sun at A but not at B',
          iv: runs((i) => aS(i) && !bS(i)),
        },
        {
          key: 'ds-b',
          label: 'Sun: B only',
          cls: 'lane-b',
          site: `B (${nameB})`,
          state: 'Sun at B but not at A',
          iv: runs((i) => bS(i) && !aS(i)),
        },
        {
          key: 'de-a',
          label: 'Earth: A only',
          cls: 'lane-a',
          site: `A (${nameA})`,
          state: 'Earth link at A but not at B',
          iv: runs((i) => aE(i) && !bE(i)),
        },
        {
          key: 'de-b',
          label: 'Earth: B only',
          cls: 'lane-b',
          site: `B (${nameB})`,
          state: 'Earth link at B but not at A',
          iv: runs((i) => bE(i) && !aE(i)),
        },
      ]
    const mk = (slot: 'A' | 'B', S: (i: number) => boolean, E: (i: number) => boolean, name: string): Lane[] => [
      { key: `${slot}s`, label: `${slot}: Sun`, cls: 'lane-sun', site: `${slot} (${name})`, state: 'Sun visible', iv: runs(S) },
      { key: `${slot}e`, label: `${slot}: Earth`, cls: 'lane-earth', site: `${slot} (${name})`, state: 'Earth visible', iv: runs(E) },
      {
        key: `${slot}b`,
        label: `${slot}: both`,
        cls: 'lane-both',
        site: `${slot} (${name})`,
        state: 'Sun and Earth both visible',
        iv: runs((i) => S(i) && E(i)),
      },
      {
        key: `${slot}n`,
        label: `${slot}: neither`,
        cls: 'lane-none',
        site: `${slot} (${name})`,
        state: 'Neither visible',
        iv: runs((i) => !S(i) && !E(i)),
      },
    ]
    return [...mk('A', aS, aE, nameA), ...mk('B', bS, bE, nameB)]
  }, [a, b, s.vis, diff, nameA, nameB])

  const L = W < 560 ? 86 : 104
  const R = 10
  const laneH = 14
  const gap = 6
  const H = lanes.length * (laneH + gap) + 28
  const pw = W - L - R
  const x = (t: number) => L + ((t - t0) / (t1 - t0)) * pw
  const days = (t1 - t0) / 86_400_000
  const every = [1, 2, 3, 7, 14].find((d) => (d / days) * pw >= 50) ?? 14
  const ticks: number[] = []
  if (days > 1.01) for (let t = Math.ceil(t0 / 86_400_000) * 86_400_000; t <= t1; t += every * 86_400_000) ticks.push(t)

  return (
    <figure className="chart-frame" aria-labelledby="lanes-h">
      <div className="chart-head">
        <h3 id="lanes-h" className="chart-title">
          Visibility timeline
        </h3>
        <label className="toggle">
          <input type="checkbox" checked={diff} onChange={(e) => setDiff(e.target.checked)} /> Highlight differences
        </label>
      </div>
      <div ref={box} className="chart-box">
        <svg
          width={W}
          height={H}
          viewBox={`0 0 ${W} ${H}`}
          role="img"
          aria-label={lanes.map((l) => `${l.label}: ${l.iv.length} periods`).join('; ')}
        >
          {lanes.map((l, k) => {
            const yy = 4 + k * (laneH + gap)
            return (
              <g key={l.key}>
                <text x={L - 8} y={yy + laneH - 3} textAnchor="end" className="tick">
                  {l.label}
                </text>
                <rect x={L} y={yy} width={pw} height={laneH} rx={3} className="lane-bg" />
                {l.iv.map((iv, j) => (
                  <rect
                    key={j}
                    x={x(iv.start)}
                    y={yy}
                    width={Math.max(2, x(iv.end) - x(iv.start))}
                    height={laneH}
                    rx={3}
                    className={`lane ${l.cls} ${picked?.iv === iv ? 'picked' : ''}`}
                    onClick={() => {
                      setPicked({ lane: l, iv })
                      set({ selectedTime: iv.start })
                    }}
                  >
                    <title>{`${l.site}: ${l.state}, ${fmtTime(iv.start, s.tz)} to ${fmtTime(iv.end, s.tz)} (${fmtHours(Math.round((iv.end - iv.start) / HOUR))})`}</title>
                  </rect>
                ))}
              </g>
            )
          })}
          {ticks.map((t) => (
            <text key={t} x={x(t)} y={H - 6} className="tick" textAnchor="middle">
              {fmtTime(t, s.tz, false).slice(5)}
            </text>
          ))}
          <line x1={x(s.selectedTime)} x2={x(s.selectedTime)} y1={0} y2={H - 18} className="cursor" />
        </svg>
      </div>
      <figcaption>
        {picked ? (
          <span className="num">
            <b>{picked.lane.state}</b> at Site {picked.lane.site}: {fmtTime(picked.iv.start, s.tz)} to {fmtTime(picked.iv.end, s.tz)},{' '}
            {fmtHours(Math.round((picked.iv.end - picked.iv.start) / HOUR))}. The selected time moved to its start.
          </span>
        ) : (
          'Hover a bar for its start, end and duration; select it to move the selected time there. Each bar is made of whole hourly samples.'
        )}
      </figcaption>
    </figure>
  )
}
