# Engineering decisions and exceptions

Keep this file limited to decisions that affect reproducibility or verification.
Routine command output belongs in local diagnostics, not in the repository.

## 2026-11-17: Authorized history replay

The owner requested internationalization in the original feature sequence and
folding five publication follow-ups into their owning changes. The 2026-11-17
follow-up restores original source author/committer dates instead of replay dates.
Unsplit steps retain both dates; each split group retains its source anchor.
The owner authorized small ordering offsets for additional parts, within neighboring
source boundaries and with at least three seconds between commits. These offsets
are ordering metadata, not historical development durations. Licensing, naming
and internationalization remain retrospective changes, not claims about when those
decisions were originally made. Keep recovery references private. Any scoped
publication exception requires immediate protection restoration and verification.

## 2026-11-16: Rebito · 晚回舟

The owner selected Rebito (晚回舟) and supplied the bilingual introduction.
The README presents it from the first platform commit after the retained baseline;
this is a retrospective editorial change, not a claim about the original naming date.
Display names, package metadata and original project notices follow that name.
Compose uses the `rebito` namespace for containers, networks and default volumes;
earlier deployments must migrate both data stores explicitly. Cookie namespaces
and identity bindings remain stable so the name does not change accounts.
The AGPL body and third-party license notices are unchanged.

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
