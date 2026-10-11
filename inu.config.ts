import { defineConfig } from '@inugram/cli'

export default defineConfig({
  plugins: {
    market: {
      entry: 'src/market/index.ts',
      manifest: {
        id: 'rtyt3000.frinumarket',
        name: 'Plugin market',
        author: 'rtyt3000',
        version: '0.1.0',
        description: 'Catalog of Inugram plugins from a Telegram channel',
        icon: 'inu://bot',
        grants: ['account.read(peers)', 'account.read(messages)', 'invokeRpc(messages.search)'],
      },
    },
  },
})
