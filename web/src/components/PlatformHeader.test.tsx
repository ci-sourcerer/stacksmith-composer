import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { PlatformHeader } from "./PlatformHeader";

describe("shared platform header", () => {
  it.each(["composer", "runs"] as const)(
    "preserves navigation and account actions in %s",
    (active) => {
      const html = renderToStaticMarkup(
        <PlatformHeader
          session={{
            mode: "github",
            login: "operator",
            execution_enabled: true,
          }}
          active={active}
          onSignOut={() => {}}
        />,
      );
      expect(html).toContain('aria-label="Stacksmith Platform home"');
      expect(html).toContain('aria-label="Platform"');
      expect(html).toContain('href="/runs"');
      expect(html).toContain('aria-current="page"');
      expect(html).toContain("operator");
      expect(html).toContain("Sign out");
      expect(html).toContain("Switch to dark mode");
      expect(html).toContain("<span>platform</span>");
    },
  );
});
