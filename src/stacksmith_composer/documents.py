import difflib
import json
import math
from io import StringIO
from typing import Any

from ruamel.yaml import YAML
from ruamel.yaml.error import YAMLError
from ruamel.yaml.tokens import AliasToken, AnchorToken, TagToken

from .errors import ComposerError

MAX_SOURCE_BYTES = 100_000


def load_document(source: str) -> dict[str, Any]:
    """Parse a conservative, editable subset of Stacksmith YAML or JSON.

    Args:
        source: Original source text, including comments and quoted expressions.

    Returns:
        A round-trip mapping that retains YAML comments and scalar styles.

    Raises:
        ComposerError: If the document requires template rendering or is unsupported.
    """
    if len(source.encode()) > MAX_SOURCE_BYTES:
        raise ComposerError("Stack files larger than 100 KB are not supported yet.")
    if "{%" in source or "{#" in source:
        raise ComposerError(
            "This stack uses whole-file Jinja. "
            "Visual editing is read-only; edit its source."
        )
    parser = YAML(typ="rt")
    parser.preserve_quotes = True
    try:
        if any(
            isinstance(token, AliasToken | AnchorToken | TagToken)
            for token in parser.scan(source)
        ):
            raise ComposerError(
                "YAML aliases, anchors, and custom tags are read-only in this version."
            )
        document = parser.load(source)
    except (YAMLError, RecursionError) as exc:
        raise ComposerError(
            "This stack is not valid YAML/JSON with quoted expressions."
        ) from exc
    _validate_json_shape(document)
    if not isinstance(document, dict) or not isinstance(document.get("name"), str):
        raise ComposerError("A stack must be a mapping with a string name.")
    if not isinstance(document.get("components", {}), dict):
        raise ComposerError("Stack components must be a mapping.")
    _validate_components(document.get("components", {}))
    return document


def _validate_json_shape(value: Any, depth: int = 0) -> None:
    if depth > 40:
        raise ComposerError("Deeply nested YAML is read-only in this version.")
    if isinstance(value, dict):
        for key, child in value.items():
            if not isinstance(key, str):
                raise ComposerError(
                    "YAML mapping keys must be strings for visual editing."
                )
            _validate_json_shape(child, depth + 1)
    elif isinstance(value, list):
        for child in value:
            _validate_json_shape(child, depth + 1)
    elif isinstance(value, int) and abs(value) > 2**53 - 1:
        raise ComposerError(
            "Large YAML integers are read-only to avoid browser precision loss."
        )
    elif isinstance(value, float) and not math.isfinite(value):
        raise ComposerError("Non-finite YAML numbers are read-only in this version.")
    elif value is not None and not isinstance(value, str | int | float | bool):
        raise ComposerError("Special YAML scalar types are read-only in this version.")


def _validate_components(components: dict[str, Any]) -> None:
    for name, component in components.items():
        if not isinstance(name, str) or not name or not isinstance(component, dict):
            raise ComposerError("Each component needs a name and a mapping definition.")
        if not isinstance(component.get("type"), str):
            raise ComposerError(f"Component {name} needs a type.")
        if not isinstance(component.get("properties", {}), dict):
            raise ComposerError(f"Component {name} properties must be a mapping.")


def _update_mapping(original: dict[str, Any], desired: dict[str, Any]) -> None:
    for key in list(original):
        if key not in desired:
            del original[key]
    for key, value in desired.items():
        if isinstance(original.get(key), dict) and isinstance(value, dict):
            _update_mapping(original[key], value)
        elif key not in original or original[key] != value:
            original[key] = value


def compose_source(
    original: str, components: dict[str, Any], disabled: list[str], path: str
) -> str:
    """Apply component edits while preserving unrelated authored stack content.

    Args:
        original: Base source captured when opening the stack.
        components: Desired component definitions, including preserved unknown fields.
        disabled: Desired stack-level association opt-outs.
        path: Source filename, used to retain JSON formatting semantics.

    Returns:
        Authored source; unchanged documents return the exact original bytes as text.

    Raises:
        ComposerError: If the source or requested component definitions are unsupported.
    """
    _validate_components(components)
    document = load_document(original)
    if (
        document.get("components", {}) == components
        and document.get("disabled_associations", []) == disabled
    ):
        return original
    _update_mapping(document.setdefault("components", {}), components)
    if document.get("disabled_associations", []) != disabled:
        if disabled:
            document["disabled_associations"] = disabled
        else:
            document.pop("disabled_associations", None)
    if path.endswith(".json"):
        return json.dumps(document, indent=2, ensure_ascii=False) + "\n"
    output = StringIO()
    parser = YAML(typ="rt")
    parser.preserve_quotes = True
    parser.width = 4096
    parser.dump(document, output)
    return output.getvalue()


def source_diff(original: str, proposed: str, path: str) -> str:
    """Return a unified diff suitable for reviewing authored changes.

    Args:
        original: Base source.
        proposed: Proposed source.
        path: Repository-relative filename.

    Returns:
        Unified text diff, empty if no changes were made.
    """
    return "".join(
        difflib.unified_diff(
            original.splitlines(keepends=True),
            proposed.splitlines(keepends=True),
            fromfile=f"a/{path}",
            tofile=f"b/{path}",
        )
    )
