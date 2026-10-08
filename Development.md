## Development

```text
npm install
npm run check
npm run compile
```

Press `F5` in VS Code to launch an Extension Development Host. To create a VSIX package in the `vsix` folder, run `npm run package`.

## Compiling a release

1. Update the `version` field in [package.json](package.json) following
   [semver](https://semver.org/).
2. Install dependencies and verify the project builds cleanly:
   ```text
   npm install
   npm run check
   npm run compile
   ```
3. Bump the version in [package.json](package.json) and build the VSIX:
   ```text
   npm run package
   ```
4. Find the packaged extension at `vsix/ibm-member-opener-<version>.vsix`.
5. Commit the version bump, then create and push the release tag:
   ```text
   git tag v<version>
   git push origin v<version>
   ```

Pushing only the tagged commit does not push a local tag. When the `v<version>`
tag reaches GitHub, the release workflow builds the VSIX and attaches it to a
new GitHub Release.

