import type { Catalog, CatalogPlugin, CatalogVersion } from '../shared/catalog.js'
import type { SortMode } from '../shared/catalog.js'
import { latest, localized, safeRepoUrl, SORT_MODES, sortPlugins } from '../shared/catalog.js'
import { iconFor } from './icons.js'

// public channel with the catalog (pinned `catalog.json`) and the plugin files
const CHANNEL = 'frinu_store'
// bot with inline mode on; it records installs from inline queries
const BOT = 'frinustore_bot'
const CACHE_KEY = 'catalog'

let catalog: Catalog | null = readCache()
let loading = false
let started = false
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

// tells the bot about an install: an inline query it records and answers with nothing
async function reportInstall(plugin: CatalogPlugin, version: CatalogVersion): Promise<void> {
  const account = inu.account()
  const bot = await account.resolvePeer(BOT)
  if (bot._ !== 'inputPeerUser') return
  await account.invokeRpc({
    _: 'messages.getInlineBotResults',
    bot: { _: 'inputUser', user_id: bot.user_id, access_hash: bot.access_hash },
    peer: { _: 'inputPeerEmpty' },
    query: `install ${plugin.id} ${version.version}`,
    offset: '',
  })
}

// the stock installer opens when the user taps a `.inu.js` document in a chat,
// so show the real file message and let the app handle the tap
async function install(plugin: CatalogPlugin, version: CatalogVersion): Promise<void> {
  const account = inu.account()
  const peer = await account.resolvePeer(CHANNEL)
  const message = await account.getMessages(peer, version.msgId)
  if (!message) {
    inu.ui.toast(t('noFile'))
    return
  }
  reportInstall(plugin, version).catch(() => {})
  inu.ui.openChatHistory({
    title: `${plugin.name} ${version.version}`,
    subtitle: t('tapFile'),
    load: (cursor) => cursor === null ? { entries: [{ message: message.raw }] } : { entries: [] },
  })
}

const lang = () => inu.info().language

const STRINGS = {
  title: { en: 'Plugin market', ru: 'Магазин плагинов' },
  loading: { en: 'Loading…', ru: 'Загрузка…' },
  empty: { en: 'Nothing found', ru: 'Ничего не найдено' },
  error: { en: 'Failed to load', ru: 'Не удалось загрузить' },
  refresh: { en: 'Refresh', ru: 'Обновить' },
  search: { en: 'Search', ru: 'Поиск' },
  clear: { en: 'Clear search', ru: 'Сбросить поиск' },
  installs: { en: 'installs', ru: 'установок' },
  versions: { en: 'Versions', ru: 'Версии' },
  install: { en: 'Install', ru: 'Установить' },
  installLatest: { en: 'Install latest', ru: 'Установить последнюю' },
  tapFile: { en: 'Tap the file to install', ru: 'Нажмите на файл, чтобы установить' },
  sort: { en: 'Sort by', ru: 'Сортировка' },
  repo: { en: 'Source code', ru: 'Исходный код' },
  noRepo: { en: 'No repository', ru: 'Нет репозитория' },
  noFile: { en: 'File not found', ru: 'Файл не найден' },
} as const

function t(key: keyof typeof STRINGS): string {
  const entry = STRINGS[key]
  return lang() === 'ru' ? entry.ru : entry.en
}

const SORT_LABELS: Record<SortMode, { en: string, ru: string }> = {
  popular: { en: 'Popular', ru: 'Популярные' },
  updated: { en: 'Recently updated', ru: 'Недавно обновлённые' },
  new: { en: 'New', ru: 'Новые' },
  name: { en: 'Name', ru: 'По названию' },
}

const SORT_KEY = 'sort'

function readSort(): SortMode {
  try {
    const stored = localStorage.getItem(SORT_KEY) as SortMode | null
    return stored && SORT_MODES.includes(stored) ? stored : 'popular'
  } catch {
    return 'popular'
  }
}

let sort: SortMode = readSort()
let query = ''

function visiblePlugins(): CatalogPlugin[] {
  const q = query.trim().toLowerCase()
  const found = (catalog?.plugins ?? [])
    .filter(p => !q || `${p.name} ${p.author} ${localized(p.description, lang())}`.toLowerCase().includes(q))
  return sortPlugins(found, sort)
}

function installSafely(plugin: CatalogPlugin, version: CatalogVersion): void {
  install(plugin, version).catch(e => inu.ui.toast(String(e?.message ?? e)))
}

function openDetail(plugin: CatalogPlugin): void {
  const newest = latest(plugin)
  const repo = safeRepoUrl(plugin.repo)
  inu.ui.openPage(inu.ui.settingsPage({
    title: plugin.name,
    transient: true,
    bottomButton: newest
      ? { text: `${t('installLatest')} ${newest.version}`, onClick: () => installSafely(plugin, newest) }
      : undefined,
    items: () => [
      inu.ui.header(`${plugin.author} · ${plugin.installs} ${t('installs')}`),
      inu.ui.separator(localized(plugin.description, lang())),
      inu.ui.button({
        id: 'repo',
        text: t('repo'),
        icon: inu.icons.common('link'),
        value: repo ? new URL(repo).host : t('noRepo'),
        subtitle: repo ?? undefined,
        onClick: () => { if (repo) inu.openUrl(repo) },
      }),
      inu.ui.header(t('versions')),
      ...[...plugin.versions].sort((a, b) => b.date - a.date).map(v => inu.ui.button({
        id: `v:${v.version}`,
        text: v.version,
        subtitle: v.changelog,
        multiline: true,
        value: inu.utils.formatDate(v.date * 1000),
        onClick: () => installSafely(plugin, v),
      })),
    ],
  }))
}

const listPage = inu.ui.settingsPage({
  title: t('title'),
  items: () => {
    // the page can be opened from the plugin list, not only from our action
    if (!started) {
      started = true
      setTimeout(refresh, 0)
    }
    const plugins = visiblePlugins()
    return [
      inu.ui.button({
        id: 'search',
        text: t('search'),
        icon: inu.icons.common('search'),
        value: query || undefined,
        onClick: () => {
          inu.ui.prompt({ title: t('search'), value: query })
            .then((value) => {
              if (value !== null) query = value
              listPage.invalidate()
            })
            .catch(() => {})
        },
        onSecondaryClick: () => {
          query = ''
          listPage.invalidate()
        },
      }),
      inu.ui.select({
        id: 'sort',
        text: t('sort'),
        icon: inu.icons.common('more'),
        items: SORT_MODES.map(m => lang() === 'ru' ? SORT_LABELS[m].ru : SORT_LABELS[m].en),
        selected: SORT_MODES.indexOf(sort),
        onChange: (index) => {
          sort = SORT_MODES[index] ?? 'popular'
          try { localStorage.setItem(SORT_KEY, sort) } catch {}
        },
      }),
      ...(error ? [inu.ui.separator(`${t('error')}: ${error}`)] : []),
      ...(loading && !catalog ? [inu.ui.separator(t('loading'))] : []),
      ...(!loading && catalog && plugins.length === 0 ? [inu.ui.separator(t('empty'))] : []),
      ...plugins.map((p) => {
        const v = latest(p)
        return inu.ui.button({
          id: `p:${p.id}`,
          text: p.name,
          subtitle: localized(p.description, lang()),
          icon: iconFor(p.icon),
          value: v?.version,
          onClick: () => openDetail(p),
        })
      }),
      inu.ui.button({ id: 'refresh', text: t('refresh'), icon: inu.icons.common('refresh'), onClick: refresh }),
    ]
  },
})

inu.registerGlobalAction({
  id: 'open-market',
  text: t('title'),
  icon: inu.icons.common('bot'),
  callback: () => {
    inu.ui.openPage(listPage)
    refresh()
  },
})

// second entry point for when the menu is minimal: "Settings" next to the plugin in the plugin list
inu.registerSettings(listPage)
