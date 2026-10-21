# Wealthfolio Statement Importer — Agent Documentation

This package contains project guidance for an AI coding agent working on a Wealthfolio addon. It is a documentation starter pack, not a complete addon implementation.

## How to use

1. Generate the addon project using the official Wealthfolio addon tooling, if you have not already done so.
2. Copy `AGENTS.md` into the project root.
3. Copy `docs/`, `local-samples/README.md`, and `tests/fixtures/README.md` into the project.
4. Merge the rules from `docs/GITIGNORE_SNIPPET.md` into the existing `.gitignore`. Do not blindly overwrite project configuration.
5. Open the project in WSL and start OpenCode from the project root.
6. Ask the agent to inspect the existing project and propose a plan before implementing the importer.

## Suggested first prompt for OpenCode

> Read `AGENTS.md` and every document in `docs/`. Inspect the existing project, installed Wealthfolio SDK version, and available package scripts. Do not implement features yet. Report the project status, propose a staged plan, and list questions that can only be answered after inspecting an XTB report. Do not send local sample files to external services.

## Privacy

Broker statements may contain sensitive financial and identifying data. Keep real files local and outside Git. Only commit synthetic or carefully anonymized samples.
