# Security Policy

## Reporting a vulnerability

Do not report suspected security vulnerabilities through public channels.

Use the destination GitHub repository's **Security → Advisories → Report a
vulnerability** control. The repository owner must enable private vulnerability
reporting before publication. If the control is unavailable, ask for a private
contact channel without posting the vulnerability details publicly.

Include enough information to reproduce and assess the issue, but do not include unrelated secrets, credentials, or personal data.

Prefer a synthetic reproduction: affected revision, deployment configuration with
secrets removed, expected/actual behavior and minimal requests. Do not attach real
ROMs, vendor BIOS, private saves, database backups or unredacted authentication logs.

The project is pre-release and has no supported stable release series yet. Fixes
target the current reviewed branch. Tests and dependency scans reduce risk; they
are not a guarantee that every emulator or uploaded game is safe.
