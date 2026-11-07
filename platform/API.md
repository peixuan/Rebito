# Private API contract

Authenticate through Better Auth's `/api/auth/*` endpoints. `/api/session` returns
only the current user's ID/name and public login options. Cookies are HttpOnly;
no browser-supplied user ID is authoritative.

Private routes authenticate in `onRequest`, before parsing bodies. Every mutation
requires an `Origin` matching `APP_ORIGIN` exactly. Responses use `Cache-Control:
no-store`; request limits are per authenticated user. Do not add private routes
outside the `privateApi` scope or remove the ownership checks in the save service.

Client errors use stable codes: `unauthenticated` (401), `invalid_origin` (403),
`not_found` (404), `conflict` (409), `release_mismatch` (400), or `invalid_request`
for other rejected input. Internal errors return no stack trace or database details.
Cross-user resources behave as absent.

Headers restrict scripts and connections to this origin and enable browser
cross-origin isolation for WASM cores. Runtime assets must be self-hosted and
compatible with these headers; do not disable the policy to use an unpinned CDN.
