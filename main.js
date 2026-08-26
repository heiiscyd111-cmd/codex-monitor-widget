const { app, BrowserWindow, ipcMain, Menu, Tray, nativeImage, Notification, screen, shell } = require("electron");
const { spawn, execFile } = require("child_process");
const fs = require("fs");
const path = require("path");
const os = require("os");
const { DatabaseSync } = require("node:sqlite");

const CODEX_HOME = path.join(os.homedir(), ".codex");
const STATE_DB = path.join(CODEX_HOME, "state_5.sqlite");
const LOG_DB = path.join(CODEX_HOME, "logs_2.sqlite");
let win;
let tray;
let appServer;
let rpcBuffer = "";
let nextRpcId = 10;
let lastRateLimits = null;
let lastSnapshot = null;
let codexWasOpen = false;
let rpcCallbacks = new Map();
let foregroundWatcher;
let tooltipWin;
let pendingTooltipText = "";

function findCodexBinary() {
  if (process.platform === "darwin") {
    const candidate = process.arch === "arm64" ? "/opt/homebrew/bin/codex" : "/usr/local/bin/codex";
    return fs.existsSync(candidate) ? candidate : null;
  }
  const root = path.join(process.env.LOCALAPPDATA || "", "OpenAI", "Codex", "bin");
  if (!fs.existsSync(root)) return null;
  return fs.readdirSync(root)
    .map(name => path.join(root, name, "codex.exe"))
    .filter(fs.existsSync)
    .sort((a, b) => fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs)[0] || null;
}

function startAppServer() {
  if (appServer && !appServer.killed) return;
  const exe = findCodexBinary();
  if (!exe) return;
  appServer = spawn(exe, ["app-server", "--listen", "stdio://"], {
    stdio: ["pipe", "pipe", "ignore"],
    windowsHide: true,
  });
  appServer.stdout.setEncoding("utf8");
  appServer.stdout.on("data", chunk => {
    rpcBuffer += chunk;
    const lines = rpcBuffer.split(/\r?\n/);
    rpcBuffer = lines.pop() || "";
    for (const line of lines) {
      if (!line.trim()) continue;
      try {
        const message = JSON.parse(line);
        if (message.id && rpcCallbacks.has(message.id)) {
          rpcCallbacks.get(message.id)(message);
          rpcCallbacks.delete(message.id);
        }
      } catch (_) {}
    }
  });
  appServer.on("exit", () => {
    appServer = null;
    for (const resolve of rpcCallbacks.values()) resolve({ error: { message: "Codex 状态服务已断开" } });
    rpcCallbacks.clear();
    setTimeout(startAppServer, 5000);
  });
  rpc("initialize", { clientInfo: { name: "codex-status-widget", version: "1.0.0" }, capabilities: {} })
    .then(refreshRateLimits)
    .catch(() => {});
}

function rpc(method, params = {}) {
  return new Promise((resolve, reject) => {
    if (!appServer || appServer.killed) return reject(new Error("Codex 状态服务未启动"));
    const id = nextRpcId++;
    rpcCallbacks.set(id, resolve);
    appServer.stdin.write(JSON.stringify({ id, method, params }) + "\n");
    setTimeout(() => {
      if (rpcCallbacks.delete(id)) reject(new Error("Codex 状态读取超时"));
    }, 5000);
  });
}

async function refreshRateLimits() {
  try {
    const reply = await rpc("account/rateLimits/read", {});
    if (reply.result) lastRateLimits = reply.result.rateLimits;
  } catch (_) {}
}

function queryActivity(weeklyStartSeconds = 0) {
  const now = Math.floor(Date.now() / 1000);
  let threads = [];
  try {
    const db = new DatabaseSync(STATE_DB, { readOnly: true });
    threads = db.prepare(`
      SELECT id, title, updated_at, updated_at_ms, created_at, created_at_ms, tokens_used, model
      FROM threads
      WHERE archived=0 AND title NOT LIKE '%approval request%' AND title NOT LIKE 'The following is the Codex agent history%'
      ORDER BY COALESCE(updated_at_ms, updated_at*1000) DESC
      LIMIT 12
    `).all();
    db.close();
  } catch (_) {}

  let activeTurn = null;
  let dailyTokens = 0;
  let weeklyTokens = 0;
  let weeklyModelUsage = [];
  try {
    const db = new DatabaseSync(LOG_DB, { readOnly: true });
    for (const thread of threads) {
      const latestEvent = db.prepare(`
        SELECT ts, feedback_log_body AS body FROM logs
        WHERE thread_id=? AND feedback_log_body LIKE '%turn.id=%'
        ORDER BY id DESC LIMIT 1
      `).get(thread.id);
      if (!latestEvent) continue;
      const latestBody = String(latestEvent.body || "");
      const turnMatch = latestBody.match(/turn\.id=([0-9a-f-]{20,})/i);
      if (!turnMatch || now - Number(latestEvent.ts) > 21600) continue;
      const turnId = turnMatch[1];
      const lifecycle = db.prepare(`
        SELECT feedback_log_body AS body FROM logs
        WHERE thread_id=? AND target='codex_core::session::turn' AND feedback_log_body LIKE ?
        ORDER BY id DESC LIMIT 1
      `).get(thread.id, `%${turnId}%`);
      const lifecycleBody = lifecycle ? String(lifecycle.body || "") : "";
      if (/model_needs_follow_up=false|needs_follow_up=false/.test(lifecycleBody)) continue;
      const start = db.prepare(`SELECT MIN(ts) AS ts FROM logs WHERE thread_id=? AND feedback_log_body LIKE ?`).get(thread.id, `%${turnId}%`);
      const candidate = { thread, lastTs: Number(latestEvent.ts), startedAt: start && start.ts ? Number(start.ts) * 1000 : Number(latestEvent.ts) * 1000 };
      if (!activeTurn || candidate.lastTs > activeTurn.lastTs) activeTurn = candidate;
    }
    const usageSince = since => {
      const rows = db.prepare(`
        SELECT feedback_log_body AS body FROM logs
        WHERE ts >= ? AND target='codex_core::session::turn'
          AND (feedback_log_body LIKE '%codex.turn.token_usage.total_tokens=%'
            OR feedback_log_body LIKE '%total_usage_tokens=%')
      `).all(since);
      const perTurn = new Map();
      for (const row of rows) {
        const body = String(row.body || "");
        const turn = body.match(/turn(?:\.id|_id)=([0-9a-f-]{20,})/i);
        const total = body.match(/(?:codex\.turn\.token_usage\.total_tokens|total_usage_tokens)=(\d+)/);
        const model = body.match(/\bmodel=\"?([^\"\s}:]+)\"?/i);
        if (!turn || !total) continue;
        const modelName = model ? model[1] : "未知模型";
        if (modelName === "codex-auto-review") continue;
        const previous = perTurn.get(turn[1]);
        if (!previous || Number(total[1]) > previous.tokens) {
          perTurn.set(turn[1], { tokens: Number(total[1]), model: modelName });
        }
      }
      const byModel = new Map();
      let total = 0;
      for (const item of perTurn.values()) {
        total += item.tokens;
        byModel.set(item.model, (byModel.get(item.model) || 0) + item.tokens);
      }
      return {
        total,
        byModel: Array.from(byModel, ([model, tokens]) => ({ model, tokens }))
          .sort((a, b) => b.tokens - a.tokens),
      };
    };
    const midnight = new Date();
    midnight.setHours(0, 0, 0, 0);
    const dailyUsage = usageSince(Math.floor(midnight.getTime() / 1000));
    const weeklyUsage = usageSince(weeklyStartSeconds || Math.floor(midnight.getTime() / 1000));
    dailyTokens = dailyUsage.total;
    weeklyTokens = weeklyUsage.total;
    weeklyModelUsage = weeklyUsage.byModel;
    db.close();
  } catch (_) {}

  const current = activeTurn ? activeTurn.thread : threads[0] || null;
  return {
    running: !!activeTurn,
    current: current && {
      id: current.id,
      title: current.title || "未命名任务",
      updatedAt: Number(current.updated_at_ms || current.updated_at * 1000),
      startedAt: activeTurn ? activeTurn.startedAt : Number(current.updated_at_ms || current.updated_at * 1000),
      tokensUsed: Number(current.tokens_used || 0),
      model: current.model || "",
    },
    dailyTokens,
    weeklyTokens,
    weeklyModelUsage,
    recent: threads.slice(0, 3).map(t => ({
      id: t.id,
      title: t.title || "未命名任务",
      updatedAt: Number(t.updated_at_ms || t.updated_at * 1000),
    })),
  };
}
function attachToCodexWindow() {
  if (!win || win.isDestroyed()) return;
  const handle = process.arch === "x64"
    ? Number(win.getNativeWindowHandle().readBigUInt64LE(0))
    : win.getNativeWindowHandle().readUInt32LE(0);
  execFile(
    "powershell.exe",
    ["-NoProfile", "-ExecutionPolicy", "Bypass", "-File", path.join(__dirname, "set-codex-owner.ps1"), "-WidgetHandle", String(handle)],
    { windowsHide: true },
    () => {},
  );
}

function isCodexOpen() {
  if (process.platform !== "win32") return Promise.resolve(false);
  return new Promise(resolve => {
    execFile("tasklist.exe", ["/FI", "IMAGENAME eq ChatGPT.exe", "/FO", "CSV", "/NH"], { windowsHide: true }, (err, stdout) => {
      resolve(!err && /ChatGPT\.exe/i.test(stdout || ""));
    });
  });
}

async function makeSnapshot() {
  const primaryRate = lastRateLimits && lastRateLimits.primary;
  const secondaryRate = lastRateLimits && lastRateLimits.secondary;
  const rates = [primaryRate, secondaryRate].filter(Boolean);
  const fiveHourRate = rates.find(rate => Number(rate.windowDurationMins) === 300) || null;
  const weeklyRate = rates.find(rate => Number(rate.windowDurationMins) === 10080) || null;
  const weeklyStartSeconds = weeklyRate && weeklyRate.resetsAt
    ? Number(weeklyRate.resetsAt) - Number(weeklyRate.windowDurationMins) * 60
    : 0;
  const activity = queryActivity(weeklyStartSeconds);
  const codexOpen = await isCodexOpen();
  const quota = rate => rate ? {
    usedPercent: Number(rate.usedPercent),
    remainingPercent: Math.max(0, 100 - Number(rate.usedPercent)),
    resetsAt: Number(rate.resetsAt) * 1000,
    windowMinutes: Number(rate.windowDurationMins),
  } : null;
  const snapshot = {
    codexOpen,
    running: activity.running,
    current: activity.current,
    recent: activity.recent,
    dailyTokens: activity.dailyTokens,
    weeklyTokens: activity.weeklyTokens,
    weeklyModelUsage: activity.weeklyModelUsage,
    planType: lastRateLimits && lastRateLimits.planType,
    fiveHour: quota(fiveHourRate),
    weekly: quota(weeklyRate),
    rateLimitReached: !!(lastRateLimits && lastRateLimits.rateLimitReachedType),
    checkedAt: Date.now(),
  };
  if (process.platform === "win32" && lastSnapshot && lastSnapshot.running && !snapshot.running && lastSnapshot.current) {
    new Notification({
      title: "Codex 任务已完成",
      body: lastSnapshot.current.title,
      silent: false,
    }).show();
  }
  if (codexOpen && !codexWasOpen && win) {
    win.showInactive();
  }
  codexWasOpen = codexOpen;
  lastSnapshot = snapshot;
  if (win && !win.isDestroyed()) win.webContents.send("codex-status", snapshot);
  return snapshot;
}

function startForegroundWatcher() {
  if (process.platform !== "win32") return;
  if (foregroundWatcher && !foregroundWatcher.killed) return;
  foregroundWatcher = spawn(
    "powershell.exe",
    ["-NoProfile", "-ExecutionPolicy", "Bypass", "-File", path.join(__dirname, "watch-foreground.ps1")],
    { stdio: ["ignore", "pipe", "ignore"], windowsHide: true },
  );
  foregroundWatcher.stdout.setEncoding("utf8");
  let buffer = "";
  foregroundWatcher.stdout.on("data", chunk => {
    buffer += chunk;
    const lines = buffer.split(/\r?\n/);
    buffer = lines.pop() || "";
    const processName = (lines.pop() || "").trim().toLowerCase();
    if (!win || win.isDestroyed()) return;
    const codexIsForeground = processName === "chatgpt";
    win.setAlwaysOnTop(codexIsForeground, codexIsForeground ? "floating" : "normal");
  });
  foregroundWatcher.on("exit", () => {
    foregroundWatcher = null;
    setTimeout(startForegroundWatcher, 3000);
  });
}

function createTooltipWindow() {
  tooltipWin = new BrowserWindow({
    width: 145,
    height: 84,
    frame: false,
    transparent: true,
    resizable: true,
    show: false,
    focusable: false,
    skipTaskbar: true,
    alwaysOnTop: true,
    parent: win,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  tooltipWin.loadFile("tooltip.html");
  tooltipWin.webContents.on("did-finish-load", () => {
    if (pendingTooltipText) tooltipWin.webContents.send("quota-tooltip", pendingTooltipText);
  });
}

function showQuotaTooltip(detail) {
  if (!tooltipWin || tooltipWin.isDestroyed() || !win || win.isDestroyed()) return;
  const payload = typeof detail === "string" ? { title: "后续预测窗口", text: detail } : detail || {};
  pendingTooltipText = payload;
  const lines = String(payload.text || "").split(/\r?\n/).filter(Boolean);
  const modelCount = Array.isArray(payload.models) ? payload.models.length : 0;
  const tooltipHeight = payload.kind === "weekly" ? 92 + Math.max(1, modelCount) * 18 : Math.max(52, 31 + lines.length * 17);
  const tooltipWidth = payload.kind === "weekly" ? 205 : 145;
  tooltipWin.setSize(tooltipWidth, tooltipHeight, false);
  const cursor = screen.getCursorScreenPoint();
  const display = screen.getDisplayNearestPoint(cursor).workArea;
  const size = tooltipWin.getBounds();
  const x = Math.max(display.x + 6, Math.min(cursor.x - Math.round(size.width / 2), display.x + display.width - size.width - 6));
  const y = Math.max(display.y + 6, Math.min(cursor.y + 16, display.y + display.height - size.height - 6));
  tooltipWin.setPosition(x, y, false);
  tooltipWin.webContents.send("quota-tooltip", payload);
  tooltipWin.showInactive();
}
function createWindow() {
  const area = screen.getPrimaryDisplay().workArea;
  const widgetWidth = Math.min(470, area.width - 24);
  win = new BrowserWindow({
    width: widgetWidth,
    height: 78,
    icon: path.join(__dirname, "icon.png"),
    x: area.x + Math.round((area.width - widgetWidth) / 2),
    y: area.y + 8,
    frame: false,
    transparent: true,
    resizable: false,
    show: false,
    skipTaskbar: true,
    alwaysOnTop: false,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  win.loadFile("index.html");
  win.on("closed", () => { win = null; });
  win.webContents.on("did-finish-load", () => makeSnapshot());
}

function createTray() {
  const isMac = process.platform === "darwin";
  const icon = nativeImage.createFromPath(path.join(__dirname, isMac ? "iconTemplate.png" : "icon.png"));
  if (isMac) icon.setTemplateImage(true);
  tray = new Tray(isMac ? icon : icon.resize({ width: 16, height: 16 }));
  tray.setToolTip("Codex 状态");
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: "显示 / 隐藏", click: () => win && (win.isVisible() ? win.hide() : win.show()) },
    { label: "立即刷新", click: async () => { await refreshRateLimits(); await makeSnapshot(); } },
    { type: "separator" },
    { label: "退出小组件", click: () => app.quit() },
  ]));
  if (!isMac) tray.on("click", () => win && (win.isVisible() ? win.hide() : win.show()));
}

app.whenReady().then(() => {
  if (process.platform === "win32") {
    app.setAppUserModelId("com.openai.codex.status-widget");
    app.setLoginItemSettings({ openAtLogin: true, path: process.execPath, args: process.defaultApp ? [__dirname] : [] });
  } else if (process.platform === "darwin") {
    app.dock.hide();
    app.setLoginItemSettings({ openAtLogin: true });
  }
  createWindow();
  createTray();
  createTooltipWindow();
  startForegroundWatcher();
  startAppServer();
  setInterval(refreshRateLimits, 30000);
  setInterval(makeSnapshot, 3000);
});

ipcMain.handle("get-status", makeSnapshot);
ipcMain.on("hide-widget", () => win && win.hide());
ipcMain.on("open-codex", () => shell.openExternal("codex://"));
ipcMain.on("open-task", (_event, threadId) => shell.openExternal(`codex://thread/${encodeURIComponent(threadId)}`));
ipcMain.on("refresh-status", async () => { await refreshRateLimits(); await makeSnapshot(); });
ipcMain.on("show-quota-tooltip", (_event, text) => showQuotaTooltip(text));
ipcMain.on("hide-quota-tooltip", () => { if (tooltipWin && !tooltipWin.isDestroyed()) tooltipWin.hide(); });

app.on("before-quit", () => {
  if (appServer && !appServer.killed) appServer.kill();
  if (foregroundWatcher && !foregroundWatcher.killed) foregroundWatcher.kill();
});
app.on("window-all-closed", event => event.preventDefault());
