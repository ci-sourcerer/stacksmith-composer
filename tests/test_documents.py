import json

import pytest

from stacksmith_composer.documents import compose_source, load_document, source_diff
from stacksmith_composer.errors import ComposerError

SOURCE = """# Keep the platform team's note.
name: storefront
tags: [production]
components:
  api:
    type: service
    properties:
      name: "hello" # Keep this inline comment.
outputs:
  url:
    value: "{{ components.api.url }}"
"""


def test_unchanged_source_is_byte_identical():
    assert (
        compose_source(SOURCE, load_document(SOURCE)["components"], [], "stack.yaml")
        == SOURCE
    )


def test_edit_retains_comments_quotes_outputs_and_flow_style():
    components = load_document(SOURCE)["components"]
    components["api"]["properties"]["name"] = "goodbye"
    proposed = compose_source(SOURCE, components, [], "stack.yaml")
    assert "# Keep the platform team's note." in proposed
    assert 'name: "goodbye" # Keep this inline comment.' in proposed
    assert "tags: [production]" in proposed
    assert 'value: "{{ components.api.url }}"' in proposed
    assert "outputs:" in proposed
    assert '+      name: "goodbye"' in source_diff(SOURCE, proposed, "stack.yaml")


def test_association_opt_out_does_not_materialize_effective_properties():
    proposed = compose_source(
        SOURCE, load_document(SOURCE)["components"], ["network"], "stack.yaml"
    )
    assert load_document(proposed)["disabled_associations"] == ["network"]
    assert "network_id" not in proposed


def test_json_remains_json():
    original = '{"name":"test","components":{},"tags":["keep"]}'
    proposed = compose_source(original, {"api": {"type": "service"}}, [], "stack.json")
    assert json.loads(proposed)["tags"] == ["keep"]
    assert json.loads(proposed)["components"]["api"]["type"] == "service"


def test_label_position_round_trips_without_custom_routing_points():
    route = {
        "source": "api",
        "target": "worker",
        "output": "url",
        "property": "url",
        "path": ["url"],
        "kind": "reference",
        "rule": None,
        "points": [],
        "label_position": {"x": 220, "y": 132},
    }
    proposed = compose_source(
        SOURCE, load_document(SOURCE)["components"], [], "stack.yaml", routes=[route]
    )
    assert load_document(proposed)["metadata"]["stacksmith_composer"]["routes"] == [
        route
    ]


@pytest.mark.parametrize(
    "point", [{"x": True, "y": 0}, {"x": float("inf"), "y": 0}, {"x": 1}]
)
def test_invalid_label_positions_are_rejected(point):
    with pytest.raises(ComposerError, match="finite x and y"):
        load_document(
            json.dumps(
                {
                    "name": "test",
                    "components": {},
                    "metadata": {
                        "stacksmith_composer": {
                            "routes": [
                                {
                                    "source": "api",
                                    "target": "worker",
                                    "output": "url",
                                    "property": "url",
                                    "path": ["url"],
                                    "kind": "reference",
                                    "points": [],
                                    "label_position": point,
                                }
                            ]
                        }
                    },
                }
            )
        )


@pytest.mark.parametrize(
    "source",
    [
        "name: test\n{% for item in inputs.items %}\n{% endfor %}",
        "name: test\ncomponents: &components {}",
        "name: test\ncomponents: !!map {}",
        "name: test\ncomponents: [bad]",
        "name: test\ncomponents:\n  api:\n    type: service\n    properties: []",
        "name: test\nname: duplicate",
        "name: test\n" + "# too large\n" * 10000,
    ],
)
def test_unsupported_sources_are_rejected(source):
    with pytest.raises(ComposerError):
        load_document(source)


@pytest.mark.parametrize("value", ["2026-01-01", ".nan", "9007199254740993"])
def test_yaml_values_that_cannot_round_trip_through_browser_are_read_only(value):
    with pytest.raises(ComposerError, match="read-only"):
        load_document(
            "name: test\ncomponents:\n  api:\n    type: service\n    properties:\n"
            f"      value: {value}\n"
        )
