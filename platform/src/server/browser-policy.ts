/** Legacy Emscripten loaders need dynamic code only inside the runtime document. */
export function browserPolicy(runtime = false) {
  return {
    defaultSrc: ["'self'"],
    scriptSrc: runtime
      ? ["'self'", "blob:", "'unsafe-eval'", "'wasm-unsafe-eval'"]
      : ["'self'", "'wasm-unsafe-eval'"],
    workerSrc: ["'self'", "blob:"],
    connectSrc: ["'self'", "blob:"],
    imgSrc: ["'self'", "data:", "blob:"],
    mediaSrc: ["'self'", "blob:"],
    styleSrc: ["'self'", "'unsafe-inline'"],
    frameSrc: ["'self'"],
    upgradeInsecureRequests: null,
  };
}
