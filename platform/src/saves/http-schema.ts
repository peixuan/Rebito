export const identifier = { type: "string", format: "uuid" } as const;
export const idParameters = {
  type: "object",
  required: ["id"],
  additionalProperties: false,
  properties: { id: identifier },
} as const;
export const baseRevision = { anyOf: [identifier, { type: "null" }] } as const;
export const profileBody = {
  type: "object",
  required: ["releaseId", "name"],
  additionalProperties: false,
  properties: {
    releaseId: { type: "string", pattern: "^[a-z0-9][a-z0-9._-]{0,95}$" },
    name: { type: "string", minLength: 1, maxLength: 80, pattern: "\\S" },
  },
} as const;
export const uploadMetadata = {
  type: "object",
  required: ["kind", "releaseId", "baseRevision"],
  additionalProperties: false,
  properties: {
    kind: { enum: ["game-save", "snapshot", "filesystem"] },
    releaseId: profileBody.properties.releaseId,
    baseRevision,
    runtime: {
      type: "object",
      required: ["adapter", "core", "version"],
      additionalProperties: false,
      properties: Object.fromEntries(
        ["adapter", "core", "version"].map((key) => [
          key,
          { type: "string", minLength: 1, maxLength: 96 },
        ]),
      ),
    },
  },
} as const;
export const restoreBody = {
  type: "object",
  required: ["baseRevision", "revisionId"],
  additionalProperties: false,
  properties: { baseRevision, revisionId: identifier },
} as const;
