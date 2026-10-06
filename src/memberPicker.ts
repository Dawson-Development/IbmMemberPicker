import type {
  CodeForIBMi,
  IBMiMember,
  IBMiObject,
} from "@halcyontech/vscode-ibmi-types";
import { randomUUID } from "node:crypto";
import * as vscode from "vscode";

type OpenMode = "browse" | "edit";

interface NamedQuickPickItem extends vscode.QuickPickItem {
  value: string;
}

interface DirectSelection {
  library: string;
  sourceFile: string;
  member: IBMiMember;
  mode: OpenMode;
}

const STATE_LIBRARY = "recentLibrary";
const STATE_FILE = "recentSourceFile";
const STATE_MEMBER = "recentMember";
const STATE_LIBRARIES = "recentLibraries";
const STATE_FILES = "recentSourceFiles";
const STATE_MEMBERS = "recentMembers";
const MAX_RECENT_NAMES = 20;
const SYSTEM_NAME = /^[A-Z0-9_$#@]{1,10}$/;

export class MemberOpener {
  constructor(
    private readonly codeForIBMi: CodeForIBMi,
    private readonly state: vscode.Memento,
  ) {}

  async open(): Promise<void> {
    const connection = this.codeForIBMi.instance.getConnection();
    if (!connection) {
      void vscode.window.showErrorMessage(
        "Connect to an IBM i with Code for IBM i before opening a source member.",
      );
      return;
    }

    try {
      const config = connection.getConfig();
      const library = await this.pickName(
        "Library",
        this.uniqueNames([
          this.state.get<string>(STATE_LIBRARY),
          config.currentLibrary,
          ...config.libraryList,
        ]),
        `Connection: ${connection.currentConnectionName}`,
      );
      if (!library) {
        return;
      }

      const sourceFiles = await vscode.window.withProgress(
        {
          location: vscode.ProgressLocation.Window,
          title: `Loading source files in ${library}`,
        },
        async () => {
          const objects = await connection
            .getContent()
            .getObjectList({
              library,
              object: "*",
              types: ["*FILE"],
            });
          return objects.filter((object: IBMiObject) => object.sourceFile);
        },
      );

      const sourceFile = await this.pickObject(
        "Source file",
        sourceFiles,
        this.state.get<string>(STATE_FILE),
      );
      if (!sourceFile) {
        return;
      }

      const members = await vscode.window.withProgress(
        {
          location: vscode.ProgressLocation.Window,
          title: `Loading members from ${library}/${sourceFile}`,
        },
        () =>
          connection.getContent().getMemberList({
            library,
            sourceFile,
            members: "*",
            sort: { order: "name", ascending: true },
          }),
      );

      const member = await this.pickMember(members);
      if (!member) {
        return;
      }

      let mode = await this.pickMode(config.readOnlyMode);
      if (!mode) {
        return;
      }

      await this.openSelection(connection, library, sourceFile, member, mode);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      void vscode.window.showErrorMessage(
        `Unable to open the source member: ${message}`,
      );
    }
  }

  async openDirect(): Promise<void> {
    const connection = this.codeForIBMi.instance.getConnection();
    if (!connection) {
      void vscode.window.showErrorMessage(
        "Connect to an IBM i with Code for IBM i before opening a source member.",
      );
      return;
    }

    try {
      const config = connection.getConfig();
      const selection = await this.showDirectPicker(
        connection.currentConnectionName,
        this.uniqueNames([
          ...this.state.get<string[]>(STATE_LIBRARIES, []),
          this.state.get<string>(STATE_LIBRARY),
          config.currentLibrary,
          ...config.libraryList,
        ]),
        this.uniqueNames([
          ...this.state.get<string[]>(STATE_FILES, []),
          this.state.get<string>(STATE_FILE),
        ]),
        this.uniqueNames([
          ...this.state.get<string[]>(STATE_MEMBERS, []),
          this.state.get<string>(STATE_MEMBER),
        ]),
        connection,
      );
      if (!selection) {
        return;
      }

      await this.openSelection(
        connection,
        selection.library,
        selection.sourceFile,
        selection.member,
        selection.mode,
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      void vscode.window.showErrorMessage(
        `Unable to open the source member: ${message}`,
      );
    }
  }

  private async openSelection(
    connection: ReturnType<CodeForIBMi["instance"]["getConnection"]>,
    library: string,
    sourceFile: string,
    member: IBMiMember,
    mode: OpenMode,
  ): Promise<void> {
    if (!connection) {
      return;
    }

    if (
      mode === "edit" &&
      !(await connection.getContent().checkObject(
        { library, name: sourceFile, type: "*FILE" },
        ["*UPD"],
      ))
    ) {
      const choice = await vscode.window.showWarningMessage(
        `You do not have update authority to ${library}/${sourceFile}.`,
        "Open for browse",
      );
      if (!choice) {
        return;
      }
      mode = "browse";
    }

    await Promise.all([
      this.state.update(STATE_LIBRARY, library),
      this.state.update(STATE_FILE, sourceFile),
      this.updateRecent(STATE_LIBRARIES, library),
      this.updateRecent(STATE_FILES, sourceFile),
      this.updateRecent(STATE_MEMBERS, member.name),
    ]);

    const uri = memberUri(member, mode === "browse");
    const document = await vscode.workspace.openTextDocument(uri);
    await vscode.window.showTextDocument(document, { preview: false });
  }

  private async pickName(
    title: string,
    suggestions: string[],
    placeholder: string,
  ): Promise<string | undefined> {
    const value = await showEditableQuickPick(
      title,
      suggestions.map((name) => ({ label: name, value: name })),
      placeholder,
    );
    if (!value) {
      return undefined;
    }

    const normalized = value.trim().toUpperCase();
    if (!SYSTEM_NAME.test(normalized)) {
      void vscode.window.showErrorMessage(
        `${title} must be a 1-10 character IBM i system name.`,
      );
      return this.pickName(title, suggestions, placeholder);
    }
    return normalized;
  }

  private async showDirectPicker(
    connectionName: string,
    libraries: string[],
    sourceFiles: string[],
    members: string[],
    connection: NonNullable<
      ReturnType<CodeForIBMi["instance"]["getConnection"]>
    >,
  ): Promise<DirectSelection | undefined> {
      const panel = vscode.window.createWebviewPanel(
        "ibmMemberPicker",
        "Open Member in Editor",
        vscode.ViewColumn.Active,
        { enableScripts: true },
      );
      panel.webview.html = this.directPickerHtml(
        connectionName,
        libraries,
        sourceFiles,
        members,
      );

      return new Promise((resolve) => {
        let resolved = false;
        const finish = (selection?: DirectSelection) => {
          if (!resolved) {
            resolved = true;
            resolve(selection);
            panel.dispose();
          }
        };

        panel.webview.onDidReceiveMessage(async (message) => {
          try {
            if (message.type === "submit") {
              const library = this.normalizeSystemName(message.library);
              const sourceFile = this.normalizeSystemName(message.sourceFile);
              const members = await connection.getContent().getMemberList({
                library,
                sourceFile,
                members: message.member,
              });
              const member = members.find(
                (candidate) =>
                  candidate.name === this.normalizeSystemName(message.member),
              );
              if (!member) {
                throw new Error("The selected member no longer exists.");
              }
              finish({
                library,
                sourceFile,
                member,
                mode: message.mode === "edit" ? "edit" : "browse",
              });
            } else if (message.type === "cancel") {
              finish();
            }
          } catch (error) {
            const messageText =
              error instanceof Error ? error.message : String(error);
            panel.webview.postMessage({ type: "error", message: messageText });
          }
        });
        panel.onDidDispose(() => finish());
      });
    }

  private normalizeSystemName(value: unknown): string {
      const normalized = String(value ?? "").trim().toUpperCase();
      if (!SYSTEM_NAME.test(normalized)) {
        throw new Error("IBM i names must be 1-10 characters.");
      }
      return normalized;
    }

  private async updateRecent(key: string, value: string): Promise<void> {
    const recent = this.state.get<string[]>(key, []);
    await this.state.update(
      key,
      [value, ...recent.filter((item) => item !== value)].slice(
        0,
        MAX_RECENT_NAMES,
      ),
    );
  }

  private directPickerHtml(
    connectionName: string,
    libraries: string[],
    sourceFiles: string[],
    members: string[],
  ): string {
      const nonce = randomUUID().replaceAll("-", "");
      const options = (values: string[]) => values
        .map((value) => `<option value="${this.escapeHtml(value)}"></option>`)
        .join("");
      return `<!doctype html>
    <html>
    <head>
    <meta charset="UTF-8">
    <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'nonce-${nonce}';">
    <style>
    body { font-family: var(--vscode-font-family); color: var(--vscode-foreground); padding: 12px; }
    h2 { margin: 0 0 14px; font-size: 16px; font-weight: 500; }
    .connection { margin-bottom: 12px; color: var(--vscode-descriptionForeground); }
    label { display: grid; grid-template-columns: 90px 1fr; align-items: center; gap: 8px; margin: 9px 0; }
    input { color: var(--vscode-input-foreground); background: var(--vscode-input-background); border: 1px solid var(--vscode-input-border); padding: 4px; min-width: 220px; }
    .mode { display: flex; gap: 18px; margin: 16px 0; }
    .mode label { display: flex; gap: 5px; margin: 0; }
    .buttons { display: flex; justify-content: flex-end; gap: 8px; }
    button { padding: 5px 14px; color: var(--vscode-button-foreground); background: var(--vscode-button-background); border: 0; }
    button:hover { background: var(--vscode-button-hoverBackground); }
    #error { color: var(--vscode-errorForeground); min-height: 18px; }
    </style>
    </head>
    <body>
    <h2>Open Member in Editor</h2>
    <div class="connection">Connection: ${this.escapeHtml(connectionName)}</div>
    <label>Library<input id="library" list="libraries" autocomplete="off"><datalist id="libraries">${options(libraries)}</datalist></label>
    <label>File<input id="sourceFile" list="sourceFiles" autocomplete="off"><datalist id="sourceFiles">${options(sourceFiles)}</datalist></label>
    <label>Member<input id="member" list="members" autocomplete="off"><datalist id="members">${options(members)}</datalist></label>
    <div class="mode">
      <label><input type="radio" name="mode" value="edit"> Open for edit</label>
      <label><input type="radio" name="mode" value="browse" checked> Open for browse</label>
    </div>
    <div id="error"></div>
    <div class="buttons"><button id="cancel">Cancel</button><button id="ok">OK</button></div>
    <script nonce="${nonce}">
    const vscode = acquireVsCodeApi();
    const library = document.getElementById('library');
    const sourceFile = document.getElementById('sourceFile');
    const member = document.getElementById('member');
    const error = document.getElementById('error');
    document.getElementById('cancel').addEventListener('click', () => vscode.postMessage({ type: 'cancel' }));
    document.getElementById('ok').addEventListener('click', () => {
      error.textContent = '';
      vscode.postMessage({
        type: 'submit', library: library.value, sourceFile: sourceFile.value,
        member: member.value, mode: document.querySelector('input[name="mode"]:checked').value
      });
    });
    window.addEventListener('message', event => {
      if (event.data.type === 'error') error.textContent = event.data.message;
    });
    library.focus();
    </script>
    </body>
    </html>`;
    }

  private escapeHtml(value: string): string {
      return value.replace(
        /[&<>"']/g,
        (character) =>
          ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
            character
          ] ?? character,
      );
    }

  private async pickObject(
    title: string,
    objects: IBMiObject[],
    recentName?: string,
  ): Promise<string | undefined> {
    const sorted = [...objects].sort((left, right) => {
      if (left.name === recentName) {
        return -1;
      }
      if (right.name === recentName) {
        return 1;
      }
      return left.name.localeCompare(right.name);
    });

    return this.pickName(
      title,
      sorted.map((object) => object.name),
      objects.length
        ? "Select a source physical file or type its name"
        : "No source files found; type a source physical file name",
    );
  }

  private async pickMember(
    members: IBMiMember[],
  ): Promise<IBMiMember | undefined> {
    const selectedName = await showEditableQuickPick(
      "Member",
      members.map((member) => ({
        label: member.name,
        description: member.extension,
        detail: member.text,
        value: member.name,
      })),
      members.length
        ? "Select a member or type its name"
        : "No members found",
    );
    if (!selectedName) {
      return undefined;
    }

    const normalized = selectedName.trim().toUpperCase();
    if (!SYSTEM_NAME.test(normalized)) {
      void vscode.window.showErrorMessage(
        "Member must be a 1-10 character IBM i system name.",
      );
      return this.pickMember(members);
    }

    const member = members.find((candidate) => candidate.name === normalized);
    if (!member) {
      void vscode.window.showErrorMessage(
        `Member ${normalized} does not exist in this source file.`,
      );
      return this.pickMember(members);
    }
    return member;
  }

  private async pickMode(
    connectionIsReadOnly: boolean,
  ): Promise<OpenMode | undefined> {
    if (connectionIsReadOnly) {
      return "browse";
    }

    const selection = await vscode.window.showQuickPick<
      vscode.QuickPickItem & { mode: OpenMode }
    >(
      [
        {
          label: "$(edit) Open for edit",
          description: "Changes can be saved to the IBM i",
          mode: "edit",
        },
        {
          label: "$(lock) Open for browse",
          description: "Read-only",
          mode: "browse",
        },
      ],
      {
        title: "Open mode",
        placeHolder: "Choose whether the member can be changed",
      },
    );
    return selection?.mode;
  }

  private uniqueNames(names: Array<string | undefined>): string[] {
    return [
      ...new Set(
        names
          .filter((name): name is string => Boolean(name))
          .map((name) => name.toUpperCase()),
      ),
    ];
  }
}

export function memberUri(
  member: IBMiMember,
  readonly: boolean,
): vscode.Uri {
  const path = `/${member.library}/${member.file}/${member.name}.${member.extension}`;
  return vscode.Uri.from({
    scheme: "member",
    path,
    query: readonly ? "readonly=true" : undefined,
  });
}

async function showEditableQuickPick(
  title: string,
  items: NamedQuickPickItem[],
  placeholder: string,
): Promise<string | undefined> {
  const picker = vscode.window.createQuickPick<NamedQuickPickItem>();
  picker.title = title;
  picker.placeholder = placeholder;
  picker.items = items;
  picker.matchOnDescription = true;
  picker.matchOnDetail = true;

  return new Promise((resolve) => {
    let resolved = false;
    const finish = (value?: string) => {
      if (!resolved) {
        resolved = true;
        resolve(value);
        picker.dispose();
      }
    };

    picker.onDidAccept(() => {
      const selected = picker.selectedItems[0];
      finish(selected?.value ?? picker.value);
    });
    picker.onDidHide(() => finish());
    picker.show();
  });
}
