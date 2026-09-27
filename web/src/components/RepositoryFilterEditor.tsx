import { useEffect, useState } from "react";
import { api } from "../api";
import {
  ListAddButton,
  ListRemoveButton,
  StringListEditor,
  stringListItems,
} from "./ListControls";
import type { StringListItem } from "./ListControls";

type Rules = { properties: Record<string, string>; topics: string[] };
type PropertyRule = { id: string; name: string; value: string };

export function RepositoryFilterEditor({
  onSaved,
  onError,
}: {
  onSaved: () => void;
  onError: (message: string) => void;
}) {
  const [rules, setRules] = useState<Rules | null>(null);
  const [properties, setProperties] = useState<PropertyRule[]>([]);
  const [topics, setTopics] = useState<StringListItem[]>([]);
  const [organizations, setOrganizations] = useState(false);
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  useEffect(() => {
    let active = true;
    Promise.all([
      api<Rules>("/v1/repository-filter"),
      api<{ installations: { account_type: string | null }[] }>(
        "/github-connection",
      ),
    ])
      .then(([value, connection]) => {
        if (!active) return;
        setRules(value);
        setProperties(
          Object.entries(value.properties).map(([name, propertyValue]) => ({
            id: crypto.randomUUID(),
            name,
            value: propertyValue,
          })),
        );
        setTopics(stringListItems(value.topics));
        setOrganizations(
          connection.installations.some(
            (item) => item.account_type === "Organization",
          ),
        );
      })
      .catch((error: unknown) => {
        if (active)
          onError(
            error instanceof Error
              ? error.message
              : "Could not load repository filters.",
          );
      });
    return () => {
      active = false;
    };
  }, [onError]);

  async function save(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!rules) return;
    setBusy(true);
    setSaved(false);
    try {
      setRules(
        await api<Rules>(
          "/v1/repository-filter",
          {
            properties: organizations
              ? Object.fromEntries(
                  properties
                    .filter((item) => item.name.trim())
                    .map((item) => [item.name.trim(), item.value.trim()]),
                )
              : rules.properties,
            topics: topics.map((item) => item.value.trim()).filter(Boolean),
          },
          undefined,
          undefined,
          "PUT",
        ),
      );
      setSaved(true);
      onSaved();
    } catch (error) {
      onError(
        error instanceof Error
          ? error.message
          : "Could not save repository filters.",
      );
    } finally {
      setBusy(false);
    }
  }

  function changeProperty(id: string, field: "name" | "value", value: string) {
    setSaved(false);
    setProperties((items) =>
      items.map((item) =>
        item.id === id ? { ...item, [field]: value } : item,
      ),
    );
  }

  function removeProperty(id: string) {
    setSaved(false);
    setProperties((items) => items.filter((item) => item.id !== id));
  }

  if (!rules) return <p>Loading repository filters…</p>;
  return (
    <form
      className="repository-filter-editor"
      onSubmit={(event) => void save(event)}
    >
      <h3>Discovery filter</h3>
      <p>Include repositories matching any custom property or topic.</p>
      <RepositoryFilterFields
        properties={properties}
        topics={topics}
        organizations={organizations}
        busy={busy}
        onPropertyChange={changeProperty}
        onRemoveProperty={removeProperty}
        onAddProperty={() => {
          setSaved(false);
          setProperties((items) => [
            ...items,
            { id: crypto.randomUUID(), name: "", value: "" },
          ]);
        }}
        onTopicsChange={(value) => {
          setSaved(false);
          setTopics(value);
        }}
      />
      <div className="platform-actions">
        <button disabled={busy}>{busy ? "Saving…" : "Save filter"}</button>
        {saved && <span role="status">Repository filter saved.</span>}
      </div>
    </form>
  );
}

export function RepositoryFilterFields({
  properties,
  topics,
  organizations,
  busy,
  onPropertyChange,
  onRemoveProperty,
  onAddProperty,
  onTopicsChange,
}: {
  properties: PropertyRule[];
  topics: StringListItem[];
  organizations: boolean;
  busy: boolean;
  onPropertyChange?: (
    id: string,
    field: "name" | "value",
    value: string,
  ) => void;
  onRemoveProperty?: (id: string) => void;
  onAddProperty?: () => void;
  onTopicsChange?: (value: StringListItem[]) => void;
}) {
  return (
    <>
      <fieldset disabled={!organizations || busy}>
        <legend>Custom properties</legend>
        {!organizations ? (
          <p>
            Custom properties require an organization installation. Use topics
            for personal repositories.
          </p>
        ) : (
          <>
            {!properties.length && (
              <p>
                No custom property rules. Repositories can still match a topic.
              </p>
            )}
            {properties.map((property, index) => (
              <div className="repository-property-row" key={property.id}>
                <label>
                  Property name
                  <input
                    name="property_name"
                    value={property.name}
                    onChange={(event) =>
                      onPropertyChange?.(
                        property.id,
                        "name",
                        event.target.value,
                      )
                    }
                  />
                </label>
                <label>
                  Property value
                  <input
                    name="property_value"
                    value={property.value}
                    onChange={(event) =>
                      onPropertyChange?.(
                        property.id,
                        "value",
                        event.target.value,
                      )
                    }
                  />
                </label>
                <ListRemoveButton
                  label={"Remove property rule " + (index + 1)}
                  onClick={() => onRemoveProperty?.(property.id)}
                />
              </div>
            ))}
            <ListAddButton
              disabled={busy || properties.length >= 32}
              onClick={onAddProperty}
            >
              Add property rule
            </ListAddButton>
          </>
        )}
      </fieldset>
      <StringListEditor
        label="Topics"
        itemLabel="Topic"
        items={topics}
        onChange={(items) => onTopicsChange?.(items)}
        disabled={busy}
        maxItems={32}
        placeholder="stacksmith-stack"
      />
    </>
  );
}
