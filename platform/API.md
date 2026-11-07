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

## Saves

| Method and path                        | Behavior                                    |
| -------------------------------------- | ------------------------------------------- |
| `GET /api/profiles`                    | List this user's profiles                   |
| `POST /api/profiles`                   | Create with `releaseId` and `name`          |
| `GET /api/profiles/:id/revisions`      | Read the latest 100 immutable revisions     |
| `POST /api/profiles/:id/revisions`     | Publish a multipart collection              |
| `GET /api/revisions/:id/file?name=...` | Download one owned artifact                 |
| `POST /api/profiles/:id/restore`       | Restore `revisionId` against `baseRevision` |

Uploads contain one text field `metadata`: JSON with `kind`, `releaseId`, required
nullable `baseRevision`, and `runtime` for snapshots. File parts use their portable
relative filenames. Limits are 128 files and 64 MiB total, with two simultaneous
uploads per process. Hashes are computed by the server. A conflict never replaces
the newer head; fetch history before choosing how to retry. Restore creates a new
revision and retains both the original and intervening versions.
