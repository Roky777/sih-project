import { expect, test, type Page } from "@playwright/test";

test.beforeEach(async ({ page }) => {
  await page.route(/^https?:\/\/[^/]+\/api\//, route => {
    const path = new URL(route.request().url()).pathname;
    if (path === '/api/access/session') return route.fulfill({ json: {
      id: 'assistant-fixture', role: 'viewer', authentication: 'server session', csrf_token: 'fixture',
    } });
    return route.fulfill({ json: [] });
  });
  await page.addLocatorHandler(page.getByRole('button', { name: 'Skip', exact: true }), async () => {
    await page.getByRole('button', { name: 'Skip', exact: true }).click();
  });
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

test("a model timeout stops the spinner and remains retryable", async ({ page }) => {
  await page.route("**/api/assistant/chat/stream", route => route.fulfill({
    contentType: "application/x-ndjson", body: [
      { type: "status", text: "Interpreting your question with the configured model…" },
      { type: "error", message: "The model did not respond in time." },
    ].map(e => JSON.stringify(e)).join("\n") + "\n",
  }));
  await ask(page);
  await expect(page.locator('.o-ai-msg.error')).toContainText('did not respond in time');
  await expect(page.locator('.o-ai-msg.error').getByRole('button', { name: 'Retry' })).toBeVisible();
  await expect(page.locator('.o-ai-typing')).toHaveCount(0);
});

test("model status updates replace the generic waiting message", async ({ page }) => {
  await page.addInitScript((response) => {
    const original = window.fetch.bind(window);
    window.fetch = (input, init) => {
      if (String(input).includes('/assistant/chat/stream')) {
        const encoder = new TextEncoder();
        return Promise.resolve(new Response(new ReadableStream({
          start(controller) {
            controller.enqueue(encoder.encode(JSON.stringify({
              type: 'status', text: 'Interpreting your question with the configured model…',
            }) + '\n'));
            setTimeout(() => {
              controller.enqueue(encoder.encode(JSON.stringify({ type: 'done', response }) + '\n'));
              controller.close();
            }, 1800);
          },
        }), { headers: { 'Content-Type': 'application/x-ndjson' } }));
      }
      return original(input, init);
    };
  }, answer);
  await ask(page);
  await expect(page.locator('.o-ai-msg.bot[role="status"]')).toContainText('Interpreting your question');
  await expect(page.locator('.o-ai-msg.bot').last()).toContainText(answer.reply);
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
