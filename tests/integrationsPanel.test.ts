// tests/integrationsPanel.test.ts
//
// Settings > API keys lists its services by hand, in display order. The list
// of what can be configured lives in the backend, in
// App\Support\IntegrationCredentials::REGISTRY. If the two disagree, either a
// service the backend can configure never appears on the page, or a card
// appears for something the backend will answer "Unknown integration" to.
//
// It also holds one rule the page must keep: a key is typed, sent, and gone.
// Nothing in the panel or its service may put one in browser storage, where it
// would outlive the session on a shared RHU computer.

import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = path.resolve(__dirname, "..");
const PANEL = path.join(ROOT, "src/components/settings/IntegrationsPanel.tsx");
const SERVICE = path.join(ROOT, "src/services/integrations.ts");

const BACKEND_CANDIDATES = [
  "../../../PROMAIN-BE-1/ka-agapay-backend",
  "../../PROMAIN-BE-1/ka-agapay-backend",
  "../ka-agapay-backend",
];

function backendRegistry(): string[] | null {
  for (const candidate of BACKEND_CANDIDATES) {
    const file = path.resolve(ROOT, candidate, "app/Support/IntegrationCredentials.php");

    if (!fs.existsSync(file)) continue;

    const php = fs.readFileSync(file, "utf8");
    const block = php.match(/public const REGISTRY = \[([\s\S]*?)\n    \];/);

    if (!block) throw new Error("REGISTRY not found in IntegrationCredentials.php");

    // Top-level entries are indented eight spaces and open an array.
    return Array.from(block[1].matchAll(/^ {8}'([a-z_]+)' => \[/gm)).map((m) => m[1]);
  }

  return null;
}

function panelOrder(): string[] {
  const source = fs.readFileSync(PANEL, "utf8");
  const order = source.match(/const ORDER: IntegrationId\[\] = \[([^\]]*)\]/);

  if (!order) throw new Error("ORDER not found in IntegrationsPanel.tsx");

  return Array.from(order[1].matchAll(/"([a-z_]+)"/g)).map((m) => m[1]);
}

describe("the API keys page matches what the backend can configure", () => {
  const registry = backendRegistry();

  it.skipIf(registry === null)("shows a card for every integration, and only those", () => {
    expect(
      [...panelOrder()].sort(),
      "The page and IntegrationCredentials::REGISTRY list different services."
    ).toEqual([...registry!].sort());
  });

  it("has guidance for every card it shows", () => {
    const source = fs.readFileSync(PANEL, "utf8");

    for (const id of panelOrder()) {
      expect(source, `No GUIDANCE entry for ${id}`).toMatch(new RegExp(`\\n  ${id}:\\s*\\n?\\s*"`));
    }
  });
});

describe("viewing a key is guarded on the page as well as the server", () => {
  const panel = () => fs.readFileSync(PANEL, "utf8");
  const service = () => fs.readFileSync(SERVICE, "utf8");

  it("sends the password by POST, never in a URL", () => {
    expect(service()).toMatch(/apiClient\.post\(\s*`\/admin\/settings\/integrations\/\$\{id\}\/reveal`/);
    expect(service()).not.toMatch(/apiClient\.get\([^)]*reveal/);
  });

  it("hides a revealed key on a timer and when the tab is hidden", () => {
    const source = panel();

    expect(source, "No timer ends the reveal.").toMatch(/setInterval\(tick, 1000\)/);
    expect(source, "Leaving the tab does not hide the key.").toMatch(
      /visibilitychange[\s\S]{0,200}|visibilityState === "hidden"\) setRevealed\(null\)/
    );
  });

  it("clears the password after every attempt, right or wrong", () => {
    // In a finally block, so a refusal or a network error clears it too.
    expect(panel()).toMatch(/finally \{[\s\S]{0,120}setPassword\(""\)/);
  });
});

describe("a key never outlives the page", () => {
  it("is not written to browser storage", () => {
    for (const file of [PANEL, SERVICE]) {
      const source = fs.readFileSync(file, "utf8");

      expect(source, `${path.basename(file)} touches browser storage`).not.toMatch(
        /localStorage|sessionStorage|indexedDB/
      );
    }
  });
});
