// which plugins are installed, from the headers of the files in the app's plugins directory
// (needs `unsafe.fs`; there is no public "list plugins" API)

const MAX_DEPTH = 2
const HEADER_BYTES = 4096

function parseHeader(head: string): { id: string, version: string } | null {
  if (!head.includes('==InuPlugin==')) return null
  const id = /^\/\/\s*@id\s+(\S+)/m.exec(head)?.[1]
  const version = /^\/\/\s*@version\s+(\S+)/m.exec(head)?.[1]
  return id && version ? { id, version } : null
}

function walk(dir: string, depth: number, out: Map<string, string>): void {
  for (const name of inu.fs.readdir(dir)) {
    const path = `${dir}/${name}`
    let st: ReturnType<typeof inu.fs.stat>
    try {
      st = inu.fs.stat(path)
    } catch {
      continue
    }
    if (st.isDirectory && depth < MAX_DEPTH) {
      walk(path, depth + 1, out)
    } else if (st.isFile && name.endsWith('.js')) {
      try {
        const head = new TextDecoder().decode(inu.fs.read(path).subarray(0, HEADER_BYTES))
        const parsed = parseHeader(head)
        if (parsed) out.set(parsed.id, parsed.version)
      } catch {
        // unreadable file: skip it
      }
    }
  }
}

/** id -> installed version, or `null` when the directory cannot be read or holds no plugins */
export function scanInstalled(): Map<string, string> | null {
  try {
    const dir = inu.android.getPluginsDir()
    const found = new Map<string, string>()
    walk(dir, 0, found)
    console.log(`installed plugins found: ${found.size} in ${dir}`)
    return found.size > 0 ? found : null
  } catch (e) {
    console.warn('plugin scan failed', e)
    return null
  }
}
