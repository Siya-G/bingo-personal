"""Security notes for this MVP API.

Host PINs and player session tokens are validated only on the server and are
never returned after creation (except the one-time join/create payloads).

This is **not** a substitute for production authentication:

- Add OAuth2 / OpenID Connect, SAML, or another enterprise IdP.
- Move secrets out of headers into httpOnly cookies where appropriate.
- Rotate tokens, add brute-force lockouts, and centralize session storage.
- Never ship LLM or payment API keys to browser bundles — keep them in
  server-side configuration and secret managers only.

See also: ``app.dependencies.game_auth`` and ``app.services.secret_hashes``.
"""
