# Game-specific save editors

Editor transformations live in `src/editors`, independent of HTTP, Vue, storage,
identity and emulator APIs. The service must authorize a revision, choose the
adapter from its immutable game release, transform a copy and publish through the
normal revision check. Requests contain known field keys/values, never byte offsets.

## Koukai2 PC format

The first module recognizes a candidate layout of exactly 328991 bytes:
`0x97 + 10 * 0x8074`. Slot `s` starts at `0x97 + s * 0x8074`. Its directory entry
starts at `1 + 15*s`: zero means empty; otherwise its first 11 bytes hold a date
in `DD/MMM/YYYY` padded decimal form. The protagonist at slot offset `0x611`
must be 0–5. These checks do not uniquely identify every historical game edition.
Only explicitly configured `editor: "koukai2"` releases should use this adapter.

The pure model currently provides the 14 basic fields. Money is a little-endian
uint32 at `0x60a`, limited to 600000000. Three uint16 fame values start at
`0x5b6 + protagonist*14`; six contribution bytes start at `0x5bc + protagonist*14`
and encode display value + 100. Date bytes at offsets 6–9 encode year−1501,
month−1, day−1 and a 20-minute time index. Editing time preserves the directory
date, which describes the last in-game save.

Field metadata carries ranges, choices, masks and display units. Rendering first
validates the entire request, writes a copy and preserves all unrelated bytes.
Untouched values outside an editor's allowed input range remain readable and are
not silently normalized. UI clamping improves entry; the server still rejects
invalid values. Masked changes preserve unrelated bits unless the legacy operation
explicitly reconstructs a byte, such as nationality.

Synthetic whole-file tests specify expected bytes independently of field metadata.
Additional modules, legacy regression comparisons and HTTP/UI integration remain
in progress; this initial module is not complete legacy feature parity.
