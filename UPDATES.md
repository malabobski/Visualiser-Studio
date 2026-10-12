# Releasing updates

Visualiser Studio uses `electron-updater` and the public GitHub releases at
https://github.com/malabobski/Visualiser-Studio.

Installed builds check after startup and every six hours, download updates in
the background, and wait for the user to choose **Restart to install**. Updates
are never installed on an ordinary exit. Settings includes a manual check and
an automatic-check toggle. Development builds can manually check GitHub for the latest version, but do not download or install updates.

## Publish a Windows release

1. Increase `version` in `package.json` and `package-lock.json`, for example with
   `npm version patch --no-git-tag-version`. Every release needs a higher version.
2. Run `npm run dist` to build locally. This never publishes anything.
3. Create a GitHub release whose tag matches the version, such as `v1.2.6`.
4. Attach the generated NSIS `.exe`, its `.exe.blockmap`, and `latest.yml` from
   `dist`. Keep their generated filenames and metadata unchanged.
5. Publish the release as a normal release. Drafts and prereleases are ignored.

Alternatively, set `GH_TOKEN` in your own environment and run
`npm run dist:publish`. This builds Windows artifacts and uploads them to a
**draft** release for review; publish that draft when ready. Do not put a token
in the source code or distribute it with the app. Public update checks need no
token on users' computers.

Users of older builds without this updater must install the first updater-enabled
release once. Later releases can arrive through the app. Projects and preferences
remain in the existing user-data folder.

## Validate an update

Install an updater-enabled build, then publish a higher-version test release with
all generated assets. Verify download progress, the ready notice, postponing the
restart, saving a new and existing project before restart, and successful startup
on the newer version. Do not point production users at test releases.

`npm run test:updates` checks the updater states, error recovery, and restart
guards without downloading an installer or closing the app.

For macOS, build both `dmg` and `zip` and sign the app before enabling releases.
For Linux, the packaged AppImage supports updates. Publish each platform's
generated metadata and artifacts when releasing that platform.

Reference: https://www.electron.build/v26/docs/features/auto-update/
