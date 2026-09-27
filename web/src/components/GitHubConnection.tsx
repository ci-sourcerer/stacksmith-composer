import { useEffect, useState } from "react";
import { api } from "../api";

type Connection = {
  install_url: string | null;
  installations: {
    id: number;
    account: string;
    management_url: string | null;
  }[];
};

export function GitHubConnection() {
  const [connection, setConnection] = useState<Connection | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    let active = true;
    api<Connection>("/github-connection")
      .then((value) => {
        if (active) setConnection(value);
      })
      .catch((failure: unknown) => {
        if (active)
          setError(
            failure instanceof Error
              ? failure.message
              : "GitHub connection unavailable.",
          );
      });
    return () => {
      active = false;
    };
  }, []);
  return (
    <div className="github-connection">
      {connection && (
        <>
          {connection.install_url && (
            <a className="button" href={connection.install_url}>
              Connect GitHub
            </a>
          )}
          {connection.installations.map(
            (installation) =>
              installation.management_url && (
                <a
                  key={installation.id}
                  className="button"
                  href={installation.management_url}
                >
                  Manage repository access: {installation.account}
                </a>
              ),
          )}
        </>
      )}
      {error && <p role="alert">{error}</p>}
    </div>
  );
}
