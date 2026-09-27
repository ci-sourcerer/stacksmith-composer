# Using Composer

Composer presents a Stacksmith stack as a component diagram backed by its authored YAML or JSON file. The diagram helps explore relationships; the source file remains authoritative.

In Open stack, choose a repository with the searchable dropdown, then choose its stack file. Search matches repository names and descriptions. Results retain Can edit or Read only badges; navigation and filtering do not switch repositories until you select a result.

## Link to a stack

Opening a stack updates the address bar to `#/stacks/owner/repository/path/to/stack.yaml`. Copy that URL to reopen the file on the repository's current default branch. The link also retains the selected workspace view and view-only mode. GitHub sign-in preserves the requested link, and repository access is checked when the stack opens. Local example URLs use `#/example`.

Links identify the stack and view. Draft edits remain in this browser's recovery storage; sharing a URL does not share those edits.

## View without editing

Switch **Editing** to **View only** in the stack toolbar to pan and zoom the diagram and select components or relationships for inspection. Components, connection labels, and routing points stay fixed. Property edits, component additions and deletions, connection changes, managed rule changes, draft restoration, and undo/redo are disabled. Switch back to **Editing** to resume changes. The URL includes `mode=view` while this mode is active.

## Explore the catalog

The catalog comes from Stacksmith inspection of the configured platform and managed associations. Add a component from an available type, then select it to edit its name and properties. Property controls follow the values already present in the authored stack. Lists and objects can be edited recursively, with a JSON editor available for less common structures.

Composer currently builds its catalog from explicit module mappings. A type that Stacksmith can resolve through a convention may not appear in the Composer catalog yet.

## Connect components

Connect a named output on one component to a property on another. Composer records the reference in the stack source and displays it as a relationship on the diagram. Managed associations are shown separately so you can distinguish platform-provided relationships from authored references. Stack-level `disabled_associations` can be edited to opt out of a managed association.

Open **Managed rules for this stack** above the canvas or in Review to enable or disable rules. Disabling a managed connection disables its rule for the entire stack, including other connections supplied by that rule. Composer lists the affected connections before confirming and marks the list when inspection is pending or has failed. Undo restores the previous rule setting and keeps authored references and routing intact.

The inspector checks references and relationships through Stacksmith and checks component cycles. This is an authoring inspection, not full Stacksmith validation or an infrastructure plan. Run the repository's normal validation and planning workflow before applying infrastructure.

## Inspect configuration resolution

Open **Resolution** in the stack toolbar to inspect the current draft against the managed platform config. The effective configuration includes the merged stack and config, resolved inputs, final component properties, and module blocks. Expand a section to inspect its structure.

Switch to **Resolution history** to see source contributions and merge decisions in order, including managed defaults, transforms, renames, and injected inputs. Expand an event to inspect its metadata. Enter a dotted address such as `inputs.region` or `components.api.properties.instance_type` and choose **Explain** to follow its contributing inputs and mappings. Both authored property names and mapped module input names are supported. Select a component on the canvas first to get a shortcut for its properties. **All configuration** clears the query, and **Refresh** retries inspection.

Values and templates are visible, including overridden contributions and any embedded secrets. Composer uses `stacksmith info explain --show-values` and requires a Stacksmith version providing that command. Resolution uses the current draft and deployment-managed config; repository runfile and variable layers are not included. Configured Python validations and transforms still execute, and module discovery may fetch sources. This inspection does not generate infrastructure files or run a plan.

## Review and download

Open the review panel to see the exact proposed source and unified diff. Composer preserves the original source byte-for-byte when there are no edits. YAML comments and unchanged scalar styles are preserved for supported edits; changed JSON is formatted with two-space indentation.

Saved component positions and routing points are preserved when opening a stack. New components and moved components or routing points snap to the grid while editing. Drag a line label to reposition it; select a line and use Hide label or Show label to control its visibility. Labels stay visible until manually hidden.

Download the stack file to keep changes outside a GitHub workflow. Component positions, routing points, and label positions are saved under `metadata.stacksmith_platform`. Label visibility is local to the UI. Layout edits update the source and diff without rerunning Stacksmith inspection. When inspection fails or is pending, **Download unvalidated stack** remains available once the authored source has been rendered. A pull request requires successful inspection of the current draft and is reinspected by the server.

## Recover a draft

Composer automatically saves components, managed rule settings, and diagram layout in browser storage. The toolbar reports when the draft is saved. These copies include authored values and the original source, remain on this browser after sign-out, and are scoped to the account, repository, file, and branch. They are not synchronized between devices or backed up by the server.

Reopen the stack to restore a saved draft. Automatic restoration requires the same base commit and original source; restored edits are inspected again using the new snapshot. If the base changed, download the saved recovery file and reconcile the edits manually. Restoring or discarding the saved copy allows new edits to be saved. Returning to the original stack state removes its browser recovery copy.

Use **Download recovery file** to keep a portable copy, including when a session or snapshot expires. **Import recovery file** loads that copy into an unchanged stack for restoration. Recovery files contain the original source and structured draft data; they are not deployable YAML or JSON stacks. If browser storage is unavailable or full, Composer reports that saving failed and you can still download a recovery file.

## Supported source boundary

Composer edits ordinary YAML and JSON mappings. Whole-file Jinja templates, YAML aliases and anchors, and custom tags are opened read-only because rewriting them safely is not supported. Unrelated root fields are retained when an editable stack is changed.
