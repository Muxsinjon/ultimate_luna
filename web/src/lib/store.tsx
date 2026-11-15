import { createContext, useContext } from 'react'
import type { AppData, Site } from './data'
import type { MissionState } from './state'
import type { Theme } from './theme'

export interface Store {
  data: AppData
  sites: Site[]
  s: MissionState
  set: (patch: Partial<MissionState>) => void
  site: (id: string) => Site
  addCustom: (lat: number, lon: number, slot: 'A' | 'B') => Promise<void>
  customBusy: boolean
  theme: Theme
  setTheme: (t: Theme) => void
  /** explanation shown when a date had to be adjusted to the supported range */
  notice: string | null
  setNotice: (n: string | null) => void
  /** bump to ask the Mission Window Finder to (re)run its search */
  finderRun: number
  runFinder: () => void
  openSummary: (ctx: SummaryContext) => void
  startDemo: () => void
}

export type SummaryContext = { kind: 'compare' } | { kind: 'candidate'; siteId: string; startMs: number }

export const StoreContext = createContext<Store | null>(null)

export function useStore(): Store {
  const s = useContext(StoreContext)
  if (!s) throw new Error('useStore outside StoreContext')
  return s
}

export const HOUR = 3_600_000
export const DAY = 24 * HOUR
export const missionEnd = (s: MissionState) => s.missionStart + s.durationDays * DAY
