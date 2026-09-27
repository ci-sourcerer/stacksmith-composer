import { expect, it } from "vitest";
import { ruleImpactMessage, setRuleEnabled } from "./associations";
import { createDraftHistory, draftHistoryReducer } from "./history";
import type { Relationship } from "./types";

const edges: Relationship[] = ["api", "worker"].map((target) => ({
  source: "role",
  output: "arn",
  target,
  property: "role_arn",
  path: ["role_arn"],
  kind: "association",
  rule: "execution-role",
}));

it("explains every affected connection and marks stale impact information", () => {
  expect(ruleImpactMessage("execution-role", edges, false)).toContain(
    "entire stack",
  );
  expect(ruleImpactMessage("execution-role", edges, false)).toContain(
    "api.role_arn",
  );
  expect(ruleImpactMessage("execution-role", edges, false)).toContain(
    "worker.role_arn",
  );
  expect(ruleImpactMessage("execution-role", edges, false)).toContain(
    "out of date",
  );
  expect(ruleImpactMessage("other-rule", edges, true)).not.toContain(
    "api.role_arn",
  );
});

it("disables one stack-wide rule, retains authored references and routing, and supports undo", () => {
  const initial = createDraftHistory({
    components: {
      api: { type: "service", properties: { role_arn: "authored-value" } },
    },
    routes: [{ ...edges[0], points: [{ x: 10, y: 20 }] }],
  });
  const changed = draftHistoryReducer(initial, {
    type: "change",
    update: (draft) => setRuleEnabled(draft, "execution-role", false),
  });
  expect(changed.present.disabled).toEqual(["execution-role"]);
  expect(changed.present.components).toBe(initial.present.components);
  expect(changed.present.routes).toBe(initial.present.routes);
  expect(
    setRuleEnabled(changed.present, "execution-role", false).disabled,
  ).toEqual(["execution-role"]);
  expect(
    setRuleEnabled(changed.present, "execution-role", true).disabled,
  ).toEqual([]);
  expect(draftHistoryReducer(changed, { type: "undo" }).present).toEqual(
    initial.present,
  );
});
