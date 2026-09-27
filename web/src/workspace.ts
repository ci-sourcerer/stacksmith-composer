export function workspaceScope(
  tab: string,
): "repository" | "platform" | "account" {
  if (tab === "tokens") return "account";
  return [
    "runs",
    "environments",
    "repository-config",
    "permissions",
    "credentials",
  ].includes(tab)
    ? "repository"
    : "platform";
}

export function workspaceUrl(
  current: string,
  tab: string,
  repository: string,
): string {
  const url = new URL(current);
  url.searchParams.set("tab", tab);
  if (workspaceScope(tab) === "repository" && repository)
    url.searchParams.set("repo", repository);
  else url.searchParams.delete("repo");
  return url.toString();
}
