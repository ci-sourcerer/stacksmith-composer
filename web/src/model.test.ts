import { describe, expect, it } from "vitest";
import {
  canRemove,
  connectComponents,
  defaultJsonValue,
  isJsonValue,
  jsonValueType,
  nextComponentName,
} from "./model";

describe("authored graph changes", () => {
  it("writes escaped bracket references and preserves unrelated properties", () => {
    expect(
      connectComponents(
        {
          "data-store": { type: "database" },
          api: { type: "service", properties: { replicas: 3 } },
        },
        "data-store",
        "endpoint",
        "api",
        "url",
      ).api.properties,
    ).toEqual({
      replicas: 3,
      url: '{{ components["data-store"]["endpoint"] }}',
    });
  });
  it("rejects self references", () => {
    expect(() =>
      connectComponents(
        { api: { type: "service" } },
        "api",
        "url",
        "api",
        "url",
      ),
    ).toThrow("own output");
  });
  it("chooses a unique component name", () => {
    expect(
      nextComponentName("database", {
        database: { type: "database" },
        "database-2": { type: "database" },
      }),
    ).toBe("database-3");
  });
  it("blocks removal of a producer with explicit consumers", () => {
    expect(
      canRemove(
        [
          {
            source: "database",
            target: "api",
            output: "endpoint",
            property: "url",
            path: ["url"],
            kind: "reference",
            rule: null,
          },
        ],
        "database",
      ),
    ).toBe(false);
    expect(
      canRemove(
        [
          {
            source: "network",
            target: "api",
            output: "id",
            property: "network_id",
            path: ["network_id"],
            kind: "association",
            rule: "managed",
          },
        ],
        "network",
      ),
    ).toBe(true);
  });
});

describe("visual JSON values", () => {
  it("identifies every supported value type", () => {
    expect(
      ["value", 2, true, ["item"], { nested: null }, null].map(jsonValueType),
    ).toEqual(["string", "number", "boolean", "array", "object", "null"]);
  });

  it("creates safe empty values when changing a field type", () => {
    expect(defaultJsonValue("object")).toEqual({});
    expect(defaultJsonValue("array")).toEqual([]);
    expect(defaultJsonValue("boolean")).toBe(false);
  });

  it("rejects values JSON cannot represent", () => {
    expect(isJsonValue({ nested: ["ok", 1, false, null] })).toBe(true);
    expect(isJsonValue({ invalid: Number.NaN })).toBe(false);
    expect(isJsonValue({ invalid: undefined })).toBe(false);
  });
});
