# Stacksmith Composer

Stacksmith Composer is a visual authoring workspace for [Stacksmith](https://github.com/ci-sourcerer/stacksmith) stacks. It helps application teams explore the component types available to them, connect component outputs to inputs, and review the resulting source change.

Composer keeps the stack file as the source of truth. It edits authored YAML or JSON while preserving unrelated fields and, where possible, YAML comments and scalar styles. It does not run infrastructure plans or apply changes. Those remain part of the repository's Stacksmith and CI workflow.

## Start here

- **Edit a stack:** [Using Composer](using-composer.md) explains the catalog, diagram, properties, and review flow.
- **Propose repository changes:** [GitHub workflow](github-workflow.md) covers sign-in, repository discovery, and pull requests.
- **Understand deployment settings:** [Configuration](configuration.md) describes the settings that affect Composer's behavior.
- **Review the system boundary:** [Architecture and trust](architecture-and-trust.md) describes how Composer uses Stacksmith and handles repository access.

## What Composer helps with

- Browse component types and managed associations exposed by Stacksmith.
- Edit component properties and tags in a visual editor.
- Connect component outputs to properties and see managed relationships.
- Review a unified source diff and download the proposed stack file.
- Open a pull request for the reviewed file change, with an optional patch download.
