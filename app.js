import {
  loadModel, unloadModel, isModelReady, chat,
  wasModelLoadedBefore, isModelInstalled, getStoredBackend, getStorageLocation,
  preferredBackend, getBackendMode, getModelProfile
} from "./ai.js";
import {
  APP_VERSION, setupPWA, promptInstall, applyUpdate,
  isStandalone, getRemoteVersion, checkForUpdate
} from "./pwa.js";

const $ = (id) => document.getElementById(id);
const els = Object.fromEntries([
  "updateBtn","modeBadge","engineDescription","progressBar","progressText","progressPct",
  "loadModelBtn","unloadBtn","deviceStats","aiStats","messages","chatForm","chatInput",
  "sendBtn","clearChatBtn","perfText","installHint","updateStatus","installBtn","versionLabel"
].map(id => [id, $(id)]));

const history = [{
  role: "system",
  content: "你是手機內的本機 AI 助手。全程使用台灣繁體中文，回答精簡、直接。"
}];
let updateRegistration = null;
let reloadingForUpdate = false;

function setProgress(value, text) {
  const pct = Math.max(0, Math.min(100, Math.round((value ?? 0) * 100)));
  els.progressBar.style.width = `${pct}%`;
  els.progressPct.textContent = `${pct}%`;
  if (text) els.progressText.textContent = text;
}

function addMessage(role, text = "") {
  const node = document.createElement("div");
  node.className = `message ${role}`;
  node.textContent = text;
  els.messages.append(node);
  els.messages.scrollTop = els.messages.scrollHeight;
  return node;
}

function stat(label, value, cls = "") {
  return `<div class="stat"><dt>${label}</dt><dd class="${cls}">${value}</dd></div>`;
}

function configureEngineUI() {
  if (preferredBackend() === "webgpu") {
    els.modeBadge.textContent = "WebGPU 高速模式";
    els.engineDescription.textContent = "使用 WebGPU + WebLLM。模型約 290MB，下載後保存在這支裝置。";
    els.loadModelBtn.textContent = isModelInstalled() ? "從本機啟動 AI" : "下載／啟動 AI（約 290MB）";
    els.progressText.textContent = isModelInstalled()
      ? "模型已存在手機裡，目前尚未載入 RAM。"
      : "尚未下載 GPU 模型";
  } else {
    els.modeBadge.textContent = "CPU 相容模式";
    els.engineDescription.textContent = "這支手機沒有 WebGPU，已自動改用 CPU/WASM + Transformers.js。完全本機，但推論會比較慢。";
    els.loadModelBtn.textContent = isModelInstalled() ? "從本機啟動 AI" : "下載 CPU 版 AI（約 520MB）";
    els.progressText.textContent = isModelInstalled()
      ? "模型已存在手機裡，目前尚未載入 RAM；啟動時直接讀快取。"
      : "首次下載約 520MB，建議使用 Wi‑Fi";
  }
}

async function renderDeviceStats() {
  const estimate = navigator.storage?.estimate ? await navigator.storage.estimate() : null;
  const used = estimate?.usage ? `${(estimate.usage / 1024 / 1024).toFixed(0)} MB` : "未知";
  const quota = estimate?.quota ? `${(estimate.quota / 1024 / 1024 / 1024).toFixed(1)} GB` : "未知";
  const webgpu = Boolean(navigator.gpu);
  els.deviceStats.innerHTML = [
    stat("WebGPU", webgpu ? "支援" : "不支援", webgpu ? "ok" : "warn"),
    stat("CPU/WASM 備援", "支援", "ok"),
    stat("PWA 模式", isStandalone() ? "已安裝" : "瀏覽器", isStandalone() ? "ok" : "warn"),
    stat("CPU 執行緒", navigator.hardwareConcurrency ?? "未知"),
    stat("網站已用空間", used),
    stat("網站可用額度", quota),
  ].join("");
}

function renderAIStats() {
  const profile = getModelProfile();
  const installed = isModelInstalled();
  const ready = isModelReady();
  const storedBackend = getStoredBackend();
  els.aiStats.innerHTML = [
    stat("模型", "Qwen2.5 0.5B"),
    stat("本機安裝狀態", installed ? "已下載到手機" : "尚未下載", installed ? "ok" : "warn"),
    stat("儲存位置", installed ? getStorageLocation() : "—"),
    stat("模型容量", profile.download),
    stat("下載時使用引擎", storedBackend === "wasm" ? "CPU / WASM" : storedBackend === "webgpu" ? "WebGPU" : "尚未"),
    stat("目前運算引擎", profile.mode, ready ? "ok" : ""),
    stat("目前執行狀態", ready ? "已載入 RAM，可聊天" : installed ? "已下載，待啟動" : "未啟動", ready ? "ok" : "warn"),
    stat("量化", profile.quant),
  ].join("");
}

async function startModel() {
  els.loadModelBtn.disabled = true;
  els.modeBadge.textContent = preferredBackend() === "webgpu" ? "WebGPU 啟動中" : "CPU 模型啟動中";
  setProgress(0.01, preferredBackend() === "webgpu" ? "準備 WebLLM…" : "準備 Transformers.js / WASM…");
  try {
    await loadModel((report) => setProgress(report.progress ?? 0, report.text || "下載／載入模型…"));
    setProgress(1, "AI 已就緒｜模型已下載到手機並載入 RAM");
    els.modeBadge.textContent = getBackendMode() === "webgpu" ? "WebGPU AI 已啟動" : "CPU/WASM AI 已啟動";
    els.modeBadge.classList.add("ok");
    els.chatInput.disabled = false;
    els.sendBtn.disabled = false;
    els.unloadBtn.disabled = false;
    els.loadModelBtn.textContent = "AI 已啟動";
    renderAIStats();
    await renderDeviceStats();
  } catch (error) {
    console.error(error);
    els.loadModelBtn.disabled = false;
    els.modeBadge.textContent = "啟動失敗";
    setProgress(0, error?.message || String(error));
  }
}

async function sendChat(event) {
  event.preventDefault();
  const text = els.chatInput.value.trim();
  if (!text || !isModelReady()) return;
  els.chatInput.value = "";
  addMessage("user", text);
  history.push({ role: "user", content: text });
  const reply = addMessage("assistant", "思考中…");
  els.sendBtn.disabled = true;
  try {
    const result = await chat(history, (output) => { reply.textContent = output || "…"; });
    history.push({ role: "assistant", content: result.output });
    const first = result.firstTokenMs ? `首字 ${result.firstTokenMs}ms｜` : "";
    els.perfText.textContent = `${first}總耗時 ${result.totalMs}ms｜${result.runtime || getModelProfile().mode}`;
  } catch (error) {
    reply.textContent = `錯誤：${error?.message || error}`;
  } finally {
    els.sendBtn.disabled = false;
  }
}

function setupInstallUI() {
  if (isStandalone()) els.installHint.textContent = "已用 PWA 模式執行。模型與程式更新分開管理。";
  else if (/iphone|ipad|ipod/i.test(navigator.userAgent)) els.installHint.textContent = "iPhone：Safari 分享 → 加入主畫面。";
  else els.installHint.textContent = "可安裝成 PWA；若瀏覽器支援，會顯示安裝按鈕。";
}

async function init() {
  els.versionLabel.textContent = `v${APP_VERSION}`;
  setupInstallUI();
  configureEngineUI();
  await renderDeviceStats();
  renderAIStats();

  await setupPWA({
    onUpdate: (reg) => {
      updateRegistration = reg;
      els.updateBtn.textContent = "立即更新";
      els.updateStatus.textContent = `目前 v${APP_VERSION}｜新版已準備完成`;
    },
    onInstallReady: () => els.installBtn.classList.remove("hidden"),
    onControllerChange: () => {
      if (!reloadingForUpdate) { reloadingForUpdate = true; location.reload(); }
    },
  });

  const remoteVersion = await getRemoteVersion();
  els.updateStatus.textContent = remoteVersion && remoteVersion !== APP_VERSION
    ? `目前 v${APP_VERSION}｜最新 v${remoteVersion}`
    : `目前 v${APP_VERSION}｜已是最新版`;

  els.loadModelBtn.addEventListener("click", startModel);
  els.unloadBtn.addEventListener("click", async () => {
    await unloadModel();
    els.loadModelBtn.disabled = false;
    els.unloadBtn.disabled = true;
    els.chatInput.disabled = true;
    els.sendBtn.disabled = true;
    els.modeBadge.classList.remove("ok");
    configureEngineUI();
    els.progressText.textContent = "模型仍保存在手機，只卸載 RAM；下次不需重新下載。";
    renderAIStats();
  });

  els.chatForm.addEventListener("submit", sendChat);
  els.clearChatBtn.addEventListener("click", () => {
    history.splice(1);
    els.messages.innerHTML = '<div class="message assistant">對話已清除。模型仍在手機本機執行。</div>';
  });

  els.updateBtn.addEventListener("click", async () => {
    if (updateRegistration?.waiting) {
      applyUpdate(updateRegistration);
      return;
    }
    els.updateBtn.disabled = true;
    els.updateBtn.textContent = "檢查中…";
    const result = await checkForUpdate();
    if (result.waiting) {
      updateRegistration = result.registration;
      els.updateBtn.disabled = false;
      els.updateBtn.textContent = "立即更新";
      els.updateStatus.textContent = `目前 v${APP_VERSION}｜新版已準備完成`;
      return;
    }
    if (result.hasUpdate) {
      els.updateStatus.textContent = `目前 v${APP_VERSION}｜最新 v${result.remoteVersion}，重新整理即可套用`;
      els.updateBtn.textContent = "重新整理更新";
      els.updateBtn.disabled = false;
      updateRegistration = result.registration;
      return;
    }
    els.updateStatus.textContent = `目前 v${APP_VERSION}｜已是最新版`;
    els.updateBtn.textContent = "檢查更新";
    els.updateBtn.disabled = false;
  });

  els.installBtn.addEventListener("click", async () => {
    const ok = await promptInstall();
    if (ok) els.installBtn.classList.add("hidden");
  });
}

init();