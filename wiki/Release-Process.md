# Release Process

Releases are **tag-driven**. Pushing a `v*` tag runs the release workflow
(`.github/workflows/release.yaml`), which builds and publishes a zipped
`dist/`.

## The workflow

`.github/workflows/release.yaml` triggers on tags matching `v*` and:

1. Checks out the repo.
2. Sets up **Node 22**.
3. `npm ci`.
4. `npm run release` — the full gate: `typecheck && lint && test && build`.
5. `npm run zip` — packages `dist/`.
6. Creates a GitHub Release with the `.zip` attached.

Because `npm run release` is the same gate you run locally
(see [Testing](Testing)), a green local gate should mean a green release.

## Cutting a release

```bash
# ensure the gate is green locally first
npm run release

# then tag and push
git tag v0.1.0
git push origin v0.1.0
```

The workflow does the rest. Use semantic version tags.

## Versioning

- `manifest.json` carries the extension version shown in Chrome.
- Keep the tag and the manifest version in step when cutting a release.

## Related workflow — wiki sync

Separately, the `Sync Wiki` workflow publishes `wiki/**` to the GitHub Wiki on
push to `main`. It is independent of releases. See [Contributing](Contributing).

---
Related: [Building and Running](Building-and-Running) · [Testing](Testing) ·
[Roadmap](Roadmap)
