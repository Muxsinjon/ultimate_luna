import { createContext, useContext } from 'react'
import type { TimeZoneMode } from './format'

export type Mode = 'planner' | 'explore'

export interface Prefs {
  mode: Mode
  tz: TimeZoneMode
}

export const PrefsContext = createContext<Prefs>({ mode: 'planner', tz: 'utc' })
export const usePrefs = () => useContext(PrefsContext)

/** localStorage wrappers that never throw (private mode, blocked storage, previews). */
export function storageGet(key: string): string | null {
  try {
    return window.localStorage.getItem(key)
  } catch {
    return null
  }
}
export function storageSet(key: string, value: string) {
  try {
    window.localStorage.setItem(key, value)
  } catch {
    /* ignore */
  }
}
