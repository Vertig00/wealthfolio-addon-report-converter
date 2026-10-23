# Releasing

## Versioning

Update `package.json` and `manifest.json` to the same version before a release. Use semantic versioning.

## Requesting a release

Ask the agent to release a specific version, for example: "release version 1.1.0".

The agent must:
1. inspect Git status and changes since the previous release;
2. run type checks, lint, build, and packaging;
3. update version files and release notes if needed;
4. create a commit and an annotated tag `vX.Y.Z`;
5. push the branch and tag only after explicit confirmation;
6. report the tag, commit, checks, and release URL.

## Automated release workflow

Pushing a tag matching `v*.*.*` runs `.github/workflows/release.yml`. The workflow:
- installs dependencies with pnpm;
- verifies the tag matches `package.json` and `manifest.json`;
- runs `pnpm run type-check`;
- builds the addon;
- creates the installable zip with `pnpm run package`;
- publishes a GitHub Release with the zip attached.

## If the workflow fails

- Open the failed GitHub Actions run.
- Read the first failing step.
- Fix the issue locally.
- Run `pnpm run type-check`, `pnpm run build`, and `pnpm run package`.
- Do not recreate or overwrite an existing tag without explicit authorization.

## Safety

- Never publish real broker statements, financial data, secrets, or local sample files.
- Never force-push or overwrite an existing release.
- The first release is not created during setup.
