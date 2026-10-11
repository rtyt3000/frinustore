import { defineConfig } from '@inugram/cli'

export default defineConfig({
  plugins: {
    market: {
      entry: 'src/market/index.ts',
      manifest: {
        id: 'rtyt3000.frinumarket',
        name: 'Plugin market',
        author: 'rtyt3000',
        version: '1.0.1',
        description: 'Catalog of Inugram plugins from a Telegram channel',
        icon: 'tg://emoji?id=5935987292354125230',
        grants: ['account.read(peers)', 'account.read(messages)', 'invokeRpc(messages.search)', 'invokeRpc(messages.getInlineBotResults)', 'openUrl', 'unsafe.jvm', 'unsafe.fs', 'fs'],
      },
    },
  },
})
