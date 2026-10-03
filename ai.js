const WEBLLM_URL = "https://esm.run/@mlc-ai/web-llm";
export const GPU_MODEL_ID = "Qwen2.5-0.5B-Instruct-q4f16_1-MLC";
export const CPU_MODEL_ID = "onnx-community/Qwen2.5-0.5B-Instruct";
export const MODEL_ID = GPU_MODEL_ID;

let moduleRef = null;
let gpuEngine = null;
let gpuWorker = null;
let cpuWorker = null;
let backend = null;
let cpuLoad = null;
let cpuChat = null;

export function preferredBackend() {
  return navigator.gpu ? "webgpu" : "wasm";
}

export function getBackendMode() {
  return backend || preferredBackend();
}

export function getModelProfile() {
  const mode = getBackendMode();
  return mode === "webgpu"
    ? { mode: "WebGPU", quant: "Q4F16", download: "約 290MB" }
    : { mode: "CPU / WASM", quant: "Q8", download: "約 520MB" };
}

async function getWebLLM() {
  if (!moduleRef) moduleRef = await import(WEBLLM_URL);
  return moduleRef;
}

function normalizeCPUProgress(report) {
  const raw = Number(report?.progress ?? 0);
  const progress = raw > 1 ? raw / 100 : raw;
  const file = report?.file ? report.file.split("/").pop() : "";
  let text = "準備 CPU/WASM 模型…";
  if (report?.status === "progress") text = `下載 ${file || "模型"} ${Math.round(progress * 100)}%`;
  else if (report?.status === "done") text = `${file || "檔案"} 已完成`;
  else if (report?.status === "ready") text = "CPU/WASM 模型已就緒";
  else if (report?.status) text = `${report.status} ${file}`.trim();
  return { progress: Number.isFinite(progress) ? progress : 0, text };
}

function setupCPUWorker(onProgress) {
  cpuWorker = new Worker(new URL("./cpu-worker.js", import.meta.url), { type: "module" });
  cpuWorker.onmessage = ({ data }) => {
    if (data.type === "progress") cpuLoad?.onProgress?.(normalizeCPUProgress(data.report));
    if (data.type === "ready") {
      backend = "wasm";
      cpuLoad?.resolve?.(true);
      cpuLoad = null;
    }
    if (data.type === "result") {
      cpuChat?.resolve?.(data);
      cpuChat = null;
    }
    if (data.type === "error") {
      const error = new Error(data.message || "CPU/WASM 模型錯誤");
      if (cpuLoad) { cpuLoad.reject(error); cpuLoad = null; }
      else if (cpuChat) { cpuChat.reject(error); cpuChat = null; }
    }
  };
  cpuWorker.onerror = (event) => {
    const error = new Error(event.message || "CPU Worker 啟動失敗");
    if (cpuLoad) { cpuLoad.reject(error); cpuLoad = null; }
    if (cpuChat) { cpuChat.reject(error); cpuChat = null; }
  };
}

async function loadCPUModel(onProgress) {
  if (cpuWorker && backend === "wasm") return true;
  if (!cpuWorker) setupCPUWorker(onProgress);
  return new Promise((resolve, reject) => {
    cpuLoad = { resolve, reject, onProgress };
    cpuWorker.postMessage({ type: "load" });
  });
}

async function loadGPUModel(onProgress) {
  if (gpuEngine) return gpuEngine;
  const webllm = await getWebLLM();
  gpuWorker = new Worker(new URL("./ai-worker.js", import.meta.url), { type: "module" });
  const appConfig = { ...webllm.prebuiltAppConfig, cacheBackend: "cache" };
  gpuEngine = await webllm.CreateWebWorkerMLCEngine(gpuWorker, GPU_MODEL_ID, {
    appConfig,
    initProgressCallback: onProgress,
  });
  backend = "webgpu";
  return gpuEngine;
}

export async function loadModel(onProgress) {
  const mode = preferredBackend();
  const result = mode === "webgpu"
    ? await loadGPUModel(onProgress)
    : await loadCPUModel(onProgress);
  localStorage.setItem("pwd:model-ever-loaded", "1");
  localStorage.setItem("pwd:last-backend", mode);
  return result;
}

export function wasModelLoadedBefore() {
  return localStorage.getItem("pwd:model-ever-loaded") === "1";
}

export async function unloadModel() {
  if (gpuEngine) await gpuEngine.unload();
  if (gpuWorker) gpuWorker.terminate();
  if (cpuWorker) cpuWorker.terminate();
  gpuEngine = null;
  gpuWorker = null;
  cpuWorker = null;
  backend = null;
  cpuLoad = null;
  cpuChat = null;
}

export function isModelReady() {
  return Boolean(gpuEngine || (cpuWorker && backend === "wasm"));
}

async function chatCPU(messages, onToken) {
  const started = performance.now();
  return new Promise((resolve, reject) => {
    cpuChat = {
      reject,
      resolve: (data) => {
        onToken(data.output);
        resolve({
          output: data.output,
          firstTokenMs: null,
          totalMs: Math.round(performance.now() - started),
          runtime: "CPU / WASM",
        });
      },
    };
    cpuWorker.postMessage({ type: "generate", messages });
  });
}

async function chatGPU(messages, onToken) {
  const started = performance.now();
  let output = "";
  let firstTokenAt = null;
  const stream = await gpuEngine.chat.completions.create({
    messages, stream: true, temperature: 0.65, max_tokens: 320,
  });
  for await (const chunk of stream) {
    const token = chunk.choices?.[0]?.delta?.content ?? "";
    if (token && firstTokenAt === null) firstTokenAt = performance.now();
    output += token;
    onToken(output);
  }
  const finished = performance.now();
  let runtime = "";
  try { runtime = await gpuEngine.runtimeStatsText(); } catch (_) {}
  return {
    output,
    firstTokenMs: firstTokenAt ? Math.round(firstTokenAt - started) : null,
    totalMs: Math.round(finished - started),
    runtime,
  };
}

export async function chat(messages, onToken) {
  if (!isModelReady()) throw new Error("AI 尚未啟動");
  return backend === "wasm" ? chatCPU(messages, onToken) : chatGPU(messages, onToken);
}