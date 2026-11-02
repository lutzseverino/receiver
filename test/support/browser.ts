// A headless Chromium-family browser driven through the Chrome DevTools
// Protocol over Node's own WebSocket, so the browser tests need no browser
// package, as repo-standards.com's site tests do. `SITE_BROWSER` names the
// executable; otherwise the first Chrome or Chromium found on `PATH` or in
// the usual install places is used.
import { spawn, type ChildProcess } from "node:child_process";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

const COMMANDS = [
  "google-chrome-stable",
  "google-chrome",
  "chromium",
  "chromium-browser",
];
const INSTALLED = [
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  "/Applications/Chromium.app/Contents/MacOS/Chromium",
];

/** The browser executable to drive. Without one the browser tests fail,
 * naming how to provide it. */
export function findBrowser(): string {
  if (process.env.SITE_BROWSER) return process.env.SITE_BROWSER;
  const dirs = (process.env.PATH ?? "").split(path.delimiter).filter(Boolean);
  for (const command of COMMANDS)
    for (const dir of dirs)
      if (existsSync(path.join(dir, command))) return path.join(dir, command);
  const installed = INSTALLED.find((file) => existsSync(file));
  if (installed) return installed;
  throw new Error(
    "The browser tests need Chrome or Chromium: install one, or set SITE_BROWSER to its executable.",
  );
}

type Message = {
  id?: number;
  sessionId?: string;
  method?: string;
  params?: Record<string, unknown>;
  result?: Record<string, unknown>;
  error?: { message: string };
};

/** How a tab shows its page: its width in CSS pixels, whether it runs the
 * page's scripts, the browser's languages, and what local storage holds
 * before the page loads. */
export type View = {
  width: number;
  javascript?: boolean;
  languages?: readonly string[];
  storage?: Record<string, string>;
};

export class Browser {
  #process: ChildProcess;
  #profile: string;
  #socket: WebSocket;
  #next = 0;
  #pending = new Map<
    number,
    {
      resolve: (result: Record<string, unknown>) => void;
      reject: (error: Error) => void;
    }
  >();
  #listeners = new Set<(message: Message) => void>();

  private constructor(
    process: ChildProcess,
    profile: string,
    socket: WebSocket,
  ) {
    this.#process = process;
    this.#profile = profile;
    this.#socket = socket;
    socket.addEventListener("message", (event) => {
      const message = JSON.parse(String(event.data)) as Message;
      const pending =
        message.id === undefined ? undefined : this.#pending.get(message.id);
      if (pending) {
        this.#pending.delete(message.id!);
        if (message.error) pending.reject(new Error(message.error.message));
        else pending.resolve(message.result ?? {});
      }
      for (const listener of this.#listeners) listener(message);
    });
  }

  /** Starts the browser headless, reaching only this machine's own servers,
   * so pages load no third-party script. */
  static async launch(executable = findBrowser()): Promise<Browser> {
    const profile = mkdtempSync(path.join(tmpdir(), "site-browser-"));
    const child = spawn(
      executable,
      [
        "--headless",
        "--remote-debugging-port=0",
        `--user-data-dir=${profile}`,
        "--no-first-run",
        "--no-default-browser-check",
        "--hide-scrollbars",
        "--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE 127.0.0.1",
        // CI runners' kernels refuse the sandbox's user namespaces; the
        // browser only loads the site built from this checkout
        ...(process.platform === "linux" ? ["--no-sandbox"] : []),
        "about:blank",
      ],
      { stdio: ["ignore", "ignore", "pipe"] },
    );
    const endpoint = await new Promise<string>((resolve, reject) => {
      let output = "";
      const timer = setTimeout(
        () => reject(new Error(`${executable} did not start:\n${output}`)),
        30_000,
      );
      child.once("exit", (code) =>
        reject(new Error(`${executable} exited with ${code}:\n${output}`)),
      );
      child.once("error", reject);
      child.stderr!.on("data", (chunk: Buffer) => {
        output += chunk.toString();
        const match = /DevTools listening on (ws:\/\/\S+)/.exec(output);
        if (match) {
          clearTimeout(timer);
          resolve(match[1]);
        }
      });
    });
    child.stderr!.resume();
    const socket = new WebSocket(endpoint);
    await new Promise((resolve, reject) => {
      socket.addEventListener("open", resolve, { once: true });
      socket.addEventListener("error", reject, { once: true });
    });
    return new Browser(child, profile, socket);
  }

  send(
    method: string,
    params: Record<string, unknown> = {},
    sessionId?: string,
  ): Promise<Record<string, unknown>> {
    const id = ++this.#next;
    this.#socket.send(JSON.stringify({ id, method, params, sessionId }));
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.#pending.delete(id);
        reject(new Error(`${method} had no answer within 60 seconds`));
      }, 60_000);
      this.#pending.set(id, {
        resolve: (result) => {
          clearTimeout(timer);
          resolve(result);
        },
        reject: (error) => {
          clearTimeout(timer);
          reject(error);
        },
      });
    });
  }

  /** The next event `method` in `sessionId`; `stop` stops waiting. */
  event(method: string, sessionId: string) {
    let stop = () => {};
    const next = new Promise<Record<string, unknown>>((resolve, reject) => {
      const listener = (message: Message) => {
        if (message.method === method && message.sessionId === sessionId) {
          stop();
          resolve(message.params ?? {});
        }
      };
      const timer = setTimeout(() => {
        stop();
        reject(new Error(`no ${method} within 60 seconds`));
      }, 60_000);
      stop = () => {
        clearTimeout(timer);
        this.#listeners.delete(listener);
      };
      this.#listeners.add(listener);
    });
    return { next, stop };
  }

  /** A new tab showing `url` in `view`, once it has loaded. */
  async open(url: string, view: View): Promise<Tab> {
    const { targetId } = await this.send("Target.createTarget", {
      url: "about:blank",
    });
    const { sessionId } = (await this.send("Target.attachToTarget", {
      targetId,
      flatten: true,
    })) as { sessionId: string };
    const tab = new Tab(this, targetId as string, sessionId);
    await tab.send("Page.enable");
    await tab.send("Runtime.enable");
    await tab.resize(view.width);
    if (view.javascript === false)
      await tab.send("Emulation.setScriptExecutionDisabled", { value: true });
    if (view.languages) {
      const { userAgent } = (await this.send("Browser.getVersion")) as {
        userAgent: string;
      };
      await tab.send("Emulation.setUserAgentOverride", {
        userAgent,
        acceptLanguage: view.languages.join(","),
      });
    }
    if (view.storage)
      await tab.send("Page.addScriptToEvaluateOnNewDocument", {
        source: `if (location.origin !== "null") for (const [key, value] of Object.entries(${JSON.stringify(view.storage)})) localStorage.setItem(key, value);`,
      });
    await tab.goto(url);
    return tab;
  }

  async close() {
    this.#socket.close();
    if (this.#process.exitCode === null && this.#process.signalCode === null) {
      const exited = new Promise((resolve) =>
        this.#process.once("exit", resolve),
      );
      this.#process.kill();
      await exited;
    }
    rmSync(this.#profile, { recursive: true, force: true });
  }
}

export class Tab {
  #browser: Browser;
  #sessionId: string;
  readonly targetId: string;

  constructor(browser: Browser, targetId: string, sessionId: string) {
    this.#browser = browser;
    this.targetId = targetId;
    this.#sessionId = sessionId;
  }

  send(method: string, params: Record<string, unknown> = {}) {
    return this.#browser.send(method, params, this.#sessionId);
  }

  event(method: string) {
    return this.#browser.event(method, this.#sessionId);
  }

  /** Opens `url` and waits for its load event. */
  async goto(url: string) {
    const loaded = this.event("Page.loadEventFired");
    const { errorText } = (await this.send("Page.navigate", { url })) as {
      errorText?: string;
    };
    if (errorText) {
      loaded.stop();
      throw new Error(`${url}: ${errorText}`);
    }
    await loaded.next;
  }

  /** Lays the page out `width` CSS pixels wide: a phone's screen up to
   * 600 px, else a desktop's. */
  async resize(width: number) {
    const mobile = width <= 600;
    await this.send("Emulation.setDeviceMetricsOverride", {
      width,
      height: mobile ? 800 : 900,
      deviceScaleFactor: mobile ? 2 : 1,
      mobile,
    });
  }

  /** Runs `fn(arg)` in the page and returns its result, which must survive
   * JSON. `fn` must reference nothing outside its own body. It runs even
   * where the page's own scripts are disabled. */
  async evaluate<A, R>(fn: (arg: A) => R | Promise<R>, arg?: A): Promise<R> {
    const { result, exceptionDetails } = (await this.send("Runtime.evaluate", {
      expression: `(${fn.toString()})(${JSON.stringify(arg ?? null)})`,
      awaitPromise: true,
      returnByValue: true,
    })) as {
      result: { value: R };
      exceptionDetails?: { exception?: { description?: string }; text: string };
    };
    if (exceptionDetails)
      throw new Error(
        exceptionDetails.exception?.description ?? exceptionDetails.text,
      );
    return result.value;
  }

  /** Runs `source`, a script, in the page. */
  async run(source: string) {
    const { exceptionDetails } = (await this.send("Runtime.evaluate", {
      expression: source,
    })) as { exceptionDetails?: { text: string } };
    if (exceptionDetails) throw new Error(exceptionDetails.text);
  }

  /** Presses Enter with Ctrl or Cmd held, as a keyboard does. */
  async pressEnterWith(modifier: "Control" | "Meta") {
    for (const type of ["keyDown", "keyUp"])
      await this.send("Input.dispatchKeyEvent", {
        type,
        key: "Enter",
        code: "Enter",
        windowsVirtualKeyCode: 13,
        modifiers: modifier === "Control" ? 2 : 4,
        ...(type === "keyDown" ? { text: "\r" } : {}),
      });
  }

  async close() {
    await this.#browser.send("Target.closeTarget", { targetId: this.targetId });
  }
}
