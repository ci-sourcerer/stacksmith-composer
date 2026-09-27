import type { Components, Relationship } from "./types";

export type JsonValue =
  string | number | boolean | null | JsonValue[] | { [key: string]: JsonValue };

export type JsonValueType =
  "string" | "number" | "boolean" | "array" | "object" | "null";

export function jsonValueType(value: JsonValue): JsonValueType {
  if (value === null) return "null";
  if (Array.isArray(value)) return "array";
  if (typeof value === "object") return "object";
  if (typeof value === "number") return "number";
  if (typeof value === "boolean") return "boolean";
  return "string";
}

export function defaultJsonValue(type: JsonValueType): JsonValue {
  switch (type) {
    case "string":
      return "";
    case "number":
      return 0;
    case "boolean":
      return false;
    case "array":
      return [];
    case "object":
      return {};
    case "null":
      return null;
  }
}

export function isJsonValue(value: unknown): value is JsonValue {
  if (value === null || typeof value === "string" || typeof value === "boolean")
    return true;
  if (typeof value === "number") return Number.isFinite(value);
  if (Array.isArray(value)) return value.every(isJsonValue);
  return typeof value === "object" && Object.values(value).every(isJsonValue);
}

export function nextComponentName(
  type: string,
  components: Components,
): string {
  const base = type.replace(/[^a-zA-Z0-9_-]/g, "-");
  if (!Object.hasOwn(components, base)) return base;
  let index = 2;
  while (Object.hasOwn(components, `${base}-${index}`)) index++;
  return `${base}-${index}`;
}

export function connectComponents(
  components: Components,
  source: string,
  output: string,
  target: string,
  property: string,
): Components {
  if (source === target)
    throw new Error("A component cannot consume its own output.");
  if (!Object.hasOwn(components, source) || !Object.hasOwn(components, target))
    throw new Error("Both components must exist.");
  return {
    ...components,
    [target]: {
      ...components[target],
      properties: {
        ...components[target].properties,
        [property]: `{{ components[${JSON.stringify(source)}][${JSON.stringify(output)}] }}`,
      },
    },
  };
}

export function canRemove(
  relationships: Relationship[],
  name: string,
): boolean {
  return !relationships.some(
    (edge) => edge.source === name && edge.kind === "reference",
  );
}
