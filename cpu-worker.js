import {
  pipeline,
  env,
} from "https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.8.1";

const MODEL_ID = "onnx-community/Qwen2.5-0.5B-Instruct";
let generator = null;
let loading = null;

env.allowLocalModels = false;
env.useBrowserCache = true;
env.useWasmCache = true;

async function loadGenerator() {
  if (generator) return generator;
  if (!loading) {
    loading = pipeline("text-generation", MODEL_ID, {
      device: "wasm",
      dtype: "q8",
      progress_callback: (report) => self.postMessage({ type: "progress", report }),
    }).then((pipe) => {
      generator = pipe;
      self.postMessage({ type: "ready" });
      return pipe;
    }).finally(() => { loading = null; });
  }
  return loading;
}

function extractReply(result) {
  const generated = result?.[0]?.generated_text;
  if (Array.isArray(generated)) {
    const last = generated[generated.length - 1];
    return typeof last === "string" ? last : (last?.content ?? "");
  }
  return typeof generated === "string" ? generated : String(generated ?? "");
}

self.onmessage = async ({ data }) => {
  try {
    if (data.type === "load") {
      await loadGenerator();
      return;
    }
    if (data.type === "generate") {
      const pipe = await loadGenerator();
      const result = await pipe(data.messages, {
        max_new_tokens: data.options?.max_tokens ?? 96,
        do_sample: true,
        temperature: data.options?.temperature ?? 0.65,
        top_p: 0.85,
        repetition_penalty: 1.08,
      });
      self.postMessage({ type: "result", output: extractReply(result) });
    }
  } catch (error) {
    self.postMessage({ type: "error", message: error?.message || String(error) });
  }
};