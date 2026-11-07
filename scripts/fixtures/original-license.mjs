import { readFileSync } from "node:fs";

// Reconstruct the original 671-line grant to test its exact historical exception.
// Current LICENSE is canonical; neither this fixture nor NOTICE broadens the waiver.
export const originalLicense = `Rebito
Copyright (c) 2026 Rebito contributors
SPDX-License-Identifier: AGPL-3.0-or-later

The project's original code, documentation and original test programs are
licensed under the GNU Affero General Public License, version 3 or (at your
option) any later version. Third-party components retain their own licenses.

The complete version 3 license follows.

${readFileSync(new URL("../../LICENSE", import.meta.url), "utf8").replaceAll("\r\n", "\n")}`;
