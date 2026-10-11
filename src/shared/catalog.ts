// catalog.json schema, written by the storage bot and read by the market plugin.
// Files live in the same channel; a version points at its file message by id.

export interface CatalogVersion {
  version: string
  /** id of the channel message holding the `.inu.js` file */
  msgId: number
  /** unix seconds */
  date: number
  changelog?: string
  /** informational, taken from the file header when it parsed; the app shows the real grants on install */
  grants?: string[]
}

export interface CatalogPlugin {
  /** manifest id of the plugin */
  id: string
  name: string
  author: string
  description: string | Record<string, string>
  /** same format as the manifest `icon` (`inu://`, `tg://emoji`, `tg://addstickers`) */
  icon?: string
  /** https link to the source repository (GitHub, GitLab, ...); required by the bot */
  repo: string
  /** ids of photo messages in the channel, shown as screenshots (up to 8) */
  screenshots?: number[]
  /** installs made through the market */
  installs: number
  versions: CatalogVersion[]
}

export interface Catalog {
  schema: 1
  /** unix seconds */
  updatedAt: number
  plugins: CatalogPlugin[]
}

export function localized(text: string | Record<string, string>, lang: string): string {
  if (typeof text === 'string') return text
  return text[lang] ?? text.en ?? Object.values(text)[0] ?? ''
}

export function latest(plugin: CatalogPlugin): CatalogVersion | undefined {
  return plugin.versions.reduce<CatalogVersion | undefined>((a, v) => (!a || v.date > a.date ? v : a), undefined)
}

export type SortMode = 'popular' | 'updated' | 'new' | 'name'

export const SORT_MODES: readonly SortMode[] = ['popular', 'updated', 'new', 'name']

function firstDate(plugin: CatalogPlugin): number {
  return plugin.versions.reduce((a, v) => Math.min(a, v.date), Infinity)
}

export function sortPlugins(plugins: CatalogPlugin[], mode: SortMode): CatalogPlugin[] {
  const key: Record<SortMode, (a: CatalogPlugin, b: CatalogPlugin) => number> = {
    popular: (a, b) => b.installs - a.installs,
    updated: (a, b) => (latest(b)?.date ?? 0) - (latest(a)?.date ?? 0),
    new: (a, b) => firstDate(b) - firstDate(a),
    name: (a, b) => a.name.localeCompare(b.name),
  }
  // ties fall back to popularity, then name, so the order is stable
  return [...plugins].sort((a, b) => key[mode](a, b) || b.installs - a.installs || a.name.localeCompare(b.name))
}

/** only plain https links are opened from the market */
export function safeRepoUrl(repo: string | undefined): string | null {
  if (!repo) return null
  try {
    const url = new URL(repo)
    return url.protocol === 'https:' ? url.href : null
  } catch {
    return null
  }
}
