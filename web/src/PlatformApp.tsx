import { ExecutionHealth } from "./components/ExecutionHealth";
import { SecretReferenceSelector } from "./components/SecretReferenceSelector";
import { useEffect, useRef, useState } from "react";
import {
  Activity,
  FolderGit2,
  KeyRound,
  ListChecks,
  Settings2,
  ShieldCheck,
  SlidersHorizontal,
  Layers,
  Globe2,
} from "lucide-react";
import Composer from "./App";
import { LogViewer } from "./components/LogViewer";
import { OperationSelector } from "./components/OperationSelector";
import { reportLabel } from "./reportLabel";
import { api } from "./api";
import { ErrorBanner } from "./components/ErrorBanner";
import { PlatformHeader } from "./components/PlatformHeader";
import { Permissions } from "./components/Permissions";
import { GitHubConnection } from "./components/GitHubConnection";
import { RepositorySelector } from "./components/RepositorySelector";
import { ConfigurationEditor } from "./components/ConfigurationEditor";
import { AdvancedRunOptions } from "./components/AdvancedRunOptions";
import { TokenTable } from "./components/TokenTable";
import type { TokenCounts, TokenMetadata, TokenStatus } from "./tokenMetadata";
import { Pagination } from "./components/Pagination";
import { pageCount } from "./pagination";
import type { Page } from "./pagination";
import { workspaceScope, workspaceUrl } from "./workspace";
import type { Session } from "./types";
import "./platform.css";

type Repository = {
  id: string;
  branch: string;
  enabled: number;
  deployment_enabled: number;
};
type Environment = {
  id: string;
  name: string;
  settings?: { discovery_mode: string };
};
type Run = {
  id: string;
  repository: string;
  environment: string;
  revision: string;
  action: string;
  actor: string;
  status: string;
  phase: number;
  spec: {
    phases: string[];
    settings?: { discovery_mode: string };
    revision_override?: boolean;
    allow_local_backend?: boolean;
  };
  result: {
    message?: string;
    reports?: Record<string, unknown>;
    plan_digest?: string;
    logs?: string;
  };
  created: number;
  updated: number;
  expires: number | null;
};
type EffectiveAccess = {
  administrator: boolean;
  capabilities: string[];
  assignments: { environment: string; role: string; workloads: string[] }[];
};

type Artifact = { id: string; name: string; digest: string };
type AuditEvent = {
  id: string;
  action: string;
  actor: string;
  detail?: Record<string, unknown> | null;
  created: number;
};

async function request<T>(path: string, body?: unknown): Promise<T> {
  return api<T>(
    `/v1${path}`,
    body,
    undefined,
    path === "/runs" && body !== undefined
      ? { "Idempotency-Key": crypto.randomUUID() }
      : undefined,
  );
}

function message(error: unknown) {
  return error instanceof Error ? error.message : "The request failed.";
}
function fields(event: React.FormEvent<HTMLFormElement>) {
  event.preventDefault();
  return new FormData(event.currentTarget);
}
const text = (data: FormData, name: string) => String(data.get(name) ?? "");
const endpoint = (repository: string) => `/repositories/${repository}`;

function actionLabel(action: string) {
  return (
    {
      plan: "Plan",
      apply: "Plan and apply",
      destroy: "Plan and destroy",
      "destroy-plan": "Destroy plan",
      "plan-operation": "Operations plan",
      "apply-operation": "Plan and apply operations",
    }[action] ?? action
  );
}

export default function PlatformApp() {
  const [session, setSession] = useState<Session | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    let active = true;
    api<Session>("/session")
      .then((value) => {
        if (active) setSession(value);
      })
      .catch((failure) => {
        if (active) setError(message(failure));
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);
  if (!session && !loading)
    return (
      <div className="platform-root">
        <PlatformHeader session={session} active="runs" onSignOut={() => {}} />
        {error && (
          <ErrorBanner message={error} signIn onDismiss={() => setError("")} />
        )}
        <main className="empty-state">
          <h1>Unable to load the platform</h1>
          <button className="button primary" onClick={() => location.reload()}>
            Retry
          </button>
        </main>
      </div>
    );
  if (!session)
    return <div className="platform-loading">Loading Stacksmith Platform…</div>;
  if (
    !session.execution_enabled ||
    !window.location.pathname.startsWith("/runs")
  )
    return <Composer />;
  return <Dashboard session={session} />;
}

function Dashboard({ session }: { session: Session }) {
  const [identity, setIdentity] = useState<{
    login: string;
    administrator: boolean;
    provisioner: boolean;
  } | null>(null);
  const [repositories, setRepositories] = useState<Repository[]>([]);
  const [repositoriesLoading, setRepositoriesLoading] = useState(false);
  const [repositoryLoadError, setRepositoryLoadError] = useState("");
  const [repository, setRepository] = useState(
    () => new URLSearchParams(window.location.search).get("repo") ?? "",
  );
  const [environments, setEnvironments] = useState<Environment[]>([]);
  const [environment, setEnvironment] = useState("");
  const [runs, setRuns] = useState<Run[]>([]);
  const [runPage, setRunPage] = useState(1);
  const [runSize, setRunSize] = useState(20);
  const [runTotal, setRunTotal] = useState(0);
  const [runsLoading, setRunsLoading] = useState(false);
  const [runRefresh, setRunRefresh] = useState(0);
  const [access, setAccess] = useState<EffectiveAccess | null>(null);
  const can = (capability: string) =>
    access?.capabilities.includes(capability) ?? false;
  const canPlan = can("plan_infrastructure") || can("plan_operations");
  const [includeInfrastructure, setIncludeInfrastructure] = useState(true);
  const [includeOperations, setIncludeOperations] = useState(false);
  const [applyAfterPlan, setApplyAfterPlan] = useState(false);
  const [destroyPlan, setDestroyPlan] = useState(false);
  const runAction = destroyPlan
    ? applyAfterPlan
      ? "destroy"
      : "destroy-plan"
    : applyAfterPlan
      ? includeInfrastructure
        ? "apply"
        : "apply-operation"
      : includeInfrastructure
        ? "plan"
        : "plan-operation";
  const [selectedOperations, setSelectedOperations] = useState<string[] | null>(
    null,
  );
  const [selected, setSelected] = useState("");
  const [error, setError] = useState("");
  const [refresh, setRefresh] = useState(0);
  const [tab, setTab] = useState(() => {
    const requested = new URLSearchParams(window.location.search).get("tab");
    return requested === "settings" ? "environments" : (requested ?? "runs");
  });
  const sections = [
    {
      id: "runs",
      icon: ListChecks,
      label: "Runs",
      description:
        "Review changes and control deployments across your Stacksmith environments.",
    },
    {
      id: "environments",
      icon: SlidersHorizontal,
      label: "Deployment settings",
      description:
        "Configure discovery and deployment behavior for the selected repository.",
    },
    {
      id: "repository-config",
      icon: Layers,
      label: "Repository configuration",
      description:
        "Inherit platform defaults, append configuration layers, or replace them for this repository.",
    },
    {
      id: "permissions",
      icon: ShieldCheck,
      label: "Stack roles",
      description:
        "Manage platform access to the selected repository and its environments.",
    },
    {
      id: "credentials",
      icon: KeyRound,
      label: "Credentials",
      description:
        "Manage phase-scoped credentials for the selected environment.",
    },
    {
      id: "tokens",
      icon: KeyRound,
      label: "API tokens",
      description: "Create and revoke scoped API tokens for your account.",
    },
    ...(identity?.administrator
      ? [
          {
            id: "platform-config",
            icon: Globe2,
            label: "Platform configuration",
            description:
              "Manage the default configuration layers used by repositories.",
          },
          {
            id: "repositories",
            icon: FolderGit2,
            label: "GitHub repositories",
            description: "Discover repositories and enable deployments.",
          },
          {
            id: "health",
            icon: Activity,
            label: "Execution health",
            description:
              "Inspect execution supervision and the deployment queue.",
          },
        ]
      : []),
  ];
  const currentSection = sections.find((item) => item.id === tab);
  const settingsSection = !["runs", "tokens"].includes(tab);
  const adminSection = [
    "platform-config",
    "repositories",
    "health",
    "permissions",
  ].includes(tab);
  const activeWorkspace = settingsSection
    ? adminSection
      ? "admin-settings"
      : "stack-settings"
    : tab;
  const settingsSections = sections.filter((item) =>
    adminSection
      ? identity?.administrator &&
        ["platform-config", "repositories", "health", "permissions"].includes(
          item.id,
        )
      : (item.id === "environments" && can("configure_environment")) ||
        (item.id === "credentials" && can("manage_credentials")) ||
        (item.id === "repository-config" && can("configure_repository")),
  );
  const scope = workspaceScope(tab);
  function selectTab(value: string) {
    setTab(value);
    window.history.replaceState(
      null,
      "",
      workspaceUrl(window.location.href, value, repository),
    );
  }
  function selectRepository(value: string) {
    if (value === repository) return;
    setRepository(value);
    setEnvironment("");
    setRunPage(1);
    setSelected("");
    window.history.replaceState(
      null,
      "",
      workspaceUrl(window.location.href, tab, value),
    );
  }
  useEffect(() => {
    window.history.replaceState(
      null,
      "",
      workspaceUrl(window.location.href, tab, repository),
    );
  }, [tab, repository]);
  useEffect(() => {
    let active = true;
    request<{ login: string; administrator: boolean; provisioner: boolean }>(
      "/me",
    )
      .then((user) => {
        if (active) setIdentity(user);
      })
      .catch((failure) => {
        if (active) setError(message(failure));
      });
    return () => {
      active = false;
    };
  }, [refresh]);
  useEffect(() => {
    if (scope === "platform" && tab !== "repositories") return;
    let active = true;
    setRepositoriesLoading(true);
    setRepositoryLoadError("");
    request<Repository[]>("/repositories")
      .then((repos) => {
        if (active) {
          setRepositories(repos);
          setRepository((current) =>
            repos.some((repo) => repo.id === current)
              ? current
              : repos[0]?.id || "",
          );
        }
      })
      .catch((failure) => {
        if (active) {
          setRepositoryLoadError(message(failure));
          setError(message(failure));
        }
      })
      .finally(() => {
        if (active) setRepositoriesLoading(false);
      });
    return () => {
      active = false;
    };
  }, [refresh, scope, tab]);
  useEffect(() => {
    if (!repository || !["runs", "environments", "credentials"].includes(tab))
      return;
    let active = true;
    setEnvironments([]);
    setSelected("");
    request<Environment[]>(`${endpoint(repository)}/environments`)
      .then((items) => {
        if (active) {
          setEnvironments(items);
          setEnvironment((current) =>
            items.some((item) => item.name === current)
              ? current
              : (items[0]?.name ?? ""),
          );
        }
      })
      .catch((error) => {
        if (active) setError(message(error));
      });
    return () => {
      active = false;
    };
  }, [repository, refresh, tab]);
  useEffect(() => {
    if (tab !== "runs" || !repository || !environment) return;
    let active = true;
    const load = () =>
      request<Page<Run>>(
        `/runs?repository=${encodeURIComponent(repository)}&environment=${encodeURIComponent(environment)}&page=${runPage}&page_size=${runSize}`,
      )
        .then((result) => {
          if (active) {
            setRuns(result.items);
            setRunTotal(result.total);
            setRunPage((current) =>
              Math.min(current, pageCount(result.total, runSize)),
            );
          }
        })
        .catch((error) => {
          if (active) setError(message(error));
        })
        .finally(() => {
          if (active) setRunsLoading(false);
        });
    setRuns([]);
    setRunsLoading(true);
    void load();
    const timer = setInterval(load, 15000);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, [repository, environment, tab, runPage, runSize, runRefresh]);
  useEffect(() => {
    setAccess(null);
    if (!repository) return;
    let active = true;
    let initialized = false;
    const load = () =>
      request<EffectiveAccess>(
        `${endpoint(repository)}/access?environment=${encodeURIComponent(environment || "*")}`,
      )
        .then((value) => {
          if (!active) return;
          setAccess(value);
          if (!initialized) {
            const infrastructure = value.capabilities.includes(
              "plan_infrastructure",
            );
            setIncludeInfrastructure(infrastructure);
            setIncludeOperations(
              !infrastructure && value.capabilities.includes("plan_operations"),
            );
            setApplyAfterPlan(false);
            setDestroyPlan(false);
            initialized = true;
          }
        })
        .catch((failure) => {
          if (active) {
            setAccess(null);
            setError(message(failure));
          }
        });
    void load();
    const timer = setInterval(load, 15000);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, [repository, environment, refresh]);
  async function start(event: React.FormEvent<HTMLFormElement>) {
    const data = fields(event);
    const revision = text(data, "revision").trim();
    const selectedOperationPhase =
      data.has("include_operations") && !!selectedOperations?.length;
    const selectedAction = destroyPlan
      ? applyAfterPlan
        ? "destroy"
        : "destroy-plan"
      : applyAfterPlan
        ? includeInfrastructure
          ? "apply"
          : "apply-operation"
        : includeInfrastructure
          ? "plan"
          : "plan-operation";
    try {
      const run = await request<Run>("/runs", {
        repository,
        environment,
        ...(identity?.administrator && revision ? { revision } : {}),
        action: selectedAction,
        include_infrastructure: data.has("include_infrastructure"),
        include_operations: selectedOperationPhase,
        apply_after_plan: data.has("apply_after_plan"),
        destroy_plan: data.has("destroy_plan"),
        allow_local_backend:
          identity?.administrator === true && data.has("allow_local_backend"),
        operations:
          selectedOperationPhase && !data.has("all_operations")
            ? (selectedOperations ?? [])
            : [],
      });
      setSelected(run.id);
      setRunPage(1);
      setRunRefresh((value) => value + 1);
      setError("");
    } catch (error) {
      setError(message(error));
    }
  }
  return (
    <div className="platform-root">
      <PlatformHeader
        session={session}
        active="runs"
        onSignOut={() => {
          void api("/auth/logout", {})
            .then(() => location.reload())
            .catch((failure) => setError(message(failure)));
        }}
      />
      {error && (
        <ErrorBanner message={error} signIn onDismiss={() => setError("")} />
      )}
      <nav className="main-nav platform-sections" aria-label="Runs workspace">
        {[
          { id: "runs", label: "Runs", icon: ListChecks },
          { id: "tokens", label: "API tokens", icon: KeyRound },
          ...(identity?.provisioner
            ? [
                {
                  id: "stack-settings",
                  label: "Stack settings",
                  icon: SlidersHorizontal,
                },
              ]
            : []),
          ...(identity?.administrator
            ? [
                {
                  id: "admin-settings",
                  label: "Admin settings",
                  icon: Settings2,
                },
              ]
            : []),
        ].map((section) => (
          <button
            key={section.id}
            className={`${activeWorkspace === section.id ? "active" : ""} ${section.id === "admin-settings" ? "admin-settings-tab" : ""}`}
            aria-current={activeWorkspace === section.id ? "page" : undefined}
            onClick={() =>
              selectTab(
                section.id === "admin-settings"
                  ? "platform-config"
                  : section.id === "stack-settings"
                    ? "environments"
                    : section.id,
              )
            }
          >
            <section.icon size={17} />
            {section.label}
          </button>
        ))}
      </nav>
      {tab === "runs" && (
        <div className="repository-context">
          <RepositorySelector
            repositories={repositories}
            selected={repository}
            onSelect={selectRepository}
            onOpen={() => setRefresh((value) => value + 1)}
            loading={repositoriesLoading}
            error={repositoryLoadError}
          />
        </div>
      )}
      <main className="platform-main">
        <header>
          <div>
            <h1>
              {settingsSection
                ? adminSection
                  ? "Admin settings"
                  : "Stack settings"
                : (currentSection?.label ?? "Workspace unavailable")}
            </h1>
            <p>
              {settingsSection
                ? adminSection
                  ? "Manage platform configuration, access, and health."
                  : "Configure stack deployment settings, credentials, and repository configuration."
                : (currentSection?.description ??
                  "Choose a workspace tab to continue.")}
            </p>
          </div>
        </header>
        <div className={settingsSection ? "platform-admin-layout" : undefined}>
          {settingsSection && (
            <nav
              className="platform-admin-nav"
              aria-label={adminSection ? "Admin settings" : "Stack settings"}
            >
              {(["platform", "repository"] as const).map((group) => {
                const items = settingsSections.filter(
                  (section) => workspaceScope(section.id) === group,
                );
                return items.length ? (
                  <div className="platform-admin-group" key={group}>
                    <h2>{group === "platform" ? "Platform" : "Repository"}</h2>
                    {items.map((section) => (
                      <button
                        key={section.id}
                        aria-current={tab === section.id ? "page" : undefined}
                        onClick={() => selectTab(section.id)}
                      >
                        <section.icon size={17} />
                        {section.label}
                      </button>
                    ))}
                  </div>
                ) : null;
              })}
            </nav>
          )}
          <div className="platform-workspace-content">
            {settingsSection && scope === "repository" && (
              <RepositorySelector
                repositories={repositories}
                selected={repository}
                onSelect={selectRepository}
                onOpen={() => setRefresh((value) => value + 1)}
                loading={repositoriesLoading}
                error={repositoryLoadError}
              />
            )}
            {settingsSection && (
              <div className="platform-section-heading">
                <span className="platform-context-label">
                  {scope === "platform"
                    ? "Platform-wide"
                    : repository || "Repository settings"}
                </span>
                <h2>{currentSection?.label ?? "Settings unavailable"}</h2>
                <p>
                  {currentSection?.description ??
                    "Choose a settings page to continue."}
                </p>
              </div>
            )}
            {["runs", "environments", "credentials"].includes(tab) && (
              <div className="platform-selectors">
                {environments.length > 1 ? (
                  <label>
                    Environment
                    <select
                      value={environment}
                      onChange={(event) => {
                        setEnvironment(event.target.value);
                        setRunPage(1);
                        setSelected("");
                      }}
                    >
                      <option value="">Select environment</option>
                      {environments.map((item) => (
                        <option key={item.id}>{item.name}</option>
                      ))}
                    </select>
                  </label>
                ) : environments.length === 1 ? (
                  <div className="platform-deployment-summary">
                    <span>Deployment</span>
                    <strong>
                      {environments[0].settings?.discovery_mode === "single"
                        ? "Repository default"
                        : environments[0].name}
                    </strong>
                  </div>
                ) : null}
              </div>
            )}
            {tab === "platform-config" && identity?.administrator && (
              <ConfigurationEditor
                onError={setError}
                onSaved={() => setRefresh((value) => value + 1)}
              />
            )}
            {tab === "repository-config" &&
              (repository ? (
                <ConfigurationEditor
                  key={repository}
                  repository={repository}
                  onError={setError}
                  onSaved={() => setRefresh((value) => value + 1)}
                />
              ) : (
                <p className="platform-notice">
                  Select a repository to configure it.
                </p>
              ))}
            {tab === "runs" && (
              <>
                {identity &&
                  !repositories.length &&
                  !repositoriesLoading &&
                  !repositoryLoadError && (
                    <div className="platform-card">
                      <h2>No repositories available</h2>
                      <p>
                        Repositories need GitHub App access and platform
                        permissions.{" "}
                        {identity.administrator
                          ? "Open GitHub repositories to get started."
                          : "Ask a platform administrator to grant you repository view access."}
                      </p>
                      {identity.administrator && (
                        <button onClick={() => selectTab("repositories")}>
                          GitHub repositories
                        </button>
                      )}
                    </div>
                  )}
                {canPlan && (
                  <form
                    className="platform-card platform-run-form"
                    onSubmit={start}
                  >
                    <h2>Start a run</h2>
                    <p className="platform-run-source">
                      Runs use the latest commit on the repository's default
                      branch. The resolved commit is saved with the run.
                    </p>

                    <fieldset className="phase-options">
                      <legend>What should this run do?</legend>
                      <div className="phase-choice-grid">
                        <label className="phase-choice">
                          <input
                            type="checkbox"
                            name="include_infrastructure"
                            disabled={!can("plan_infrastructure")}
                            checked={includeInfrastructure}
                            onChange={(event) => {
                              const checked = event.target.checked;
                              setIncludeInfrastructure(checked);
                              if (!checked) {
                                setDestroyPlan(false);
                                if (!includeOperations)
                                  setApplyAfterPlan(false);
                              }
                            }}
                          />
                          <span>
                            <strong>Plan infrastructure</strong>
                            <small>Review infrastructure changes.</small>
                          </span>
                        </label>
                        <label className="phase-choice">
                          <input
                            type="checkbox"
                            name="include_operations"
                            disabled={!can("plan_operations")}
                            checked={includeOperations}
                            onChange={(event) => {
                              const checked = event.target.checked;
                              setIncludeOperations(checked);
                              if (!checked && !includeInfrastructure) {
                                setApplyAfterPlan(false);
                              }
                            }}
                          />
                          <span>
                            <strong>Plan operations</strong>
                            <small>
                              Include declared Stacksmith operations.
                            </small>
                          </span>
                        </label>
                        <label className="phase-choice">
                          <input
                            type="checkbox"
                            name="apply_after_plan"
                            checked={applyAfterPlan}
                            disabled={
                              !includeInfrastructure && !includeOperations
                            }
                            onChange={(event) =>
                              setApplyAfterPlan(event.target.checked)
                            }
                          />
                          <span>
                            <strong>Apply after approval</strong>
                            <small>
                              Pause for approval before making changes.
                            </small>
                          </span>
                        </label>
                        <label className="phase-choice">
                          <input
                            type="checkbox"
                            name="destroy_plan"
                            checked={destroyPlan}
                            disabled={!includeInfrastructure}
                            onChange={(event) =>
                              setDestroyPlan(event.target.checked)
                            }
                          />
                          <span>
                            <strong>Plan to destroy</strong>
                            <small>
                              With apply enabled, destroy after approval.
                            </small>
                          </span>
                        </label>
                      </div>
                    </fieldset>
                    {includeOperations && (
                      <OperationSelector
                        key={`${repository}:${environment}`}
                        repository={repository}
                        environment={environment}
                        selected={selectedOperations}
                        onChange={setSelectedOperations}
                        onError={setError}
                      />
                    )}
                    <AdvancedRunOptions
                      key={`${repository}:${environment}`}
                      administrator={!!identity?.administrator}
                      action={runAction}
                    />
                    <button
                      disabled={
                        !repository ||
                        !environment ||
                        (includeInfrastructure &&
                          !can(
                            applyAfterPlan
                              ? "execute_infrastructure"
                              : "plan_infrastructure",
                          )) ||
                        (includeOperations &&
                          !can(
                            applyAfterPlan
                              ? "execute_operations"
                              : "plan_operations",
                          )) ||
                        (!includeInfrastructure && !includeOperations) ||
                        (includeOperations && selectedOperations === null) ||
                        (!includeInfrastructure && !selectedOperations?.length)
                      }
                    >
                      Start run
                    </button>
                  </form>
                )}
                <div className="platform-columns">
                  <section className="platform-card">
                    <h2>Run history</h2>
                    {runsLoading ? (
                      <p role="status">Loading run history…</p>
                    ) : runs.length === 0 ? (
                      <p>No runs in this environment yet.</p>
                    ) : (
                      <ul className="platform-history">
                        {runs.map((run) => (
                          <li key={run.id}>
                            <button
                              onClick={() => setSelected(run.id)}
                              aria-pressed={selected === run.id}
                            >
                              <strong>{actionLabel(run.action)}</strong>
                              <span className={`platform-status ${run.status}`}>
                                {run.status.replaceAll("_", " ")}
                              </span>
                              <code>{run.revision.slice(0, 10)}</code>
                              <small>
                                {new Date(run.created * 1000).toLocaleString()}{" "}
                                · {run.actor}
                              </small>
                            </button>
                          </li>
                        ))}
                      </ul>
                    )}
                    <Pagination
                      label="Run history"
                      page={runPage}
                      size={runSize}
                      total={runTotal}
                      loading={runsLoading}
                      onPage={setRunPage}
                      onSize={(value) => {
                        setRunSize(value);
                        setRunPage(1);
                      }}
                    />
                  </section>
                  {selected && (
                    <RunDetail
                      key={selected}
                      id={selected}
                      onError={setError}
                    />
                  )}
                </div>
              </>
            )}
            {((tab === "environments" && can("configure_environment")) ||
              (tab === "credentials" && can("manage_credentials")) ||
              (tab === "permissions" && identity?.administrator)) && (
              <Settings
                key={`${repository}:${environment}:${refresh}`}
                repository={repository}
                environment={environment}
                section={tab}
                initialDiscoveryMode={
                  environments.find((item) => item.name === environment)
                    ?.settings?.discovery_mode
                }
                onSaved={() => setRefresh((value) => value + 1)}
                onError={setError}
              />
            )}
            {tab === "repositories" && identity?.administrator && (
              <GitHubRepositories
                loading={repositoriesLoading}
                repositories={repositories}
                onSaved={() => {
                  setError("");
                  setRefresh((value) => value + 1);
                }}
                onError={setError}
              />
            )}
            {tab === "health" && identity?.administrator && (
              <ExecutionHealth onError={setError} />
            )}
            {tab === "tokens" && (
              <Tokens
                repositories={repositories}
                repositoriesLoading={repositoriesLoading}
                repositoryLoadError={repositoryLoadError}
                onError={setError}
              />
            )}
          </div>
        </div>
      </main>
    </div>
  );
}

function RunDetail({
  id,
  onError,
}: {
  id: string;
  onError: (value: string) => void;
}) {
  const [run, setRun] = useState<Run | null>(null);
  const [logs, setLogs] = useState("");
  const [artifacts, setArtifacts] = useState<Artifact[]>([]);
  const [audit, setAudit] = useState<AuditEvent[]>([]);
  const [busy, setBusy] = useState(false);
  const [capabilities, setCapabilities] = useState<string[]>([]);

  useEffect(() => {
    let active = true;
    let updated = 0;
    const load = async () => {
      try {
        const current = await request<Run>(`/runs/${id}`);
        const currentAccess = await request<EffectiveAccess>(
          `${endpoint(current.repository)}/access?environment=${encodeURIComponent(current.environment)}`,
        );
        if (!active) return;
        setCapabilities(currentAccess.capabilities);
        setRun(current);
        setLogs(current.result.logs ?? "");
        if (current.updated !== updated) {
          const [files, events] = await Promise.all([
            request<Artifact[]>(`/runs/${id}/artifacts`),
            request<AuditEvent[]>(`/runs/${id}/audit`),
          ]);
          if (!active) return;
          setArtifacts(files);
          setAudit(events);
          updated = current.updated;
        }
        if (
          ["succeeded", "failed", "cancelled", "expired"].includes(
            current.status,
          )
        )
          clearInterval(timer);
      } catch (error) {
        if (active) onError(message(error));
      }
    };
    void load();
    const timer = setInterval(load, 5000);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, [id, onError]);
  async function act(action: string, body: unknown = {}) {
    setBusy(true);
    try {
      await request(`/runs/${id}/${action}`, body);
      setRun(await request<Run>(`/runs/${id}`));
    } catch (error) {
      onError(message(error));
    } finally {
      setBusy(false);
    }
  }
  const allowed = (action: string) => {
    if (!run) return false;
    const workloads = [
      ...(run.spec.phases.some((phase) =>
        ["plan", "apply", "destroy"].includes(phase),
      )
        ? ["infrastructure"]
        : []),
      ...(run.spec.phases.some((phase) =>
        ["plan-operation", "operation"].includes(phase),
      )
        ? ["operations"]
        : []),
    ];
    return (
      workloads.length > 0 &&
      workloads.every((workload) =>
        capabilities.includes(`${action}_${workload}`),
      )
    );
  };
  if (!run) return <section className="platform-card">Loading run…</section>;
  return (
    <section className="platform-card platform-detail">
      <h2>
        {actionLabel(run.action)} ·{" "}
        {run.spec.settings?.discovery_mode === "single"
          ? "Repository default"
          : run.environment}
      </h2>
      <p className={`platform-status ${run.status}`}>
        {run.status.replaceAll("_", " ")}
      </p>
      {run.spec.revision_override && (
        <p className="platform-notice">
          Administrator commit override. Deployment approval also requires a
          platform administrator.
        </p>
      )}
      <dl>
        <dt>Revision</dt>
        <dd>
          <code>{run.revision}</code>
        </dd>
        {["succeeded", "failed", "cancelled", "expired", "uncertain"].includes(
          run.status,
        ) ? (
          <>
            <dt>Finished</dt>
            <dd>{new Date(run.updated * 1000).toLocaleString()}</dd>
          </>
        ) : (
          <>
            <dt>Phase</dt>
            <dd>{run.spec.phases[run.phase]?.replaceAll("-", " ")}</dd>
          </>
        )}
        {run.expires && (
          <>
            <dt>Approval expires</dt>
            <dd>{new Date(run.expires * 1000).toLocaleString()}</dd>
          </>
        )}
      </dl>
      {run.result.message && <p role="status">{run.result.message}</p>}
      {run.spec.allow_local_backend && (
        <p className="platform-notice">
          Local-backend test plan. This run’s local state is not reused by later
          runs.
        </p>
      )}
      {run.status === "awaiting_authorization" && allowed("approve") && (
        <div className="platform-approval">
          <p>
            This PR revision can execute code. Authorizing it allows access to
            the configured plan credentials.
          </p>
          <button disabled={busy} onClick={() => void act("authorize")}>
            Authorize this revision
          </button>
        </div>
      )}
      {run.status === "awaiting_approval" && allowed("approve") && (
        <div className="platform-approval">
          <p>
            Review the reports before approving {run.action}. Infrastructure
            execution uses the saved plan. Operations may replan against current
            outputs.
          </p>
          {run.result.plan_digest && <code>{run.result.plan_digest}</code>}
          <button disabled={busy} onClick={() => void act("approve")}>
            Approve {run.action}
          </button>
        </div>
      )}
      {run.status === "uncertain" && allowed("reconcile") && (
        <form
          onSubmit={(event) => {
            const data = fields(event);
            void act("resolve", { note: text(data, "note") });
          }}
        >
          <p>
            Inspect the remote infrastructure and state before releasing this
            deployment lock.
          </p>
          <label>
            Reconciliation record
            <textarea name="note" minLength={10} required />
          </label>
          <button disabled={busy}>
            Record reconciliation and release lock
          </button>
        </form>
      )}
      {allowed("execute") &&
        !["succeeded", "failed", "cancelled", "expired", "uncertain"].includes(
          run.status,
        ) && (
          <button disabled={busy} onClick={() => void act("cancel")}>
            Cancel run
          </button>
        )}
      <h3>Reports</h3>
      {Object.entries(run.result.reports ?? {}).map(([name, report]) => (
        <ReportSummary key={name} name={name} value={report} />
      ))}
      {artifacts.length > 0 && (
        <details className="report-artifacts">
          <summary>Reports ({artifacts.length})</summary>
          <ul>
            {artifacts.map((item) => (
              <li key={item.id}>
                <button
                  onClick={() => {
                    void request<{ url: string }>(
                      `/runs/${id}/artifacts/${item.id}`,
                    )
                      .then((data) =>
                        window.open(data.url, "_blank", "noopener,noreferrer"),
                      )
                      .catch((error) => onError(message(error)));
                  }}
                >
                  {reportLabel(item.name)}
                </button>
              </li>
            ))}
          </ul>
        </details>
      )}
      <h3>Phase logs</h3>
      <LogViewer key={id} logs={logs || "Waiting for execution output…"} />
      <h3>Audit history</h3>
      <AuditTable events={audit} />
    </section>
  );
}

function AuditTable({ events }: { events: AuditEvent[] }) {
  return (
    <div className="platform-table-scroll">
      <table className="platform-data-table audit-table">
        <thead>
          <tr>
            <th scope="col">Time</th>
            <th scope="col">Event</th>
            <th scope="col">Actor</th>
            <th scope="col">Details</th>
          </tr>
        </thead>
        <tbody>
          {events.length ? (
            events.map((event) => (
              <tr key={event.id}>
                <td>{new Date(event.created * 1000).toLocaleString()}</td>
                <th scope="row">{event.action.replaceAll(".", " ")}</th>
                <td>{event.actor}</td>
                <td>
                  {event.detail && Object.keys(event.detail).length ? (
                    <ul className="audit-details">
                      {Object.entries(event.detail).map(([key, value]) => (
                        <li key={key}>
                          <strong>{key.replaceAll("_", " ")}:</strong>{" "}
                          {typeof value === "string"
                            ? value
                            : JSON.stringify(value)}
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <span className="platform-muted">
                      No additional details
                    </span>
                  )}
                </td>
              </tr>
            ))
          ) : (
            <tr>
              <td colSpan={4}>No audit events have been recorded yet.</td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

function ReportSummary({ name, value }: { name: string; value: unknown }) {
  if (
    !value ||
    typeof value !== "object" ||
    !("totals" in value) ||
    !value.totals ||
    typeof value.totals !== "object"
  )
    return null;
  const totals = Object.entries(value.totals).filter(
    (entry): entry is [string, number] => typeof entry[1] === "number",
  );
  if (!totals.length) return null;
  return (
    <article className="platform-report">
      <h4>{name.replace(".json", "").replaceAll("-", " ")}</h4>
      {"complete" in value && typeof value.complete === "boolean" && (
        <p>Reported coverage: {value.complete ? "complete" : "incomplete"}</p>
      )}
      <dl>
        {totals.map(([label, count]) => (
          <div key={label}>
            <dt>{label.replaceAll("_", " ")}</dt>
            <dd>{count}</dd>
          </div>
        ))}
      </dl>
    </article>
  );
}

function GitHubRepositories({
  loading,
  repositories,
  onSaved,
  onError,
}: {
  repositories: Repository[];
  loading: boolean;
  onSaved: () => void;
  onError: (value: string) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [selected, setSelected] = useState("");
  const repository = repositories.find((item) => item.id === selected);
  useEffect(() => {
    if (selected && !repositories.some((item) => item.id === selected))
      setSelected("");
  }, [repositories, selected]);
  async function refresh() {
    setBusy(true);
    try {
      await request("/repositories/refresh", {});
      onSaved();
    } catch (failure) {
      onError(message(failure));
    } finally {
      setBusy(false);
    }
  }
  async function activate(repository: Repository) {
    setBusy(true);
    try {
      await request(`${endpoint(repository.id)}/deployment`, {
        enabled: !repository.deployment_enabled,
      });
      onSaved();
    } catch (failure) {
      onError(message(failure));
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="platform-settings">
      <article className="platform-card">
        <h2>GitHub repositories</h2>
        <p>
          Select repository access on GitHub. Discovered repositories inherit
          platform configuration. Enable deployments explicitly before running
          infrastructure or operations.
        </p>
        <GitHubConnection />
        <button disabled={busy} onClick={() => void refresh()}>
          {busy ? "Refreshing…" : "Refresh repositories"}
        </button>
      </article>
      <article className="platform-card">
        <h2>Deployment activation</h2>
        <RepositorySelector
          repositories={repositories.map((item) => ({
            id: item.id,
            description: item.deployment_enabled
              ? "Deployments enabled"
              : "Deployments not enabled",
          }))}
          selected={selected}
          onSelect={setSelected}
          onOpen={onSaved}
          loading={loading}
          disabled={busy}
        />
        {repository && (
          <>
            <h3>{repository.id}</h3>
            <p>
              {repository.deployment_enabled
                ? "Deployments enabled"
                : "Deployments not enabled"}
            </p>
            <button disabled={busy} onClick={() => void activate(repository)}>
              {repository.deployment_enabled
                ? "Disable deployments"
                : "Enable deployments"}
            </button>
            <p>
              Configure environments, permissions, and credentials in repository
              settings.
            </p>
          </>
        )}
      </article>
    </section>
  );
}

function Settings({
  repository,
  environment,
  section,
  initialDiscoveryMode,
  onSaved,
  onError,
}: {
  repository: string;
  environment: string;
  section: string;
  initialDiscoveryMode?: string;
  onSaved: () => void;
  onError: (value: string) => void;
}) {
  const [discoveryMode, setDiscoveryMode] = useState(
    initialDiscoveryMode ?? "auto",
  );
  const [credentialSource, setCredentialSource] = useState("value");
  const [secretReference, setSecretReference] = useState("");
  useEffect(() => setSecretReference(""), [repository, environment]);
  const [secretMetadata, setSecretMetadata] = useState<
    {
      id: string;
      name: string;
      phases: string[];
      reference: string | null;
      json_key: string | null;
    }[]
  >([]);
  async function save(path: string, body: unknown, form: HTMLFormElement) {
    try {
      await request(path, body);
      form.reset();
      setSecretReference("");
      onSaved();
    } catch (error) {
      onError(message(error));
    }
  }
  useEffect(() => {
    setSecretMetadata([]);
    if (!repository) return;
    if (section === "credentials" && environment)
      request<typeof secretMetadata>(
        `${endpoint(repository)}/environments/${environment}/secrets`,
      )
        .then(setSecretMetadata)
        .catch((error) => onError(message(error)));
  }, [repository, environment, section, onError]);
  return (
    <div className="platform-settings">
      {!repository && (
        <p className="platform-notice">Select a repository to continue.</p>
      )}
      {repository && section === "credentials" && !environment && (
        <p className="platform-notice">
          Select an environment to manage its credentials.
        </p>
      )}
      {repository && section === "environments" && (
        <>
          <form
            className="platform-card"
            onSubmit={(event) => {
              const form = event.currentTarget;
              const data = fields(event);
              void save(
                `${endpoint(repository)}/environments`,
                {
                  ...(discoveryMode === "single"
                    ? {}
                    : { name: text(data, "name") }),
                  gitops_root: text(data, "root") || ".",
                  discovery_mode: text(data, "discovery"),
                  lock_key: text(data, "lock"),
                  locked: data.has("locked"),
                  automatic: data.has("automatic"),
                },
                form,
              );
            }}
          >
            <h2>Configure a deployment</h2>
            {discoveryMode !== "single" && (
              <label>
                Environment name
                <input
                  name="name"
                  required
                  defaultValue={environment}
                  placeholder="dev"
                />
              </label>
            )}
            <label>
              GitOps root
              <input name="root" defaultValue="." />
            </label>
            <label>
              Discovery
              <select
                name="discovery"
                value={discoveryMode}
                onChange={(event) => setDiscoveryMode(event.target.value)}
              >
                <option value="single">
                  Single deployment (no named environments)
                </option>
                <option>auto</option>
                <option>folders</option>
                <option>flat-files</option>
                <option>env-files</option>
              </select>
            </label>
            <label>
              Shared deployment lock
              <input name="lock" placeholder="Defaults to this repository" />
            </label>
            <label>
              <input type="checkbox" name="locked" defaultChecked /> Require
              source lockfile
            </label>
            <label>
              <input type="checkbox" name="automatic" defaultChecked /> Enable
              GitHub event runs
            </label>
            {discoveryMode === "single" && (
              <p>
                Use the Stacksmith runfile at the GitOps root. No environment
                name or environment directory is needed.
              </p>
            )}
            <button>Save deployment settings</button>
          </form>
        </>
      )}
      {repository && section === "permissions" && (
        <Permissions
          key={repository}
          repository={repository}
          onError={onError}
        />
      )}
      {repository && environment && section === "credentials" && (
        <form
          className="platform-card"
          onSubmit={(event) => {
            const form = event.currentTarget;
            const data = fields(event);
            if (credentialSource === "reference" && !secretReference) return;
            void save(
              `${endpoint(repository)}/environments/${environment}/secrets`,
              {
                name: text(data, "name"),
                phases: data.getAll("phase"),
                ...(credentialSource === "reference"
                  ? {
                      reference: text(data, "reference"),
                      json_key: text(data, "json_key") || null,
                    }
                  : { value: text(data, "value") }),
              },
              form,
            );
          }}
        >
          <h2>Environment credentials</h2>
          <label>
            Environment variable
            <input name="name" required placeholder="AWS_ACCESS_KEY_ID" />
          </label>
          <fieldset className="credential-source">
            <legend>Credential source</legend>
            <div className="credential-source-options">
              <label className={credentialSource === "value" ? "selected" : ""}>
                <input
                  type="radio"
                  name="credential-source"
                  value="value"
                  checked={credentialSource === "value"}
                  onChange={() => setCredentialSource("value")}
                />
                <span>
                  <strong>Enter a secret value</strong>
                  <small>Encrypted and stored by this deployment</small>
                </span>
              </label>
              <label
                className={credentialSource === "reference" ? "selected" : ""}
              >
                <input
                  type="radio"
                  name="credential-source"
                  value="reference"
                  checked={credentialSource === "reference"}
                  onChange={() => setCredentialSource("reference")}
                />
                <span>
                  <strong>Use a deployment secret</strong>
                  <small>
                    Resolve a secret configured by the platform administrator
                  </small>
                </span>
              </label>
            </div>
            {credentialSource === "value" ? (
              <label>
                Secret value
                <input
                  name="value"
                  type="password"
                  autoComplete="new-password"
                  required
                  placeholder="Enter secret value"
                />
              </label>
            ) : (
              <SecretReferenceSelector
                key={`${repository}:${environment}`}
                repository={repository}
                environment={environment}
                value={secretReference}
                onChange={setSecretReference}
                onError={onError}
              />
            )}
          </fieldset>
          <fieldset>
            <legend>Available during</legend>
            {[
              "prepare",
              "plan",
              "plan-operation",
              "apply",
              "destroy",
              "operation",
            ].map((value) => (
              <label key={value}>
                <input type="checkbox" name="phase" value={value} /> {value}
              </label>
            ))}
          </fieldset>
          <button
            disabled={credentialSource === "reference" && !secretReference}
          >
            Save binding
          </button>
          <ul>
            {secretMetadata.map((item) => (
              <li key={item.id}>
                {item.name} · {item.phases.join(", ")} ·{" "}
                {item.reference
                  ? `Deployment secret: ${item.reference}${item.json_key ? ` (field: ${item.json_key})` : ""}`
                  : "Stored secret value"}
                <button
                  type="button"
                  onClick={() => {
                    void request(
                      `${endpoint(repository)}/environments/${environment}/secrets/${item.name}/remove`,
                      {},
                    )
                      .then(onSaved)
                      .catch((error) => onError(message(error)));
                  }}
                >
                  Revoke binding
                </button>
              </li>
            ))}
          </ul>
        </form>
      )}
    </div>
  );
}

function Tokens({
  repositories,
  repositoriesLoading,
  repositoryLoadError,
  onError,
}: {
  repositories: Repository[];
  repositoriesLoading: boolean;
  repositoryLoadError: string;
  onError: (value: string) => void;
}) {
  const [tokenData, setTokenData] = useState<
    (Page<TokenMetadata> & { counts: TokenCounts }) | null
  >(null);
  const [tokenPage, setTokenPage] = useState(1);
  const [tokenSize, setTokenSize] = useState(20);
  const [tokenLoading, setTokenLoading] = useState(true);
  const [tokenFilter, setTokenFilter] = useState<TokenStatus | "All">("Active");
  const [created, setCreated] = useState("");
  const [refresh, setRefresh] = useState(0);
  const [repository, setRepository] = useState("");
  const [environments, setEnvironments] = useState<Environment[]>([]);
  const [environment, setEnvironment] = useState("*");
  const [loadingScope, setLoadingScope] = useState(false);
  const [busy, setBusy] = useState(false);
  const [tokenAccess, setTokenAccess] = useState<EffectiveAccess | null>(null);
  useEffect(() => {
    let active = true;
    setTokenAccess(null);
    if (!repository) return;
    request<EffectiveAccess>(
      `${endpoint(repository)}/access?environment=${encodeURIComponent(environment)}`,
    )
      .then((value) => {
        if (active) setTokenAccess(value);
      })
      .catch((failure) => {
        if (active) onError(message(failure));
      });
    return () => {
      active = false;
    };
  }, [repository, environment, onError]);

  useEffect(() => {
    setEnvironments([]);
    setEnvironment("*");
    if (!repository) return;
    let active = true;
    setLoadingScope(true);
    request<Environment[]>(`${endpoint(repository)}/environments`)
      .then((items) => {
        if (active) setEnvironments(items);
      })
      .catch((error) => {
        if (active) onError(message(error));
      })
      .finally(() => {
        if (active) setLoadingScope(false);
      });
    return () => {
      active = false;
    };
  }, [repository, onError]);
  const tokenPath = `/tokens?page=${tokenPage}&page_size=${tokenSize}&status=${tokenFilter.toLowerCase()}`;
  const tokenPathRef = useRef(tokenPath);
  tokenPathRef.current = tokenPath;
  function acceptTokenPage(
    result: Page<TokenMetadata> & { counts: TokenCounts },
  ) {
    setTokenData(result);
    setTokenPage((current) =>
      Math.min(current, pageCount(result.total, result.page_size)),
    );
  }
  async function refreshTokenPage() {
    const path = tokenPathRef.current;
    const result = await request<Page<TokenMetadata> & { counts: TokenCounts }>(
      path,
    );
    if (path === tokenPathRef.current) acceptTokenPage(result);
  }
  useEffect(() => {
    let active = true;
    setTokenLoading(true);
    const load = () =>
      request<Page<TokenMetadata> & { counts: TokenCounts }>(tokenPath)
        .then((result) => {
          if (active) acceptTokenPage(result);
        })
        .catch((error) => {
          if (active) onError(message(error));
        })
        .finally(() => {
          if (active) setTokenLoading(false);
        });
    void load();
    const timer = setInterval(load, 15000);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, [tokenPath, refresh, onError]);
  return (
    <div className="platform-settings platform-token-settings">
      <section className="platform-card">
        <h2>Create a token</h2>
        <p>
          Tokens belong to your account. Choose the repository and environment
          each new token can access. Tokens expire within your current sign-in
          session; approvals require signing in through the browser.
        </p>
        <form
          onSubmit={(event) => {
            const form = event.currentTarget;
            const data = fields(event);
            setBusy(true);
            void request<{ token: string }>("/tokens", {
              name: text(data, "name"),
              repository,
              environment,
              permissions: data.getAll("permission"),
              workloads: data.getAll("workload"),
              expires_in: Number(text(data, "lifetime")),
            })
              .then((value) => {
                setCreated(value.token);
                setTokenFilter("Active");
                setTokenPage(1);
                form.reset();
                setRepository("");
                setEnvironment("*");
                setRefresh((value) => value + 1);
              })
              .catch((error) => onError(message(error)))
              .finally(() => setBusy(false));
          }}
        >
          <label>
            Name
            <input name="name" required />
          </label>
          <div className="platform-token-scope">
            <RepositorySelector
              label="Repository access"
              repositories={repositories}
              selected={repository}
              onSelect={setRepository}
              loading={repositoriesLoading}
              error={repositoryLoadError}
              disabled={busy}
              required
            />
            <label>
              Environment access
              <select
                value={environment}
                onChange={(event) => setEnvironment(event.target.value)}
                disabled={!repository || loadingScope}
              >
                <option value="*">All environments</option>
                {environments.map((item) => (
                  <option key={item.id} value={item.name}>
                    {item.settings?.discovery_mode === "single"
                      ? "Repository default"
                      : item.name}
                  </option>
                ))}
              </select>
            </label>
          </div>
          {!repositories.length &&
            !repositoriesLoading &&
            !repositoryLoadError && (
              <p className="platform-notice">
                You need platform access to a repository to create a scoped
                token. You can still manage your existing tokens below.
              </p>
            )}
          <label>
            Lifetime
            <select name="lifetime">
              <option value="3600">One hour</option>
              <option value="28800">Up to eight hours</option>
            </select>
          </label>
          <input type="hidden" name="permission" value="view" />
          {["plan", "deploy"].map((value) => (
            <label key={value}>
              <input
                type="checkbox"
                name="permission"
                value={value}
                disabled={
                  value !== "view" &&
                  !tokenAccess?.capabilities.some((capability) =>
                    capability.startsWith(
                      value === "deploy" ? "execute_" : "plan_",
                    ),
                  )
                }
                defaultChecked={value === "view"}
              />{" "}
              {value}
            </label>
          ))}
          <fieldset>
            <legend>Workload access</legend>
            {["infrastructure", "operations"].map((workload) => (
              <label key={workload}>
                <input
                  type="checkbox"
                  name="workload"
                  value={workload}
                  disabled={
                    !tokenAccess?.capabilities.includes(`plan_${workload}`)
                  }
                />
                {workload === "infrastructure"
                  ? "Infrastructure"
                  : "Operations"}
              </label>
            ))}
          </fieldset>
          <button
            disabled={!repository || loadingScope || busy || !tokenAccess}
          >
            {busy ? "Creating…" : "Create scoped token"}
          </button>
        </form>
        {created && (
          <div role="status">
            <p>Copy this token now. Its value is shown once.</p>
            <code className="platform-token">{created}</code>
            <button onClick={() => setCreated("")}>Hide token</button>
          </div>
        )}
      </section>
      <TokenTable
        tokens={tokenData?.items ?? null}
        filter={tokenFilter}
        onFilter={(value) => {
          setTokenLoading(true);
          setTokenFilter(value);
          setTokenPage(1);
          setRefresh((current) => current + 1);
        }}
        onRefresh={refreshTokenPage}
        counts={
          tokenData?.counts ?? { active: 0, all: 0, expired: 0, revoked: 0 }
        }
        page={tokenPage}
        size={tokenSize}
        total={tokenData?.total ?? 0}
        loading={tokenLoading}
        onPage={(value) => {
          setTokenLoading(true);
          setTokenPage(value);
        }}
        onSize={(value) => {
          setTokenLoading(true);
          setTokenSize(value);
          setTokenPage(1);
        }}
        onError={onError}
      />
    </div>
  );
}
