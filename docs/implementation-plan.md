# Implementation plan

## Implemented foundation

- [x] Independent Python package and frontend project, with no changes to Stacksmith packaging.
- [x] CLI adapter using the real module and association inspection commands.
- [x] Read-only catalog and friendly authored platform-config view.
- [x] React Flow composer with draggable components and named connection ports.
- [x] Component property editing, explicit references, and stack-level association opt-outs.
- [x] Preserved YAML source, safe read-only handling of whole-file templates, and reviewed diffs.
- [x] Local sample with no cloud dependencies.
- [x] GitHub App OAuth, encrypted sessions, topic discovery, and conventional stack discovery.
- [x] Draft PR creation with a captured base SHA and retry reuse.
- [x] Unit and contract tests, plus an opt-in real-CLI integration test.

## Next increment

- [ ] Register a GitHub App and verify the complete OAuth and PR workflow against a dedicated test repository.
- [ ] Add durable per-user drafts, saved diagram positions, undo/redo, and draft recovery.
- [ ] Generate input forms from richer Stacksmith type metadata.
- [ ] Introduce explicit runfile and environment discovery without duplicating Stacksmith resolution rules.
- [ ] Support selecting an editable layer while keeping inherited and generated components read-only.
- [ ] Add component-level association exclusions and explanations of matched selectors and cardinality.
- [ ] Show root outputs, cross-stack contracts, and dependencies in the diagram.
- [ ] Add structured validation diagnostics and CI plan/check results.

## Before shared production hosting

- [ ] Isolate workers at the operating-system/container level with restricted filesystem and network access.
- [ ] Pin and verify managed config and module revisions, and negotiate the inspection schema version.
- [ ] Move sessions, durable drafts, and jobs to PostgreSQL with explicit migrations and retention.
- [ ] Add request-size limits, bounded subprocess output, process-tree cancellation, and fair job scheduling.
- [ ] Implement GitHub token refresh, webhook validation, permission-change handling, and rate-limit recovery.
- [ ] Add deployment packaging, same-origin HTTPS configuration, observability, and an audit trail of PR actions.
- [ ] Exercise keyboard, touch, accessibility, and error recovery with automated browser coverage.
