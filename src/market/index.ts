import type { Catalog, CatalogPlugin, CatalogVersion } from '../shared/catalog.js'
import { latest, localized } from '../shared/catalog.js'

// public channel with the catalog (pinned `catalog.json`) and the plugin files
const CHANNEL = 'frinumarket'
const CACHE_KEY = 'catalog'

let catalog: Catalog | null = readCache()
let loading = false
let error: string | null = null

function readCache(): Catalog | null {
  try {
    const raw = localStorage.getItem(CACHE_KEY)
    return raw ? JSON.parse(raw) as Catalog : null
  } catch {
    return null
  }
}

async function loadCatalog(account = inu.account()): Promise<Catalog> {
  const peer = await account.resolvePeer(CHANNEL)
  const res = await account.invokeRpc({
    _: 'messages.search',
    peer,
    q: '',
    filter: { _: 'inputMessagesFilterPinned' },
    min_date: 0,
    max_date: 0,
    offset_id: 0,
    add_offset: 0,
    limit: 1,
    max_id: 0,
    min_id: 0,
    hash: '0',
  })
  const raw = res && 'messages' in res ? res.messages?.[0] : undefined
  if (!raw) throw new Error('catalog is not pinned')
  const file = await account.downloadMedia(new inu.Message(raw))
  const data = JSON.parse(await file.text()) as Catalog
  if (data.schema !== 1) throw new Error('unsupported catalog schema')
  return data
}

function refresh(): void {
  if (loading) return
  loading = true
  error = null
  loadCatalog()
    .then((c) => {
      catalog = c
      localStorage.setItem(CACHE_KEY, JSON.stringify(c))
    })
    .catch((e) => { error = String(e?.message ?? e) })
    .finally(() => {
      loading = false
      listPage.invalidate()
    })
}

// the stock installer opens when the user taps a `.inu.js` document in a chat,
// so show the real file message and let the app handle the tap
async function install(plugin: CatalogPlugin, version: CatalogVersion): Promise<void> {
  const account = inu.account()
  const peer = await account.resolvePeer(CHANNEL)
  const message = await account.getMessages(peer, version.msgId)
  if (!message) {
    inu.ui.toast('File not found')
    return
  }
  inu.ui.openChatHistory({
    title: `${plugin.name} ${version.version}`,
    subtitle: 'Tap the file to install',
    load: (cursor) => cursor === null ? { entries: [{ message: message.raw }] } : { entries: [] },
  })
}

const lang = () => inu.info().language

function iconOf(plugin: CatalogPlugin): ReturnType<typeof inu.icons.common> {
  return inu.icons.common('bot')
}

function detailPage(plugin: CatalogPlugin): ReturnType<typeof inu.ui.settingsPage> {
  const page = inu.ui.settingsPage({
    title: plugin.name,
    items: () => [
      inu.ui.header(`${plugin.author} · ${plugin.installs} installs`),
      inu.ui.separator(localized(plugin.description, lang())),
      inu.ui.header('Versions'),
      ...[...plugin.versions].sort((a, b) => b.date - a.date).map(v => inu.ui.button({
        id: `v:${v.version}`,
        text: v.version,
        subtitle: v.changelog,
        value: inu.utils.formatDate(v.date * 1000),
        onClick: () => { install(plugin, v).catch(e => inu.ui.toast(String(e?.message ?? e))) },
      })),
    ],
  })
  return page
}

const listPage = inu.ui.settingsPage({
  title: 'Plugin market',
  items: () => [
    ...(error ? [inu.ui.separator(`Error: ${error}`)] : []),
    ...(loading && !catalog ? [inu.ui.separator('Loading…')] : []),
    ...(catalog?.plugins ?? []).map((p) => {
      const v = latest(p)
      return inu.ui.button({
        id: p.id,
        text: p.name,
        subtitle: localized(p.description, lang()),
        icon: iconOf(p),
        value: v?.version,
        onClick: () => inu.ui.openPage(detailPage(p)),
      })
    }),
    inu.ui.button({ id: 'refresh', text: 'Refresh', icon: inu.icons.common('download'), onClick: refresh }),
  ],
})

inu.registerGlobalAction({
  id: 'open-market',
  text: 'Plugin market',
  icon: inu.icons.common('bot'),
  callback: () => {
    inu.ui.openPage(listPage)
    refresh()
  },
})
