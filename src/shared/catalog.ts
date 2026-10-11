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
