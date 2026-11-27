# Private API contract

Authenticate through Better Auth's `/api/auth/*` endpoints. `/api/session` returns
only the current user's ID/name and public login options. Cookies are HttpOnly;
no browser-supplied user ID is authoritative.

Private routes authenticate in `onRequest`, before parsing bodies. Every mutation
requires an `Origin` matching `APP_ORIGIN` exactly. Responses use `Cache-Control:
no-store`; request limits are per authenticated user. Do not add private routes
outside the `privateApi` scope or remove the ownership checks in the save service.

Client errors use stable codes: `unauthenticated` (401), `invalid_origin` (403),
`not_found` (404), `conflict` (409), `release_mismatch` (400), or `invalid_request` for other rejected input.
Capacity failures return 507 with `quota_exceeded` (account), `site_quota_exceeded`
(all accounts), or `disk_space_low` (filesystem reserve). Internal errors return no stack trace or database details.
Cross-user resources behave as absent.

Headers restrict scripts and connections to this origin and enable browser
cross-origin isolation for WASM cores. Runtime assets must be self-hosted and
compatible with these headers; do not disable the policy to use an unpinned CDN.

Administrators can read `GET /api/admin/save-quotas` for effective account/site
limits, site usage and the host disk reserve. POST the complete `account`, `site`
and last observed `version` to the same path to update the limits. A stale
version returns 409. Updates persist in PostgreSQL and apply across replicas.

## Saves

| Method and path                        | Behavior                                        |
| -------------------------------------- | ----------------------------------------------- |
| `GET /api/profiles`                    | List this user's profiles                       |
| `GET /api/storage`                     | This user's logical usage and configured limits |
| `POST /api/profiles`                   | Create with `releaseId` and `name`              |
| `GET /api/profiles/:id/revisions`      | Read the latest 100 immutable revisions         |
| `POST /api/profiles/:id/revisions`     | Publish a multipart collection                  |
| `GET /api/revisions/:id/file?name=...` | Download one owned artifact                     |
| `POST /api/profiles/:id/restore`       | Restore `revisionId` against `baseRevision`     |

A profile owner can preview permanent removal with `GET /api/profiles/:id/deletion`.
The response names the profile and counts its revisions and protected checkpoints.
`POST` to the same path with `{token}` confirms that exact impact. A changed head
or protection flag requires a fresh preview (409). This also works for empty profiles
and damaged game data. After metadata removal, cleanup rechecks shared references
before unlinking unique files. Interrupted cleanup resumes in the background.

Uploads contain one text field `metadata`: JSON with `kind`, `releaseId`, required
nullable `baseRevision`, and `runtime` for snapshots. Optional `backup: true`
protects the captured revision in the publication transaction. File parts use their portable
relative filenames. Limits are 128 files and 64 MiB total, with two simultaneous
uploads per process. Hashes are computed by the server. A conflict never replaces
the newer head; fetch history before choosing how to retry. Restore creates a new
revision. For DOS, publication replaces the ordinary head and keeps protected
backups; console history rotates. The publication response's `parentId` identifies
the exact input accepted (including live editor writeback). History reads link
only the revisions still retained.

## Editors

Both routes require the same session and exact-origin checks as save publication.
The server selects an adapter from the immutable release configuration.

- `POST /api/revisions/:id/editor/preview` accepts `{}` to choose the first eligible
  file, active slot and module. Optional `file`, `slot`, `module`, `record` and
  `changes` select a view with a draft. `action: {id, record}` expands a linked
  operation against that draft. The response includes slots, modules, sortable
  record cells, selected fields, available actions, expanded changes and a diff.
  It never writes data or returns binary offsets.
- `POST /api/revisions/:id/editor` accepts
  `{file, edits: [{slot, changes: {money: 1000000}}]}`. One to ten unique slots are
  transformed before publishing a single `editor` revision. `:id` is the expected
  head; a newer game upload or another edit produces HTTP 409.

Edits use integer storage values; field metadata describes display multipliers
and divisors. Unsupported releases, malformed saves and invalid operations return
HTTP 422 with a stable `error` and a user-readable `message`. Bodies reject unknown
properties and noninteger values. A slot accepts at most 6000 changed fields;
preview/publication body limits are 512 KiB/1 MiB. Native files are restricted to
the release's configured save paths. Snapshots cannot be edited in place.

## Game covers

The authenticated game lists include an optional `cover` version. Read
`GET /api/games/:id/cover/:version` to display its PNG. A removed game or an
obsolete version returns 404.

Administrators can use `POST /api/admin/games/:id/cover` with `expected` set to
the version they saw, or null for a release without artwork. Set `image` to
null to remove it, or supply integer `width`, `height` and base64 `rgba`
pixels inside `image`. Each side may contain 1–256 pixels. The endpoint
returns the new version and reports HTTP 409 if the cover changed meanwhile.
