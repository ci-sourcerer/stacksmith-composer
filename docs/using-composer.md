# Using Composer

Composer presents a Stacksmith stack as a component diagram backed by its authored YAML or JSON file. The diagram helps explore relationships; the source file remains authoritative.

## Explore the catalog

The catalog comes from Stacksmith inspection of the configured platform and managed associations. Add a component from an available type, then select it to edit its name and properties. Property controls follow the values already present in the authored stack. Lists and objects can be edited recursively, with a JSON editor available for less common structures.

Composer currently builds its catalog from explicit module mappings. A type that Stacksmith can resolve through a convention may not appear in the Composer catalog yet.

## Connect components

Connect a named output on one component to a property on another. Composer records the reference in the stack source and displays it as a relationship on the diagram. Managed associations are shown separately so you can distinguish platform-provided relationships from authored references. Stack-level `disabled_associations` can be edited to opt out of a managed association.

The inspector checks references and relationships through Stacksmith and checks component cycles. This is an authoring inspection, not full Stacksmith validation or an infrastructure plan. Run the repository's normal validation and planning workflow before applying infrastructure.

## Review and download

Open the review panel to see the exact proposed source and unified diff. Composer preserves the original source byte-for-byte when there are no edits. YAML comments and unchanged scalar styles are preserved for supported edits; changed JSON is formatted with two-space indentation.

Components and routing points snap to the grid on load and during movement. Drag a line label to reposition it; select a line and use Hide label or Show label to control its visibility. Labels stay visible until manually hidden.

Download the reviewed stack file to keep changes outside a GitHub workflow. Component positions, routing points, and label positions are saved under `metadata.stacksmith_composer`. Label visibility is local to the UI. Unsaved edits are not recoverable after the tab is closed.

## Supported source boundary

Composer edits ordinary YAML and JSON mappings. Whole-file Jinja templates, YAML aliases and anchors, and custom tags are opened read-only because rewriting them safely is not supported. Unrelated root fields are retained when an editable stack is changed.
