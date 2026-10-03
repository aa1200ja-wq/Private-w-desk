export async function runLLMBenchmark(chatFn) {
  const prompt = [
    { role:"system", content:"請只用台灣繁體中文，回答一句話。" },
    { role:"user", content:"用一句話說明瀏覽器本機 AI 的優點。" }
  ];
  const started = performance.now();
  const result = await chatFn(prompt, () => {}, { max_tokens:64, temperature:0.2 });
  return {
    totalMs: Math.round(performance.now() - started),
    firstTokenMs: result.firstTokenMs,
    runtime: result.runtime || "",
    output: result.output,
  };
}
