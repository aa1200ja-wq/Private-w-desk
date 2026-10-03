const TOOL_HELP = `
你是手機內的小型 Agent 決策器。每次只決定「下一步」。所有 reason 與 message 一律使用台灣慣用繁體中文。
只輸出一個 JSON 物件，不要 Markdown、不要說明文字。

可用工具：
task.create {"title":"待辦名稱"}
task.list {}
task.complete {"query":"待辦關鍵字"}
task.delete {"query":"待辦關鍵字"}
camera.open {}
camera.capture {}
vision.pose {}
vision.gesture {}
vision.face {}
vision.hand {}
image.describe {"question":"要看什麼"}
image.grayscale {}
video.frame {"time":8}
finish {"message":"給使用者的最終回答"}

規則：
1. 依照使用者目標與目前 observation 決定下一步。
2. 不要假裝工具已執行；要做事就一定要呼叫工具。
3. 如果前一步工具失敗，可以換策略或 finish 說明失敗。
4. 最多只規劃目前一步，不要一次輸出多個工具。
5. 如果已取得足夠結果，使用 finish。
6. args 沒需要就用 {}。\n7. 一般知識、地理、歷史、文化、科學與生活問題可直接用 finish 回答，不要誤判成敏感問題。\n8. 使用者有錯字時，依上下文推測最合理意思。
格式固定：
{"tool":"task.create","args":{"title":"剪影片"},"reason":"需要先建立待辦"}
`.trim();

function parseJSON(text){
  const raw=String(text??"").trim();
  const candidates=[raw, raw.match(/\{[\s\S]*\}/)?.[0]].filter(Boolean);
  for(const c of candidates){ try{return JSON.parse(c);}catch(_){} }
  return null;
}

export async function nextAgentAction(chatFn,{goal,observations=[],step=1,context=""}){
  const history=observations.length
    ? observations.map((x,i)=>`Step ${i+1}: tool=${x.tool}; result=${JSON.stringify(x.result)}`).join("\n")
    : "尚無工具執行結果";

  const prompt=[
    {role:"system",content:TOOL_HELP},
    {role:"user",content:`使用者目標：${goal}
目前步驟：${step}
可用上下文：${context||"無"}
先前 observation：
${history}

決定下一步，只輸出 JSON。`}
  ];

  let result=await chatFn(prompt,()=>{},{max_tokens:150,temperature:0.05});
  let parsed=parseJSON(result.output);

  if(!parsed?.tool){
    const repair=[
      ...prompt,
      {role:"assistant",content:result.output},
      {role:"user",content:"上一個輸出不是合法工具 JSON。請只重輸出一個合法 JSON，不要任何其他文字。"}
    ];
    result=await chatFn(repair,()=>{},{max_tokens:120,temperature:0.01});
    parsed=parseJSON(result.output);
  }

  if(!parsed?.tool) {
    return {tool:"finish",args:{message:"Agent 無法產生合法工具指令。"},reason:"invalid_json",raw:result.output};
  }
  return {...parsed,raw:result.output};
}

export function isFinishAction(action){ return action?.tool==="finish"; }
