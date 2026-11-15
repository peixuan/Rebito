# Security Policy

## Reporting a vulnerability

Do not report suspected security vulnerabilities through public channels.

Use [Rebito's private vulnerability report](https://github.com/peixuan/Rebito/security/advisories/new)
after signing in to GitHub. Private reporting is enabled on the upstream repository.
Fork owners must enable this feature on their own repositories before publication.
If the control is unavailable, ask for a private contact channel without posting
the vulnerability details publicly.

Include enough information to reproduce and assess the issue, but do not include unrelated secrets, credentials, or personal data.

Prefer a synthetic reproduction: affected revision, deployment configuration with
secrets removed, expected/actual behavior and minimal requests. Do not attach real
ROMs, vendor BIOS, private saves, database backups or unredacted authentication logs.

The project is pre-release and has no supported stable release series yet. Fixes
target `main`. Tests and dependency scans reduce risk; they
are not a guarantee that every emulator or uploaded game is safe.
