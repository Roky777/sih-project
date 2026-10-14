import { expect, test, type Page } from "@playwright/test";

test.beforeEach(async ({ page }) => {
  test.skip(!process.env.FLEET_E2E_BASE_URL, "Local backend selected explicitly.");
  await page.route("**/api/assistant/status", route => route.fulfill({ json: {
    enabled: true, available: true, model: "fixture-model", detail: "ready", can_run_scenarios: false,
  } }));
});

const answer = { reply: "Checked fixture answer.", model: "fixture-model",
  data_label: "Synthetic UI test fixture", context: {}, tool_calls: [], artifacts: [],
  citations: [], warnings: ["Fixture verification warning."] };

async function ask(page: Page) {
  await page.goto("/");
  await page.getByRole("button", { name: "Ask AeroCare maintenance copilot", exact: true }).first().click();
  await page.getByLabel("Ask the copilot", { exact: true }).fill("Fixture question");
  await page.getByRole("button", { name: "Ask", exact: true }).click();
}

test("checked final answer replaces draft text and retains verification warnings", async ({ page }) => {
  await page.route("**/api/assistant/chat/stream", route => route.fulfill({
    contentType: "application/x-ndjson", body: [
      { type: "delta", text: "Provisional fixture text" },
      { type: "done", response: answer },
    ].map(e => JSON.stringify(e)).join("\n") + "\n",
  }));
  await ask(page);
  const reply = page.locator(".o-ai-msg.bot").last();
  await expect(reply).toContainText(answer.reply);
  await expect(reply).toContainText(answer.warnings[0]);
  await expect(reply).not.toContainText("Provisional fixture text");
  await expect(page.locator(".o-ai-typing")).toHaveCount(0);
});

test("truncated stream cannot become a completed answer", async ({ page }) => {
  await page.route("**/api/assistant/chat/stream", route => route.fulfill({
    contentType: "application/x-ndjson", body: JSON.stringify({ type: "delta", text: "Incomplete fixture text" }) + "\n",
  }));
  await ask(page);
  await expect(page.locator(".o-ai-msg.error")).toContainText("ended before completion");
  await expect(page.locator(".o-ai-msg.bot")).not.toContainText("Incomplete fixture text");
});

test("malformed completed response is rejected without crashing the panel", async ({ page }) => {
  const errors: string[] = []; page.on("pageerror", e => errors.push(e.message));
  await page.route("**/api/assistant/chat/stream", route => route.fulfill({
    contentType: "application/x-ndjson", body: JSON.stringify({ type: "done", response: { ...answer, citations: [null] } }) + "\n",
  }));
  await ask(page);
  await expect(page.locator(".o-ai-msg.error")).toContainText("Invalid completed answer");
  expect(errors).toEqual([]);
});

test("cancelling a pending question cannot display its late answer", async ({ page }) => {
  await page.route("**/api/assistant/chat/stream", async route => {
    await new Promise(resolve => setTimeout(resolve, 800));
    await route.fulfill({ contentType: "application/x-ndjson", body: JSON.stringify({ type: "done", response: answer }) + "\n" }).catch(() => {});
  });
  await ask(page);
  await page.getByRole("button", { name: "Cancel", exact: true }).click();
  await expect(page.locator(".o-ai-msg.bot").last()).toContainText("Cancelled.");
  await expect(page.locator(".o-ai-msg.bot")).not.toContainText(answer.reply);
});

test("completed conversation gives space to answers and keeps details collapsed on mobile", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await page.route("**/api/assistant/chat/stream", route => route.fulfill({
    contentType: "application/x-ndjson", body: JSON.stringify({ type: "done", response: answer }) + "\n",
  }));
  await ask(page);
  await expect(page.locator(".o-ai-reply")).toContainText(answer.reply);
  await expect(page.locator(".o-ai-suggestions")).toHaveCount(0);
  await expect(page.locator(".o-ai-trace")).not.toHaveAttribute("open", "");
  await expect(page.getByLabel("Ask the copilot", { exact: true })).toBeEnabled();
  expect(await page.locator(".o-ai-panel").evaluate(el => el.scrollWidth <= el.clientWidth)).toBe(true);
});
