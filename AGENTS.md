# Repository Guidelines

This workspace has no source files, build configuration, tests, or Git history yet. Update this guide alongside the first implementation so its paths and commands reflect the actual project.

## Project Structure & Module Organization

Keep application code, tests, and static assets in clearly named directories. Prefer `src/` for application code, `tests/` for tests, and `assets/` for images or other static files when those directories are introduced. Group related code by feature or responsibility, and place tests close to the behavior they verify or mirror the source layout under `tests/`.

## Build, Test, and Development Commands

No build, run, lint, or test commands are defined yet. When adding a toolchain, provide repeatable commands in its standard configuration file and document them here. For example, list `npm run dev`, `npm test`, and `npm run build` only after those scripts exist, with a short explanation of what each runs.

## Coding Style & Naming Conventions

No language or formatter has been selected. Follow the conventions of the chosen language and add formatter and linter configuration with the first source files. Use descriptive names, keep naming consistent within each module, and let the configured formatter determine indentation rather than formatting files by hand.

## Testing Guidelines

No test framework or coverage target is established. Add tests for new behavior and regressions when a stable test surface exists. Name tests for the behavior they check, and document the exact command for running the full suite once it is available.

## Commit & Pull Request Guidelines

There is no Git history from which to infer a commit convention. Use short, imperative commit subjects that describe the change. Pull requests should explain the purpose, summarize meaningful changes, identify related issues, and report the checks run. Include screenshots for visible interface changes.
