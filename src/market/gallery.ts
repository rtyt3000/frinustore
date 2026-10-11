// horizontal strip of screenshots as a native view (needs `unsafe.jvm`)
// only stock Android classes are used: HorizontalScrollView, LinearLayout, ImageView, BitmapFactory

const HEIGHT_DP = 220
const GAP_DP = 8
const PAD_DP = 16
const MAX_SHOTS = 8

type JObject = NonNullable<ReturnType<typeof inu.android.getCurrentActivity>>

// the plugin thread is not the UI thread: views are created on the main looper,
// and the result is handed back through a promise (continuations run on the plugin thread)
function onMain<T>(fn: () => T): Promise<T> {
  return new Promise((resolve, reject) => {
    const Handler = inu.jvm.cls('android.os.Handler')
    const Looper = inu.jvm.cls('android.os.Looper')
    const handler = new Handler(Looper.callStatic('getMainLooper'))
    handler.call('post', inu.jvm.runnable(() => {
      try {
        resolve(fn())
      } catch (e) {
        reject(e)
      }
    }))
  })
}

interface Shot {
  bitmap: JObject
  width: number
  height: number
}

// decodes at roughly the displayed height so large photos do not eat memory
function decode(path: string, heightPx: number): Shot | null {
  const BitmapFactory = inu.jvm.cls('android.graphics.BitmapFactory')
  const Options = inu.jvm.cls('android.graphics.BitmapFactory$Options')

  const bounds = new Options()
  bounds.setField('inJustDecodeBounds', true)
  BitmapFactory.callStatic('decodeFile', path, bounds)
  const h: number = bounds.getField('outHeight')
  if (h <= 0) return null

  let sample = 1
  while (h / (sample * 2) >= heightPx) sample *= 2
  const opts = new Options()
  opts.setField('inSampleSize', sample)
  const bitmap = BitmapFactory.callStatic('decodeFile', path, opts)
  if (!bitmap) return null
  return { bitmap, width: bitmap.call('getWidth'), height: bitmap.call('getHeight') }
}

export async function buildGallery(account: inu.Account, channel: string, msgIds: number[]) {
  const activity = inu.android.getCurrentActivity()
  if (!activity) return null

  const density: number = activity.call('getResources').call('getDisplayMetrics').getField('density')
  const dp = (v: number) => Math.round(v * density)
  const heightPx = dp(HEIGHT_DP)

  const peer = await account.resolvePeer(channel)
  const messages = await account.getMessages(peer, msgIds.slice(0, MAX_SHOTS))

  const shots: Shot[] = []
  for (const message of messages) {
    if (!message || message.mediaType !== 'photo') continue
    try {
      const { path } = await account.downloadMediaToFile(message)
      const shot = decode(path, heightPx)
      if (shot) shots.push(shot)
    } catch (e) {
      console.warn('screenshot skipped', e)
    }
  }
  if (shots.length === 0) return null

  const view = await onMain(() => {
    const Scroll = inu.jvm.cls('android.widget.HorizontalScrollView')
    const Row = inu.jvm.cls('android.widget.LinearLayout')
    const Image = inu.jvm.cls('android.widget.ImageView')
    const Params = inu.jvm.cls('android.widget.LinearLayout$LayoutParams')

    const row = new Row(activity)
    row.call('setOrientation', 0) // HORIZONTAL
    shots.forEach((shot, i) => {
      const image = new Image(activity)
      image.call('setImageBitmap', shot.bitmap)
      const params = new Params(Math.round(heightPx * shot.width / shot.height), heightPx)
      params.setField('rightMargin', i === shots.length - 1 ? 0 : dp(GAP_DP))
      image.call('setLayoutParams', params)
      row.call('addView', image)
    })

    const scroll = new Scroll(activity)
    scroll.call('setHorizontalScrollBarEnabled', false)
    scroll.call('setClipToPadding', false)
    scroll.call('setPadding', dp(PAD_DP), dp(PAD_DP / 2), dp(PAD_DP), dp(PAD_DP / 2))
    scroll.call('addView', row)
    return scroll
  })
  return inu.android.nativeView(view)
}
