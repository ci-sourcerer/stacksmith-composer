import { useEffect, useReducer, useState } from "react";
import {
  ArrowDownToLine,
  ArrowLeft,
  ArrowRight,
  Blocks,
  BookOpen,
  Check,
  CircleAlert,
  FileCode2,
  FolderGit2,
  GitBranch,
  Github,
  Layers3,
  LoaderCircle,
  Plus,
  Search,
  Settings2,
  Redo2,
  Undo2,
  X,
} from "lucide-react";
import type { Connection } from "@xyflow/react";
import { api } from "./api";
import {
  canRemove,
  connectComponents,
  nextComponentName,
  relationshipKey,
  removeReference,
} from "./model";
import {
  createDraftHistory,
  draftHistoryReducer,
  isTextEditingTarget,
  keyboardCommand,
} from "./history";
import { Canvas } from "./components/Canvas";
import { Inspector } from "./components/Inspector";
import { PlatformView } from "./components/PlatformView";
import { TypeIcon } from "./components/ComponentNode";
import type {
  Catalog,
  Platform,
  Repository,
  Review,
  Session,
  Snapshot,
} from "./types";

type View = "compose" | "catalog" | "platform" | "review";

function downloadSource(source: string, path: string) {
  const url = URL.createObjectURL(new Blob([source], { type: "text/plain" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = path.split("/").at(-1) ?? "stack.yaml";
  link.click();
  URL.revokeObjectURL(url);
}

function errorMessage(error: unknown): string {
  return error instanceof Error
    ? error.message
    : "An unexpected error occurred.";
}

export default function App() {
  const [session, setSession] = useState<Session>();
  const [catalog, setCatalog] = useState<Catalog>({});
  const [platform, setPlatform] = useState<Platform>();
  const [snapshot, setSnapshot] = useState<Snapshot>();
  const [draftHistory, dispatchDraft] = useReducer(
    draftHistoryReducer,
    undefined,
    () => createDraftHistory(),
  );
  const { components, positions, disabled } = draftHistory.present;
  const [selected, setSelected] = useState<string | null>(null);
  const [selectedRelationship, setSelectedRelationship] = useState<
    string | null
  >(null);
  const [view, setView] = useState<View>("compose");
  const [search, setSearch] = useState("");
  const [review, setReview] = useState<Review>();
  const [inspecting, setInspecting] = useState(false);
  const [validationError, setValidationError] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [repositories, setRepositories] = useState<Repository[]>([]);
  const [picker, setPicker] = useState(false);
  const [chosenRepo, setChosenRepo] = useState("");
  const [stackPaths, setStackPaths] = useState<string[]>([]);
  const [pathsLoading, setPathsLoading] = useState(false);
  const [creatingPR, setCreatingPR] = useState(false);
  const [pr, setPr] = useState<{ url: string; number: number }>();

  function loadSnapshot(opened: Snapshot) {
    dispatchDraft({
      type: "reset",
      draft: {
        positions: {},
        components: opened.document?.components ?? {},
        disabled: opened.document?.disabled_associations ?? [],
      },
    });
    setSnapshot(opened);
    setSelected(null);
    setSelectedRelationship(null);
    setPr(undefined);
    setReview(undefined);
    setValidationError("");
    setView("compose");
  }

  const editable = snapshot?.editable ?? false;

  useEffect(() => {
    let active = true;
    async function initialize() {
      try {
        const connected = await api<Session>("/session");
        if (!active) return;
        setSession(connected);
        if (connected.mode === "github" && !connected.login) return;
        const [types, policy] = await Promise.all([
          api<Catalog>("/catalog"),
          api<Platform>("/platform"),
        ]);
        if (!active) return;
        setCatalog(types);
        setPlatform(policy);
        if (connected.mode === "demo") {
          const sample = await api<Snapshot>("/sample");
          if (active) loadSnapshot(sample);
        } else {
          const repos = await api<Repository[]>("/repositories");
          if (active) {
            setRepositories(repos);
            setPicker(true);
          }
        }
      } catch (error) {
        if (active) setError(errorMessage(error));
      } finally {
        if (active) setLoading(false);
      }
    }
    void initialize();
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    setReview(undefined);
    setPr(undefined);
    if (!snapshot?.editable) {
      setInspecting(false);
      return;
    }
    const abort = new AbortController();
    setInspecting(true);
    setValidationError("");
    const timer = setTimeout(() => {
      api<Review>(
        "/review",
        {
          snapshot: snapshot.snapshot,
          components,
          disabled_associations: disabled,
        },
        abort.signal,
      )
        .then((result) => {
          if (!abort.signal.aborted) setReview(result);
        })
        .catch((error) => {
          if (!abort.signal.aborted) setValidationError(errorMessage(error));
        })
        .finally(() => {
          if (!abort.signal.aborted) setInspecting(false);
        });
    }, 400);
    return () => {
      clearTimeout(timer);
      abort.abort();
    };
  }, [snapshot, components, disabled]);

  useEffect(() => {
    if (!chosenRepo) return;
    const abort = new AbortController();
    setPathsLoading(true);
    setStackPaths([]);
    api<{ paths: string[] }>(
      `/repositories/${chosenRepo}/stacks`,
      undefined,
      abort.signal,
    )
      .then((result) => {
        if (!abort.signal.aborted) setStackPaths(result.paths);
      })
      .catch((error) => {
        if (!abort.signal.aborted) setError(errorMessage(error));
      })
      .finally(() => {
        if (!abort.signal.aborted) setPathsLoading(false);
      });
    return () => abort.abort();
  }, [chosenRepo]);

  const dirty = Boolean(
    snapshot?.document &&
    (JSON.stringify(components) !==
      JSON.stringify(snapshot.document.components ?? {}) ||
      JSON.stringify(disabled) !==
        JSON.stringify(snapshot.document.disabled_associations ?? [])),
  );
  useEffect(() => {
    function preventLoss(event: BeforeUnloadEvent) {
      if (dirty) event.preventDefault();
    }
    window.addEventListener("beforeunload", preventLoss);
    return () => window.removeEventListener("beforeunload", preventLoss);
  }, [dirty]);

  function addComponent(type: string): string {
    const name = nextComponentName(type, components);
    dispatchDraft({
      type: "change",
      update: (draft) => ({
        ...draft,
        components: {
          ...draft.components,
          [name]: { type, properties: {} },
        },
      }),
    });
    setSelected(name);
    setSelectedRelationship(null);
    setView("compose");
    return name;
  }

  function connect(connection: Connection) {
    if (
      !connection.sourceHandle?.startsWith("out:") ||
      !connection.targetHandle?.startsWith("in:")
    )
      return;
    if (
      Object.hasOwn(
        components[connection.target].properties ?? {},
        connection.targetHandle.slice(3),
      ) &&
      !window.confirm(
        "Replace this authored property with the selected output reference?",
      )
    )
      return;
    if (connection.source === connection.target) {
      setError("A component cannot consume its own output.");
      return;
    }
    if (
      !Object.hasOwn(components, connection.source) ||
      !Object.hasOwn(components, connection.target)
    ) {
      setError("Both components must exist.");
      return;
    }
    dispatchDraft({
      type: "change",
      update: (draft) => ({
        ...draft,
        components: connectComponents(
          draft.components,
          connection.source,
          connection.sourceHandle!.slice(4),
          connection.target,
          connection.targetHandle!.slice(3),
        ),
      }),
    });
  }

  function removeComponent(name: string) {
    if (!canRemove(review?.edges ?? [], name)) {
      setError(
        "Another component uses this output. Remove its authored reference first.",
      );
      return;
    }
    dispatchDraft({
      type: "change",
      update: (draft) => ({
        ...draft,
        components: Object.fromEntries(
          Object.entries(draft.components).filter(([key]) => key !== name),
        ),
        positions: Object.fromEntries(
          Object.entries(draft.positions).filter(([key]) => key !== name),
        ),
      }),
    });
    setSelected(null);
  }

  function removeRelationship(key: string) {
    const relationship = review?.edges.find(
      (edge) => relationshipKey(edge) === key,
    );
    if (!relationship) return;
    dispatchDraft({
      type: "change",
      update: (draft) =>
        relationship.kind === "association" && relationship.rule
          ? {
              ...draft,
              disabled: draft.disabled.includes(relationship.rule)
                ? draft.disabled
                : [...draft.disabled, relationship.rule],
            }
          : {
              ...draft,
              components: removeReference(draft.components, relationship),
            },
    });
    setSelectedRelationship(null);
  }

  function changePosition(
    name: string,
    position: { x: number; y: number },
    record: boolean,
  ) {
    dispatchDraft({
      type: "change",
      record,
      update: (draft) => ({
        ...draft,
        positions: { ...draft.positions, [name]: position },
      }),
    });
  }

  async function openStack(path: string) {
    if (
      dirty &&
      !window.confirm(
        "Discard the current unsaved draft and open another stack?",
      )
    )
      return;
    setPathsLoading(true);
    try {
      loadSnapshot(
        await api<Snapshot>(
          `/repositories/${chosenRepo}/stack?path=${encodeURIComponent(path)}`,
        ),
      );
      setPicker(false);
    } catch (error) {
      setError(errorMessage(error));
    } finally {
      setPathsLoading(false);
    }
  }

  async function createPR() {
    if (!snapshot || !review?.diff) return;
    setCreatingPR(true);
    try {
      setPr(
        await api("/pull-requests", {
          snapshot: snapshot.snapshot,
          components,
          disabled_associations: disabled,
        }),
      );
    } catch (error) {
      setError(errorMessage(error));
    } finally {
      setCreatingPR(false);
    }
  }

  useEffect(() => {
    if (selected && !Object.hasOwn(components, selected)) setSelected(null);
  }, [components, selected]);

  useEffect(() => {
    function handleKeyboard(event: KeyboardEvent) {
      if (isTextEditingTarget(event.target)) return;
      const command = keyboardCommand(event);
      if (command === "undo" && draftHistory.past.length) {
        event.preventDefault();
        dispatchDraft({ type: "undo" });
      } else if (command === "redo" && draftHistory.future.length) {
        event.preventDefault();
        dispatchDraft({ type: "redo" });
      } else if (command === "delete" && editable && view === "compose") {
        if (selected) {
          event.preventDefault();
          removeComponent(selected);
        } else if (selectedRelationship) {
          event.preventDefault();
          removeRelationship(selectedRelationship);
        }
      }
    }
    window.addEventListener("keydown", handleKeyboard);
    return () => window.removeEventListener("keydown", handleKeyboard);
  });

  const filteredCatalog = Object.entries(catalog).filter(([type, definition]) =>
    `${type} ${definition.display_name} ${definition.tags?.join(" ")}`
      .toLowerCase()
      .includes(search.toLowerCase()),
  );
  return (
    <div className="application">
      <header className="topbar">
        <a className="brand" href="/" aria-label="Stacksmith Composer home">
          <span className="brand-mark">
            <Layers3 size={23} />
          </span>
          <strong>
            stacksmith<span>composer</span>
          </strong>
        </a>
        <div className="topbar-divider" />
        <span className="workspace-label">Infrastructure workspace</span>
        <div className="topbar-right">
          {session?.mode === "demo" ? (
            <span className="badge demo-badge">LOCAL EXAMPLE</span>
          ) : session?.login ? (
            <>
              <span className="user-badge">
                <Github size={15} />
                {session.login}
              </span>
              <button
                className="text-button"
                onClick={() => {
                  if (
                    !dirty ||
                    window.confirm("Sign out and discard this unsaved draft?")
                  )
                    void api("/auth/logout", {})
                      .then(() => location.reload())
                      .catch((error) => setError(errorMessage(error)));
                }}
              >
                Sign out
              </button>
            </>
          ) : null}
          <span className="version-badge">EARLY PREVIEW</span>
        </div>
      </header>
      <nav className="main-nav" aria-label="Workspace">
        <button
          className={view === "compose" || view === "review" ? "active" : ""}
          onClick={() => setView("compose")}
        >
          <Blocks size={17} />
          Composer
        </button>
        <button
          className={view === "catalog" ? "active" : ""}
          onClick={() => setView("catalog")}
        >
          <BookOpen size={17} />
          Component catalog
          <span className="count">{Object.keys(catalog).length}</span>
        </button>
        <button
          className={view === "platform" ? "active" : ""}
          onClick={() => setView("platform")}
        >
          <Settings2 size={17} />
          Platform configuration
        </button>
      </nav>
      {error && (
        <div className="error-banner" role="alert">
          <CircleAlert size={17} />
          <span>{error}</span>
          <button className="text-button" onClick={() => location.reload()}>
            Reload
          </button>
          <button
            className="icon-button"
            aria-label="Dismiss error"
            onClick={() => setError("")}
          >
            <X size={16} />
          </button>
        </div>
      )}
      {loading ? (
        <main className="empty-state">
          <LoaderCircle className="spin" size={28} />
          <h2>Reading your platform contract…</h2>
          <p>Loading components from Stacksmith.</p>
        </main>
      ) : session?.mode === "github" && !session.login ? (
        <main className="welcome">
          <div className="eyebrow">FROM COMPONENTS TO PULL REQUESTS</div>
          <h1>
            Your infrastructure.
            <br />A clearer way to compose it.
          </h1>
          <p>
            Explore your platform, connect approved components, and propose
            stack changes through GitHub.
          </p>
          <a href="/api/auth/github" className="button primary">
            <Github size={18} />
            Continue with GitHub
            <ArrowRight size={17} />
          </a>
          <small>
            Your GitHub App must be installed on the repositories you want to
            access.
          </small>
        </main>
      ) : (
        <>
          {(view === "compose" || view === "review") && (
            <section className="stack-toolbar">
              <div>
                <div className="breadcrumb">
                  <FolderGit2 size={14} />
                  <button
                    className="text-button"
                    disabled={session?.mode === "demo"}
                    onClick={() => setPicker(true)}
                  >
                    {snapshot?.repository ??
                      (session?.mode === "demo"
                        ? "Example workspace"
                        : "Choose a repository")}
                  </button>
                  <span>/</span>
                  <span>{snapshot?.path ?? "No stack selected"}</span>
                </div>
                <div className="stack-title">
                  <h1>{snapshot?.document?.name ?? "Stack composer"}</h1>
                  <span className="branch-badge">
                    <GitBranch size={12} />
                    {snapshot?.branch ?? "—"}
                  </span>
                  {dirty && <span className="unsaved">Unsaved draft</span>}
                </div>
              </div>
              <div className="toolbar-actions">
                <div className="history-actions" aria-label="Draft history">
                  <button
                    className="icon-button"
                    aria-label="Undo"
                    title="Undo (⌘Z / Ctrl+Z)"
                    disabled={!draftHistory.past.length}
                    onClick={() => dispatchDraft({ type: "undo" })}
                  >
                    <Undo2 size={16} />
                  </button>
                  <button
                    className="icon-button"
                    aria-label="Redo"
                    title="Redo (⌘⇧Z / Ctrl+Y)"
                    disabled={!draftHistory.future.length}
                    onClick={() => dispatchDraft({ type: "redo" })}
                  >
                    <Redo2 size={16} />
                  </button>
                </div>
                {view === "review" ? (
                  <button className="button" onClick={() => setView("compose")}>
                    <ArrowLeft size={15} />
                    Back to canvas
                  </button>
                ) : (
                  <button
                    className="button primary"
                    disabled={!snapshot || !editable}
                    onClick={() => setView("review")}
                  >
                    Review changes
                    <ArrowRight size={16} />
                  </button>
                )}
              </div>
            </section>
          )}
          {view === "compose" && (
            <>
              {session?.mode === "demo" && (
                <div className="demo-notice">
                  <span className="status-dot" />
                  <span>
                    Try the composer with local example modules. Changes stay in
                    this tab; download the reviewed YAML to keep them.
                  </span>
                </div>
              )}
              {!snapshot ? (
                <main className="empty-state">
                  <FolderGit2 size={36} />
                  <h2>Choose a stack to start composing.</h2>
                  <p>
                    Repositories are discovered through the stacksmith-stack
                    topic.
                  </p>
                  <button
                    className="button primary"
                    onClick={() => setPicker(true)}
                  >
                    Browse repositories
                  </button>
                </main>
              ) : !editable ? (
                <main className="source-view">
                  <div className="notice">{snapshot.reason}</div>
                  <pre>{snapshot.source}</pre>
                </main>
              ) : (
                <div
                  className={`composer-layout ${selected ? "with-inspector" : ""}`}
                >
                  <aside className="palette">
                    <div className="panel-title">
                      <span>Add a component</span>
                      <span className="count">
                        {Object.keys(catalog).length}
                      </span>
                    </div>
                    <label className="search-field">
                      <Search size={15} />
                      <input
                        placeholder="Search components…"
                        aria-label="Search components"
                        value={search}
                        onChange={(event) => setSearch(event.target.value)}
                      />
                    </label>
                    <p className="palette-hint">
                      Drag onto the canvas or click +
                    </p>
                    <div className="palette-list">
                      {filteredCatalog.map(([type, definition]) => (
                        <div
                          className="palette-item"
                          key={type}
                          draggable
                          onDragStart={(event) =>
                            event.dataTransfer.setData(
                              "application/stacksmith-component",
                              type,
                            )
                          }
                        >
                          <span
                            className={`type-icon tone-${definition.tags?.[0] ?? "default"}`}
                          >
                            <TypeIcon type={type} />
                          </span>
                          <div>
                            <strong>{definition.display_name}</strong>
                            <small>{type}</small>
                          </div>
                          <button
                            className="icon-button"
                            aria-label={`Add ${definition.display_name}`}
                            onClick={() => addComponent(type)}
                          >
                            <Plus size={17} />
                          </button>
                        </div>
                      ))}
                      {!filteredCatalog.length && (
                        <p className="muted">No matching components.</p>
                      )}
                    </div>
                    <div className="palette-footer">
                      <BookOpen size={17} />
                      <p>
                        Every component comes from your platform’s managed
                        catalog.
                      </p>
                      <button
                        className="text-button"
                        onClick={() => setView("platform")}
                      >
                        Explore the platform <ArrowRight size={13} />
                      </button>
                    </div>
                  </aside>
                  <div className="diagram-column">
                    <Canvas
                      positions={positions}
                      onPositionChange={changePosition}
                      key={snapshot.snapshot}
                      components={components}
                      catalog={catalog}
                      relationships={review?.edges ?? []}
                      selected={selected}
                      selectedRelationship={selectedRelationship}
                      onSelect={setSelected}
                      onSelectRelationship={setSelectedRelationship}
                      onConnect={connect}
                      onAdd={addComponent}
                      inspecting={inspecting}
                    />
                    <div
                      className={`validation-bar ${validationError ? "has-error" : ""}`}
                      role="status"
                    >
                      {inspecting ? (
                        <LoaderCircle size={15} className="spin" />
                      ) : validationError ? (
                        <CircleAlert size={15} />
                      ) : (
                        <Check size={15} />
                      )}
                      <span>
                        {inspecting
                          ? "Checking references and managed associations…"
                          : validationError ||
                            review?.validation ||
                            "Ready to inspect"}
                      </span>
                    </div>
                  </div>
                  {selected && components[selected] && (
                    <Inspector
                      key={selected}
                      name={selected}
                      component={components[selected]}
                      definition={catalog[components[selected].type]}
                      relationships={review?.edges ?? []}
                      onChange={(component) =>
                        dispatchDraft({
                          type: "change",
                          update: (draft) => ({
                            ...draft,
                            components: {
                              ...draft.components,
                              [selected]: component,
                            },
                          }),
                        })
                      }
                      onRemove={() => removeComponent(selected)}
                      onClose={() => setSelected(null)}
                    />
                  )}
                </div>
              )}
            </>
          )}
          {view === "catalog" && (
            <main className="information-view">
              <div className="eyebrow">YOUR BUILDING BLOCKS</div>
              <h1>Approved components. Clear contracts.</h1>
              <p className="intro-copy">
                Explore the inputs and public outputs available from your
                platform.
              </p>
              <label className="search-field wide">
                <Search size={17} />
                <input
                  placeholder="Search by name, type, or tag…"
                  aria-label="Search catalog"
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                />
              </label>
              <div className="catalog-grid">
                {filteredCatalog.map(([type, definition]) => (
                  <article className="catalog-card" key={type}>
                    <div className="catalog-card-heading">
                      <span
                        className={`type-icon large tone-${definition.tags?.[0] ?? "default"}`}
                      >
                        <TypeIcon type={type} size={23} />
                      </span>
                      <span className="badge">
                        {definition.tags?.[0] ?? "component"}
                      </span>
                    </div>
                    <h2>{definition.display_name}</h2>
                    <code>{type}</code>
                    <div className="catalog-ports">
                      <h3>Inputs</h3>
                      {definition.inputs.map((port) => (
                        <p key={port.name}>
                          <code>{port.name}</code>
                          <span>
                            {port.description ?? "No description provided."}
                          </span>
                        </p>
                      ))}
                      <h3>Outputs</h3>
                      {definition.outputs?.map((port) => (
                        <p key={port.name}>
                          <code>{port.name}</code>
                          <span>
                            {port.description ?? "No description provided."}
                          </span>
                        </p>
                      ))}
                    </div>
                    <div className="catalog-source">
                      <span>Module · {definition.module_version}</span>
                      <code title={definition.module_source}>
                        {definition.module_source}
                      </code>
                    </div>
                    <button
                      className="button"
                      disabled={!editable}
                      onClick={() => addComponent(type)}
                    >
                      <Plus size={15} />
                      Add to stack
                    </button>
                  </article>
                ))}
              </div>
            </main>
          )}
          {view === "platform" && platform && (
            <PlatformView platform={platform} />
          )}
          {view === "review" && (
            <main className="review-view">
              <section className="review-main">
                <div className="eyebrow">REVIEW BEFORE YOU PROPOSE</div>
                <h2>A small, readable change.</h2>
                <p className="muted">
                  Only authored stack changes are included. Diagram positions
                  and resolved association values stay out of the file.
                </p>
                {validationError && (
                  <div className="notice error-text">{validationError}</div>
                )}
                <div className="diff-heading">
                  <FileCode2 size={16} />
                  <span>{snapshot?.path}</span>
                  <span>
                    {inspecting
                      ? "Inspecting…"
                      : review?.diff
                        ? "Modified"
                        : "No changes"}
                  </span>
                </div>
                <pre className="diff">
                  {review?.diff
                    ? review.diff.split("\n").map((line, index) => (
                        <span
                          className={
                            line.startsWith("+")
                              ? "diff-add"
                              : line.startsWith("-")
                                ? "diff-remove"
                                : line.startsWith("@@")
                                  ? "diff-meta"
                                  : ""
                          }
                          key={index}
                        >
                          {line || " "}
                          <br />
                        </span>
                      ))
                    : inspecting
                      ? "Preparing the reviewed source…"
                      : "Edit a component or connect an output to create a change."}
                </pre>
              </section>
              <aside className="review-aside">
                <h3>Managed associations</h3>
                <p className="muted">
                  Opt out for this stack when a platform rule should not apply.
                </p>
                {platform?.associations.map((rule) => (
                  <label className="rule-toggle" key={rule.name}>
                    <input
                      type="checkbox"
                      checked={!disabled.includes(rule.name)}
                      onChange={(event) => {
                        const enabled = event.target.checked;
                        dispatchDraft({
                          type: "change",
                          update: (draft) => ({
                            ...draft,
                            disabled: enabled
                              ? draft.disabled.filter(
                                  (name) => name !== rule.name,
                                )
                              : [...draft.disabled, rule.name],
                          }),
                        });
                      }}
                    />
                    <span>
                      <strong>{rule.name}</strong>
                      <small>{rule.description}</small>
                    </span>
                  </label>
                ))}
                <div className="review-checks">
                  <Check size={17} />
                  <p>
                    {review?.validation ??
                      "Resolve inspection errors before proposing this change."}
                  </p>
                </div>
                {pr ? (
                  <a
                    className="button primary"
                    href={pr.url}
                    target="_blank"
                    rel="noreferrer"
                  >
                    <Github size={16} />
                    Open draft PR #{pr.number}
                  </a>
                ) : snapshot?.repository ? (
                  <button
                    className="button primary"
                    disabled={!review?.diff || creatingPR || inspecting}
                    onClick={() => void createPR()}
                  >
                    {creatingPR ? (
                      <LoaderCircle size={16} className="spin" />
                    ) : (
                      <Github size={16} />
                    )}
                    Create draft pull request
                  </button>
                ) : (
                  <div className="notice">
                    GitHub PR creation is available when a GitHub App is
                    configured and a repository stack is open.
                  </div>
                )}
                <button
                  className="button"
                  disabled={!review || inspecting}
                  onClick={() =>
                    review &&
                    snapshot &&
                    downloadSource(review.source, snapshot.path)
                  }
                >
                  <ArrowDownToLine size={16} />
                  Download stack
                </button>
                <p className="field-help">
                  A PR proposes this file change. CI owns full validation,
                  planning, and deployment.
                </p>
              </aside>
            </main>
          )}
        </>
      )}
      {picker && (
        <div className="modal-backdrop">
          <section
            className="repository-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="repository-title"
          >
            <div className="panel-title">
              <h2 id="repository-title">Open a stack</h2>
              <button
                className="icon-button"
                aria-label="Close repository picker"
                onClick={() => setPicker(false)}
              >
                <X size={18} />
              </button>
            </div>
            <p className="muted">
              Repositories shared with your GitHub App and tagged{" "}
              <code>stacksmith-stack</code>.
            </p>
            <label className="field-label">
              Repository
              <select
                value={chosenRepo}
                onChange={(event) => setChosenRepo(event.target.value)}
              >
                <option value="">Choose a repository</option>
                {repositories.map((repo) => (
                  <option value={repo.name} key={repo.name}>
                    {repo.name}
                    {repo.writable ? "" : " (read only)"}
                  </option>
                ))}
              </select>
            </label>
            {!repositories.length && (
              <div className="notice">
                No matching repositories found. Install your GitHub App on a
                repository and add the stacksmith-stack topic, then reload.
              </div>
            )}
            <div className="stack-list">
              {pathsLoading ? (
                <p>Reading repository…</p>
              ) : (
                stackPaths.map((path) => (
                  <button key={path} onClick={() => void openStack(path)}>
                    <FileCode2 size={17} />
                    <span>{path}</span>
                    <ArrowRight size={16} />
                  </button>
                ))
              )}
              {chosenRepo && !pathsLoading && !stackPaths.length && (
                <p>No stack.yaml, stack.json, or *.stack.yaml files found.</p>
              )}
            </div>
          </section>
        </div>
      )}
    </div>
  );
}
