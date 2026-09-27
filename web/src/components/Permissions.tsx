import { useEffect, useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { api } from "../api";

type Role = "viewer" | "runner" | "provisioner";
type Grant = {
  id: string;
  login: string;
  environment: string;
  role: Role;
  workloads: string[];
};
type Environment = { name: string; settings?: { discovery_mode: string } };
const roleLabels = {
  viewer: "Stack viewer",
  runner: "Stack runner",
  provisioner: "Stack provisioner",
};

function RoleChoices({
  role,
  workloads,
  onChange,
  disabled = false,
}: {
  role: Role;
  workloads: string[];
  onChange: (role: Role, workloads: string[]) => void;
  disabled?: boolean;
}) {
  return (
    <fieldset className="role-choices" disabled={disabled}>
      <label>
        Role
        <select
          value={role}
          onChange={(event) => {
            const next = event.target.value as Role;
            onChange(next, next === "viewer" ? [] : workloads);
          }}
        >
          {Object.entries(roleLabels).map(([value, label]) => (
            <option value={value} key={value}>
              {label}
            </option>
          ))}
        </select>
      </label>
      {role !== "viewer" && (
        <div
          className="role-workloads"
          role="group"
          aria-label="Allowed workloads"
        >
          {["infrastructure", "operations"].map((workload) => (
            <label key={workload}>
              <input
                type="checkbox"
                checked={workloads.includes(workload)}
                onChange={(event) =>
                  onChange(
                    role,
                    event.target.checked
                      ? [...workloads, workload]
                      : workloads.filter((value) => value !== workload),
                  )
                }
              />
              {workload === "infrastructure" ? "Infrastructure" : "Operations"}
            </label>
          ))}
          {!workloads.length && <small>Select at least one workload.</small>}
        </div>
      )}
    </fieldset>
  );
}

function GrantRow({
  grant,
  scope,
  busy,
  onSave,
  onRemove,
}: {
  grant: Grant;
  scope: string;
  busy: boolean;
  onSave: (role: Role, workloads: string[]) => void;
  onRemove: () => void;
}) {
  const [role, setRole] = useState(grant.role);
  const [workloads, setWorkloads] = useState(grant.workloads);
  useEffect(() => {
    setRole(grant.role);
    setWorkloads(grant.workloads);
  }, [grant]);
  const changed =
    role !== grant.role ||
    workloads.length !== grant.workloads.length ||
    workloads.some((value) => !grant.workloads.includes(value));
  return (
    <tr>
      <th scope="row">{grant.login}</th>
      <td>{scope}</td>
      <td>
        <RoleChoices
          role={role}
          workloads={workloads}
          disabled={busy}
          onChange={(next, selected) => {
            setRole(next);
            setWorkloads(selected);
          }}
        />
      </td>
      <td>
        <div className="permission-actions">
          <button
            disabled={
              busy || !changed || (role !== "viewer" && !workloads.length)
            }
            onClick={() => onSave(role, workloads)}
          >
            Save
          </button>
          <button
            disabled={busy}
            onClick={onRemove}
            aria-label={`Remove ${grant.login} from ${scope}`}
          >
            <Trash2 size={15} />
            Remove
          </button>
        </div>
      </td>
    </tr>
  );
}

export function Permissions({
  repository,
  onError,
}: {
  repository: string;
  onError: (value: string) => void;
}) {
  const [grants, setGrants] = useState<Grant[]>([]);
  const [environments, setEnvironments] = useState<Environment[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [login, setLogin] = useState("");
  const [environment, setEnvironment] = useState("*");
  const [role, setRole] = useState<Role>("viewer");
  const [workloads, setWorkloads] = useState<string[]>([]);
  const [adding, setAdding] = useState(false);
  const [notice, setNotice] = useState("");
  const path = `/v1/repositories/${repository}`;
  useEffect(() => {
    let active = true;
    setLoading(true);
    setAdding(false);
    setNotice("");
    Promise.all([
      api<Grant[]>(`${path}/grants`),
      api<Environment[]>(`${path}/environments`),
    ])
      .then(([assigned, targets]) => {
        if (active) {
          setGrants(assigned);
          setEnvironments(targets);
        }
      })
      .catch((error) => {
        if (active)
          onError(error instanceof Error ? error.message : String(error));
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [path, onError]);
  const scopeName = (scope: string) =>
    scope === "*"
      ? "All environments"
      : environments.find((item) => item.name === scope)?.settings
            ?.discovery_mode === "single"
        ? "Repository default"
        : scope;
  async function save(
    user: string,
    scope: string,
    selectedRole: Role,
    selectedWorkloads: string[],
  ) {
    setBusy(true);
    setNotice("");
    try {
      await api(`${path}/grants`, {
        login: user.trim(),
        environment: scope,
        role: selectedRole,
        workloads: selectedWorkloads,
      });
      setGrants(await api<Grant[]>(`${path}/grants`));
      setNotice("Role assignment saved.");
      setAdding(false);
    } catch (error) {
      onError(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(false);
    }
  }
  async function remove(grant: Grant) {
    setBusy(true);
    setNotice("");
    try {
      await api(
        `${path}/grants/${encodeURIComponent(grant.id)}`,
        undefined,
        undefined,
        undefined,
        "DELETE",
      );
      setGrants(await api<Grant[]>(`${path}/grants`));
      setNotice("Role assignment removed. Pending phases will recheck access.");
    } catch (error) {
      onError(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="platform-card">
      <div className="permission-heading">
        <h2>Stack roles</h2>
        <button
          onClick={() => {
            setAdding(!adding);
            setLogin("");
            setEnvironment("*");
            setRole("viewer");
            setWorkloads([]);
          }}
        >
          <Plus size={15} />
          Assign role
        </button>
      </div>
      <p>
        Viewers read stack results. Runners request plans and execution.
        Provisioners also manage settings and approve their allowed workloads.
        Repository-wide Provisioners can author Composer changes and edit shared
        configuration.
      </p>
      <p>
        Assignments add access across their scopes. Configured platform Admins
        retain full access and are the only users who can assign roles.
      </p>
      {notice && (
        <p className="platform-notice" role="status">
          {notice}
        </p>
      )}
      {adding && (
        <form
          className="permission-add"
          onSubmit={(event) => {
            event.preventDefault();
            void save(login, environment, role, workloads);
          }}
        >
          <label>
            GitHub login
            <input
              value={login}
              required
              onChange={(event) => setLogin(event.target.value)}
            />
          </label>
          <label>
            Scope
            <select
              value={environment}
              onChange={(event) => setEnvironment(event.target.value)}
            >
              <option value="*">All environments</option>
              {environments.map((item) => (
                <option key={item.name} value={item.name}>
                  {scopeName(item.name)}
                </option>
              ))}
            </select>
          </label>
          <RoleChoices
            role={role}
            workloads={workloads}
            onChange={(next, selected) => {
              setRole(next);
              setWorkloads(selected);
            }}
            disabled={busy}
          />
          <button
            disabled={
              busy || !login.trim() || (role !== "viewer" && !workloads.length)
            }
          >
            Save assignment
          </button>
        </form>
      )}
      {loading ? (
        <p role="status">Loading role assignments…</p>
      ) : grants.length ? (
        <div className="permission-table-scroll">
          <table className="permission-table">
            <thead>
              <tr>
                <th>User</th>
                <th>Scope</th>
                <th>Role and workloads</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {grants.map((grant) => (
                <GrantRow
                  key={grant.id}
                  grant={grant}
                  scope={scopeName(grant.environment)}
                  busy={busy}
                  onSave={(next, selected) =>
                    void save(grant.login, grant.environment, next, selected)
                  }
                  onRemove={() => void remove(grant)}
                />
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p>No stack roles have been assigned.</p>
      )}
    </section>
  );
}
