// manifest-style icon string (`inu://`, `tg://emoji`, `tg://addstickers`) -> UIIcon

type CommonName = Parameters<typeof inu.icons.common>[0]

const COMMON = new Set<string>([
  'settings', 'info', 'search', 'edit', 'delete', 'copy', 'share', 'download',
  'link', 'pin', 'star', 'mute', 'unmute', 'archive', 'forward', 'reply',
  'user', 'group', 'channel', 'bot', 'lock', 'eye', 'eyeOff', 'refresh',
  'plus', 'minus', 'check', 'close', 'more', 'translate', 'bookmark',
])

// no `URL` here: the engine's implementation of non-http schemes is not specified
function param(query: string, name: string): string | null {
  const m = new RegExp(`(?:^|&)${name}=([^&#]*)`).exec(query)
  return m ? decodeURIComponent(m[1]!) : null
}

export function iconFor(spec: string | undefined): ReturnType<typeof inu.icons.common> {
  const fallback = inu.icons.common('bot')
  const value = spec?.trim()
  if (!value) return fallback
  try {
    if (value.startsWith('inu://')) {
      const name = value.slice('inu://'.length)
      if (COMMON.has(name)) return inu.icons.common(name as CommonName)
    } else {
      const m = /^tg:\/\/(emoji|addstickers)\/?\?([^#]*)/.exec(value)
      if (m?.[1] === 'emoji') {
        const id = param(m[2]!, 'id')
        if (id) return inu.icons.customEmoji(id)
      } else if (m?.[1] === 'addstickers') {
        const slug = param(m[2]!, 'set')
        if (slug) {
          const id = param(m[2]!, 'id')
          if (id) return inu.icons.sticker({ slug, id })
          const idx = Number(param(m[2]!, 'idx') ?? 0)
          return inu.icons.sticker({ slug, index: Number.isInteger(idx) && idx >= 0 ? idx : 0 })
        }
      }
    }
    console.warn('icon not recognized, using default:', value)
  } catch (e) {
    console.warn('icon failed, using default:', value, e)
  }
  return fallback
}
