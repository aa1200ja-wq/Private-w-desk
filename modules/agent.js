function extractJSON(text) {
  const match = String(text).match(/\{[\s\S]*\}/);
  if (!match) return null;
  try { return JSON.parse(match[0]); } catch (_) { return null; }
}

export async function planToolCall(chatFn, input) {
  const messages = [
    {
      role:"system",
      content:`你是手機工作台的工具路由器。只輸出一個 JSON，不要 Markdown。
可用工具：
task.create {title}
task.complete {title}
page.open {target}
camera.open {}
none {}
target 可用：home,chat,tasks,voice,vision,media,storage,gpu,offline。
若只是一般聊天，tool=none。
格式：{"tool":"task.create","args":{"title":"..."}}`
    },
    { role:"user", content:input }
  ];
  const result = await chatFn(messages, () => {}, { max_tokens:120, temperature:0.1 });
  return extractJSON(result.output) || { tool:"none", args:{} };
}
