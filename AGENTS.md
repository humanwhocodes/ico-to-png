# Agent guidance

## Project and layout

`@humanwhocodes/ico-to-png` is a zero-runtime-dependency ES module library for
extracting images from ICO files and converting BMP images to PNG. Preserve PNG
pass-through behavior, supported BMP bit depths, and transparency handling.

- `src/index.js`: implementation and public exports, annotated with JSDoc.
- `tests/index.js`: Mocha tests using Node.js assertions.
- `tests/fixtures/`: image fixtures used by the tests.
- `scripts/convert-icons.js`: helper that writes extracted fixture images; do not
  run it as a validation command.
- `dist/`: generated JavaScript and type declarations from the TypeScript build.
- `README.md`: public API documentation and examples.

Read `.github/copilot-instructions.md` and, for JavaScript or TypeScript changes,
`.github/instructions/javascript.instructions.md`.

## Setup and validation

Use Node.js 18.18 or newer and install locked dependencies with `npm ci`. Run
commands from the repository root; do not change directories to run tests.

- `npm run build`: type-check JavaScript with strict TypeScript `checkJs` and
  generate `dist/` output and declarations.
- `npx mocha tests/index.js`: run the focused test file; repeat after fixes until
  it passes.
- `npm test`: run the complete Mocha suite; the `pretest` hook also runs the build.
- `npm run lint`: lint source and tests with ESLint.
- `npx prettier --check <changed-files>`: check formatting of changed files.
  `npm run fmt` rewrites the whole repository, so avoid unrelated formatting.
- `npm run test:jsr`: dry-run JSR publishing when changing package/publish setup.
- `npm run test:attw`: check packed ESM package types when changing exports or
  generated declarations.

For code changes, run the focused tests, full suite, build/type-check, and lint.
Documentation-only changes do not require code tests. CI tests Node.js 18, 20,
and 22 on Windows, macOS, and Linux, plus Bun; keep changes portable.

## Implementation conventions

Keep the library dependency-free and use ES modules, `Uint8Array` image data, and
JSDoc types rather than introducing a separate TypeScript implementation. Edit
source files, not generated `dist/` output. Follow the existing ESLint and
Prettier configuration: tabs, double-quoted JavaScript strings, and braced
conditional blocks with blank lines around conditionals.

Validate public inputs at entry points. Use `TypeError` for type validation and
`Error` for invalid data or business logic; preserve specific error messages.
Add comprehensive tests for new behavior and regressions, including success and
error paths and exact error messages. Cover async/concurrent behavior when
applicable and mock external dependencies when needed. Update `README.md` for
public API changes.

## Commits and pull requests

**Every commit message subject and every PR title MUST use Conventional Commits
format:** `type(scope): description`. The scope is optional; use
`type: description` when no scope is useful. A relevant scope might be `png`,
`ico`, or `types`.

Choose the type for the primary purpose: `feat` for functionality, `fix` for bug
fixes, `docs` for Markdown-only documentation changes, `chore` for maintenance
that does not affect users, `ci` for CI workflows, and `build` for build changes.
For example: `fix(png): preserve transparency when converting BMP images` or
`docs: add agent guidance`. Use `!` before the colon and a `BREAKING CHANGE:`
footer when documenting a breaking change.

Use the primary change to choose the PR title type even when the PR also updates
docs. Keep changes focused, preserve unrelated work, and describe the behavior
change and relevant validation in the PR body.
