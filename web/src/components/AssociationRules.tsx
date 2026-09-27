import type { Platform, Relationship } from "../types";

interface Props {
  readOnly: boolean;
  rules: Platform["associations"];
  disabled: string[];
  relationships: Relationship[];
  pending: boolean;
  onToggle: (rule: string, enabled: boolean) => void;
}

export function AssociationRules({
  rules,
  disabled,
  relationships,
  pending,
  onToggle,
  readOnly,
}: Props) {
  return (
    <details className="association-rules">
      <summary>
        Managed rules for this stack ({disabled.length} disabled)
      </summary>
      <p className="muted">
        Disabling a rule affects every connection it supplies in this stack.
        Undo restores the previous setting.
      </p>
      {pending && (
        <p role="status">
          Connection lists show the last inspection and may be out of date.
        </p>
      )}
      {rules.map((rule) => (
        <div key={rule.name} className="rule-toggle">
          <div>
            <strong>{rule.name}</strong>
            <p>{rule.description}</p>
            <ul>
              {relationships
                .filter(
                  (edge) =>
                    edge.kind === "association" && edge.rule === rule.name,
                )
                .map((edge, index) => (
                  <li key={index}>
                    <code>
                      {edge.source}.{edge.output} → {edge.target}.
                      {edge.property}
                    </code>
                  </li>
                ))}
            </ul>
            <button
              className="button small"
              disabled={readOnly}
              onClick={() => onToggle(rule.name, disabled.includes(rule.name))}
            >
              {disabled.includes(rule.name)
                ? "Enable this rule for this stack"
                : "Disable this rule for this stack"}
            </button>
          </div>
        </div>
      ))}
    </details>
  );
}
