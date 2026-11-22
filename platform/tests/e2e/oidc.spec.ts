import { expect, type Page, test } from "@playwright/test";

const origin = "http://localhost:4320";
test.use({ baseURL: origin });

async function authorize(page: Page, identity: string) {
  // The test provider imports Google Fonts. Their availability must not gate
  // authentication; only decorative font requests are blocked, never OIDC calls.
  await page.route(/^https:\/\/fonts\.(googleapis|gstatic)\.com\//, (route) => route.abort());
  await page.goto("/");
  await expect(page.getByRole("button", { name: "Create account", exact: true })).toHaveCount(0);
  const authorization = page.waitForRequest((request) =>
    request.url().startsWith("http://localhost:4319/auth?"),
  );
  const signIn = page.waitForResponse((response) =>
    response.url().endsWith("/api/auth/sign-in/social"),
  );
  await page.getByRole("button", { name: "Sign in with your identity provider" }).click();
  const response = await signIn;
  if (response.status() === 429) {
    // Exercise the production limiter unchanged; all test users share loopback IP.
    const seconds = Number(response.headers()["x-retry-after"]);
    expect(seconds).toBeGreaterThan(0);
    expect(seconds).toBeLessThanOrEqual(10);
    await new Promise((resolve) => setTimeout(resolve, (seconds + 1) * 1000));
    await page.getByRole("button", { name: "Sign in with your identity provider" }).click();
  }
  const url = new URL((await authorization).url());
  expect(url.searchParams.get("code_challenge_method")).toBe("S256");
  expect(url.searchParams.get("code_challenge")).toMatch(/^[\w-]{43}$/);
  expect(url.searchParams.get("nonce")).toBeTruthy();
  expect(url.searchParams.get("state")).toBeTruthy();
  await page.getByPlaceholder("Enter any login").fill(identity);
  await page.getByPlaceholder("and password").fill("test-provider-only");
  await page.getByRole("button", { name: "Sign-in", exact: true }).click();
  await page.getByRole("button", { name: "Continue", exact: true }).click();
}

test("uses a real OIDC code exchange and keeps provider users' progress isolated", async ({
  page,
  browser,
}) => {
  await authorize(page, "alice");
  await expect(page.locator(".account-actions")).toContainText("OIDC alice");
  const cookie = (await page.context().cookies()).find(
    (entry) => entry.name === "retro.session_token",
  );
  expect(cookie).toMatchObject({ httpOnly: true, sameSite: "Lax" });
  const games = await (await page.request.get("/api/games")).json();
  const profileResponse = await page.request.post("/api/profiles", {
    headers: { origin },
    data: { name: "OIDC private progress", releaseId: games[0].id },
  });
  expect(profileResponse.status()).toBe(201);
  const profile = await profileResponse.json();
  await page.reload();
  await expect(page.locator(".account-actions")).toContainText("OIDC alice");
  const second = await browser.newContext({ baseURL: origin });
  try {
    const other = await second.newPage();
    await authorize(other, "bob");
    await expect(other.locator(".account-actions")).toContainText("OIDC bob");
    expect(await (await other.request.get("/api/profiles")).json()).toEqual([]);
    expect((await other.request.get(`/api/profiles/${profile.id}/revisions`)).status()).toBe(404);
  } finally {
    await second.close();
  }
  const signup = await page.request.post("/api/auth/sign-up/email", {
    headers: { origin },
    data: { name: "Blocked", email: "blocked@example.test", password: "blocked-registration-123" },
  });
  expect(signup.ok()).toBe(false);
  await page.getByRole("button", { name: "Sign out" }).click();
  await expect(page.getByRole("heading", { name: "Sign in to your library" })).toBeVisible();
  expect((await page.request.get("/api/profiles")).status()).toBe(401);
});

for (const tamper of ["state", "nonce"] as const) {
  test(`rejects a tampered OIDC ${tamper} without creating a session`, async ({ page }) => {
    let intercepted = false;
    // Intercept the initial authorization, before the redirect chain begins.
    await page.route(/^http:\/\/localhost:4319\/auth\?/, async (route) => {
      const url = new URL(route.request().url());
      url.searchParams.set(tamper, "tampered-test-value");
      intercepted = true;
      await route.continue({ url: url.href });
    });
    await authorize(page, `invalid-${tamper}`);
    await page.waitForURL((url) => url.origin === origin);
    expect(intercepted).toBe(true);
    const session = await (await page.request.get("/api/session")).json();
    expect(session.user).toBeNull();
    expect((await page.request.get("/api/profiles")).status()).toBe(401);
  });
}
