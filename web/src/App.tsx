import { useEffect, useMemo, useReducer, useRef, useState } from "react";
import {
  ArrowDownToLine,
  ArrowLeft,
  ArrowRight,
  Blocks,
  BookOpen,
  Check,
  CircleAlert,
  ExternalLink,
  Eye,
  FileCode2,
  FolderGit2,
  GitBranch,
  Github,
  LoaderCircle,
  Plus,
  Pencil,
  Search,
  Settings2,
  X,
} from "lucide-react";
import type { Connection } from "@xyflow/react";
import { api } from "./api";
import { ruleImpactMessage, setRuleEnabled } from "./associations";
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
  inspectionBody,
  type DraftAction,
} from "./history";
import { Canvas } from "./components/Canvas";
import { Inspector } from "./components/Inspector";
import { PlatformView } from "./components/PlatformView";
import { ResolutionView } from "./components/ResolutionView";
import { AssociationRules } from "./components/AssociationRules";
import { ActionMenu } from "./components/ActionMenu";
import { ErrorBanner } from "./components/ErrorBanner";
import {
  canRestore,
  parseRecovery,
  recoveryKey,
  recoveryRecord,
  type Recovery,
} from "./recovery";
import { TypeIcon } from "./components/ComponentNode";
import { PlatformHeader } from "./components/PlatformHeader";
import { GitHubConnection } from "./components/GitHubConnection";
import { RepositorySelector } from "./components/RepositorySelector";
import { useEditorRoute } from "./useEditorRoute";
import {
  rememberEditorRoute,
  sameStack,
  stackRequest,
  type View,
} from "./navigation";
import { newComponentPosition, snapPoint } from "./layout";
import type {
  Catalog,
  Platform,
  Repository,
  Relationship,
  Review,
  Session,
  Snapshot,
} from "./types";

const CATALOG_PAGE_SIZE = 12;

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
  const [draftHistory, reduceDraft] = useReducer(
    draftHistoryReducer,
    undefined,
    () => createDraftHistory(),
  );
  const { components, positions, routes, disabled } = draftHistory.present;
  const [selected, setSelected] = useState<string | null>(null);
  const [selectedRelationship, setSelectedRelationship] = useState<
    string | null
  >(null);
  const { route, navigate } = useEditorRoute(confirmStackChange);
  const { view } = route;
  const viewOnly = route.viewOnly || snapshot?.can_author === false;
  const [openingStack, setOpeningStack] = useState(false);
  const [stackAttempt, setStackAttempt] = useState(0);
  const [search, setSearch] = useState("");
  const [catalogPage, setCatalogPage] = useState(0);
  const [review, setReview] = useState<Review>();
  const [inspectedKey, setInspectedKey] = useState("");
  const [rendered, setRendered] = useState<{
    key: string;
    source: string;
    diff: string;
  }>();
  const [sourceError, setSourceError] = useState("");
  const [inspectionAttempt, setInspectionAttempt] = useState(0);
  const [sourceAttempt, setSourceAttempt] = useState(0);
  const [recovery, setRecovery] = useState<Recovery>();
  const [storageError, setStorageError] = useState("");
  const [savedDraft, setSavedDraft] = useState(false);
  const semanticKey = useMemo(
    () => inspectionBody(snapshot?.snapshot ?? "", { components, disabled }),
    [snapshot?.snapshot, components, disabled],
  );
  const sourceKey = useMemo(
    () => JSON.stringify({ ...JSON.parse(semanticKey), positions, routes }),
    [semanticKey, positions, routes],
  );
  const inspectionCurrent = inspectedKey === semanticKey;
  const sourceCurrent = rendered?.key === sourceKey;
  const [inspecting, setInspecting] = useState(false);
  const [validationError, setValidationError] = useState("");
  const [error, setError] = useState(
    () => new URLSearchParams(window.location.search).get("auth_error") ?? "",
  );
  const [loading, setLoading] = useState(true);
  const [repositories, setRepositories] = useState<Repository[]>([]);
  const [repositoriesLoading, setRepositoriesLoading] = useState(false);
  const [repositoryLoadError, setRepositoryLoadError] = useState("");
  const [picker, setPicker] = useState(false);
  const [chosenRepo, setChosenRepo] = useState("");
  const [stackPaths, setStackPaths] = useState<string[]>([]);
  const [pathsLoading, setPathsLoading] = useState(false);
  const [creatingPR, setCreatingPR] = useState(false);
  const [pr, setPr] = useState<{
    url: string;
    patch_url: string;
    number: number;
  }>();

  function loadSnapshot(
    opened: Snapshot,
    principal = session?.login ?? "local-demo",
  ) {
    setRecovery(undefined);
    setStorageError("");
    setSavedDraft(false);
    try {
      const stored = localStorage.getItem(recoveryKey(opened, principal));
      if (stored) setRecovery(parseRecovery(stored));
    } catch (failure) {
      setStorageError(
        `Draft recovery is unavailable: ${errorMessage(failure)} Download a recovery file to keep your work.`,
      );
    }
    dispatchDraft({
      type: "reset",
      draft: {
        positions:
          opened.document?.metadata?.stacksmith_composer?.positions ?? {},
        routes: opened.document?.metadata?.stacksmith_composer?.routes ?? [],
        components: opened.document?.components ?? {},
        disabled: opened.document?.disabled_associations ?? [],
      },
    });
    setSnapshot(opened);
    setSelected(null);
    setSelectedRelationship(null);
    setPr(undefined);
    setReview(undefined);
    setInspectedKey("");
    setRendered(undefined);
    setValidationError("");
  }

  const editable = snapshot?.editable ?? false;
  const canEdit = editable && !viewOnly && !openingStack;
  const editingEnabled = useRef(canEdit);
  editingEnabled.current = canEdit;

  function dispatchDraft(action: DraftAction) {
    if (action.type === "reset" || editingEnabled.current) reduceDraft(action);
  }

  function clearStack() {
    setSnapshot(undefined);
    dispatchDraft({ type: "reset", draft: createDraftHistory().present });
    setReview(undefined);
    setRendered(undefined);
    setSelected(null);
    setSelectedRelationship(null);
    setRecovery(undefined);
    setStorageError("");
    setSavedDraft(false);
    setPr(undefined);
    setValidationError("");
    setSourceError("");
  }

  function setView(view: View) {
    navigate({ ...route, view });
  }

  function confirmStackChange(): boolean {
    return (
      !dirty ||
      window.confirm(
        savedDraft
          ? "Open another stack? Your draft remains saved in this browser."
          : "Leave this unsaved draft and open another stack? Download a recovery file first to keep it.",
      )
    );
  }

  useEffect(() => {
    if (!picker || !session?.login) return;
    let active = true;
    function refreshRepositories() {
      setRepositoriesLoading(true);
      api<{ repositories: Repository[] }>("/repository-discovery")
        .then((value) => {
          if (active) {
            setRepositories(value.repositories);
            setRepositoryLoadError("");
          }
        })
        .catch((failure: unknown) => {
          if (active)
            setRepositoryLoadError(
              failure instanceof Error
                ? failure.message
                : "Repository discovery failed.",
            );
        })
        .finally(() => {
          if (active) setRepositoriesLoading(false);
        });
    }
    refreshRepositories();
    window.addEventListener("focus", refreshRepositories);
    return () => {
      active = false;
      window.removeEventListener("focus", refreshRepositories);
    };
  }, [picker, session?.login]);

  useEffect(() => {
    const url = new URL(window.location.href);
    if (url.searchParams.has("auth_error")) {
      url.searchParams.delete("auth_error");
      window.history.replaceState(window.history.state, "", url);
    }
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
        if (connected.mode === "github") {
          setRepositoriesLoading(true);
          const discovery = await api<{
            repositories: Repository[];
            empty_reason: string | null;
          }>("/repository-discovery").catch((failure) => {
            if (active) setRepositoryLoadError(errorMessage(failure));
            throw failure;
          });
          if (active) {
            setRepositories(discovery.repositories);
            setPicker(!route.stack);
          }
        }
      } catch (error) {
        if (active) setError(errorMessage(error));
      } finally {
        if (active) {
          setLoading(false);
          setRepositoriesLoading(false);
        }
      }
    }
    void initialize();
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (loading || session?.mode !== "github" || !session.login || !chosenRepo)
      return;
    let active = true;
    Promise.all([
      api<Catalog>(`/catalog?repository=${encodeURIComponent(chosenRepo)}`),
      api<Platform>(`/platform?repository=${encodeURIComponent(chosenRepo)}`),
    ])
      .then(([types, policy]) => {
        if (active) {
          setCatalog(types);
          setPlatform(policy);
        }
      })
      .catch((failure) => {
        if (active) setError(errorMessage(failure));
      });
    return () => {
      active = false;
    };
  }, [chosenRepo, loading, session?.mode, session?.login]);

  useEffect(() => {
    if (loading || !session || (session.mode === "github" && !session.login))
      return;
    if (!route.stack) {
      setOpeningStack(false);
      if (session.mode === "demo") {
        navigate({ ...route, stack: "example" }, true);
      } else {
        clearStack();
      }
      return;
    }
    const abort = new AbortController();
    setOpeningStack(true);
    clearStack();
    api<Snapshot>(stackRequest(route.stack), undefined, abort.signal)
      .then((opened) => {
        if (abort.signal.aborted) return;
        loadSnapshot(opened);
        setPicker(false);
      })
      .catch((failure) => {
        if (abort.signal.aborted) return;
        setError(errorMessage(failure));
        if (session.mode === "github") setPicker(true);
      })
      .finally(() => {
        if (!abort.signal.aborted) setOpeningStack(false);
      });
    return () => abort.abort();
  }, [loading, session, route.stack, stackAttempt]);

  useEffect(() => {
    if (!snapshot?.editable) {
      setInspecting(false);
      return;
    }
    const abort = new AbortController();
    setInspecting(true);
    setValidationError("");
    const timer = setTimeout(() => {
      api<Review>("/review", JSON.parse(semanticKey), abort.signal)
        .then((result) => {
          if (!abort.signal.aborted) {
            setReview(result);
            setInspectedKey(semanticKey);
          }
        })
        .catch((error) => {
          if (!abort.signal.aborted) {
            setValidationError(errorMessage(error));
            setInspectedKey("");
          }
        })
        .finally(() => {
          if (!abort.signal.aborted) setInspecting(false);
        });
    }, 400);
    return () => {
      clearTimeout(timer);
      abort.abort();
    };
  }, [snapshot?.editable, semanticKey, inspectionAttempt]);

  useEffect(() => {
    setPr(undefined);
    setSourceError("");
    if (!snapshot?.editable) return;
    const abort = new AbortController();
    const timer = setTimeout(() => {
      api<Pick<Review, "source" | "diff">>(
        "/source",
        JSON.parse(sourceKey),
        abort.signal,
      )
        .then((result) => {
          if (!abort.signal.aborted) setRendered({ ...result, key: sourceKey });
        })
        .catch((failure) => {
          if (!abort.signal.aborted) setSourceError(errorMessage(failure));
        });
    }, 400);
    return () => {
      clearTimeout(timer);
      abort.abort();
    };
  }, [snapshot?.editable, sourceKey, sourceAttempt]);

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
        JSON.stringify(snapshot.document.disabled_associations ?? []) ||
      JSON.stringify(positions) !==
        JSON.stringify(
          snapshot.document.metadata?.stacksmith_composer?.positions ?? {},
        ) ||
      JSON.stringify(routes) !==
        JSON.stringify(
          snapshot.document.metadata?.stacksmith_composer?.routes ?? [],
        )),
  );
  useEffect(() => {
    if (!snapshot?.editable || recovery || storageError) return;
    setSavedDraft(false);
    function save() {
      try {
        if (dirty)
          localStorage.setItem(
            recoveryKey(snapshot!, session?.login ?? "local-demo"),
            JSON.stringify(recoveryRecord(snapshot!, draftHistory.present)),
          );
        else
          localStorage.removeItem(
            recoveryKey(snapshot!, session?.login ?? "local-demo"),
          );
        setSavedDraft(dirty);
      } catch (failure) {
        setSavedDraft(false);
        setStorageError(
          `Could not save this draft in your browser: ${errorMessage(failure)} Download a recovery file to keep your work.`,
        );
      }
    }
    const timer = setTimeout(save, 250);
    window.addEventListener("pagehide", save);
    window.addEventListener("beforeunload", save);
    return () => {
      clearTimeout(timer);
      window.removeEventListener("pagehide", save);
      window.removeEventListener("beforeunload", save);
    };
  }, [
    snapshot,
    session?.login,
    draftHistory.present,
    dirty,
    recovery,
    storageError,
  ]);

  function downloadRecovery(
    record = snapshot
      ? recoveryRecord(snapshot, draftHistory.present)
      : undefined,
  ) {
    if (record)
      downloadSource(
        JSON.stringify(record, null, 2),
        `${record.base.path}.composer-draft.json`,
      );
  }

  async function importRecovery(file: File) {
    try {
      if (file.size > 10_000_000)
        throw new Error("Recovery files must be smaller than 10 MB.");
      setRecovery(parseRecovery(await file.text()));
    } catch (failure) {
      setError(`Could not import recovery file: ${errorMessage(failure)}`);
    }
  }

  function toggleRule(rule: string, enabled: boolean) {
    if (!canEdit) return;
    if (
      !enabled &&
      !window.confirm(
        ruleImpactMessage(
          rule,
          review?.edges ?? [],
          inspectionCurrent && !inspecting,
        ),
      )
    )
      return;
    dispatchDraft({
      type: "change",
      update: (draft) => setRuleEnabled(draft, rule, enabled),
    });
    setSelectedRelationship(null);
  }
  useEffect(() => {
    function preventLoss(event: BeforeUnloadEvent) {
      if (dirty) event.preventDefault();
    }
    window.addEventListener("beforeunload", preventLoss);
    return () => window.removeEventListener("beforeunload", preventLoss);
  }, [dirty]);

  function addComponent(type: string): string {
    if (!canEdit) return "";
    const name = nextComponentName(type, components);
    dispatchDraft({
      type: "change",
      update: (draft) => ({
        ...draft,
        components: {
          ...draft.components,
          [name]: { type, properties: {} },
        },
        positions: {
          ...draft.positions,
          [name]: newComponentPosition(
            type,
            draft.components,
            draft.positions,
            catalog,
          ),
        },
      }),
    });
    setSelected(name);
    setSelectedRelationship(null);
    setView("compose");
    return name;
  }

  function connect(connection: Connection) {
    if (!canEdit) return;
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
        routes: draft.routes.filter(
          (route) =>
            route.target !== connection.target ||
            route.property !== connection.targetHandle!.slice(3),
        ),
      }),
    });
  }

  function removeComponent(name: string) {
    if (!canEdit) return;
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
        routes: draft.routes.filter(
          (route) => route.source !== name && route.target !== name,
        ),
      }),
    });
    setSelected(null);
  }

  function removeRelationship(key: string) {
    if (!canEdit) return;
    const relationship = review?.edges.find(
      (edge) => relationshipKey(edge) === key,
    );
    if (!relationship) return;
    if (relationship.kind === "association" && relationship.rule) {
      toggleRule(relationship.rule, false);
      return;
    }
    dispatchDraft({
      type: "change",
      update: (draft) => ({
        ...draft,
        components: removeReference(draft.components, relationship),
        routes: draft.routes.filter((route) => relationshipKey(route) !== key),
      }),
    });
    setSelectedRelationship(null);
  }

  function changePosition(
    name: string,
    position: { x: number; y: number },
    record: boolean,
  ) {
    if (!canEdit) return;
    dispatchDraft({
      type: "change",
      record,
      update: (draft) => ({
        ...draft,
        positions: {
          ...draft.positions,
          [name]: snapPoint(position),
        },
      }),
    });
  }

  function changeRoute(
    relationship: Relationship,
    points: { x: number; y: number }[],
    record: boolean,
  ) {
    if (!canEdit) return;
    const key = relationshipKey(relationship);
    dispatchDraft({
      type: "change",
      record,
      update: (draft) => ({
        ...draft,
        routes: points.length
          ? [
              ...draft.routes.filter((route) => relationshipKey(route) !== key),
              {
                ...relationship,
                ...(draft.routes.find((route) => relationshipKey(route) === key)
                  ?.label_position
                  ? {
                      label_position: draft.routes.find(
                        (route) => relationshipKey(route) === key,
                      )!.label_position,
                    }
                  : {}),
                points: points.map(snapPoint),
              },
            ]
          : draft.routes.filter((route) => relationshipKey(route) !== key),
      }),
    });
  }

  function changeLabelPosition(
    relationship: Relationship,
    position: { x: number; y: number },
    record: boolean,
  ) {
    if (!canEdit) return;
    dispatchDraft({
      type: "change",
      record,
      update: (draft) => ({
        ...draft,
        routes: [
          ...draft.routes.filter(
            (route) => relationshipKey(route) !== relationshipKey(relationship),
          ),
          {
            ...relationship,
            points:
              draft.routes.find(
                (route) =>
                  relationshipKey(route) === relationshipKey(relationship),
              )?.points ?? [],
            label_position: position,
          },
        ],
      }),
    });
  }

  function openStack(path: string) {
    const stack = { repository: chosenRepo, path };
    if (sameStack(route.stack, stack)) {
      if (!confirmStackChange()) return;
      setStackAttempt((attempt) => attempt + 1);
    }
    if (
      navigate({
        ...route,
        stack,
        view: "compose",
      })
    )
      setPicker(false);
  }

  async function createPR() {
    if (
      !snapshot ||
      !rendered?.diff ||
      !sourceCurrent ||
      !inspectionCurrent ||
      inspecting
    )
      return;
    setCreatingPR(true);
    try {
      setPr(
        await api("/pull-requests", {
          snapshot: snapshot.snapshot,
          components,
          disabled_associations: disabled,
          positions,
          routes,
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
      if (command && !canEdit) return;
      if (command === "undo" && draftHistory.past.length) {
        event.preventDefault();
        dispatchDraft({ type: "undo" });
      } else if (command === "redo" && draftHistory.future.length) {
        event.preventDefault();
        dispatchDraft({ type: "redo" });
      } else if (command === "delete" && view === "compose") {
        if (selected) {
          event.preventDefault();
          removeComponent(selected);
        } else if (selectedRelationship) {
          event.preventDefault();
          removeRelationship(selectedRelationship);
        }
      } else if (event.key === "Escape") {
        if (selected || selectedRelationship) {
          event.preventDefault();
          setSelected(null);
          setSelectedRelationship(null);
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
  const catalogPageCount = Math.max(
    1,
    Math.ceil(filteredCatalog.length / CATALOG_PAGE_SIZE),
  );
  const activeCatalogPage = Math.min(catalogPage, catalogPageCount - 1);
  const visibleCatalog = filteredCatalog.slice(
    activeCatalogPage * CATALOG_PAGE_SIZE,
    (activeCatalogPage + 1) * CATALOG_PAGE_SIZE,
  );
  return (
    <div className="application">
      <PlatformHeader
        session={session}
        active="composer"
        onSignOut={() => {
          if (
            !dirty ||
            window.confirm(
              savedDraft
                ? "Sign out? Your draft remains saved in this browser for this account."
                : "Sign out and leave this unsaved draft? Download a recovery file first to keep it.",
            )
          )
            void api("/auth/logout", {})
              .then(() => location.reload())
              .catch((error) => setError(errorMessage(error)));
        }}
      />
      <nav className="main-nav" aria-label="Workspace">
        <button
          className={
            view === "compose" || view === "review" || view === "resolution"
              ? "active"
              : ""
          }
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
      {error && !picker && (
        <ErrorBanner
          message={error}
          signIn={session?.mode === "github"}
          onDismiss={() => setError("")}
        />
      )}
      {loading || openingStack ? (
        <main className="empty-state">
          <LoaderCircle className="spin" size={28} />
          <h2>{openingStack ? "Opening stack…" : "Loading platform…"}</h2>
        </main>
      ) : session?.mode === "github" && !session.login ? (
        <main className="welcome">
          <h1>Stacksmith Platform</h1>
          <p>
            Explore your platform, connect approved components, and propose
            stack changes through GitHub.
          </p>
          <a
            href="/api/auth/github"
            className="button primary"
            onClick={rememberEditorRoute}
          >
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
          {(view === "compose" ||
            view === "review" ||
            view === "resolution") && (
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
                  {dirty && (
                    <span className="unsaved">
                      {savedDraft
                        ? "Draft saved in this browser"
                        : "Unsaved draft"}
                    </span>
                  )}
                </div>
              </div>
              <div className="toolbar-actions">
                {editable && (
                  <button
                    className="button"
                    aria-pressed={viewOnly}
                    disabled={snapshot?.can_author === false}
                    title={
                      viewOnly
                        ? "Switch to editing"
                        : "Pan and inspect without changing the stack"
                    }
                    onClick={() => navigate({ ...route, viewOnly: !viewOnly })}
                  >
                    {viewOnly ? <Eye size={15} /> : <Pencil size={15} />}
                    {viewOnly ? "View only" : "Editing"}
                  </button>
                )}
                {snapshot?.editable && snapshot.can_author !== false && (
                  <ActionMenu label="Draft">
                    <label className="recovery-import">
                      Import recovery file
                      <input
                        type="file"
                        accept=".json"
                        aria-label="Import recovery file"
                        disabled={!canEdit || dirty || Boolean(recovery)}
                        onChange={(event) => {
                          if (event.target.files?.[0])
                            void importRecovery(event.target.files[0]);
                          event.target.value = "";
                        }}
                      />
                    </label>
                    {dirty && (
                      <button onClick={() => downloadRecovery()}>
                        Download current recovery file
                      </button>
                    )}
                    <p>Recovery files are backups, not deployable stacks.</p>
                  </ActionMenu>
                )}
                {view !== "resolution" && (
                  <button
                    className="button"
                    disabled={!snapshot || !editable}
                    onClick={() => setView("resolution")}
                  >
                    <Search size={15} />
                    Resolution
                  </button>
                )}
                {view === "review" || view === "resolution" ? (
                  <button className="button" onClick={() => setView("compose")}>
                    <ArrowLeft size={15} />
                    Back to canvas
                  </button>
                ) : (
                  <button
                    className="button primary"
                    disabled={!snapshot || !editable || !dirty}
                    onClick={() => setView("review")}
                  >
                    Review changes
                    <ArrowRight size={16} />
                  </button>
                )}
              </div>
            </section>
          )}
          {storageError && (
            <ErrorBanner
              message={storageError}
              signIn={false}
              onDismiss={() => setStorageError("")}
            />
          )}
          {recovery && snapshot && (
            <section
              className="notice recovery-notice"
              role="region"
              aria-label="Saved draft recovery"
            >
              <div className="recovery-message">
                <strong>Saved draft available</strong>
                <span className="recovery-timestamp">
                  {new Date(recovery.savedAt).toLocaleString()}
                </span>
                <p>
                  {canRestore(recovery, snapshot)
                    ? "Restore to resume your work. New edits won't be saved until you restore or discard this draft."
                    : "The base revision or source has changed. Download the saved recovery file before starting a new draft; automatic restoration is unavailable."}
                </p>
              </div>
              <div className="recovery-actions">
                <button
                  className="button small"
                  aria-label="Restore saved draft"
                  disabled={!canEdit || !canRestore(recovery, snapshot)}
                  onClick={() => {
                    if (
                      dirty &&
                      !window.confirm(
                        "Replace your current edits with the saved draft? You can undo the restoration.",
                      )
                    )
                      return;
                    dispatchDraft({
                      type: "change",
                      update: () => recovery.draft,
                    });
                    setRecovery(undefined);
                  }}
                >
                  Restore
                </button>
                <ActionMenu label="Saved draft options">
                  <button onClick={() => downloadRecovery(recovery)}>
                    Download saved recovery file
                  </button>
                  <button
                    className="danger"
                    onClick={() => {
                      if (
                        !window.confirm(
                          "Discard the saved browser draft and continue with the open stack? Download its recovery file first if you want to keep it.",
                        )
                      )
                        return;
                      try {
                        localStorage.removeItem(
                          recoveryKey(snapshot, session?.login ?? "local-demo"),
                        );
                        setRecovery(undefined);
                      } catch (failure) {
                        setStorageError(errorMessage(failure));
                      }
                    }}
                  >
                    Discard saved draft
                  </button>
                  <p>
                    Recovery files include the base source and draft data, not a
                    deployable stack.
                  </p>
                </ActionMenu>
              </div>
            </section>
          )}
          {view === "compose" && (
            <>
              {session?.mode === "demo" && (
                <div className="demo-notice">
                  <span className="status-dot" />
                  <span>
                    Try the composer with private, versioned example modules.
                    Drafts are saved in this browser. Download a stack or
                    recovery file to keep a separate copy.
                  </span>
                </div>
              )}
              {!snapshot ? (
                <main className="empty-state">
                  <FolderGit2 size={36} />
                  <h2>Choose a stack to start composing.</h2>
                  <p>
                    {session?.execution_enabled
                      ? "Choose a repository available to your GitHub account and the GitHub App."
                      : "Choose a repository available to your GitHub account and the GitHub App."}
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
                      <span>{viewOnly ? "Components" : "Add a component"}</span>
                      <span className="count">
                        {Object.keys(catalog).length}
                      </span>
                    </div>
                    <div className="search-field">
                      <Search size={15} />
                      <input
                        placeholder="Search components…"
                        aria-label="Search components"
                        value={search}
                        onChange={(event) => setSearch(event.target.value)}
                      />
                      {search && (
                        <button
                          className="icon-button clear-search"
                          aria-label="Clear search"
                          onClick={() => setSearch("")}
                        >
                          <X size={14} />
                        </button>
                      )}
                    </div>
                    {canEdit && (
                      <p className="palette-hint">
                        Drag onto the canvas or click +
                      </p>
                    )}
                    <div className="palette-list">
                      {filteredCatalog.map(([type, definition]) => (
                        <div
                          className="palette-item"
                          key={type}
                          draggable={canEdit}
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
                            disabled={!canEdit}
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
                      <button
                        className="text-button"
                        onClick={() => setView("platform")}
                      >
                        Explore the platform <ArrowRight size={13} />
                      </button>
                    </div>
                  </aside>
                  <div className="diagram-column">
                    <AssociationRules
                      rules={platform?.associations ?? []}
                      disabled={disabled}
                      relationships={review?.edges ?? []}
                      pending={!inspectionCurrent || inspecting}
                      onToggle={toggleRule}
                      readOnly={!canEdit}
                    />
                    {selectedRelationship &&
                      review?.edges.find(
                        (edge) =>
                          relationshipKey(edge) === selectedRelationship,
                      )?.kind === "association" && (
                        <div className="managed-edge-action">
                          <span>
                            This connection is supplied by a stack-wide rule.
                          </span>
                          <button
                            className="button small"
                            disabled={!canEdit}
                            onClick={() =>
                              removeRelationship(selectedRelationship)
                            }
                          >
                            Disable this rule for this stack…
                          </button>
                        </div>
                      )}
                    <Canvas
                      readOnly={!canEdit}
                      positions={positions}
                      routes={routes}
                      onLabelPositionChange={changeLabelPosition}
                      onPositionChange={changePosition}
                      onRouteChange={changeRoute}
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
                      canUndo={canEdit && Boolean(draftHistory.past.length)}
                      canRedo={canEdit && Boolean(draftHistory.future.length)}
                      onUndo={() => dispatchDraft({ type: "undo" })}
                      onRedo={() => dispatchDraft({ type: "redo" })}
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
                        {review &&
                          !inspectionCurrent &&
                          " Diagram connections show the last successful inspection."}
                      </span>
                      {validationError && (
                        <button
                          className="text-button"
                          onClick={() =>
                            setInspectionAttempt((attempt) => attempt + 1)
                          }
                        >
                          Retry inspection
                        </button>
                      )}
                    </div>
                  </div>
                  {selected && components[selected] && (
                    <Inspector
                      readOnly={!canEdit}
                      key={selected}
                      name={selected}
                      component={components[selected]}
                      definition={catalog[components[selected].type]}
                      relationships={review?.edges ?? []}
                      onChange={(component) =>
                        canEdit &&
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
              <h1>Component catalog</h1>
              <div className="search-field wide">
                <Search size={17} />
                <input
                  placeholder="Search by name, type, or tag…"
                  aria-label="Search catalog"
                  value={search}
                  onChange={(event) => {
                    setSearch(event.target.value);
                    setCatalogPage(0);
                  }}
                />
                {search && (
                  <button
                    className="icon-button clear-search"
                    aria-label="Clear search"
                    onClick={() => {
                      setSearch("");
                      setCatalogPage(0);
                    }}
                  >
                    <X size={15} />
                  </button>
                )}
              </div>
              <div className="catalog-grid">
                {visibleCatalog.map(([type, definition]) => (
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
                      <span>
                        Module ·{" "}
                        {definition.module_path ?? definition.module_version}
                      </span>
                      {!definition.module_path && (
                        <>
                          <code title={definition.module_source}>
                            {definition.module_source}
                          </code>
                          {definition.module_source_url && (
                            <a
                              className="catalog-source-link"
                              href={definition.module_source_url}
                              target="_blank"
                              rel="noreferrer"
                            >
                              View source <ExternalLink size={12} />
                            </a>
                          )}
                        </>
                      )}
                    </div>
                    <button
                      className="button"
                      disabled={!canEdit}
                      onClick={() => addComponent(type)}
                    >
                      <Plus size={15} />
                      Add to stack
                    </button>
                  </article>
                ))}
              </div>
              {!filteredCatalog.length && (
                <p className="catalog-empty">No matching components.</p>
              )}
              {catalogPageCount > 1 && (
                <nav className="catalog-pagination" aria-label="Catalog pages">
                  <span>
                    Showing {activeCatalogPage * CATALOG_PAGE_SIZE + 1}–
                    {Math.min(
                      (activeCatalogPage + 1) * CATALOG_PAGE_SIZE,
                      filteredCatalog.length,
                    )}{" "}
                    of {filteredCatalog.length}
                  </span>
                  <div>
                    <button
                      className="button"
                      disabled={activeCatalogPage === 0}
                      onClick={() => setCatalogPage(activeCatalogPage - 1)}
                    >
                      Previous
                    </button>
                    <span aria-live="polite">
                      Page {activeCatalogPage + 1} of {catalogPageCount}
                    </span>
                    <button
                      className="button"
                      disabled={activeCatalogPage + 1 === catalogPageCount}
                      onClick={() => setCatalogPage(activeCatalogPage + 1)}
                    >
                      Next
                    </button>
                  </div>
                </nav>
              )}
            </main>
          )}
          {view === "platform" && platform && (
            <PlatformView platform={platform} />
          )}
          {view === "resolution" && snapshot && (
            <ResolutionView
              key={snapshot.snapshot}
              snapshot={snapshot}
              draft={draftHistory.present}
              selected={selected}
            />
          )}
          {view === "review" && (
            <main className="review-view">
              <section className="review-main">
                <h2>Review changes</h2>
                <p className="muted">
                  Authored stack changes and diagram layout are included.
                  Resolved association values stay out of the file.
                </p>
                {(validationError || sourceError) && (
                  <div className="notice error-text">
                    {validationError && (
                      <p>
                        {validationError}{" "}
                        <button
                          className="text-button"
                          onClick={() =>
                            setInspectionAttempt((attempt) => attempt + 1)
                          }
                        >
                          Retry inspection
                        </button>
                      </p>
                    )}
                    {sourceError && (
                      <p>
                        {sourceError}{" "}
                        <button
                          className="text-button"
                          onClick={() =>
                            setSourceAttempt((attempt) => attempt + 1)
                          }
                        >
                          Retry source rendering
                        </button>
                      </p>
                    )}
                  </div>
                )}
                <div className="diff-heading">
                  <FileCode2 size={16} />
                  <span>{snapshot?.path}</span>
                  <span>
                    {!sourceCurrent
                      ? sourceError
                        ? "Source unavailable"
                        : "Preparing source…"
                      : rendered?.diff
                        ? "Modified"
                        : "No changes"}
                  </span>
                </div>
                <pre className="diff">
                  {sourceCurrent && rendered?.diff
                    ? rendered.diff.split("\n").map((line, index) => (
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
                    : !sourceCurrent
                      ? sourceError || "Preparing the authored source…"
                      : "Edit a component or connect an output to create a change."}
                </pre>
              </section>
              <aside className="review-aside">
                <AssociationRules
                  rules={platform?.associations ?? []}
                  disabled={disabled}
                  relationships={review?.edges ?? []}
                  pending={!inspectionCurrent || inspecting}
                  onToggle={toggleRule}
                  readOnly={!canEdit}
                />
                <div className="review-checks">
                  {inspecting ? (
                    <LoaderCircle className="spin" size={17} />
                  ) : inspectionCurrent ? (
                    <Check size={17} />
                  ) : (
                    <CircleAlert size={17} />
                  )}
                  <p>
                    {inspecting
                      ? "Inspecting the current draft…"
                      : inspectionCurrent
                        ? review?.validation
                        : validationError ||
                          "The current draft has not passed inspection."}
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
                    Open pull request #{pr.number}
                  </a>
                ) : snapshot?.can_author === false ? (
                  <p className="notice">
                    Your stack role provides read-only Composer access.
                  </p>
                ) : snapshot?.repository ? (
                  <button
                    className="button primary"
                    disabled={
                      !rendered?.diff ||
                      !sourceCurrent ||
                      !inspectionCurrent ||
                      creatingPR ||
                      inspecting
                    }
                    onClick={() => void createPR()}
                  >
                    {creatingPR ? (
                      <>
                        <LoaderCircle size={16} className="spin" />
                        Proposing changes…
                      </>
                    ) : (
                      <>
                        <Github size={16} />
                        Create pull request
                      </>
                    )}
                  </button>
                ) : (
                  <div className="notice">
                    GitHub PR creation is available when a GitHub App is
                    configured and a repository stack is open.
                  </div>
                )}
                {pr && (
                  <a className="button" href={pr.patch_url} download>
                    <ArrowDownToLine size={16} />
                    Download PR patch
                  </a>
                )}
                <button
                  className="button"
                  disabled={!sourceCurrent}
                  onClick={() =>
                    rendered &&
                    sourceCurrent &&
                    snapshot &&
                    downloadSource(rendered.source, snapshot.path)
                  }
                >
                  <ArrowDownToLine size={16} />
                  {inspectionCurrent && !inspecting
                    ? "Download stack"
                    : "Download unvalidated stack"}
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
              {session?.execution_enabled
                ? "Repositories shared with your GitHub App."
                : "Repositories shared with your GitHub App."}
            </p>
            {error && (
              <ErrorBanner
                message={error}
                signIn={session?.mode === "github"}
                onDismiss={() => setError("")}
              />
            )}
            <GitHubConnection />
            <RepositorySelector
              repositories={repositories.map((repo) => ({
                id: repo.name,
                account: repo.account,
                description: repo.description,
                writable: repo.writable,
              }))}
              selected={chosenRepo}
              onSelect={setChosenRepo}
              loading={repositoriesLoading}
              error={repositoryLoadError}
            />
            {!repositories.length &&
              !repositoriesLoading &&
              !repositoryLoadError && (
                <div className="notice">
                  <span>
                    No repositories are accessible to both your account and the
                    GitHub App. Use Connect GitHub or Manage repository access
                    to select repositories.
                  </span>
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
