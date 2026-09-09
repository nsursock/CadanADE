// Terminal manager: spawns pseudo-terminals via node-pty and bridges them
// to the renderer over Electron IPC. One manager per BrowserWindow.
import * as os from "node:os";
import * as fs from "node:fs";
import { ipcMain, type WebContents, type IpcMainInvokeEvent } from "electron";
import * as pty from "node-pty";

export interface SpawnOptions {
  cwd?: string;
  cols?: number;
  rows?: number;
}

interface Session {
  pty: pty.IPty;
  contents: WebContents;
}

const sessions = new Map<string, Session>();

function defaultShell(): { file: string; args: string[] } {
  if (process.platform === "win32") {
    return { file: process.env.COMSPEC ?? "cmd.exe", args: [] };
  }
  const file = process.env.SHELL ?? (os.platform() === "darwin" ? "/bin/zsh" : "/bin/bash");
  return { file, args: [] };
}

function resolveCwd(requested?: string): string {
  const home = os.homedir();
  if (!requested || requested.length === 0) return home;
  try {
    if (fs.statSync(requested).isDirectory()) return requested;
  } catch {
    /* not a directory or inaccessible */
  }
  return home;
}

function registerHandlers() {
  ipcMain.handle("terminal:spawn", (event: IpcMainInvokeEvent, opts: SpawnOptions = {}) => {
    const id = `term-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const { file, args } = defaultShell();
    const cwd = resolveCwd(opts.cwd);
    const env = { ...process.env, TERM: "xterm-256color" } as Record<string, string>;
    let term: pty.IPty;
    try {
      term = pty.spawn(file, args, {
        name: "xterm-color",
        cols: opts.cols && opts.cols > 0 ? opts.cols : 80,
        rows: opts.rows && opts.rows > 0 ? opts.rows : 24,
        cwd,
        env,
      });
    } catch (err) {
      console.error("[cadan/desktop] terminal spawn failed:", {
        file,
        args,
        cwd,
        error: err instanceof Error ? err.message : String(err),
      });
      throw err;
    }

    const win = event.sender;
    const session: Session = { pty: term, contents: win };

    term.onData((data) => {
      if (!win.isDestroyed()) win.send(`terminal:data:${id}`, data);
    });
    term.onExit(({ exitCode }) => {
      if (!win.isDestroyed()) win.send(`terminal:exit:${id}`, exitCode);
      sessions.delete(id);
    });

    sessions.set(id, session);

    win.once("destroyed", () => dispose(id));
    return id;
  });

  ipcMain.on("terminal:input", (_event, id: string, data: string) => {
    sessions.get(id)?.pty.write(data);
  });

  ipcMain.on("terminal:resize", (_event, id: string, cols: number, rows: number) => {
    const session = sessions.get(id);
    if (session && cols > 0 && rows > 0) {
      try {
        session.pty.resize(cols, rows);
      } catch {
        /* pty may have exited */
      }
    }
  });

  ipcMain.on("terminal:dispose", (_event, id: string) => {
    dispose(id);
  });
}

function dispose(id: string) {
  const session = sessions.get(id);
  if (!session) return;
  sessions.delete(id);
  try {
    session.pty.kill();
  } catch {
    /* already dead */
  }
}

function disposeAll() {
  for (const id of [...sessions.keys()]) dispose(id);
}

let registered = false;
export function initTerminalIpc() {
  if (registered) return;
  registered = true;
  registerHandlers();
}

export { disposeAll as disposeAllTerminals };
