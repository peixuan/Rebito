import { createHash } from "node:crypto";

// Maintainer-approved legal text; the original prefixed grant remains counted.
// Only initial introduction qualifies; this is not a general license-file waiver.
export const projectLicenseSha256 =
  "1940f99af9a0f69babc28780777f449c9b3d649184965f8a8523d7c3780b52e9";
export const officialLicenseSha256 =
  "0d96a4ff68ad6d4b6f1f30f713b18d5184912ba8dd389f86aa7710db079abcb0";

export function approvedLicenseLines(entry, before, after) {
  if (
    !["LICENSE", "platform/LICENSE"].includes(entry.path) ||
    ![661, 671].includes(entry.added) ||
    entry.deleted !== 0 ||
    before !== "" ||
    typeof after !== "string"
  )
    return 0;
  const normalized = after.replaceAll("\r\n", "\n");
  const expected = entry.added === 661 ? officialLicenseSha256 : projectLicenseSha256;
  if (createHash("sha256").update(normalized).digest("hex") !== expected) return 0;
  return 661;
}
