const WEBLLM_URL = "https://esm.run/@mlc-ai/web-llm";
export const MODEL_ID = "Qwen2.5-0.5B-Instruct-q4f16_1-MLC";

let moduleRef = null;
let engine = null;
let worker = null;

async function getModule() {
  if (!moduleRef) moduleRef = await import(WEBLLM_URL);
  return moduleRef;
}

export async function loadModel(onProgress) {
  if (!navigator.gpu) throw new Error("此瀏覽器沒有 WebGPU，無法啟動本機 Qwen。");
  if (engine) return engine;
  const webllm = await getModule();
  worker = new Worker(new URL("./ai-worker.js", import.meta.url), { type: "module" });
  const appConfig = { ...webllm.prebuiltAppConfig, cacheBackend: "cache" };
  engine = await webllm.CreateWebWorkerMLCEngine(worker, MODEL_ID, {
    appConfig,
    initProgressCallback: onProgress,
  });
  localStorage.setItem("pwd:model-ever-loaded", "1");
  return engine;
}

export function wasModelLoadedBefore() {
  return localStorage.getItem("pwd:model-ever-loaded") === "1";
}

export async function unloadModel() {
  if (engine) await engine.unload();
  if (worker) worker.terminate();
  engine = null;
  worker = null;
}

export function isModelReady() {
  return Boolean(engine);
}

export async function chat(messages, onToken) {
  if (!engine) throw new Error("AI 尚未啟動");
  const started = performance.now();
  let output = "";
  let firstTokenAt = null;
  const stream = await engine.chat.completions.create({
    messages,
    stream: true,
    temperature: 0.65,
    max_tokens: 320,
  });
  for await (const chunk of stream) {
    const token = chunk.choices?.[0]?.delta?.content ?? "";
    if (token && firstTokenAt === null) firstTokenAt = performance.now();
    output += token;
    onToken(output);
  }
  const finished = performance.now();
  let runtime = "";
  try { runtime = await engine.runtimeStatsText(); } catch (_) {}
  return {
    output,
    firstTokenMs: firstTokenAt ? Math.round(firstTokenAt - started) : null,
    totalMs: Math.round(finished - started),
    runtime,
  };
}
