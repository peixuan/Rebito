/** Keep source pixels on whole device pixels without changing the emulator's video mode. */
export function pixelScale(canvas: HTMLCanvasElement) {
  const parent = canvas.parentElement;
  if (!parent) throw new Error("Missing canvas container");
  function resize() {
    const box = parent?.getBoundingClientRect();
    if (!box || !canvas.width || !canvas.height) return;
    const ratio = window.devicePixelRatio || 1;
    const fit = Math.min((box.width * ratio) / canvas.width, (box.height * ratio) / canvas.height);
    // Small screens still fit the whole picture instead of cropping it.
    const scale = fit >= 1 ? Math.floor(fit) : fit;
    const width = (canvas.width * scale) / ratio;
    const height = (canvas.height * scale) / ratio;
    canvas.style.setProperty("--pixel-width", `${width}px`);
    canvas.style.setProperty("--pixel-height", `${height}px`);
    canvas.style.setProperty(
      "--pixel-left",
      `${Math.round(((box.width - width) * ratio) / 2) / ratio}px`,
    );
    canvas.style.setProperty(
      "--pixel-top",
      `${Math.round(((box.height - height) * ratio) / 2) / ratio}px`,
    );
  }
  const geometry = new ResizeObserver(resize);
  geometry.observe(parent);
  const resolution = new MutationObserver(resize);
  resolution.observe(canvas, { attributes: true, attributeFilter: ["width", "height"] });
  window.addEventListener("resize", resize);
  canvas.dataset.integerScale = "";
  resize();
  return {
    setEnabled(enabled: boolean) {
      if (enabled) canvas.dataset.integerScale = "";
      else delete canvas.dataset.integerScale;
      resize();
    },
    dispose() {
      geometry.disconnect();
      resolution.disconnect();
      window.removeEventListener("resize", resize);
    },
  };
}
