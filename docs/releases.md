# Releases and deployment

Production runs at [undercover-club.up.railway.app](https://undercover-club.up.railway.app/) on Railway. The service builds the repository's Dockerfile from `main`. Rooms and history are stored in memory; a deployment or rollback clears them. Deploy between games.

## Versioning

Use annotated [Semantic Versioning](https://semver.org/) tags: `vMAJOR.MINOR.PATCH`. The tag version must match `package.json` and `package-lock.json`.

- Patch: compatible bug fixes.
- Minor: compatible gameplay or interface features.
- Major: incompatible changes to the client/server contract or supported behavior.

Tags identify a source commit and must never be moved or reused. GitHub releases describe that version; creating a release does not deploy the app. Confirm the Railway deployment's commit before describing a release as live.

The initial `v1.0.0` identifies commit `394eb5e7276e42b699252a3ccc91d32c7b165572`, the deployed app before CI and repository presentation were added. This historical commit has no Actions workflow, so its release is bootstrapped manually after verification. Later tags use the release job in CI.

## CI

[GitHub Actions](../.github/workflows/ci.yml) checks pull requests, pushes to `main`, and version tags. It runs the existing client, UI, and Go race tests; lint and Go vet; formatting; frontend and server builds; and a Docker build with HTTP smoke checks. Release tags also validate the version and that their commit belongs to `main` before publishing a GitHub release.

Actions have read access by default. Only the release job has permission to publish repository content. Third-party actions are pinned to commit SHAs, and [Dependabot](../.github/dependabot.yml) proposes dependency and action updates through pull requests.

## Railway

The current production setup uses one replica in Singapore, `/healthz` as its deployment health check, and Serverless disabled. Keep those settings while state remains in memory: multiple replicas would hold different rooms, and sleeping or restarting loses the current rooms.

Deployment is manual. Choose a commit with a successful CI run, then deploy that commit through the existing Railway service. Verify the active deployment's commit and status, load the app, and check `/healthz`; the health endpoint alone does not prove a complete game flow. For runtime changes, also exercise create/join, reveal, clues, voting, recovery, and rematch.

If enabling automatic deployment later, enable Railway's [Wait for CI](https://docs.railway.com/deployments/github-autodeploys#wait-for-ci) and check that a deployment waits until the push workflow passes. Configure watch paths for app source, shared protocol, dependencies, Dockerfile, and build configuration so documentation and artwork changes do not restart active games. GitHub branch checks do not replace Railway's deployment gate.

## Publish a version

1. Update the package version without creating a tag, for example `npm version 1.0.1 --no-git-tag-version`, and document the change in the pull request.
2. After the change reaches `main`, wait for its CI checks to pass.
3. Deploy the chosen commit at a suitable time and verify the app and active Railway commit.
4. Fetch `main`, then create an annotated tag on that exact commit and push only that tag:

   ```sh
   git fetch origin main
   git tag -a v1.0.1 VERIFIED_COMMIT_SHA -m "Undercover Club v1.0.1"
   git push origin v1.0.1
   ```

5. Wait for the tag's CI run and release job, then check the published source commit and release notes.

Use the next unused version if a published version needs correcting. For a failed unpublished tag, investigate the failure before retrying the workflow; do not change its source commit.

## Rollback

Select and redeploy the previous successful deployment in Railway. Verify its commit, app, and health endpoint. Ask players to reload to get the matching frontend; existing rooms cannot be recovered after a process restart. Keep published tags and release history intact, and record which version is running after rollback.
