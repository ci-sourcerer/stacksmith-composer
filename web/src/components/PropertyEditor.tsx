import { useEffect, useState } from "react";
import {
  Braces,
  ChevronDown,
  ChevronRight,
  CirclePlus,
  Link2,
  ListPlus,
  Plus,
  Trash2,
  Unlink,
} from "lucide-react";
import {
  defaultJsonValue,
  isJsonValue,
  jsonValueType,
  type JsonValue,
  type JsonValueType,
} from "../model";
import type { Port, Relationship } from "../types";

const VALUE_TYPES: { value: JsonValueType; label: string }[] = [
  { value: "string", label: "Text" },
  { value: "number", label: "Number" },
  { value: "boolean", label: "True / false" },
  { value: "array", label: "List" },
  { value: "object", label: "Object" },
  { value: "null", label: "Empty / null" },
];

interface ValueEditorProps {
  value: JsonValue;
  onChange: (value: JsonValue) => void;
  depth?: number;
}

function ValueEditor({ value, onChange, depth = 0 }: ValueEditorProps) {
  const type = jsonValueType(value);
  return (
    <div className={`value-editor depth-${Math.min(depth, 3)}`}>
      <select
        className="value-type"
        aria-label="Value type"
        value={type}
        onChange={(event) =>
          onChange(defaultJsonValue(event.target.value as JsonValueType))
        }
      >
        {VALUE_TYPES.map((option) => (
          <option value={option.value} key={option.value}>
            {option.label}
          </option>
        ))}
      </select>
      {type === "string" && (
        <textarea
          aria-label="Text value"
          rows={String(value).length > 70 ? 3 : 1}
          value={value as string}
          placeholder="Enter a value or Stacksmith expression"
          onChange={(event) => onChange(event.target.value)}
        />
      )}
      {type === "number" && (
        <input
          aria-label="Number value"
          type="number"
          value={value as number}
          onChange={(event) => {
            const next = event.target.valueAsNumber;
            if (Number.isFinite(next)) onChange(next);
          }}
        />
      )}
      {type === "boolean" && (
        <label className="boolean-control">
          <input
            type="checkbox"
            checked={value as boolean}
            onChange={(event) => onChange(event.target.checked)}
          />
          <span>{value ? "True" : "False"}</span>
        </label>
      )}
      {type === "null" && <div className="null-value">No value</div>}
      {type === "array" && (
        <ArrayEditor
          value={value as JsonValue[]}
          onChange={onChange}
          depth={depth}
        />
      )}
      {type === "object" && (
        <ObjectEditor
          value={value as Record<string, JsonValue>}
          onChange={onChange}
          depth={depth}
        />
      )}
    </div>
  );
}

function ArrayEditor({
  value,
  onChange,
  depth,
}: {
  value: JsonValue[];
  onChange: (value: JsonValue) => void;
  depth: number;
}) {
  return (
    <div className="collection-editor">
      {value.map((item, index) => (
        <div className="collection-row" key={index}>
          <span className="collection-index">{index + 1}</span>
          <ValueEditor
            value={item}
            onChange={(next) =>
              onChange(
                value.map((current, itemIndex) =>
                  itemIndex === index ? next : current,
                ),
              )
            }
            depth={depth + 1}
          />
          <button
            className="icon-button subtle-danger"
            aria-label={`Remove list item ${index + 1}`}
            onClick={() =>
              onChange(value.filter((_, itemIndex) => itemIndex !== index))
            }
          >
            <Trash2 size={13} />
          </button>
        </div>
      ))}
      <button className="add-value" onClick={() => onChange([...value, ""])}>
        <ListPlus size={14} /> Add list item
      </button>
    </div>
  );
}

function ObjectEditor({
  value,
  onChange,
  depth,
}: {
  value: Record<string, JsonValue>;
  onChange: (value: JsonValue) => void;
  depth: number;
}) {
  const [newKey, setNewKey] = useState("");
  return (
    <div className="collection-editor object-editor">
      {Object.entries(value).map(([key, item]) => (
        <div className="object-row" key={key}>
          <ObjectKeyEditor
            name={key}
            existingNames={Object.keys(value)}
            onChange={(replacement) =>
              onChange(
                Object.fromEntries(
                  Object.entries(value).map(([currentKey, currentValue]) =>
                    currentKey === key
                      ? [replacement, currentValue]
                      : [currentKey, currentValue],
                  ),
                ),
              )
            }
          />
          <ValueEditor
            value={item}
            onChange={(next) => onChange({ ...value, [key]: next })}
            depth={depth + 1}
          />
          <button
            className="icon-button subtle-danger"
            aria-label={`Remove ${key}`}
            onClick={() =>
              onChange(
                Object.fromEntries(
                  Object.entries(value).filter(([name]) => name !== key),
                ),
              )
            }
          >
            <Trash2 size={13} />
          </button>
        </div>
      ))}
      <div className="new-object-key">
        <input
          aria-label="New object key"
          placeholder="New key"
          value={newKey}
          onChange={(event) => setNewKey(event.target.value)}
          onKeyDown={(event) => {
            if (
              event.key === "Enter" &&
              newKey &&
              !Object.hasOwn(value, newKey)
            ) {
              onChange({ ...value, [newKey]: "" });
              setNewKey("");
            }
          }}
        />
        <button
          className="add-value"
          disabled={!newKey || Object.hasOwn(value, newKey)}
          onClick={() => {
            onChange({ ...value, [newKey]: "" });
            setNewKey("");
          }}
        >
          <Plus size={13} /> Add key
        </button>
      </div>
    </div>
  );
}

function ObjectKeyEditor({
  name,
  existingNames,
  onChange,
}: {
  name: string;
  existingNames: string[];
  onChange: (name: string) => void;
}) {
  const [draft, setDraft] = useState(name);
  const invalid = !draft || (draft !== name && existingNames.includes(draft));
  return (
    <input
      className={`object-key ${invalid ? "is-invalid" : ""}`}
      aria-label={`Object key ${name}`}
      aria-invalid={invalid}
      value={draft}
      onChange={(event) => setDraft(event.target.value)}
      onBlur={() => {
        if (invalid) setDraft(name);
        else if (draft !== name) onChange(draft);
      }}
      onKeyDown={(event) => {
        if (event.key === "Enter") event.currentTarget.blur();
      }}
    />
  );
}

interface PropertyEditorProps {
  inputs: Port[];
  properties: Record<string, unknown>;
  relationships: Relationship[];
  onChange: (properties: Record<string, unknown>) => void;
}

export function PropertyEditor({
  inputs,
  properties,
  relationships,
  onChange,
}: PropertyEditorProps) {
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [source, setSource] = useState(JSON.stringify(properties, null, 2));
  const [error, setError] = useState("");
  const inputMap = new Map(inputs.map((input) => [input.name, input]));
  const names = [
    ...inputs.map((input) => input.name),
    ...Object.keys(properties).filter((name) => !inputMap.has(name)),
  ];
  useEffect(() => setSource(JSON.stringify(properties, null, 2)), [properties]);

  function update(next: Record<string, unknown>) {
    onChange(next);
    setSource(JSON.stringify(next, null, 2));
    setError("");
  }

  return (
    <div className="properties-editor">
      <div className="properties-heading">
        <span>Properties</span>
        <span>{Object.keys(properties).length} authored</span>
      </div>
      <div className="property-list">
        {names.map((name) => {
          const authored = Object.hasOwn(properties, name);
          const value = properties[name];
          const input = inputMap.get(name);
          const explicit = relationships.find(
            (edge) =>
              edge.kind === "reference" &&
              edge.property === name &&
              edge.path.length === 1,
          );
          const managed = relationships.find(
            (edge) => edge.kind === "association" && edge.property === name,
          );
          return (
            <section
              className={`property-field ${authored ? "is-authored" : ""}`}
              key={name}
            >
              <div className="property-label">
                <div>
                  <code>{name}</code>
                  {input?.description && <p>{input.description}</p>}
                </div>
                {authored ? (
                  <button
                    className="icon-button subtle-danger"
                    aria-label={`Remove ${name}`}
                    title={`Remove ${name}`}
                    onClick={() =>
                      update(
                        Object.fromEntries(
                          Object.entries(properties).filter(
                            ([key]) => key !== name,
                          ),
                        ),
                      )
                    }
                  >
                    <Trash2 size={13} />
                  </button>
                ) : null}
              </div>
              {explicit ? (
                <div className="connection-value">
                  <Link2 size={14} />
                  <span>
                    Connected to{" "}
                    <code>
                      {explicit.source}.{explicit.output}
                    </code>
                  </span>
                  <button
                    className="icon-button"
                    aria-label={`Disconnect ${name}`}
                    onClick={() =>
                      update(
                        Object.fromEntries(
                          Object.entries(properties).filter(
                            ([key]) => key !== name,
                          ),
                        ),
                      )
                    }
                  >
                    <Unlink size={13} />
                  </button>
                </div>
              ) : authored && isJsonValue(value) ? (
                <ValueEditor
                  value={value}
                  onChange={(next) => update({ ...properties, [name]: next })}
                />
              ) : managed ? (
                <div className="managed-value">
                  <Link2 size={13} /> Supplied by {managed.rule}
                </div>
              ) : (
                <button
                  className="add-property"
                  onClick={() => update({ ...properties, [name]: "" })}
                >
                  <CirclePlus size={14} /> Add a value
                </button>
              )}
            </section>
          );
        })}
      </div>
      <button
        className="advanced-toggle"
        onClick={() => setShowAdvanced(!showAdvanced)}
      >
        {showAdvanced ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
        <Braces size={14} /> Advanced JSON
      </button>
      {showAdvanced && (
        <div className="advanced-json">
          <textarea
            aria-label="Advanced properties JSON"
            spellCheck={false}
            rows={9}
            value={source}
            onChange={(event) => setSource(event.target.value)}
          />
          <p className="field-help">
            Use this fallback for copying or editing the complete property
            object.
          </p>
          {error && (
            <p role="alert" className="error-text">
              {error}
            </p>
          )}
          <button
            className="button small"
            onClick={() => {
              try {
                const parsed: unknown = JSON.parse(source);
                if (
                  typeof parsed !== "object" ||
                  parsed === null ||
                  Array.isArray(parsed) ||
                  !isJsonValue(parsed)
                )
                  throw new Error(
                    "Properties must be a JSON object containing finite JSON values.",
                  );
                update(parsed as Record<string, JsonValue>);
              } catch (caught) {
                setError(
                  caught instanceof Error ? caught.message : "Invalid JSON.",
                );
              }
            }}
          >
            Apply advanced JSON
          </button>
        </div>
      )}
    </div>
  );
}
