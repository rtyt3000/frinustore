import { defineConfig } from '@inugram/cli'

export default defineConfig({
  plugins: {
    hello: {
      entry: 'src/hello/index.ts',
      manifest: {
        id: 'rtyt3000.hello',
        name: 'Hello',
        author: 'rtyt3000',
        version: '1.0.0',
        description: 'a starting point',
        icon: 'inu://bot',
      },
    },
  },
})
