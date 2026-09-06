# KitsuneOS MCP marketplace checklist

## Shared prerequisites
- [x] Streamable HTTP endpoint `/api/mcp`
- [x] API key Bearer auth
- [x] OAuth 2.1 + PKCE + protected resource metadata
- [x] Tool annotations (title / readOnlyHint / destructiveHint / openWorldHint)
- [x] Official registry `packages/mcp/server.json` (stdio + remote)
- [x] Cursor plugin scaffold under `marketplace/cursor-plugin/`
- [ ] Privacy / ToS / support URLs verified for listing forms
- [ ] Seeded reviewer demo workspace
- [ ] Publish via `mcp-publisher` to official MCP Registry
- [ ] Claude Connectors Directory submit (Team/Enterprise org)
- [ ] Cursor Marketplace submit
- [ ] OpenAI Apps / domain challenge
- [ ] Grok custom connector docs + optional Build marketplace PR

External submissions remain ops-gated (org verification / review queues).
