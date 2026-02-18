import * as vscode from "vscode";
import { readFileSync } from "node:fs";

const STATE_RELATIVE_PATH = ".tracker/state.json";

type TaskLane = "todo" | "progress" | "done";
type TaskOwner = "human" | "ai";
type TaskStatus = "todo" | "progress" | "done" | "blocked";

interface TrackerTask {
  id: string;
  title: string;
  note?: string;
  owner: TaskOwner;
  lane: TaskLane;
  status: TaskStatus;
  effort?: string;
}

interface TrackerMessage {
  id: string;
  from: "human" | "ai";
  to: "human" | "ai";
  type: string;
  title: string;
  body: string;
  createdAt: string;
  resolved: boolean;
  inReplyTo?: string;
}

interface TrackerState {
  revision: number;
  updatedAt: string;
  tasks: TrackerTask[];
  messages: TrackerMessage[];
}

function defaultState(): TrackerState {
  return {
    revision: 1,
    updatedAt: new Date().toISOString(),
    tasks: [],
    messages: []
  };
}

class TrackerStateStore {
  private readonly encoder = new TextEncoder();
  private readonly decoder = new TextDecoder();

  public constructor(private readonly workspaceFolder: vscode.WorkspaceFolder) {}

  public getStateUri(): vscode.Uri {
    return vscode.Uri.joinPath(this.workspaceFolder.uri, STATE_RELATIVE_PATH);
  }

  public async read(): Promise<TrackerState> {
    const uri = this.getStateUri();

    try {
      const bytes = await vscode.workspace.fs.readFile(uri);
      const parsed = JSON.parse(this.decoder.decode(bytes));
      return this.normalize(parsed);
    } catch {
      const created = defaultState();
      await this.write(created);
      return created;
    }
  }

  public async write(state: TrackerState): Promise<TrackerState> {
    const normalized = this.normalize(state);
    normalized.updatedAt = new Date().toISOString();

    const stateUri = this.getStateUri();
    const dirUri = vscode.Uri.joinPath(this.workspaceFolder.uri, ".tracker");
    await vscode.workspace.fs.createDirectory(dirUri);

    const json = JSON.stringify(normalized, null, 2) + "\n";
    await vscode.workspace.fs.writeFile(stateUri, this.encoder.encode(json));
    return normalized;
  }

  private normalize(raw: unknown): TrackerState {
    const value = (raw ?? {}) as Partial<TrackerState>;
    return {
      revision: typeof value.revision === "number" && Number.isFinite(value.revision) ? value.revision : 1,
      updatedAt: typeof value.updatedAt === "string" ? value.updatedAt : new Date().toISOString(),
      tasks: Array.isArray(value.tasks) ? value.tasks : [],
      messages: Array.isArray(value.messages) ? value.messages : []
    };
  }
}

class TrackerDashboardProvider implements vscode.WebviewViewProvider, vscode.Disposable {
  public static readonly viewType = "trackerSync.dashboardView";

  private view?: vscode.WebviewView;
  private store?: TrackerStateStore;
  private watcher?: vscode.FileSystemWatcher;
  private readonly disposables: vscode.Disposable[] = [];

  public constructor(private readonly context: vscode.ExtensionContext) {}

  public resolveWebviewView(webviewView: vscode.WebviewView): void {
    this.view = webviewView;

    const webview = webviewView.webview;
    webview.options = {
      enableScripts: true,
      localResourceRoots: [vscode.Uri.joinPath(this.context.extensionUri, "media")]
    };

    webview.html = this.getHtml(webview);

    this.ensureWorkspaceBinding();

    this.disposables.push(webview.onDidReceiveMessage(async msg => {
      await this.handleMessage(msg);
    }));

    void this.pushState();
  }

  public async openStateFile(): Promise<void> {
    this.ensureWorkspaceBinding();
    if (!this.store) {
      void vscode.window.showWarningMessage("Open a workspace folder to use Tracker Sync Board.");
      return;
    }

    const state = await this.store.read();
    await this.store.write(state);
    const doc = await vscode.workspace.openTextDocument(this.store.getStateUri());
    await vscode.window.showTextDocument(doc, { preview: false });
  }

  public async processHumanMessages(): Promise<void> {
    this.ensureWorkspaceBinding();
    if (!this.store) {
      void vscode.window.showWarningMessage("Open a workspace folder to use Tracker Sync Board.");
      return;
    }

    const state = await this.store.read();
    const pending = state.messages.filter(m => m.from === "human" && m.to === "ai" && !m.resolved);

    if (pending.length === 0) {
      void vscode.window.showInformationMessage("No unresolved messages from human to AI.");
      return;
    }

    const pick = await vscode.window.showQuickPick(
      pending.map(m => ({
        label: m.title,
        description: m.type,
        detail: m.body,
        id: m.id
      })),
      { placeHolder: "Select a message to reply to" }
    );

    if (!pick) {
      return;
    }

    const source = pending.find(m => m.id === pick.id);
    if (!source) {
      return;
    }

    const response = await vscode.window.showInputBox({
      prompt: "AI response",
      placeHolder: "Write a response for the selected message"
    });

    if (!response) {
      return;
    }

    source.resolved = true;
    state.messages.push({
      id: `msg-${Date.now()}`,
      from: "ai",
      to: "human",
      type: "response",
      title: `Re: ${source.title}`,
      body: response,
      createdAt: new Date().toISOString(),
      resolved: false,
      inReplyTo: source.id
    });

    state.revision += 1;
    await this.store.write(state);
    await this.pushState();
  }

  public async refresh(): Promise<void> {
    await this.pushState();
  }

  public dispose(): void {
    this.watcher?.dispose();
    while (this.disposables.length > 0) {
      this.disposables.pop()?.dispose();
    }
  }

  private ensureWorkspaceBinding(): void {
    const folder = vscode.workspace.workspaceFolders?.[0];
    if (!folder) {
      this.store = undefined;
      this.watcher?.dispose();
      this.watcher = undefined;
      return;
    }

    if (!this.store || this.store.getStateUri().toString() !== vscode.Uri.joinPath(folder.uri, STATE_RELATIVE_PATH).toString()) {
      this.store = new TrackerStateStore(folder);
      this.watcher?.dispose();

      const pattern = new vscode.RelativePattern(folder, STATE_RELATIVE_PATH);
      this.watcher = vscode.workspace.createFileSystemWatcher(pattern);
      this.disposables.push(this.watcher);

      const onChange = async () => {
        await this.pushState();
      };

      this.disposables.push(this.watcher.onDidChange(onChange));
      this.disposables.push(this.watcher.onDidCreate(onChange));
      this.disposables.push(this.watcher.onDidDelete(onChange));
    }
  }

  private async handleMessage(msg: unknown): Promise<void> {
    const message = (msg ?? {}) as { type?: string; payload?: TrackerState };

    if (!message.type) {
      return;
    }

    switch (message.type) {
      case "requestState":
        await this.pushState();
        return;
      case "saveState":
        await this.saveFromWebview(message.payload);
        return;
      case "openStateFile":
        await this.openStateFile();
        return;
      case "processHumanMessages":
        await this.processHumanMessages();
        return;
      default:
        return;
    }
  }

  private async saveFromWebview(payload: TrackerState | undefined): Promise<void> {
    this.ensureWorkspaceBinding();
    if (!this.store) {
      void this.postInfo("Open a workspace folder to persist tracker state.");
      return;
    }

    if (!payload) {
      void this.postInfo("Invalid state payload from dashboard.");
      return;
    }

    const saved = await this.store.write(payload);
    await this.postState(saved);
  }

  private async pushState(): Promise<void> {
    this.ensureWorkspaceBinding();
    if (!this.store) {
      await this.postInfo("Open a workspace folder to use Tracker Sync Board.");
      return;
    }

    const state = await this.store.read();
    await this.postState(state);
  }

  private async postState(state: TrackerState): Promise<void> {
    await this.view?.webview.postMessage({ type: "state", payload: state });
  }

  private async postInfo(message: string): Promise<void> {
    await this.view?.webview.postMessage({ type: "info", message });
  }

  private getHtml(webview: vscode.Webview): string {
    const htmlUri = vscode.Uri.joinPath(this.context.extensionUri, "media", "dashboard.html");
    const cssUri = vscode.Uri.joinPath(this.context.extensionUri, "media", "dashboard.css");
    const jsUri = vscode.Uri.joinPath(this.context.extensionUri, "media", "dashboard.js");

    const template = readFileSync(htmlUri.fsPath, "utf8");

    return template
      .replace("{{styleUri}}", webview.asWebviewUri(cssUri).toString())
      .replace("{{scriptUri}}", webview.asWebviewUri(jsUri).toString())
      .replace("{{styleCsp}}", webview.cspSource)
      .replace("{{scriptCsp}}", webview.cspSource);
  }
}

export function activate(context: vscode.ExtensionContext): void {
  const provider = new TrackerDashboardProvider(context);

  context.subscriptions.push(
    provider,
    vscode.window.registerWebviewViewProvider(TrackerDashboardProvider.viewType, provider),
    vscode.commands.registerCommand("trackerSync.openStateFile", async () => provider.openStateFile()),
    vscode.commands.registerCommand("trackerSync.processHumanMessages", async () => provider.processHumanMessages()),
    vscode.commands.registerCommand("trackerSync.refreshDashboard", async () => provider.refresh())
  );
}

export function deactivate(): void {
  // Nothing to clean up; VS Code disposes subscriptions.
}
