# IbmMemberPicker

Open existing IBM i source members from Visual Studio Code with an RDi-style
guided workflow. This extension builds on
[Code for IBM i](https://github.com/codefori/vscode-ibmi) and does not create
its own IBM i connection.

## Features

- Press `Ctrl+Alt+Q` (`Cmd+Alt+Q` on macOS) while connected.
- Choose or type the library.
- Choose or type the source physical file.
- Choose the member without knowing or entering its source type extension.
- Open the member for edit or as a read-only browse document.
- Reuse the most recently selected library and source file.
- Use **IBM i: Open Source Member (RDi Dialog)** to choose the library, source
  file, and member from one popup. The dialog accepts manual IBM i names and
  keeps recent values as suggestions without scanning large libraries.

The original step-by-step command remains available as **IBM i: Open Source
Member** in the Command Palette.

## Requirements

1. Install [Code for IBM i](https://marketplace.visualstudio.com/items?itemName=HalcyonTechLtd.code-for-ibmi).
2. Connect to an IBM i through Code for IBM i.
3. Run **IBM i: Open Source Member** or press `Ctrl+Alt+Q`.

The edit option requires update authority to the selected source physical
file. Connections configured for read-only access automatically use browse
mode.

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
5. Commit the version bump and tag the release (e.g. `git tag v<version>`).

