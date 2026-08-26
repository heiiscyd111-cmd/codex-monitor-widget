const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("codexWidget", {
  getStatus: () => ipcRenderer.invoke("get-status"),
  onStatus: callback => ipcRenderer.on("codex-status", (_event, data) => callback(data)),
  hide: () => ipcRenderer.send("hide-widget"),
  refresh: () => ipcRenderer.send("refresh-status"),
  setSubscriptionExpiry: date => ipcRenderer.invoke("set-subscription-expiry", date),
  setCompact: compact => ipcRenderer.send("set-widget-compact", compact),
  openCodex: () => ipcRenderer.send("open-codex"),
  openTask: id => ipcRenderer.send("open-task", id),
  showTooltip: text => ipcRenderer.send("show-quota-tooltip", text),
  hideTooltip: () => ipcRenderer.send("hide-quota-tooltip"),
  onTooltip: callback => ipcRenderer.on("quota-tooltip", (_event, text) => callback(text)),
});
