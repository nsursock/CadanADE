// Electron main — CommonJS require for the Electron API (see Adaan desktop pattern).
const {
  app,
  BrowserWindow,
  Menu,
  dialog,
  ipcMain,
  shell,
} = require("electron") as typeof import("electron");
import { spawn, type ChildProcess } from "node:child_process";
import * as net from "node:net";
import * as path from "node:path";
import * as fs from "node:fs";

const isDev = !app.isPackaged;

if (isDev) {
  console.log("[cadan/desktop] runtime", {
    node: process.versions.node,
    electron: process.versions.electron,
    chrome: process.versions.chrome,
  });
}

let serverProcess: ChildProcess | null = null;
let serverPort = 0;
let mainWindow: Electron.BrowserWindow | null = null;

function findFreePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const srv = net.createServer();
    srv.unref();
    srv.on("error", reject);
    srv.listen(0, "127.0.0.1", () => {
      const addr = srv.address();
      if (addr && typeof addr === "object") {
        const port = addr.port;
        srv.close(() => resolve(port));
      } else {
        srv.close();
        reject(new Error("could not find free port"));
      }
    });
  });
}

function waitForPort(port: number, timeoutMs = 20000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  return new Promise((resolve, reject) => {
    function attempt() {
      if (Date.now() > deadline) {
        reject(new Error(`server did not start within ${timeoutMs}ms`));
        return;
      }
      const socket = net.connect(port, "127.0.0.1", () => {
        socket.destroy();
        resolve();
      });
      socket.on("error", () => setTimeout(attempt, 200));
    }
    attempt();
  });
}

function killServer() {
  if (!serverProcess) return;
  try {
    serverProcess.kill("SIGTERM");
    const proc = serverProcess;
    setTimeout(() => {
      try {
        if (proc.exitCode === null && proc.signalCode === null) proc.kill("SIGKILL");
      } catch {
        /* already dead */
      }
    }, 3000);
  } catch {
    /* already dead */
  }
  serverProcess = null;
}

async function startServer(): Promise<string> {
  if (isDev) return "http://localhost:5175";

  serverPort = await findFreePort();
  const serverDir = path.join(process.resourcesPath, "server");
  const entryFile = path.join(serverDir, "index.js");
  if (!fs.existsSync(entryFile)) {
    throw new Error(`Server entry not found: ${entryFile}`);
  }

  serverProcess = spawn(process.execPath, [entryFile], {
    env: {
      ...process.env,
      PORT: String(serverPort),
      HOST: "127.0.0.1",
      ORIGIN: `http://127.0.0.1:${serverPort}`,
      ELECTRON_RUN_AS_NODE: "1",
    },
    stdio: ["ignore", "pipe", "pipe"],
    cwd: serverDir,
  });

  serverProcess.stdout?.on("data", (chunk: Buffer) => {
    console.log(`[server] ${chunk.toString().trim()}`);
  });
  serverProcess.stderr?.on("data", (chunk: Buffer) => {
    console.error(`[server] ${chunk.toString().trim()}`);
  });
  serverProcess.on("exit", (code) => {
    console.log(`[server] exited with code ${code}`);
    serverProcess = null;
  });

  await waitForPort(serverPort);
  return `http://127.0.0.1:${serverPort}`;
}

function createWindow(url: string) {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 900,
    minHeight: 600,
    show: false,
    title: "CadanADE",
    titleBarStyle: process.platform === "darwin" ? "hiddenInset" : "default",
    backgroundColor: "#050010",
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });

  mainWindow.once("ready-to-show", () => mainWindow?.show());
  void mainWindow.loadURL(url);

  mainWindow.webContents.setWindowOpenHandler(({ url: targetUrl }) => {
    if (targetUrl.startsWith("http://") || targetUrl.startsWith("https://")) {
      if (!targetUrl.includes("localhost") && !targetUrl.includes("127.0.0.1")) {
        void shell.openExternal(targetUrl);
        return { action: "deny" };
      }
    }
    return { action: "allow" };
  });

  mainWindow.on("closed", () => {
    mainWindow = null;
  });
}

async function openWorkspaceDialog(): Promise<void> {
  if (!mainWindow) return;
  const result = await dialog.showOpenDialog(mainWindow, {
    title: "Open Workspace",
    properties: ["openDirectory"],
  });
  if (!result.canceled && result.filePaths[0]) {
    mainWindow.webContents.send("workspace:opened", result.filePaths[0]);
  }
}

function buildMenu(): Electron.Menu {
  const isMac = process.platform === "darwin";

  const fileSubmenu: Electron.MenuItemConstructorOptions[] = [
    {
      label: "Open Workspace…",
      accelerator: "CmdOrCtrl+O",
      click: () => void openWorkspaceDialog(),
    },
    {
      label: "Save",
      accelerator: "CmdOrCtrl+S",
      click: () => mainWindow?.webContents.send("menu:save"),
    },
    { type: "separator" },
  ];
  fileSubmenu.push(
    isMac
      ? ({ role: "close", label: "Close Window" } as Electron.MenuItemConstructorOptions)
      : ({ role: "quit", label: "Quit" } as Electron.MenuItemConstructorOptions),
  );

  const template: Electron.MenuItemConstructorOptions[] = [
    ...(isMac
      ? [
          {
            label: app.name,
            submenu: [
              { role: "about" },
              { type: "separator" },
              { role: "services" },
              { type: "separator" },
              { role: "hide" },
              { role: "hideOthers" },
              { role: "unhide" },
              { type: "separator" },
              { role: "quit" },
            ],
          } as Electron.MenuItemConstructorOptions,
        ]
      : []),
    { label: "File", submenu: fileSubmenu },
    {
      label: "Edit",
      submenu: [
        { role: "undo" },
        { role: "redo" },
        { type: "separator" },
        { role: "cut" },
        { role: "copy" },
        { role: "paste" },
        { role: "selectAll" },
      ],
    },
    {
      label: "View",
      submenu: [
        { role: "reload" },
        { role: "forceReload" },
        { role: "toggleDevTools" },
        { type: "separator" },
        { role: "resetZoom" },
        { role: "zoomIn" },
        { role: "zoomOut" },
        { type: "separator" },
        { role: "togglefullscreen" },
      ],
    },
    {
      label: "Window",
      submenu: [
        { role: "minimize" },
        { role: "zoom" },
        ...(isMac
          ? ([{ type: "separator" }, { role: "front" }] as Electron.MenuItemConstructorOptions[])
          : ([{ role: "close" }] as Electron.MenuItemConstructorOptions[])),
      ],
    },
  ];

  return Menu.buildFromTemplate(template);
}

ipcMain.handle("dialog:open-workspace", async () => {
  if (!mainWindow) return null;
  const result = await dialog.showOpenDialog(mainWindow, {
    title: "Open Workspace",
    properties: ["openDirectory"],
  });
  if (result.canceled || !result.filePaths[0]) return null;
  return result.filePaths[0];
});

ipcMain.handle("app:is-dev", () => isDev);

if (!app.requestSingleInstanceLock()) {
  app.quit();
}

app.on("second-instance", () => {
  if (mainWindow) {
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.focus();
  }
});

app.whenReady().then(async () => {
  Menu.setApplicationMenu(buildMenu());
  try {
    const url = await startServer();
    createWindow(url);
  } catch (err) {
    dialog.showErrorBox(
      "Failed to start CadanADE",
      `The backend server could not be started:\n\n${err instanceof Error ? err.message : String(err)}`,
    );
    app.quit();
  }
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    killServer();
    app.quit();
  }
});

app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0 && mainWindow === null) {
    if (serverPort || isDev) {
      const url = isDev ? "http://localhost:5175" : `http://127.0.0.1:${serverPort}`;
      createWindow(url);
    }
  }
});

app.on("before-quit", () => {
  killServer();
});
