export const gameUploadLimits = {
  bytes: 64 * 1024 ** 2,
  expanded: 256 * 1024 ** 2,
  files: 5000,
} as const;

export const discUploadLimits = { bytes: 1024 ** 3, expanded: 1024 ** 3, files: 500 } as const;

export const dosExecutablePattern = /^(?:[a-zA-Z0-9_~-]+\/)*[a-zA-Z0-9_~-]+\.(exe|com|bat)$/i;
