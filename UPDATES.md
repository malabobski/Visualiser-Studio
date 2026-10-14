# Releasing updates

Visualiser Studio uses `electron-updater` and the public GitHub releases at
https://github.com/malabobski/Visualiser-Studio-Releases.

Installed builds check after startup and every six hours, download updates in
the background, and wait for the user to choose **Restart to install**. Updates
are never installed on an ordinary exit. Settings includes a manual check and
an automatic-check toggle. Development builds can manually check GitHub for the latest version, but do not download or install updates.

## One-time repository transition: v1.2.7

The source repository remains `malabobski/Visualiser-Studio`. Installers and future
updates now belong in the public `malabobski/Visualiser-Studio-Releases` repository.

Installed v1.2.5 and v1.2.6 builds still check the original repository. To migrate
those installs without a manual download:

1. Build v1.2.7 once with `npm run dist -- --win --x64 --config build/bridge-release.cjs`.
2. Upload that exact installer, blockmap and latest.yml to matching v1.2.7 releases
   in **both** repositories. Keep both drafts until all assets are uploaded.
3. Publish the new releases-repository release first, then the original-repository
   bridge release. Existing installs can then find and install it normally.
4. Verify an installed v1.2.6 can update through Settings to v1.2.7. Check that the
   installed resources/app-update.yml names Visualiser-Studio-Releases. Future
   releases can be published only to the new repository.

With GH_TOKEN configured, `npm run dist:publish:bridge` builds once and uploads
both **draft** releases. The first provider in build/bridge-release.cjs is the
new repository: it becomes the feed inside the installed app. Normal
`npm run dist:publish` publishes only to the new repository.

**Keep the original repository public during the migration.** Installs that have
not yet reached v1.2.7 still need its release feed and assets. Making it private
will prevent those installs from updating. There is no remote way to change the
feed of an already-installed old binary. Users do not need a GitHub token.

The website file resolves the latest Windows installer through the new public
GitHub releases API, with the repository's latest-release page as a fallback.
Deploy the updated HTML to the existing website separately.

## Publish a Windows release

1. Increase `version` in `package.json` and `package-lock.json`, for example with
   `npm version patch --no-git-tag-version`. Every release needs a higher version.
2. Run `npm run dist` to build locally. This never publishes anything.
3. Create a GitHub release whose tag matches the version, such as `v1.2.7`.
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
