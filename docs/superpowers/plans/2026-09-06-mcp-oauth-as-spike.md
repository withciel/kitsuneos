# MCP OAuth AS spike (Phase 3)

**Decision:** Embed a minimal OAuth 2.1 + PKCE authorization server in the KitsuneOS app that federates login to WorkOS AuthKit, then mint MCP access tokens bound to `{workspaceId, principalId}`.

**Why not WorkOS-as-AS alone:** AuthKit covers user login well, but MCP clients expect RFC 9728 protected-resource metadata, RFC 8414 AS metadata, dynamic client registration, and PKCE auth-code exchange against the MCP resource (`/api/mcp`). WorkOS does not currently expose that full MCP AS surface.

**Shipped shape:**
- `/.well-known/oauth-protected-resource`
- `/.well-known/oauth-authorization-server`
- `/api/mcp/oauth/register|authorize|token`
- Bearer API keys remain valid on `/api/mcp` (Cursor / CI)
- OAuth access tokens use `mcp_*` HMAC tokens with workspace/principal claims
