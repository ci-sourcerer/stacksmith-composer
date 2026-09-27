import { useEffect, useState } from "react";
import { api } from "../api";

type HealthBase = {
  observed_at: number;
  pending: { id: string; status: string; created: number }[];
};
export type ExecutionStatus = HealthBase &
  (
    | {
        mode: "worker";
        stale_workers: number;
        workers: { id: string; driver: string; heartbeat: number }[];
      }
    | {
        mode: "kubernetes-jobs";
        recovery: {
          completed: number | null;
          overdue: boolean;
          error: string | null;
        };
        supervisors: {
          run: string;
          job: string | null;
          generation: number;
          state: string;
          status: string;
          phase: string | null;
          error: string | null;
          execution: string | null;
          execution_state: string | null;
        }[];
      }
  );

export function ExecutionHealthDetails({
  status,
}: {
  status: ExecutionStatus;
}) {
  return (
    <>
      {status.mode === "worker" ? (
        <>
          <p>
            Only workers with a heartbeat in the last two minutes are shown.
          </p>
          <p>
            <strong>{status.workers.length}</strong> active workers ·{" "}
            {status.stale_workers} stale records excluded
          </p>
          <table className="platform-worker-table">
            <thead>
              <tr>
                <th>Worker</th>
                <th>Runner</th>
                <th>Last heartbeat</th>
              </tr>
            </thead>
            <tbody>
              {status.workers.map((worker) => (
                <tr key={worker.id}>
                  <td>
                    <code>{worker.id}</code>
                  </td>
                  <td>{worker.driver}</td>
                  <td>{new Date(worker.heartbeat * 1000).toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      ) : (
        <>
          <p>
            Kubernetes launches temporary supervisors for active runs. Recovery
            retries missed scheduling and deployment locks every minute.
          </p>
          <p>
            Last successful recovery:{" "}
            {status.recovery.completed
              ? new Date(status.recovery.completed * 1000).toLocaleString()
              : "Awaiting first recovery pass"}
            {status.recovery.overdue && status.recovery.completed
              ? " (overdue)"
              : ""}
          </p>
          {status.recovery.error && (
            <p role="alert" className="platform-notice">
              {status.recovery.error}
            </p>
          )}
          {status.supervisors.length ? (
            <table className="platform-worker-table">
              <thead>
                <tr>
                  <th>Run</th>
                  <th>Supervisor Job</th>
                  <th>Run status</th>
                  <th>Execution Job</th>
                  <th>Scheduling</th>
                </tr>
              </thead>
              <tbody>
                {status.supervisors.map((item) => (
                  <tr key={item.run}>
                    <td>
                      <code>{item.run}</code>
                    </td>
                    <td>
                      {item.job ?? "Awaiting dispatch"}
                      <br />
                      <small>
                        {item.state} · generation {item.generation}
                      </small>
                    </td>
                    <td>
                      {item.status}
                      {item.phase ? ` · ${item.phase}` : ""}
                    </td>
                    <td>
                      {item.execution ?? "None"}
                      {item.execution_state ? ` (${item.execution_state})` : ""}
                    </td>
                    <td>{item.error ?? "No scheduling errors"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <p>No Kubernetes runs yet.</p>
          )}
        </>
      )}
      <h3>Pending runs</h3>
      {status.pending.length ? (
        <ul>
          {status.pending.map((run) => (
            <li key={run.id}>
              <code>{run.id}</code> · {run.status}
            </li>
          ))}
        </ul>
      ) : (
        <p>No queued or uncertain runs.</p>
      )}
    </>
  );
}

export function ExecutionHealth({
  onError,
}: {
  onError: (message: string) => void;
}) {
  const [status, setStatus] = useState<ExecutionStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [refresh, setRefresh] = useState(0);
  useEffect(() => {
    let active = true;
    const load = () =>
      api<ExecutionStatus>("/v1/status")
        .then((value) => {
          if (active) setStatus(value);
        })
        .catch((error) => {
          if (active)
            onError(
              error instanceof Error
                ? error.message
                : "Execution health is unavailable.",
            );
        })
        .finally(() => {
          if (active) setLoading(false);
        });
    void load();
    const timer = setInterval(load, 15000);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, [refresh, onError]);
  return (
    <section className="platform-card">
      <h2>Execution health</h2>
      <button
        disabled={loading}
        onClick={() => {
          setLoading(true);
          setRefresh((value) => value + 1);
        }}
      >
        Refresh health
      </button>
      {status ? (
        <ExecutionHealthDetails status={status} />
      ) : (
        <p role="status">
          {loading
            ? "Checking execution health…"
            : "Execution health is unavailable. Retry using Refresh health."}
        </p>
      )}
    </section>
  );
}
