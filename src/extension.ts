import type { CodeForIBMi } from "@halcyontech/vscode-ibmi-types";
import * as vscode from "vscode";
import { MemberOpener } from "./memberPicker";

const CODE_FOR_IBMI_EXTENSION_ID = "halcyontechltd.code-for-ibmi";

export async function activate(context: vscode.ExtensionContext): Promise<void> {
  context.subscriptions.push(
    vscode.commands.registerCommand(
      "ibm-member-picker.openMember",
      async () => {
        const extension =
          vscode.extensions.getExtension<CodeForIBMi>(
            CODE_FOR_IBMI_EXTENSION_ID,
          );

        if (!extension) {
          void vscode.window.showErrorMessage(
            "Code for IBM i must be installed before a source member can be opened.",
          );
          return;
        }

        const codeForIBMi = extension.isActive
          ? extension.exports
          : await extension.activate();

        await new MemberOpener(codeForIBMi, context.globalState).open();
      },
    ),
    vscode.commands.registerCommand(
      "ibm-member-picker.openMemberDialog",
      async () => {
        const extension =
          vscode.extensions.getExtension<CodeForIBMi>(
            CODE_FOR_IBMI_EXTENSION_ID,
          );

        if (!extension) {
          void vscode.window.showErrorMessage(
            "Code for IBM i must be installed before a source member can be opened.",
          );
          return;
        }

        const codeForIBMi = extension.isActive
          ? extension.exports
          : await extension.activate();

        await new MemberOpener(codeForIBMi, context.globalState).openDirect();
      },
    ),
  );
}

export function deactivate(): void {}
