# Stacksmith Composer

Stacksmith Composer is a visual authoring workspace for [Stacksmith](https://github.com/ci-sourcerer/stacksmith) stacks. It helps application teams explore the component types available to them, connect component outputs to inputs, and review the resulting source change.

Composer keeps the stack file as the source of truth. It edits authored YAML or JSON while preserving unrelated fields and, where possible, YAML comments and scalar styles. It does not run infrastructure plans or apply changes. Those remain part of the repository's Stacksmith and CI workflow.

## Editing a stack

- Browse component types and managed associations exposed by Stacksmith.
- Edit component properties and tags in a visual editor.
- Connect component outputs to properties and see managed relationships.
- Review a unified source diff and download the proposed stack file.
- Open a pull request for the reviewed file change, with an optional patch download.

See [Using Composer](using-composer.md), [GitHub workflow](github-workflow.md),
[Configuration](configuration.md), and [Architecture and trust](architecture-and-trust.md)
for details.
