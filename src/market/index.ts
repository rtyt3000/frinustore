import type { Catalog, CatalogPlugin, CatalogVersion } from '../shared/catalog.js'
import type { SortMode } from '../shared/catalog.js'
import { compareVersions, latest, localized, safeRepoUrl, SORT_MODES, sortPlugins } from '../shared/catalog.js'
import { buildGallery } from './gallery.js'
import { iconFor } from './icons.js'
import { scanInstalled } from './installed.js'

// public channel with the catalog (pinned `catalog.json`) and the plugin files
const CHANNEL = 'frinu_store'
// bot with inline mode on; it records installs from inline queries
const BOT = 'frinustore_bot'
const CACHE_KEY = 'catalog'

let catalog: Catalog | null = readCache()
let loading = false
let installed: Map<string, string> | null = null
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
      installed = scanInstalled()
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
async function install(plugin: CatalogPlugin, version: CatalogVersion, onDone?: () => void): Promise<void> {
  const account = inu.account()
  const peer = await account.resolvePeer(CHANNEL)
  const message = await account.getMessages(peer, version.msgId)
  if (!message) {
    inu.ui.toast(t('noFile'))
    return
  }
  reportInstall(plugin, version).catch(() => {})
  const history = inu.ui.openChatHistory({
    title: `${plugin.name} ${version.version}`,
    subtitle: t('tapFile'),
    load: (cursor) => cursor === null ? { entries: [{ message: message.raw }] } : { entries: [] },
  })
  // the user may have installed it: look at the plugins directory again once they come back
  history.closed
    .then(() => {
      installed = scanInstalled() ?? installed
      listPage.invalidate()
      onDone?.()
    })
    .catch(() => {})
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
  updates: { en: 'Updates available', ru: 'Доступны обновления' },
  all: { en: 'All plugins', ru: 'Все плагины' },
  update: { en: 'Update to', ru: 'Обновить до' },
  upToDate: { en: 'Installed', ru: 'Установлена' },
  upToDateToast: { en: 'The latest version is already installed', ru: 'Последняя версия уже установлена' },
  current: { en: 'installed', ru: 'установлена' },
  installedVersion: { en: 'Installed', ru: 'Установлена' },
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

// installed version when the plugin is installed and the catalog has a newer one
function updateFrom(p: CatalogPlugin): string | null {
  const have = installed?.get(p.id)
  const newest = latest(p)
  return have && newest && compareVersions(newest.version, have) > 0 ? have : null
}

function visiblePlugins(): { updates: CatalogPlugin[], rest: CatalogPlugin[] } {
  const q = query.trim().toLowerCase()
  const found = sortPlugins(
    (catalog?.plugins ?? [])
      .filter(p => !q || `${p.name} ${p.author} ${localized(p.description, lang())}`.toLowerCase().includes(q)),
    sort,
  )
  // plugins that need an update go first, in the chosen order
  return { updates: found.filter(p => updateFrom(p)), rest: found.filter(p => !updateFrom(p)) }
}

function installSafely(plugin: CatalogPlugin, version: CatalogVersion, onDone?: () => void): void {
  install(plugin, version, onDone).catch(e => inu.ui.toast(String(e?.message ?? e)))
}

function openDetail(plugin: CatalogPlugin): void {
  const newest = latest(plugin)
  const repo = safeRepoUrl(plugin.repo)
  let shots: Awaited<ReturnType<typeof buildGallery>> = null

  const haveVersion = () => installed?.get(plugin.id)
  const isLatestInstalled = () => {
    const have = haveVersion()
    return !!have && !!newest && compareVersions(have, newest.version) >= 0
  }
  // "inactive" when the latest version is installed: the button stays but installs nothing
  const cta = () => {
    if (!newest) return undefined
    const have = haveVersion()
    if (isLatestInstalled()) {
      return { text: `${t('upToDate')} ${have} ✓`, onClick: () => inu.ui.toast(t('upToDateToast')) }
    }
    return {
      text: `${have ? t('update') : t('installLatest')} ${newest.version}`,
      onClick: () => installSafely(plugin, newest, () => page.invalidate()),
    }
  }

  installed = scanInstalled() ?? installed
  const page = inu.ui.settingsPage({
    title: plugin.name,
    transient: true,
    // a getter, so the label follows the installed version if the page re-reads it
    get bottomButton() {
      return cta()
    },
    items: () => [
      inu.ui.header(`${plugin.author} · ${plugin.installs} ${t('installs')}`),
      ...(haveVersion()
        ? [inu.ui.separator(`${t('installedVersion')}: ${haveVersion()}${isLatestInstalled() ? ' ✓' : ''}`)]
        : []),
      inu.ui.separator(localized(plugin.description, lang())),
      ...(shots ? [shots] : []),
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
        value: `${inu.utils.formatDate(v.date * 1000)}${haveVersion() && compareVersions(haveVersion()!, v.version) === 0 ? ` · ✓ ${t('current')}` : ''}`,
        onClick: () => installSafely(plugin, v, () => page.invalidate()),
      })),
    ],
  })
  inu.ui.openPage(page)

  if (plugin.screenshots?.length) {
    buildGallery(inu.account(), CHANNEL, plugin.screenshots)
      .then((el) => {
        shots = el
        page.invalidate()
      })
      .catch(e => console.warn('gallery failed', e))
  }
}

const listPage = inu.ui.settingsPage({
  title: t('title'),
  items: () => {
    // the page can be opened from the plugin list, not only from our action
    if (!started) {
      started = true
      setTimeout(refresh, 0)
    }
    const { updates, rest } = visiblePlugins()
    const row = (p: CatalogPlugin) => {
      const v = latest(p)
      const from = updateFrom(p)
      return inu.ui.button({
        id: `p:${p.id}`,
        text: p.name,
        subtitle: localized(p.description, lang()),
        icon: iconFor(p.icon),
        value: from ? `${from} → ${v?.version}` : v?.version,
        onClick: () => openDetail(p),
      })
    }
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
      inu.ui.button({ id: 'refresh', text: t('refresh'), icon: inu.icons.common('refresh'), onClick: refresh }),
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
      ...(!loading && catalog && updates.length + rest.length === 0 ? [inu.ui.separator(t('empty'))] : []),
      ...(updates.length ? [inu.ui.header(t('updates')), ...updates.map(row)] : []),
      ...(updates.length && rest.length ? [inu.ui.header(t('all'))] : []),
      ...rest.map(row),
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
