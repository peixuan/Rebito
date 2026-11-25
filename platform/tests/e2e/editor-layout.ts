import { expect, type Locator, test } from "@playwright/test";

/** Exercise the rendered editor while its real record and draft remain mounted. */
export async function checkEditorLayout(editor: Locator, name: string) {
  const page = editor.page();
  const original = page.viewportSize();
  for (const width of [1280, 390]) {
    await page.setViewportSize({ width, height: 844 });
    await expect
      .poll(() => editor.evaluate((node) => node.scrollWidth - node.clientWidth), {
        message: `Editor overflow at ${width}px`,
      })
      .toBeLessThanOrEqual(1);
    await expect
      .poll(() => page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth), {
        message: `Page overflow at ${width}px`,
      })
      .toBeLessThanOrEqual(1);
    await editor.screenshot({ path: test.info().outputPath(`${name}-${width}.png`) });
  }
  if (original) await page.setViewportSize(original);
}
