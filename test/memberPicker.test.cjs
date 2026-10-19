const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const Module = require("node:module");
const { join } = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

const vscode = {
  ProgressLocation: { Window: "window" },
  Uri: {
    from: (components) => ({ ...components }),
  },
  window: {},
  workspace: {},
};

const originalLoad = Module._load;
Module._load = function (request, parent, isMain) {
  if (request === "vscode") {
    return vscode;
  }
  return originalLoad.call(this, request, parent, isMain);
};

const { MemberOpener } = require("../dist/memberPicker.js");
Module._load = originalLoad;

function createHarness({
  connection = true,
  canUpdate = true,
  readOnlyMode = false,
  pickerValues = ["mylib", "qsrc", "hello"],
  mode = { mode: "edit" },
  warningChoice = undefined,
} = {}) {
  const calls = {
    errors: [],
    warnings: [],
    objectList: [],
    memberList: [],
    checkObject: [],
    opened: [],
    shown: [],
    quickPickOptions: [],
    quickPickItems: [],
  };
  const stateValues = new Map();
  const state = {
    get: (key, fallback) => stateValues.get(key) ?? fallback,
    update: async (key, value) => stateValues.set(key, value),
  };

  const member = {
    library: "MYLIB",
    file: "QSRC",
    name: "HELLO",
    extension: "RPGLE",
  };
  const content = {
    getObjectList: async (query) => {
      calls.objectList.push(query);
      return [
        { name: "NON_SRC", sourceFile: false },
        { name: "QSRC", sourceFile: true },
      ];
    },
    getMemberList: async (query) => {
      calls.memberList.push(query);
      return [member];
    },
    checkObject: async (object, authorities) => {
      calls.checkObject.push({ object, authorities });
      return canUpdate;
    },
  };
  const ibmiConnection = {
    currentConnectionName: "TEST",
    getConfig: () => ({
      currentLibrary: "MYLIB",
      libraryList: ["QGPL"],
      readOnlyMode,
    }),
    getContent: () => content,
  };
  const api = {
    instance: {
      getConnection: () => (connection ? ibmiConnection : undefined),
    },
  };

  vscode.window.showErrorMessage = async (message) => {
    calls.errors.push(message);
  };
  vscode.window.showWarningMessage = async (...args) => {
    calls.warnings.push(args);
    return warningChoice;
  };
  vscode.window.withProgress = async (_options, task) => task();
  vscode.window.createQuickPick = () => {
    const handlers = { accept: [], hide: [] };
    const picker = {
      items: [],
      selectedItems: [],
      value: pickerValues.shift() ?? "",
      onDidAccept: (handler) => handlers.accept.push(handler),
      onDidHide: (handler) => handlers.hide.push(handler),
      show() {
        calls.quickPickItems.push(this.items.map((item) => item.label));
        queueMicrotask(() => handlers.accept.forEach((handler) => handler()));
      },
      dispose: () => {},
    };
    return picker;
  };
  vscode.window.showQuickPick = async (_items, options) => {
    calls.quickPickOptions.push(options);
    return mode;
  };
  vscode.workspace.openTextDocument = async (uri) => {
    calls.opened.push(uri);
    return { uri };
  };
  vscode.window.showTextDocument = async (document, options) => {
    calls.shown.push({ document, options });
  };

  return {
    calls,
    state,
    stateValues,
    opener: new MemberOpener(api, state),
  };
}

test("guided picker filters source files and opens the selected member for edit", async () => {
  const harness = createHarness();

  await harness.opener.open();

  assert.deepEqual(harness.calls.objectList, [
    { library: "MYLIB", object: "*", types: ["*FILE"] },
  ]);
  assert.deepEqual(harness.calls.quickPickItems, [
    ["MYLIB", "QGPL"],
    ["QSRC"],
    ["HELLO"],
  ]);
  assert.deepEqual(harness.calls.memberList, [
    {
      library: "MYLIB",
      sourceFile: "QSRC",
      members: "*",
      sort: { order: "name", ascending: true },
    },
  ]);
  assert.equal(harness.calls.checkObject.length, 1);
  assert.deepEqual(harness.calls.opened, [
    {
      scheme: "member",
      path: "/MYLIB/QSRC/HELLO.RPGLE",
      query: undefined,
    },
  ]);
  assert.equal(harness.stateValues.get("recentLibrary"), "MYLIB");
  assert.equal(harness.stateValues.get("recentSourceFile"), "QSRC");
  assert.deepEqual(harness.stateValues.get("recentMembers"), ["HELLO"]);
  assert.deepEqual(harness.stateValues.get("recentLibraries"), ["MYLIB"]);
  assert.deepEqual(harness.stateValues.get("recentSourceFiles"), ["QSRC"]);
  assert.equal(harness.calls.shown.length, 1);
  assert.deepEqual(harness.calls.shown[0].options, { preview: false });
});

test("denied update authority offers browse mode and opens a read-only member", async () => {
  const harness = createHarness({
    canUpdate: false,
    warningChoice: "Open for browse",
  });

  await harness.opener.open();

  assert.deepEqual(harness.calls.warnings, [
    ["You do not have update authority to MYLIB/QSRC.", "Open for browse"],
  ]);
  assert.equal(harness.calls.opened[0].query, "readonly=true");
  assert.equal(harness.calls.errors.length, 0);
});

test("read-only connections open in browse mode without prompting for edit", async () => {
  const harness = createHarness({ readOnlyMode: true });

  await harness.opener.open();

  assert.equal(harness.calls.quickPickOptions.length, 0);
  assert.equal(harness.calls.checkObject.length, 0);
  assert.equal(harness.calls.opened[0].query, "readonly=true");
});

test("missing IBM i connection reports an error without opening a picker", async () => {
  const harness = createHarness({ connection: false });

  await harness.opener.open();

  assert.deepEqual(harness.calls.errors, [
    "Connect to an IBM i with Code for IBM i before opening a source member.",
  ]);
  assert.equal(harness.calls.objectList.length, 0);
});

test("direct picker embeds the source assets with nonce protection", () => {
  const { opener } = createHarness();
  const html = opener.directPickerHtml("TEST", ["MYLIB"], ["QSRC"], ["HELLO"]);
  const script = readFileSync(join(__dirname, "../src/webview/memberPicker.js"), "utf8");
  const styles = readFileSync(join(__dirname, "../src/webview/memberPicker.css"), "utf8");
  assert.equal(html.match(/<script nonce="[^"]+">([\s\S]*?)<\/script>/)[1], script);
  assert.equal(html.match(/<style>([\s\S]*?)<\/style>/)[1], styles);
  const nonce = html.match(/<script nonce="([^"]+)">/)[1];
  assert.ok(html.includes(`script-src 'nonce-${nonce}'`));
  assert.notEqual(opener.directPickerHtml("TEST", [], [], []).match(/<script nonce="([^"]+)">/)[1], nonce);
  assert.doesNotMatch(html, /\{\{\w+\}\}/);
});

test("direct picker escapes values without expanding embedded placeholders", () => {
  const { opener } = createHarness();
  const value = `<script>"&'{{script}}</script>`;
  const escaped = "&lt;script&gt;&quot;&amp;&#39;{{script}}&lt;/script&gt;";
  const html = opener.directPickerHtml(value, [value], [value], [value]);
  assert.ok(html.includes(`Connection: ${escaped}</div>`));
  for (const id of ["library", "sourceFile", "member"]) {
    assert.ok(html.includes(`<div id="${id}-option-0" role="option" aria-selected="false">${escaped}</div>`));
  }
  assert.doesNotMatch(html, /<script>/);
});

function createDirectPickerHarness() {
  const { opener } = createHarness();
  const html = opener.directPickerHtml("TEST", ["MYLIB", "QGPL"], ["QSRC"], ["HELLO"]);
  assert.doesNotMatch(html, /<datalist/);
  const elements = new Map();
  const messages = [];
  function element(id, textContent = "") {
    const handlers = new Map();
    const attributes = new Map();
    const result = {
      id, textContent, value: "", hidden: false, children: [],
      setAttribute: (name, value) => attributes.set(name, value),
      getAttribute: (name) => attributes.get(name),
      removeAttribute: (name) => attributes.delete(name),
      addEventListener: (name, handler) => handlers.set(name, handler),
      scrollIntoView: () => {},
      dispatch(name, values = {}) {
        const event = {
          defaultPrevented: false,
          preventDefault() { this.defaultPrevented = true; },
          stopPropagation() {},
          ...values,
        };
        handlers.get(name)?.(event);
        return event;
      },
      focus() { this.dispatch("focus"); },
      click() { this.dispatch("click"); },
    };
    elements.set(id, result);
    return result;
  }
  for (const id of ["library", "sourceFile", "member"]) {
    const input = element(id);
    input.setAttribute("aria-controls", `${id}-options`);
    const list = element(`${id}-options`);
    list.hidden = true;
    const listMarkup = html.match(new RegExp(`<div id="${id}-options"[^>]*>(.*?)</div>\\s*</div></div>`, "s"))[1];
    list.children = Array.from(listMarkup.matchAll(/<div id="([^"]+)"[^>]*>([^<]*)/g),
      ([, optionId, text]) => element(optionId, text));
  }
  for (const id of ["error", "cancel", "ok"]) element(id);
  vm.runInNewContext(html.match(/<script nonce="[^"]+">([\s\S]*?)<\/script>/)[1], {
    acquireVsCodeApi: () => ({ postMessage: (message) => messages.push(message) }),
    document: {
      getElementById: (id) => elements.get(id),
      querySelector: () => ({ value: "browse" }),
    },
    window: { addEventListener: () => {} },
  });
  return { elements, messages };
}

test("direct picker arrows navigate suggestions and Enter selects without submitting", () => {
  const { elements, messages } = createDirectPickerHarness();
  const input = elements.get("library");
  const list = elements.get("library-options");
  assert.equal(input.getAttribute("aria-expanded"), "true");
  for (const [key, expected] of [["ArrowDown", 0], ["ArrowDown", 1], ["ArrowUp", 0], ["ArrowUp", 1]]) {
    assert.equal(input.dispatch("keydown", { key }).defaultPrevented, true);
    assert.equal(input.getAttribute("aria-activedescendant"), list.children[expected].id);
    assert.equal(list.children[expected].getAttribute("aria-selected"), "true");
  }
  input.dispatch("keydown", { key: "Enter" });
  assert.equal(input.value, "QGPL");
  assert.equal(list.hidden, true);
  assert.equal(input.getAttribute("aria-activedescendant"), undefined);
  assert.equal(messages.length, 0);
});

test("direct picker filters case-insensitively and Escape dismisses suggestions", () => {
  const { elements } = createDirectPickerHarness();
  const input = elements.get("library");
  const list = elements.get("library-options");
  input.value = "qg";
  input.dispatch("input");
  assert.equal(list.children[0].hidden, true);
  assert.equal(list.children[1].hidden, false);
  input.dispatch("keydown", { key: "ArrowDown" });
  input.dispatch("keydown", { key: "Escape" });
  assert.equal(input.value, "qg");
  assert.equal(list.hidden, true);
  assert.equal(input.getAttribute("aria-expanded"), "false");
  input.dispatch("keydown", { key: "ArrowUp" });
  input.dispatch("keydown", { key: "Enter" });
  assert.equal(input.value, "QGPL");
});

test("direct picker supports all fields, mouse selection, and blur dismissal", () => {
  const { elements } = createDirectPickerHarness();
  for (const [id, expected] of [["sourceFile", "QSRC"], ["member", "HELLO"]]) {
    const input = elements.get(id);
    input.focus();
    input.dispatch("keydown", { key: "ArrowDown" });
    input.dispatch("keydown", { key: "Enter" });
    assert.equal(input.value, expected);
    input.focus();
    input.dispatch("blur");
    assert.equal(elements.get(`${id}-options`).hidden, true);
  }
  const option = elements.get("library-options").children[0];
  assert.equal(option.dispatch("mousedown").defaultPrevented, true);
  assert.equal(elements.get("library").value, "MYLIB");
});

test("direct picker accepts typed names with no suggestions and submits on Enter", () => {
  const { elements, messages } = createDirectPickerHarness();
  const input = elements.get("library");
  input.value = "OTHERLIB";
  input.dispatch("input");
  input.dispatch("keydown", { key: "ArrowDown" });
  assert.equal(elements.get("library-options").hidden, true);
  elements.get("sourceFile").value = "QSRC";
  elements.get("member").value = "HELLO";
  input.dispatch("keydown", { key: "Enter" });
  assert.equal(messages.length, 1);
  assert.equal(messages[0].type, "submit");
  assert.equal(messages[0].library, "OTHERLIB");
});
