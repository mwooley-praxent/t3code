import type { BrowserLinkTarget } from "@t3tools/contracts";
import { describe, expect, it, vi } from "vite-plus/test";

import { resolveLinkTarget } from "./browserLinkTarget";

const settings = vi.hoisted(() => ({ browserLinkTarget: "system" as BrowserLinkTarget }));

vi.mock("~/hooks/useSettings", () => ({
  ensureClientSettingsHydrated: vi.fn(async () => undefined),
  getClientSettings: () => settings,
}));

const click = { metaKey: false, ctrlKey: false };

describe("resolveLinkTarget", () => {
  it("flips the preference while ⌘ or Ctrl is held", () => {
    const url = "https://example.com";
    const mod = { metaKey: true, ctrlKey: false };
    const resolve = (preference: BrowserLinkTarget, event: typeof click) =>
      resolveLinkTarget({ url, event, preference, canOpenInApp: true });
    expect(resolve("system", click)).toBe("system");
    expect(resolve("system", mod)).toBe("app");
    expect(resolve("system", { metaKey: false, ctrlKey: true })).toBe("app");
    expect(resolve("app", click)).toBe("app");
    expect(resolve("app", mod)).toBe("system");
    expect(
      resolveLinkTarget({
        url,
        event: { ...mod, button: 1 },
        preference: "system",
        canOpenInApp: true,
      }),
    ).toBe("system");
  });

  it("never opens in the app when it cannot", () => {
    const event = { metaKey: true, ctrlKey: false };
    expect(
      resolveLinkTarget({
        url: "https://example.com",
        event,
        preference: "system",
        canOpenInApp: false,
      }),
    ).toBe("system");
  });

  it("leaves non-web schemes to the shell", () => {
    for (const url of ["mailto:someone@example.com", "vscode://file/x", "not a url"]) {
      expect(resolveLinkTarget({ url, event: click, preference: "app", canOpenInApp: true })).toBe(
        "system",
      );
    }
  });
});
