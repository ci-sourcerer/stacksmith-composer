import re
from pathlib import Path
from typing import Any
from urllib.parse import quote, urlparse

from ruamel.yaml import YAML


def platform_summary(path: Path) -> dict[str, Any]:
    """Expose descriptive policy metadata without configuration values or hook code.

    Args:
        path: Administrator-selected local managed configuration.

    Returns:
        An allowlisted summary of the authored configuration, not effective values.
    """
    config = YAML(typ="safe").load(path.read_text())
    return {
        "description": config.get(
            "description", "Platform-managed Stacksmith contract"
        ),
        "source": path.name,
        "scope": "Authored configuration; layered and runtime values are not resolved.",
        "backend": {
            "kind": next(iter(config.get("backend", {})), "unknown"),
            "type": config.get("backend", {}).get("data", {}).get("type"),
            "source": _generated_source(config.get("backend", {})),
        },
        "tools": {
            name: {
                "version": spec.get("version"),
                "source": _source("data", "Managed tool configuration"),
            }
            for name, spec in config.get("tools", {}).items()
        },
        "providers": [
            _provider_summary(name, spec)
            for name, spec in config.get("provider_mappings", {}).items()
        ],
        "components": [
            {
                "name": name,
                "description": spec.get("description", ""),
                "tags": spec.get("tags", []),
                "source": _module_source(spec.get("source", {})),
                "inputs": [
                    {
                        "name": input_name,
                        "description": input_spec.get("description", ""),
                    }
                    for input_name, input_spec in spec.get("properties", {}).items()
                ],
                "outputs": [
                    {
                        "name": output_name,
                        "description": output_spec.get("description", ""),
                    }
                    for output_name, output_spec in spec.get("outputs", {}).items()
                ],
            }
            for name, spec in config.get("module_mappings", {}).items()
        ],
        "policies": [
            {
                "name": name,
                "description": spec.get("description", ""),
                "kind": kind,
                "source": _generated_source(
                    spec.get("rule", {}) if kind == "plan_validations" else spec
                ),
            }
            for kind in ("var_validations", "plan_validations")
            for name, spec in config.get(kind, {}).items()
        ],
        "associations": [
            {
                "name": name,
                "description": spec.get("description", ""),
                "source": _source("data", "Declarative platform configuration"),
            }
            for name, spec in config.get("associations", {}).items()
        ],
        "required_input_sets": config.get("required_module_input_sets", []),
        "has_default_mapping": bool(config.get("default_module_mapping")),
    }


def _provider_summary(name: str, spec: dict[str, Any]) -> dict[str, Any]:
    data = spec.get("source", {}).get("data", {})
    return {
        "name": name,
        "address": data.get("address", name),
        "version": data.get("version"),
        "source": _source(
            "registry",
            "OpenTofu Registry",
            _provider_registry_url(data.get("address", name), data.get("version")),
        ),
        "instances": [
            {
                "name": instance_name,
                "description": instance.get("description", ""),
                "source": _generated_source(instance.get("config", {})),
            }
            for instance_name, instance in spec.get("instances", {}).items()
        ],
    }


def _generated_source(spec: dict[str, Any]) -> dict[str, str | None]:
    if "inline" in spec:
        return _source("inline", "Inline Python")
    if "script" in spec:
        return _script_source(spec["script"])
    if "data" in spec:
        return _source("data", "Static configuration data")
    return _source("unknown", "Source not declared")


def _script_source(reference: dict[str, Any]) -> dict[str, str | None]:
    data = reference.get("data", {})
    match reference.get("source"):
        case "local":
            return _source("script", "Local Python script", detail=data.get("path"))
        case "git":
            return _source(
                "script",
                "Python script from GitHub",
                _github_url(data.get("repo"), data.get("ref"), data.get("path")),
                _git_detail(data),
            )
        case "http":
            return _source(
                "script",
                "Remote Python script",
                _safe_http_url(data.get("url")),
                data.get("url"),
            )
        case _:
            return _source("script", "Python script")


def _module_source(reference: dict[str, Any]) -> dict[str, str | None]:
    data = reference.get("data", {})
    match reference.get("source"):
        case "local":
            return _source("local", "Local OpenTofu module", detail=data.get("path"))
        case "git":
            return _source(
                "git",
                "GitHub OpenTofu module",
                _github_url(data.get("repo"), data.get("ref"), data.get("path")),
                _git_detail(data),
            )
        case "registry":
            return _source(
                "registry",
                "OpenTofu Registry module",
                detail=" ".join(
                    value
                    for value in (data.get("address"), data.get("version"))
                    if value
                ),
            )
        case _:
            return _source("unknown", "Module source not declared")


def _source(
    kind: str, label: str, url: str | None = None, detail: str | None = None
) -> dict[str, str | None]:
    return {"kind": kind, "label": label, "detail": detail, "url": url}


def _git_detail(data: dict[str, Any]) -> str:
    repo = str(data.get("repo", "")).removesuffix(".git")
    parsed = urlparse(repo)
    repository = parsed.path.strip("/") if parsed.hostname == "github.com" else repo
    return " · ".join(
        value for value in (repository, data.get("path"), data.get("ref")) if value
    )


def _github_url(repo: Any, ref: Any = None, path: Any = None) -> str | None:
    if not isinstance(repo, str):
        return None
    parsed = urlparse(repo.removesuffix(".git"))
    if parsed.scheme != "https" or parsed.hostname != "github.com":
        return None
    url = f"https://github.com/{parsed.path.strip('/')}"
    if ref:
        url += f"/tree/{quote(str(ref), safe='')}"
        if path:
            url += f"/{'/'.join(quote(part, safe='') for part in str(path).split('/'))}"
    return url


def _safe_http_url(value: Any) -> str | None:
    if not isinstance(value, str):
        return None
    return value if urlparse(value).scheme in {"http", "https"} else None


def _provider_registry_url(address: Any, version: Any) -> str | None:
    if not isinstance(address, str):
        return None
    parts = address.split("/")
    if len(parts) == 2:
        namespace, provider = parts
    elif len(parts) == 3 and parts[0] == "registry.opentofu.org":
        _, namespace, provider = parts
    else:
        return None
    exact_version = re.fullmatch(r"\s*=?\s*(\d+\.\d+\.\d+)\s*", str(version or ""))
    release = f"v{exact_version.group(1)}" if exact_version else "latest"
    return f"https://search.opentofu.org/provider/{namespace}/{provider}/{release}"
