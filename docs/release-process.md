# Release Process

Releases are triggered manually via GitHub Actions. The dispatch workflow handles
version bumping, tagging, and hands off to the build pipeline automatically.

---

## How to trigger a release

1. Open the repository on GitHub.
2. Go to **Actions** → **Dispatch Release** (left sidebar).
3. Click **Run workflow** (top-right of the workflow runs table).
4. Fill in the inputs (see below) and click **Run workflow**.

---

## Inputs

### Bump type (required)

Controls which part of the version number is incremented.

| Choice | Effect | Example (from `1.2.3`) |
|---|---|---|
| `patch` | Increment the third number | `1.2.3` → `1.2.4` |
| `minor` | Increment the second number, reset patch to 0 | `1.2.3` → `1.3.0` |
| `major` | Increment the first number, reset minor and patch to 0 | `1.2.3` → `2.0.0` |

The current version is read from `package.json` at runtime — no manual editing needed.

### Pre-release suffix (optional)

Leave blank for a stable release. Enter a suffix string to publish a pre-release.

| Input | Result |
|---|---|
| *(blank)* | Stable release, e.g. `v1.3.0` |
| `beta.1` | Pre-release, e.g. `v1.3.0-beta.1` |
| `rc.1` | Release candidate, e.g. `v1.3.0-rc.1` |
| `alpha.2` | Alpha pre-release, e.g. `v1.3.0-alpha.2` |

---

## Examples

| Starting version | Bump | Suffix | Result tag | Release type |
|---|---|---|---|---|
| `1.0.0` | `minor` | *(blank)* | `v1.1.0` | Stable |
| `1.1.0` | `patch` | `beta.1` | `v1.1.1-beta.1` | Pre-release |
| `1.1.1` | `patch` | *(blank)* | `v1.1.2` | Stable |
| `1.1.2` | `major` | `rc.1` | `v2.0.0-rc.1` | Pre-release |

---

## What happens automatically

### dispatch-release.yaml (does everything)

1. Reads the current version from `package.json`.
2. Applies the selected bump (major/minor/patch), resets lower components.
3. Appends the pre-release suffix if provided.
4. Validates the resulting tag does not already exist — fails fast if it does.
5. Writes the new version to `package.json` (full version, e.g. `1.1.0-beta.1`).
6. Writes the numeric-only version to `manifest.json` (e.g. `1.1.0`) — Chrome
   requires a numeric-only `X.Y.Z` format in the extension manifest.
7. Commits both files to `main`: `chore: bump version to 1.1.0-beta.1`
8. Creates and pushes the tag `v1.1.0-beta.1`.
9. Runs `npm ci` to install dependencies.
10. Runs `npm run release` — full gate: typecheck + lint + test + build.
11. Runs `npm run zip` — produces `autonomous-reports-engine-X.Y.Z.zip`.
12. Creates a GitHub Release attached to the tag.
    - No pre-release suffix → published as a **stable release**.
    - Pre-release suffix provided → published as a **pre-release**.

### release.yaml (manual tag fallback only)

Still triggers on any manually pushed `v*` tag. Use this if you need to release
from a specific commit without going through the dispatch workflow. Pre-release
detection works the same way — a tag containing `-` is marked as pre-release.

---

## Versioned files

| File | What is written |
|---|---|
| `package.json` | Full version including suffix — `1.1.0-beta.1` |
| `manifest.json` | Numeric-only version — `1.1.0` (Chrome requires this format) |

---

## Verifying a release

After the workflow runs:

1. Check the **Actions** tab — both `dispatch-release` and `release` jobs should be green.
2. Open the **Releases** tab — the new release should appear with the zip attached.
3. Confirm the zip filename matches the version: `autonomous-reports-engine-X.Y.Z.zip`.

---

## Rollback

If something went wrong after the tag was pushed:

```bash
# 1. Delete the GitHub Release via the UI (Releases → Edit → Delete)

# 2. Delete the tag remotely
git push origin --delete vX.Y.Z

# 3. Delete the tag locally
git tag -d vX.Y.Z

# 4. Revert the version bump commit on main
git revert HEAD   # or git reset --hard HEAD~1 if not yet pushed
git push origin main
```

Only perform the revert if the version bump commit is the last commit on `main`.
If other commits have landed since, use `git revert` (not `reset`) to avoid
rewriting shared history.

---

## Manual tag fallback

The existing `release.yaml` still triggers on any manually pushed `v*` tag.
This is the fallback if you need to release from a specific commit without
going through the dispatch workflow:

```bash
git tag v1.1.0 -m "Release v1.1.0"
git push origin v1.1.0
```

The pre-release detection still applies — a tag containing `-` will be marked
as a pre-release on GitHub automatically.
