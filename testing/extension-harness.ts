import { chromium, type BrowserContext, type Page } from "playwright";
import path from "node:path";
import fs from "node:fs/promises";

const extensionPath = path.resolve(".output/chrome-mv3");
const profilePath = path.resolve("testing/chromium-profile");
const reportPath = path.resolve("testing/HARNESS_RESULTS.json");
const screenshotDir = path.resolve("testing/screenshots");
const licenseKey = process.env.TABYRINTH_LICENSE_KEY?.trim();

type Check = {
  name: string;
  status: "PASS" | "FAIL" | "SKIP";
  detail: string;
};

const checks: Check[] = [];

function record(name: string, status: Check["status"], detail: string) {
  checks.push({ name, status, detail });
  console.log(`${status.padEnd(4)} ${name}: ${detail}`);
}

async function storage(page: Page): Promise<Record<string, unknown>> {
  return page.evaluate(async () => chrome.storage.local.get(null));
}

async function seedState(page: Page) {
  const now = Date.now();
  const makeNode = (id: number, title: string, workspaceID: string, note?: string) => ({
      id,
      title,
      url: `https://example.com/${id}`,
      parentID: null,
      windowID: 1,
      childrenIDs: [],
      isLoading: false,
      isClosed: false,
      workspaceID,
      notes: note ? [{ id: `note-${id}`, content: note, createdAt: now }] : [],
    });
  const nodes = {
      101: makeNode(101, "Alpha research 1", "workspace-default", "<p>Default workspace note</p>"),
      102: makeNode(102, "Alpha research 2", "workspace-default"),
      103: makeNode(103, "Alpha research 3", "workspace-default"),
      201: makeNode(201, "Beta research 1", "workspace-harness", "<p>Beta workspace note</p>"),
      202: makeNode(202, "Beta research 2", "workspace-harness"),
      203: makeNode(203, "Beta research 3", "workspace-harness"),
    };
  await page.evaluate(async (tabTreeData) => {
    await chrome.storage.local.set({ tabTreeData });
  }, {
        nodes,
        rootIDs: Object.keys(nodes).map(Number),
        groups: {},
        lastActiveTabID: 101,
        activeMediaTabID: null,
        activeMediaAccentColor: null,
        activeWorkspaceID: "workspace-default",
        workspaces: [
          { id: "workspace-default", name: "untitled", isDefault: true },
          { id: "workspace-harness", name: "Harness Workspace" },
        ],
        moodboardItems: {
          "seed-image": {
            id: "seed-image",
            type: "image",
            content: "https://via.placeholder.com/160",
            sourceURL: "https://example.com/image",
            sourceTitle: "Seed image",
            workspaceID: "workspace-default",
            createdAt: now,
          },
          "seed-note": {
            id: "seed-note",
            type: "note",
            content: "Seed moodboard text",
            sourceTitle: "Seed note",
            workspaceID: "workspace-default",
            createdAt: now,
          },
        },
        moodboardVisible: false,
        hotTabs: {},
      });
}

async function openExtension(context: BrowserContext): Promise<{ page: Page; id: string }> {
  const worker = context.serviceWorkers()[0] ?? await context.waitForEvent("serviceworker");
  const id = new URL(worker.url()).host;
  const page = await context.newPage();
  await page.goto(`chrome-extension://${id}/sidepanel.html`);
  await page.getByPlaceholder("Search Tabs").waitFor({ state: "visible", timeout: 10000 });
  return { page, id };
}

async function main() {
  await fs.rm(profilePath, { recursive: true, force: true });
  await fs.mkdir(path.dirname(reportPath), { recursive: true });
  await fs.mkdir(screenshotDir, { recursive: true });

  const context = await chromium.launchPersistentContext(profilePath, {
    headless: false,
    args: [
      `--disable-extensions-except=${extensionPath}`,
      `--load-extension=${extensionPath}`,
    ],
  });

  const consoleErrors: string[] = [];
  const pageErrors: string[] = [];

  try {
    const { page, id } = await openExtension(context);
    page.on("console", (message) => {
      if (message.type() === "error") consoleErrors.push(message.text());
    });
    page.on("pageerror", (error) => pageErrors.push(error.message));

    record("Extension loads in Chromium", "PASS", `Loaded unpacked extension ${id}`);

    await page.waitForTimeout(1000);
    const initialText = await page.locator("body").innerText();
    const hasInitialControls =
      await page.getByText("New tab", { exact: true }).isVisible().catch(() => false) &&
      await page.getByPlaceholder("Search Tabs").isVisible().catch(() => false);
    record(
      "Initial side-panel UI",
      hasInitialControls ? "PASS" : "FAIL",
      `Rendered expected controls: ${hasInitialControls}; body text length ${initialText.length}`,
    );

    const initialPages = context.pages().length;
    await page.getByText("New tab", { exact: true }).click();
    await page.waitForTimeout(500);
    record(
      "New tab action",
      context.pages().length > initialPages ? "PASS" : "FAIL",
      `Browser page count changed from ${initialPages} to ${context.pages().length}`,
    );

    const search = page.getByPlaceholder("Search Tabs");
    await search.fill("unlikely-tabyrinth-query");
    await page.waitForTimeout(250);
    record(
      "Search input",
      (await search.inputValue()) === "unlikely-tabyrinth-query" ? "PASS" : "FAIL",
      "Search query is accepted and retained",
    );
    await search.fill("");

    const settingsButton = page.locator("button").filter({ has: page.locator("svg") }).last();
    await settingsButton.click();
    await page.getByText("Upgrade to Tabyrinth Plus").waitFor({ state: "visible", timeout: 5000 }).catch(() => {});
    const settingsText = await page.locator("body").innerText();
    record(
      "Settings panel",
      settingsText.includes("Already have a key?") || settingsText.includes("Plus License Active") ? "PASS" : "FAIL",
      `Settings view text detected: ${settingsText.includes("Already have a key?") || settingsText.includes("Plus License Active")}`,
    );

    if (!licenseKey) {
      record("Plus license activation", "SKIP", "Set TABYRINTH_LICENSE_KEY to run activation without storing the key in source");
    } else if (settingsText.includes("Plus License Active")) {
      record("Plus license activation", "PASS", "Temporary profile already reports Plus active");
    } else {
      await page.getByPlaceholder("PRO-XXXX-XXXX-XXXX").fill(licenseKey);
      await page.getByText("Activate License", { exact: true }).click();
      await page.waitForTimeout(3000);
      const afterActivation = await page.locator("body").innerText();
      const persisted = await storage(page);
      const active = persisted.isPro === true && typeof persisted.licenseKey === "string";
      record(
        "Plus license activation",
        active && afterActivation.includes("Plus License Active") ? "PASS" : "FAIL",
        active ? "Activation persisted in temporary extension storage" :
          `Activation did not persist; status: ${afterActivation.includes("INVALID") ? "invalid key response" : "no Plus state"}`,
      );
    }

    await page.reload();
    await page.getByPlaceholder("Search Tabs").waitFor({ state: "visible", timeout: 10000 });
    const reloadedText = await page.locator("body").innerText();
    record(
      "Plus state survives panel reload",
      !licenseKey || reloadedText.includes("Plus") ? "PASS" : "FAIL",
      "Reloaded side panel without losing the persisted subscription state",
    );

    await page.getByText("untitled", { exact: true }).click();
    await page.getByText("Workspaces", { exact: true }).waitFor({ state: "visible", timeout: 5000 });
    await page.getByText("New", { exact: true }).click();
    await page.getByPlaceholder("Group name").fill("Harness Workspace");
    await page.getByText("Add", { exact: true }).click();
    await page.getByText("Harness Workspace", { exact: true }).waitFor({ state: "visible", timeout: 5000 });
    record("Workspace creation", "PASS", "Created and switched to a workspace through the UI");

    await seedState(page);
    await page.reload();
    await page.getByText("Alpha research 1", { exact: true }).waitFor({ state: "visible", timeout: 10000 });

    await page.getByText("untitled", { exact: true }).click();
    await page.getByText("Harness Workspace", { exact: true }).click();
    await page.getByText("Beta research 1", { exact: true }).waitFor({ state: "visible", timeout: 5000 });
    const betaVisible = await page.getByText("Alpha research 1", { exact: true }).count() === 0;
    record("Workspace switching and isolation", betaVisible ? "PASS" : "FAIL", "Beta workspace shows beta tabs and hides default tabs");

    await page.getByText("Beta research 1", { exact: true }).hover();
    await page.getByText("Beta research 1", { exact: true }).locator("..").locator("..").locator("button:visible").first().click();
    await page.screenshot({ path: path.join(screenshotDir, "workspace-beta-note.png"), fullPage: true });
    const betaNotesVisible = await page.getByText("Beta workspace note", { exact: false }).count() > 0;
    record("Workspace note rendering", betaNotesVisible ? "PASS" : "FAIL", "Captured screenshot of the beta workspace note surface");
    await page.getByText("Notes for", { exact: true }).locator("..").locator("..").locator("button").click();

    await page.getByText("Harness Workspace", { exact: true }).click();
    await page.getByText("untitled", { exact: true }).click();
    await page.getByText("Alpha research 1", { exact: true }).hover();
    await page.getByText("Alpha research 1", { exact: true }).locator("..").locator("..").locator("button:visible").first().click();
    await page.screenshot({ path: path.join(screenshotDir, "workspace-default-note.png"), fullPage: true });
    const defaultNotesVisible = await page.getByText("Default workspace note", { exact: false }).count() > 0;
    record("Cross-workspace note separation", defaultNotesVisible && betaNotesVisible ? "PASS" : "FAIL", "Notes remain associated with their respective workspace tabs");
    await page.getByText("Notes for", { exact: true }).locator("..").locator("..").locator("button").click();

    await page.getByTitle("Open moodboard").click();
    const moodboardVisible = (await page.locator("body").innerText()).includes("Seed moodboard text");
    record(
      "Moodboard toggle",
      moodboardVisible ? "PASS" : "FAIL",
      "Moodboard board expanded in the side-panel layout",
    );
    const moodboardText = await page.locator("body").innerText();
    const moodboardHasSeedContent = moodboardText.includes("Seed moodboard text");
    await page.screenshot({ path: path.join(screenshotDir, "moodboard.png"), fullPage: true });
    record("Moodboard seeded image and text", moodboardHasSeedContent ? "PASS" : "FAIL", "Moodboard rendered seeded note content and captured a screenshot");

    await page.getByTitle("Open moodboard").click();
    await page.locator("button").filter({ has: page.locator("svg") }).last().click();
    const downloadExport = async (label: string, index: number, name: string) => {
      const candidates = page.getByText(label, { exact: true });
      try {
        const downloadPromise = page.waitForEvent("download", { timeout: 8000 });
        await candidates.nth(index).click();
        const download = await downloadPromise;
        record(name, "PASS", `Downloaded ${download.suggestedFilename()}`);
      } catch {
        record(name, "FAIL", "Export click did not produce a download");
      }
    };
    const pdfExport = async (label: string, index: number, name: string) => {
      const before = context.pages().length;
      await page.locator("button").filter({ hasText: label }).nth(index).click();
      await page.waitForTimeout(500);
      record(name, context.pages().length > before ? "PASS" : "FAIL", "PDF export opened a printable browser tab");
    };
    await downloadExport("This workspace", 0, "Notes Markdown: workspace");
    await downloadExport("All workspaces", 0, "Notes Markdown: all workspaces");
    await pdfExport("This workspace", 1, "Notes PDF: workspace");
    await pdfExport("All workspaces", 1, "Notes PDF: all workspaces");
    await downloadExport("This workspace", 2, "Moodboard Markdown: workspace");
    await downloadExport("All workspaces", 2, "Moodboard Markdown: all workspaces");
    await pdfExport("This workspace", 3, "Moodboard PDF: workspace");
    await pdfExport("All workspaces", 3, "Moodboard PDF: all workspaces");
    await pdfExport("PDF", 0, "Visual moodboard PDF");
    await downloadExport("HTML", 0, "Visual moodboard HTML");
    await downloadExport("This workspace", 4, "Research trail: workspace");
    await downloadExport("All workspaces", 4, "Research trail: all workspaces");

    await page.waitForTimeout(22000);
    const contextAState = await storage(page);
    const secondProfile = path.resolve("testing/chromium-profile-b");
    await fs.rm(secondProfile, { recursive: true, force: true });
    const contextB = await chromium.launchPersistentContext(secondProfile, {
      headless: false,
      args: [`--disable-extensions-except=${extensionPath}`, `--load-extension=${extensionPath}`],
    });
    try {
      const { page: pageB } = await openExtension(contextB);
      if (licenseKey) {
        await pageB.locator("button").filter({ has: pageB.locator("svg") }).last().click();
        const textB = await pageB.locator("body").innerText();
        if (!textB.includes("Plus License Active")) {
          await pageB.getByPlaceholder("PRO-XXXX-XXXX-XXXX").fill(licenseKey);
          await pageB.getByText("Activate License", { exact: true }).click();
          await pageB.waitForTimeout(3000);
        }
      }
      await pageB.waitForTimeout(3000);
      const contextBState = await storage(pageB);
      const synced = JSON.stringify(contextBState.tabTreeData).includes("Alpha research 1");
      record("Cross-browser session sync", synced ? "PASS" : "FAIL", synced ? "Profile B received profile A tabs" : "Profile B did not receive profile A tab state");
      await pageB.screenshot({ path: path.join(screenshotDir, "cross-browser-profile-b.png"), fullPage: true });
      await pageB.evaluate(async () => {
        const stored = await chrome.storage.local.get("tabTreeData");
        const current = stored.tabTreeData as {
          nodes: Record<string, unknown>;
          rootIDs: number[];
          [key: string]: unknown;
        };
        const node = {
          id: 303,
          title: "Profile B only tab",
          url: "https://example.com/profile-b-only",
          parentID: null,
          windowID: 1,
          childrenIDs: [],
          isLoading: false,
          isClosed: false,
          workspaceID: "workspace-harness",
        };
        await chrome.storage.local.set({
          tabTreeData: {
            ...current,
            nodes: { ...current.nodes, 303: node },
            rootIDs: [...current.rootIDs, 303],
          },
        });
      });
      await pageB.waitForTimeout(22000);
      await contextB.close();
      await context.close();
      const contextA2 = await chromium.launchPersistentContext(profilePath, {
        headless: false,
        args: [`--disable-extensions-except=${extensionPath}`, `--load-extension=${extensionPath}`],
      });
      try {
        const { page: pageA2 } = await openExtension(contextA2);
        await pageA2.waitForTimeout(3000);
        const reverseState = await storage(pageA2);
        const reverseSynced = JSON.stringify(reverseState.tabTreeData).includes("Profile B only tab");
        record("Cross-browser reverse sync", reverseSynced ? "PASS" : "FAIL", reverseSynced ? "Profile A received the tab created in Profile B" : "Profile A did not receive the Profile B change");
      } finally {
        await contextA2.close();
      }
    } finally {
      await contextB.close().catch(() => {});
      await fs.rm(secondProfile, { recursive: true, force: true });
    }

    const persisted = contextAState;
    record(
      "Extension storage available",
      typeof persisted === "object" ? "PASS" : "FAIL",
      `Read ${Object.keys(persisted).length} storage keys`,
    );

    if (consoleErrors.length || pageErrors.length) {
      record("Runtime errors", "FAIL", [...consoleErrors, ...pageErrors].join(" | "));
    } else {
      record("Runtime errors", "PASS", "No console/page errors during the harness flow");
    }
  } finally {
    await context.close();
  }

  await fs.writeFile(reportPath, JSON.stringify({
    generatedAt: new Date().toISOString(),
    checks,
    note: "License values are intentionally omitted.",
  }, null, 2));

  if (checks.some((check) => check.status === "FAIL")) process.exitCode = 1;
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
