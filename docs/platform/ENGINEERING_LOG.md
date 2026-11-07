# Engineering decisions and exceptions

Keep this file limited to decisions that affect reproducibility or verification.
Routine command output belongs in local diagnostics, not in the repository.

## 2026-11-16: AGPL source grant and complete legal text

The owner selected AGPL-3.0-or-later for original project work and source-only
publication. This decision was applied retrospectively to the first platform
commit after the retained template baseline; it is not a claim that the decision
was made on that commit's original author date. Third-party terms are unchanged.

The owner approved an exception for the complete 661-line official AGPLv3 body,
including the identical copy required by the independent Docker build context.
Source: <https://www.gnu.org/licenses/agpl-3.0.txt>, retrieved 2026-11-16.
SHA-256: `0d96a4ff68ad6d4b6f1f30f713b18d5184912ba8dd389f86aa7710db079abcb0`.
It is preserved verbatim, not reformatted or split into incomplete grants. Only
its initial introduction is exempt; the original project notice still counts.
Each complete legal text is introduced in its own commit; its exception cannot
cover unrelated files. All other handwritten changes retain the 500-line budget. The policy verifies
the complete file hash before allowing the exception. Canonical `LICENSE` files
and separately counted `NOTICE` grants are used from introduction in the new
replay. The earlier exact prefixed blob remains recognized for auditing the
original published history; neither form permits edited or repeated legal text.
