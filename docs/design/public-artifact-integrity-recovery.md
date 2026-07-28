# Public artifact integrity recovery

## Tracked work

- Task: [gpu-lock-free-queue#26](https://github.com/Plasius-LTD/gpu-lock-free-queue/issues/26)
- Story: [plasius-ltd-site#1626](https://github.com/Plasius-LTD/plasius-ltd-site/issues/1626)
- Feature: [plasius-ltd-site#1597](https://github.com/Plasius-LTD/plasius-ltd-site/issues/1597)
- Feature flag: `platform.public-artifact-integrity.enabled`

## Scope

This recovery removes the administrative contributor-registry path from the
current tree with an ordinary forward commit. It does not rewrite history,
change shader qualification, publish npm packages, or enable a release
workflow.

The source and package admission check works in this order:

1. Inspect case-normalised source and Git-index path metadata.
2. Fail immediately if the prohibited path or a case variant is present.
3. Only after the source check passes, obtain the final npm dry-run inventory.
4. Reject the inventory if it contains the prohibited path or a variant.

This ordering prevents package tooling from being asked to read the prohibited
source path.

## Rollout and rollback

The parent Feature owns `platform.public-artifact-integrity.enabled`. The flag
controls staged restoration of public distribution; it cannot disable or
bypass the mandatory source, package, CI, or CD integrity checks.

- Disabled: keep repository visibility restricted and package CD disabled.
- Enabled: public distribution may be restored only after all mandatory checks
  and the separate release-channel gates pass.
- Rollback: disable public distribution and package CD. Do not restore the
  removed administrative path.

There is no user-visible entitlement surface, so no capability is required.
The queue shader qualification remains independently governed by its complete
physical WebGPU matrix.
