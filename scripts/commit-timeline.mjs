// The template history is retained verbatim. Platform rules start after this
// reviewed baseline; secret and artifact audits still cover all reachable files.
export const publicationBase = "a20553aaf4bd0c506c8ddf8066ab74af6f9fdc03";

export function validateTimeline(current, previous) {
  for (const field of ["authorTime", "committerTime"]) {
    if (!Number.isSafeInteger(current[field]) || current[field] < 0) {
      throw new Error(`Invalid ${field}: ${current.id}`);
    }
    if (previous && current[field] - previous[field] < 3) {
      throw new Error(`${field} must advance at least three seconds: ${current.id}`);
    }
  }
  if (current.authorTime > current.committerTime) {
    throw new Error(`Author time must not follow committer time: ${current.id}`);
  }
  if (previous && current.subject === previous.subject) {
    throw new Error(`Adjacent commits must describe different changes: ${current.id}`);
  }
  for (const role of ["author", "committer"]) {
    if (
      !current[`${role}Name`]?.trim() ||
      !/^[^\s<>@]+@[^\s<>@]+$/.test(current[`${role}Email`] ?? "")
    ) {
      throw new Error(`Missing or malformed ${role} identity: ${current.id}`);
    }
  }
}

export function parseNumstat(output) {
  const fields = output.split("\0");
  const entries = [];
  for (let index = 0; index < fields.length - 1; index++) {
    const match = /^(\d+|-)\t(\d+|-)\t(.*)$/s.exec(fields[index]);
    if (!match) throw new Error("Malformed Git change statistics.");
    let path = match[3];
    if (!path) {
      // With -z a rename has an empty path, followed by old and new paths.
      const oldPath = fields[++index];
      path = fields[++index];
      if (!oldPath || !path) throw new Error("Incomplete Git rename statistics.");
    }
    entries.push({ added: Number(match[1]), deleted: Number(match[2]), path });
  }
  if (fields.at(-1) !== "") throw new Error("Unterminated Git change statistics.");
  return entries;
}
