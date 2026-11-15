import type { WindowSummary } from '../lib/analysis'
import { fmtHours, fmtPct } from '../lib/format'
import { INFO } from '../lib/glossary'
import { HOUR } from '../lib/store'
import { MODEL_LABEL } from '../lib/visibility'
import { InfoTip } from './ui'

interface Row {
  label: string
  info?: keyof typeof INFO
  a: number
  b: number
  fmt: (v: number) => string
  /** true = higher is better, false = lower is better, null = no "better" judgement */
  better: boolean | null
  /** phrase for trade-off text, e.g. "more sunlight" */
  phrase?: string
}

const h = (ms: number) => Math.round(ms / HOUR)

export function compareRows(A: WindowSummary, B: WindowSummary): Row[] {
  // full / partial / disc-weighted sunlight exist only in the terrain model (the geometric model does not resolve partial discs)
  const disc: Row[] =
    A.sunFullPct !== null && B.sunFullPct !== null && A.sunPartialPct !== null && B.sunPartialPct !== null
      ? [
          {
            label: 'Full Sun disc visible',
            a: A.sunFullPct,
            b: B.sunFullPct,
            fmt: fmtPct,
            better: true,
            phrase: 'more full-disc sunlight',
          },
          { label: 'Only part of the Sun visible', a: A.sunPartialPct, b: B.sunPartialPct, fmt: fmtPct, better: null },
          {
            label: 'Sunlight, disc-weighted',
            a: A.sunDiscWeightedPct ?? 0,
            b: B.sunDiscWeightedPct ?? 0,
            fmt: fmtPct,
            better: null,
          },
        ]
      : []
  return [
    {
      label: 'Sun visible (any part of the disc)',
      info: 'sun',
      a: A.sunPct,
      b: B.sunPct,
      fmt: fmtPct,
      better: true,
      phrase: 'more sunlight',
    },
    ...disc,
    { label: 'Earth visible', info: 'earth', a: A.earthPct, b: B.earthPct, fmt: fmtPct, better: true, phrase: 'more Earth visibility' },
    { label: 'Sun and Earth together', info: 'ops', a: A.bothPct, b: B.bothPct, fmt: fmtPct, better: true, phrase: 'more time with both' },
    { label: 'Only the Sun', a: A.sunOnlyPct, b: B.sunOnlyPct, fmt: fmtPct, better: null },
    { label: 'Only Earth', a: A.earthOnlyPct, b: B.earthOnlyPct, fmt: fmtPct, better: null },
    { label: 'Neither', a: A.neitherPct, b: B.neitherPct, fmt: fmtPct, better: false, phrase: 'less time with neither' },
    {
      label: 'Longest darkness',
      info: 'dark',
      a: h(A.longestDarkMs),
      b: h(B.longestDarkMs),
      fmt: fmtHours,
      better: false,
      phrase: 'a shorter longest darkness',
    },
    {
      label: 'Longest communication blackout',
      info: 'noLink',
      a: h(A.longestNoLinkMs),
      b: h(B.longestNoLinkMs),
      fmt: fmtHours,
      better: false,
      phrase: 'a shorter longest blackout',
    },
    {
      label: 'Communication interruptions',
      a: A.linkInterruptions,
      b: B.linkInterruptions,
      fmt: (v) => String(v),
      better: false,
      phrase: 'fewer link interruptions',
    },
    {
      label: 'Longest continuous sunlight',
      a: h(A.longestSunMs),
      b: h(B.longestSunMs),
      fmt: fmtHours,
      better: true,
      phrase: 'a longer sunlit stretch',
    },
    {
      label: 'Longest continuous Earth view',
      a: h(A.longestEarthMs),
      b: h(B.longestEarthMs),
      fmt: fmtHours,
      better: true,
      phrase: 'a longer Earth-link stretch',
    },
  ]
}

/** Trade-off sentences built only from the computed rows (no claim of a universally better site). */
export function tradeOffs(rows: Row[], nameA: string, nameB: string): string[] {
  const winsA: string[] = []
  const winsB: string[] = []
  for (const r of rows) {
    if (r.better === null || !r.phrase || r.a === r.b) continue
    const aBetter = r.better ? r.a > r.b : r.a < r.b
    ;(aBetter ? winsA : winsB).push(r.phrase)
  }
  const list = (x: string[]) => (x.length <= 2 ? x.join(' and ') : `${x.slice(0, -1).join(', ')} and ${x.at(-1)}`)
  if (!winsA.length && !winsB.length) return ['Both sites score the same on every metric for this period.']
  if (!winsA.length) return [`For this period, ${nameB} is as good or better on every metric: ${list(winsB)}. Other dates may differ.`]
  if (!winsB.length) return [`For this period, ${nameA} is as good or better on every metric: ${list(winsA)}. Other dates may differ.`]
  return [
    `Trade-off: ${nameA} offers ${list(winsA)}.`,
    `${nameB} offers ${list(winsB)}.`,
    'Which matters more depends on the mission: power (sunlight and darkness) or communication (Earth view and blackouts).',
  ]
}

export default function CompareTable({ A, B, nameA, nameB }: { A: WindowSummary; B: WindowSummary; nameA: string; nameB: string }) {
  const rows = compareRows(A, B)
  return (
    <section className="chart-frame" aria-labelledby="cmp-table-h">
      <div className="chart-head">
        <h3 id="cmp-table-h" className="chart-title">
          Site comparison over the mission
        </h3>
        <span className="model-label">{MODEL_LABEL[A.model]}</span>
      </div>
      <div className="table-scroll">
        <table className="cmp-table">
          <thead>
            <tr>
              <th scope="col">Metric</th>
              <th scope="col">
                <span className="site-tag tag-a">A</span> {nameA}
              </th>
              <th scope="col">
                <span className="site-tag tag-b">B</span> {nameB}
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const winA = r.better !== null && r.a !== r.b && (r.better ? r.a > r.b : r.a < r.b)
              const winB = r.better !== null && r.a !== r.b && !winA
              return (
                <tr key={r.label}>
                  <th scope="row">
                    {r.label} {r.info && <InfoTip info={INFO[r.info]} label={r.label} />}
                  </th>
                  <td className={`num ${winA ? 'win' : ''}`}>
                    {r.fmt(r.a)} {winA && <span aria-label="better">▲</span>}
                  </td>
                  <td className={`num ${winB ? 'win' : ''}`}>
                    {r.fmt(r.b)} {winB && <span aria-label="better">▲</span>}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
      <div className="tradeoffs">
        {tradeOffs(rows, nameA, nameB).map((t) => (
          <p key={t}>{t}</p>
        ))}
      </div>
      <p className="hint">▲ marks the better value where a comparison makes sense. Durations are counted in whole hourly samples.</p>
    </section>
  )
}
