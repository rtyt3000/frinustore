# Plugin market

## Pieces
1. **Channel** (public, https://t.me/frinu_store, `CHANNEL` in `src/market/index.ts`): pinned message with `catalog.json`
   (a document), below it one message per plugin version with the `.inu.js` file.
2. **Bot** (TZ later): accepts plugins from users, validates, publishes files, rewrites
   `catalog.json` in the pinned message (edit media keeps the pin stable).
3. **Plugin `market`** (`src/market`): drawer item "Plugin market" -> list -> plugin page -> versions.

## Plugin flow
- `messages.search` with `inputMessagesFilterPinned` on the channel -> `downloadMedia` -> JSON.
  Cached in `localStorage`, refreshed on open.
- Install: `getMessages(channel, version.msgId)` -> `ui.openChatHistory` with that real message;
  the user taps the file and the stock installer opens.
- Grants: `account.read(peers)`, `account.read(messages)`, `invokeRpc(messages.search)`. No xposed/jvm.

## catalog.json
Schema in `src/shared/catalog.ts` (`schema: 1`). Version files are referenced by `msgId`.
`id` is the manifest id and must never change between versions.

## Open questions (need a device)
- Does tapping a file inside `openChatHistory` (non-synthetic) start the stock installer?
  Fallback: `openPage({type:'chat', dialogId})` on the channel.
- There is no public plugin-install API in SDK 45 (`common.d.ts`).
- Installed/update detection: no API lists installed plugins, so "Update" state is not possible yet.
  Ask Inugram devs.
- Install counter: plugin sends an inline query `install <id> <version>` to `BOT` (`messages.getInlineBotResults`); the bot records it. Bot username in `src/market/index.ts` is a placeholder.
- Icons: only `inu://`, emoji, stickers, SVG; no arbitrary image avatars. Plugin `iconOf` is a stub.
