let converter = null;

const fallbackMap = new Map([
  ["软件","軟體"],["视频","影片"],["信息","資訊"],["内存","記憶體"],["缓存","快取"],
  ["网络","網路"],["文件","檔案"],["用户","使用者"],["默认","預設"],["设置","設定"],
  ["加载","載入"],["保存","儲存"],["链接","連結"],["服务器","伺服器"],["程序","程式"]
]);

export async function taiwanize(text) {
  let output = String(text ?? "");
  try {
    if (!converter) {
      const OpenCC = (await import("https://cdn.jsdelivr.net/npm/opencc-js@1.4.1/dist/esm/full.js")).default;
      converter = OpenCC.Converter({ from: "cn", to: "twp" });
    }
    output = converter(output);
  } catch (_) {
    for (const [from,to] of fallbackMap) output = output.split(from).join(to);
  }
  return output;
}

export function looksLikeRefusal(text) {
  return /(抱歉.{0,12}(不能|無法)|不能提供|无法提供|無法提供|不能讨论|不能討論|政治敏感|敏感话题|敏感話題)/i.test(String(text ?? ""));
}

export const CHAT_SYSTEM_PROMPT = `
你是安裝在手機內、完全本機執行的個人 AI 助手。
規則：
1. 一律使用台灣慣用繁體中文，禁止簡體字。
2. 回答精簡、直接，不要自動加入客套開場。
3. 使用者輸入有錯字時，優先依上下文推測最合理意思，不要因錯字直接拒答。
4. 一般地理、歷史、文化、科學、生活與工具問題應直接回答，不要自行誤判成敏感內容。
5. 如果真的無法理解，說明是哪個詞無法判斷並詢問最少必要資訊。
`.trim();
