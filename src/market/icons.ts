// manifest-style icon string (`inu://`, `tg://emoji`, `tg://addstickers`) -> UIIcon

type CommonName = Parameters<typeof inu.icons.common>[0]

const COMMON = new Set<string>([
  'settings', 'info', 'search', 'edit', 'delete', 'copy', 'share', 'download',
  'link', 'pin', 'star', 'mute', 'unmute', 'archive', 'forward', 'reply',
  'user', 'group', 'channel', 'bot', 'lock', 'eye', 'eyeOff', 'refresh',
  'plus', 'minus', 'check', 'close', 'more', 'translate', 'bookmark',
])

export function iconFor(spec: string | undefined): ReturnType<typeof inu.icons.common> {
  const fallback = inu.icons.common('bot')
  if (!spec) return fallback
  try {
    if (spec.startsWith('inu://')) {
      const name = spec.slice('inu://'.length)
      return COMMON.has(name) ? inu.icons.common(name as CommonName) : fallback
    }
    const url = new URL(spec)
    if (url.protocol !== 'tg:') return fallback
    if (url.hostname === 'emoji') {
      const id = url.searchParams.get('id')
      return id ? inu.icons.customEmoji(id, { static: true }) : fallback
    }
    if (url.hostname === 'addstickers') {
      const slug = url.searchParams.get('set')
      if (!slug) return fallback
      const id = url.searchParams.get('id')
      if (id) return inu.icons.sticker({ slug, id, static: true })
      const idx = Number(url.searchParams.get('idx') ?? 0)
      return inu.icons.sticker({ slug, index: Number.isInteger(idx) && idx >= 0 ? idx : 0, static: true })
    }
  } catch {
    // malformed icon from the catalog: fall through
  }
  return fallback
}
