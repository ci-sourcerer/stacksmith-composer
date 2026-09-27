import { expect, it } from "vitest";
import { workspaceScope, workspaceUrl } from "./workspace";

it.each(["health", "repositories", "platform-config"])(
  "keeps %s independent of repository context",
  (tab) => {
    expect(workspaceScope(tab)).toBe("platform");
    expect(
      new URL(
        workspaceUrl(
          "https://platform.example/runs?repo=acme/service",
          tab,
          "acme/service",
        ),
      ).searchParams.has("repo"),
    ).toBe(false);
  },
);

it("keeps account token management independent of repository context", () => {
  expect(workspaceScope("tokens")).toBe("account");
  expect(
    new URL(
      workspaceUrl(
        "https://platform.example/runs?repo=acme/service",
        "tokens",
        "acme/service",
      ),
    ).searchParams.has("repo"),
  ).toBe(false);
});

it.each([
  "runs",
  "environments",
  "repository-config",
  "permissions",
  "credentials",
])("restores the selected repository when entering %s", (tab) => {
  expect(workspaceScope(tab)).toBe("repository");
  expect(
    new URL(
      workspaceUrl(
        "https://platform.example/runs?tab=health",
        tab,
        "acme/service",
      ),
    ).searchParams.get("repo"),
  ).toBe("acme/service");
});
