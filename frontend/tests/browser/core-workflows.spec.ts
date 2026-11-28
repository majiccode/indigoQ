import { test, expect, type APIRequestContext } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";

async function loadExample(request: APIRequestContext, name: string) {
  const graph = JSON.parse(fs.readFileSync(path.resolve("public/examples", `${name}.json`), "utf8")).graph;
  const response = await request.post("/api/graph/import", { data: graph });
  expect(response.ok()).toBeTruthy();
}

test("starter entry is visible and dismissing the hint persists", async ({ page, request }) => {
  await loadExample(request, "chart-studio");
  await page.goto("/");
  await page.getByRole("button", { name: "Start here", exact: true }).click();
  await expect(page.getByRole("dialog", { name: "Make your first connection" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Load PDF Read-aloud" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Load Notes to Structured Data" })).toBeVisible();
  await page.getByRole("button", { name: "Close starter workflows" }).click();
  await page.getByRole("button", { name: "Dismiss getting started" }).click();
  await page.reload();
  await expect(page.getByRole("button", { name: "Start here", exact: true })).toBeEnabled();
  await expect(page.getByRole("complementary", { name: "Getting started" })).toHaveCount(0);
});

test("PDF extracts text; speech starts explicitly and supports pause, resume, stop", async ({ page, request }) => {
  await loadExample(request, "pdf-read-aloud");
  await page.addInitScript(() => {
    const browser = window as unknown as { __spoken: string[]; __canceled: number };
    browser.__spoken = []; browser.__canceled = 0;
    class Utterance { text: string; constructor(text: string) { this.text = text; } }
    const synth = Object.assign(new EventTarget(), {
      getVoices: () => [{ name: "Test voice", voiceURI: "test", lang: "en-US" }],
      speak: (u: Utterance) => browser.__spoken.push(u.text),
      cancel: () => browser.__canceled++, pause: () => {}, resume: () => {},
    });
    Object.defineProperty(window, "speechSynthesis", { value: synth });
    Object.defineProperty(window, "SpeechSynthesisUtterance", { value: Utterance });
  });
  await page.goto("/workspace/?id=pdf-preview");
  await expect(page.getByText("Page 1 of 1", { exact: true })).toBeVisible();
  await expect.poll(async () => {
    const graph = await (await request.get("/api/graph")).json();
    return graph.workspaces.find((w: { id: string }) => w.id === "pdf-preview").tool.output;
  }).toContain("Welcome to indigoQ");
  await page.goto("/workspace/?id=pdf-speech");
  await expect(page.getByText(/characters ready from Document Preview/)).toBeVisible();
  expect(await page.evaluate(() => (window as unknown as { __spoken: string[] }).__spoken)).toEqual([]);
  await page.getByRole("button", { name: "Speak it all", exact: true }).click();
  expect((await page.evaluate(() => (window as unknown as { __spoken: string[] }).__spoken)).join(" ")).toContain("Welcome to indigoQ");
  await page.getByRole("button", { name: "Pause", exact: true }).click();
  await page.getByRole("button", { name: "Resume", exact: true }).click();
  await page.getByRole("button", { name: "Stop", exact: true }).click();
  await expect(page.getByRole("button", { name: "Speak it all", exact: true })).toBeEnabled();
  await page.reload();
  expect(await page.evaluate(() => (window as unknown as { __spoken: string[] }).__spoken)).toEqual([]);
});

test("structured records validate, import, and survive invalid replacement input", async ({ page, request }) => {
  await loadExample(request, "structured-data");
  await page.goto("/workspace/?id=records-transform");
  await page.getByRole("button", { name: "Run transform" }).click();
  await expect(page.getByText(/Ready: 3 rows/)).toBeVisible();
  await expect.poll(async () => (await (await request.get("/api/graph")).json()).workspaces.find((w: { id: string }) => w.id === "records-transform").tool.table?.rows.length).toBe(3);
  await page.goto("/workspace/?id=records-table");
  await page.getByLabel("Import connected input").selectOption("table|records-transform");
  await expect(page.getByLabel("Row 1, item", { exact: true })).toHaveValue("Notebook");
  await page.getByLabel("Row 1, item", { exact: true }).fill("My notebook");
  await expect.poll(async () => (await (await request.get("/api/graph")).json()).workspaces.find((w: { id: string }) => w.id === "records-table").tool.rows?.[0]?.[0]).toBe("My notebook");
  const graph = await (await request.get("/api/graph")).json();
  const model = graph.workspaces.find((w: { id: string }) => w.id === "records-ai");
  await request.put("/api/workspaces/records-ai/tool", { data: { ...model.tool, output: "invalid JSON" } });
  await page.goto("/workspace/?id=records-transform");
  await page.getByRole("button", { name: "Run transform" }).click();
  await expect(page.locator(".tool-error")).toBeVisible();
  await page.goto("/workspace/?id=records-table");
  await expect(page.getByLabel("Row 1, item", { exact: true })).toHaveValue("My notebook");
});

test("table edits update charts and export a usable PNG", async ({ page, request }) => {
  await loadExample(request, "chart-studio");
  await page.goto("/workspace/?id=chart-data");
  await page.getByLabel("Row 1, sales", { exact: true }).fill("42");
  await expect.poll(async () => (await (await request.get("/api/graph")).json()).workspaces.find((w: { id: string }) => w.id === "chart-data").tool.rows[0][1]).toBe("42");
  await page.goto("/workspace/?id=chart-view");
  await expect(page.locator("circle title").filter({ hasText: /42/ }).first()).toHaveCount(1);
  const pending = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export PNG", exact: true }).click();
  const download = await pending;
  expect(download.suggestedFilename()).toBe("chart.png");
  const file = await download.path();
  expect(fs.readFileSync(file!).subarray(0, 8)).toEqual(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
});
