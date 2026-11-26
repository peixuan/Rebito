import type { Locator } from "@playwright/test";

/** Read the displayed center pixel from the running console fixture. */
export function centerPixel(canvas: Locator) {
  return canvas.evaluate(
    (canvas: HTMLCanvasElement) =>
      new Promise<number[]>((resolve) =>
        requestAnimationFrame(() => {
          const gl = canvas.getContext("webgl2") ?? canvas.getContext("webgl");
          if (!gl) throw new Error("Missing console framebuffer");
          const value = new Uint8Array(4);
          gl.readPixels(
            canvas.width / 2,
            canvas.height / 2,
            1,
            1,
            gl.RGBA,
            gl.UNSIGNED_BYTE,
            value,
          );
          resolve([...value]);
        }),
      ),
  );
}
