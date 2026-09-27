import type { Draft } from "./history";
import type { Relationship } from "./types";

export function setRuleEnabled(
  draft: Draft,
  rule: string,
  enabled: boolean,
): Draft {
  return {
    ...draft,
    disabled: enabled
      ? draft.disabled.filter((name) => name !== rule)
      : [...new Set([...draft.disabled, rule])],
  };
}

export function ruleImpactMessage(
  rule: string,
  relationships: Relationship[],
  current: boolean,
): string {
  return `Disable ${rule} for this entire stack?\n\n${
    relationships
      .filter((edge) => edge.kind === "association" && edge.rule === rule)
      .map(
        (edge) =>
          `${edge.source}.${edge.output} → ${edge.target}.${edge.property}`,
      )
      .join("\n") || "No connections were found in the last inspection."
  }\n\n${current ? "" : "The connection list may be out of date. "}All connections supplied by this rule are affected. You can undo this change.`;
}
