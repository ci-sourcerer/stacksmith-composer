from pathlib import Path
from typing import Any

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
        },
        "tools": {
            name: {"version": spec.get("version")}
            for name, spec in config.get("tools", {}).items()
        },
        "providers": [
            {"name": name, "instances": list(spec.get("instances", {}))}
            for name, spec in config.get("provider_mappings", {}).items()
        ],
        "policies": [
            {"name": name, "description": spec.get("description", ""), "kind": kind}
            for kind in ("var_validations", "plan_validations")
            for name, spec in config.get(kind, {}).items()
        ],
        "associations": [
            {"name": name, "description": spec.get("description", "")}
            for name, spec in config.get("associations", {}).items()
        ],
        "required_input_sets": config.get("required_module_input_sets", []),
        "has_default_mapping": bool(config.get("default_module_mapping")),
    }
