## Development

```text
npm install
npm run check
npm run compile
npm test
```

Press `F5` in VS Code to launch an Extension Development Host. To create a VSIX package in the `vsix` folder, run `npm run package`.

## Dialog Assets

Edit the direct picker in [src/webview/memberPicker.html](src/webview/memberPicker.html),
[src/webview/memberPicker.css](src/webview/memberPicker.css), and
[src/webview/memberPicker.js](src/webview/memberPicker.js). Compilation copies
these assets to `dist/webview` for loading by the extension. `npm run watch`
also copies asset changes; reopen the dialog to see them. Packaging runs
compilation automatically. The extension substitutes escaped data into the
HTML template and embeds the styles and script with a fresh script nonce.

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
