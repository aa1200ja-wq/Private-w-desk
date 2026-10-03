import { MODEL_ID, loadModel, unloadModel, isModelReady, chat, wasModelLoadedBefore } from "./ai.js";
import { APP_VERSION, setupPWA, promptInstall, applyUpdate, isStandalone, getRemoteVersion } from "./pwa.js";

const $ = (id) => document.getElementById(id);
const els = Object.fromEntries([
  "updateBtn","modeBadge","progressBar","progressText","progressPct","loadModelBtn","unloadBtn",
  "deviceStats","aiStats","messages","chatForm","chatInput","sendBtn","clearChatBtn","perfText",
  "installHint","installBtn","versionLabel"
].map(id => [id, $(id)]));

const history = [{ role: "system", content: "你是手機內的本機 AI 助手。全程使用台灣繁體中文，回答精簡、直接。" }];
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

async function renderDeviceStats() {
  const estimate = navigator.storage?.estimate ? await navigator.storage.estimate() : null;
  const used = estimate?.usage ? `${(estimate.usage / 1024 / 1024).toFixed(0)} MB` : "未知";
  const quota = estimate?.quota ? `${(estimate.quota / 1024 / 1024 / 1024).toFixed(1)} GB` : "未知";
  const webgpu = Boolean(navigator.gpu);
  els.deviceStats.innerHTML = [
    stat("WebGPU", webgpu ? "支援" : "不支援", webgpu ? "ok" : "danger"),
    stat("PWA 模式", isStandalone() ? "已安裝" : "瀏覽器", isStandalone() ? "ok" : "warn"),
    stat("CPU 執行緒", navigator.hardwareConcurrency ?? "未知"),
    stat("網站已用空間", used),
    stat("網站可用額度", quota),
  ].join("");
}

function renderAIStats() {
  els.aiStats.innerHTML = [
    stat("模型", "Qwen2.5 0.5B"),
    stat("量化", "Q4F16"),
    stat("模型紀錄", wasModelLoadedBefore() ? "曾下載／載入" : "尚未", wasModelLoadedBefore() ? "ok" : "warn"),
    stat("目前 RAM 狀態", isModelReady() ? "已載入" : "未載入", isModelReady() ? "ok" : "warn"),
    stat("Model ID", MODEL_ID.replace("-Instruct-q4f16_1-MLC", "")),
  ].join("");
}

async function startModel() {
  els.loadModelBtn.disabled = true;
  els.modeBadge.textContent = "AI 啟動中";
  setProgress(0.01, "準備 WebLLM…");
  try {
    await loadModel((report) => {
      setProgress(report.progress ?? 0, report.text || "下載／編譯模型…");
    });
    setProgress(1, "AI 已就緒");
    els.modeBadge.textContent = "本機 AI 已啟動";
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
    const first = result.firstTokenMs ? `首字 ${result.firstTokenMs}ms` : "首字未知";
    els.perfText.textContent = `${first}｜總耗時 ${result.totalMs}ms${result.runtime ? `｜${result.runtime}` : ""}`;
  } catch (error) {
    reply.textContent = `錯誤：${error?.message || error}`;
  } finally { els.sendBtn.disabled = false; }
}

function setupInstallUI() {
  if (isStandalone()) {
    els.installHint.textContent = "已用 PWA 模式執行。首次啟動可直接下載本機 AI 模型。";
  } else if (/iphone|ipad|ipod/i.test(navigator.userAgent)) {
    els.installHint.textContent = "iPhone：Safari 分享 → 加入主畫面。安裝後開啟即可測試本機模型。";
  } else {
    els.installHint.textContent = "可安裝成 PWA。若瀏覽器支援，會顯示安裝按鈕。";
  }
}

async function init() {
  els.versionLabel.textContent = `v${APP_VERSION}`;
  setupInstallUI();
  await renderDeviceStats();
  renderAIStats();

  await setupPWA({
    onUpdate: (reg) => { updateRegistration = reg; els.updateBtn.classList.remove("hidden"); },
    onInstallReady: () => els.installBtn.classList.remove("hidden"),
    onControllerChange: () => {
      if (!reloadingForUpdate) { reloadingForUpdate = true; location.reload(); }
    },
  });

  const remoteVersion = await getRemoteVersion();
  if (remoteVersion && remoteVersion !== APP_VERSION) els.updateBtn.classList.remove("hidden");

  els.loadModelBtn.addEventListener("click", startModel);
  els.unloadBtn.addEventListener("click", async () => {
    await unloadModel();
    els.loadModelBtn.disabled = false;
    els.loadModelBtn.textContent = "重新啟動 AI";
    els.unloadBtn.disabled = true;
    els.chatInput.disabled = true;
    els.sendBtn.disabled = true;
    els.modeBadge.textContent = "模型已卸載 RAM";
    renderAIStats();
  });
  els.chatForm.addEventListener("submit", sendChat);
  els.clearChatBtn.addEventListener("click", () => {
    history.splice(1);
    els.messages.innerHTML = '<div class="message assistant">對話已清除。模型仍在手機本機執行。</div>';
  });
  els.updateBtn.addEventListener("click", () => {
    if (updateRegistration?.waiting) applyUpdate(updateRegistration);
    else location.reload();
  });
  els.installBtn.addEventListener("click", async () => {
    const ok = await promptInstall();
    if (ok) els.installBtn.classList.add("hidden");
  });

  if (isStandalone() && wasModelLoadedBefore() && navigator.gpu) {
    els.progressText.textContent = "偵測到曾載入模型，可按按鈕直接啟動快取模型。";
  }
}

init();
