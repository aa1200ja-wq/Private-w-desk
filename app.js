import {
  loadModel, unloadModel, isModelReady, chat,
  isModelInstalled, getStoredBackend, getStorageLocation,
  scanModelInventory, deleteCPUModelCache, preferredBackend, getBackendMode, getModelProfile
} from "./ai.js";
import { APP_VERSION, setupPWA, promptInstall, applyUpdate, isStandalone, getRemoteVersion, checkForUpdate } from "./pwa.js";
import { taiwanize, looksLikeRefusal, CHAT_SYSTEM_PROMPT } from "./modules/i18n.js";
import {
  addTask, listTasks, toggleTask, deleteTask, completeTaskByQuery, deleteTaskByQuery,
  addAgentRun, listAgentRuns, clearAgentRuns
} from "./modules/db.js";
import { nextAgentAction, isFinishAction } from "./modules/agent.js";
import { loadWhisper, startRecording, stopAndTranscribe, isWhisperReady } from "./modules/voice.js";
import { startCamera, stopCamera, analyzeVision, captureCamera, preloadVision, getVisionStatus } from "./modules/vision.js";
import { loadVLM, analyzeImage, isVLMReady } from "./modules/vlm.js";
import { loadImageToCanvas, grayscaleCanvas, loadVideo, captureVideoFrame } from "./modules/media.js";
import { runOfflineChecks } from "./modules/offline.js";

const els={};
document.querySelectorAll("[id]").forEach(el=>els[el.id]=el);

let updateRegistration=null;
let reloadingForUpdate=false;
let modelInventory=null;
let attachedImage=null;
let attachedVideo=null;
let videoObjectUrl=null;
let cameraActive=false;
let voiceRecording=false;
let agentRunning=false;
let currentSteps=[];

function escapeHTML(value){
  return String(value??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
}
function stat(label,value,cls=""){
  return `<div class="stat"><dt>${escapeHTML(label)}</dt><dd class="${cls}">${escapeHTML(value)}</dd></div>`;
}
function showPage(name){
  document.querySelectorAll(".page").forEach(p=>p.classList.toggle("active",p.dataset.pagePanel===name));
  document.querySelectorAll("#mainNav button").forEach(b=>b.classList.toggle("active",b.dataset.page===name));
  window.scrollTo({top:0,behavior:"smooth"});
}
function setModelProgress(v,text){
  const p=Math.max(0,Math.min(100,Math.round((v??0)*100)));
  els.modelProgressBar.style.width=`${p}%`;
  els.modelProgressPct.textContent=`${p}%`;
  if(text)els.modelProgressText.textContent=text;
}
function setAgentStatus(text,kind=""){
  els.agentRunStatus.textContent=text;
  els.agentRunStatus.className=`model-note ${kind}`;
}
function updateAttachmentStatus(){
  const parts=[];
  if(attachedImage)parts.push(`圖片：${attachedImage.name||"相機照片"}`);
  if(attachedVideo)parts.push(`影片：${attachedVideo.name||"已附加"}`);
  if(cameraActive)parts.push("相機：已開啟");
  els.attachmentStatus.textContent=parts.length?parts.join("｜"):"沒有附件";
  els.clearAttachmentBtn.classList.toggle("hidden",parts.length===0);
}

async function renderHealth(){
  const vision=getVisionStatus();
  const visionReady=Object.values(vision).every(Boolean);
  const skillCount=Number(isWhisperReady())+Number(visionReady)+Number(isVLMReady());
  els.qwenHealth.textContent=`🧠 Qwen：${isModelReady()?"運行中":isModelInstalled()?"已下載":"未下載"}`;
  els.skillHealth.textContent=`🧩 技能包：${skillCount}/3 已載入`;
  els.gpuHealth.textContent=`⚡ WebGPU：${navigator.gpu?"支援":"不支援"}`;
  els.agentBadge.textContent=isModelReady()?"Agent 可工作":"Agent 尚未啟動";
  els.agentBadge.className=`badge ${isModelReady()?"ok":""}`;
  els.agentHealthText.textContent=isModelReady()
    ?"Qwen 已在本機 RAM，可開始測試工具選擇、多步任務與失敗重試。"
    :"先到「模型」載入 Qwen；技能包可由 Agent 在需要時自動載入。";
}

async function renderDeviceStats(){
  const e=navigator.storage?.estimate?await navigator.storage.estimate():null;
  const used=e?.usage?`${(e.usage/1048576).toFixed(0)} MB`:"未知";
  const quota=e?.quota?`${(e.quota/1073741824).toFixed(1)} GB`:"未知";
  els.deviceStats.innerHTML=[
    stat("WebGPU",navigator.gpu?"支援":"不支援",navigator.gpu?"ok":"warn"),
    stat("PWA 模式",isStandalone()?"已安裝":"瀏覽器",isStandalone()?"ok":"warn"),
    stat("Service Worker",navigator.serviceWorker?.controller?"已接管":"尚未接管",navigator.serviceWorker?.controller?"ok":"warn"),
    stat("CPU 執行緒",navigator.hardwareConcurrency??"未知"),
    stat("網站已用空間",used),
    stat("網站可用額度",quota)
  ].join("");
}

function renderQwenStats(){
  const p=getModelProfile(),stored=getStoredBackend();
  const rows=[
    stat("本機安裝",isModelInstalled()?"已下載":"尚未下載",isModelInstalled()?"ok":"warn"),
    stat("執行狀態",isModelReady()?"已載入 RAM":"未載入",isModelReady()?"ok":"warn"),
    stat("目前引擎",p.mode),
    stat("量化",p.quant),
    stat("目前模型容量",p.download),
    stat("儲存位置",isModelInstalled()?getStorageLocation():"—"),
    stat("上次下載引擎",stored==="webgpu"?"WebGPU":stored==="wasm"?"CPU/WASM":"尚未")
  ];
  if(modelInventory){
    rows.push(
      stat("GPU Q4F16",modelInventory.gpu.installed?"已安裝":modelInventory.gpu.partial?"部分殘留":"未發現",modelInventory.gpu.installed?"ok":modelInventory.gpu.partial?"warn":""),
      stat("CPU/WASM Q8",modelInventory.cpu.installed?"已安裝":modelInventory.cpu.partial?"部分殘留":"未發現",(modelInventory.cpu.installed||modelInventory.cpu.partial)?"warn":""),
      stat("精確重複檔",modelInventory.exactDuplicateUrls.length?`${modelInventory.exactDuplicateUrls.length} 個`:"未發現",modelInventory.exactDuplicateUrls.length?"danger":"ok")
    );
  }
  els.qwenStats.innerHTML=rows.join("");
  els.loadQwenBtn.textContent=isModelReady()?"Qwen 已啟動":isModelInstalled()?"從本機啟動 Qwen":preferredBackend()==="webgpu"?"下載／啟動 Qwen（約290MB）":"下載 CPU 版 Qwen";
  els.loadQwenBtn.disabled=isModelReady();
  els.unloadQwenBtn.disabled=!isModelReady();
}

async function refreshModelInventory(){
  els.scanModelsBtn.disabled=true;
  els.scanModelsBtn.textContent="掃描中…";
  try{
    modelInventory=await scanModelInventory();
    const hasCpu=modelInventory.cpu.installed||modelInventory.cpu.partial;
    els.cleanupCpuBtn.classList.toggle("hidden",!hasCpu||!navigator.gpu);
    if(modelInventory.exactDuplicateUrls.length){
      els.modelScanNote.textContent=`發現 ${modelInventory.exactDuplicateUrls.length} 個完全相同的重複快取檔。`;
    }else if(modelInventory.gpu.installed&&hasCpu){
      els.modelScanNote.textContent=modelInventory.cpu.installed?"GPU 與 CPU/WASM 兩套格式並存；不會打架，可清理 CPU 版。":"GPU 完整；另有 CPU/WASM 部分殘留，可清理。";
    }else{
      els.modelScanNote.textContent="未發現模型衝突或精確重複檔。";
    }
    renderQwenStats();
  }catch(e){els.modelScanNote.textContent=`掃描失敗：${e.message||e}`;}
  finally{els.scanModelsBtn.disabled=false;els.scanModelsBtn.textContent="重新掃描本機模型";}
}

async function startQwen(){
  els.loadQwenBtn.disabled=true;
  setModelProgress(.01,preferredBackend()==="webgpu"?"準備 WebLLM…":"準備 CPU/WASM…");
  try{
    await loadModel(r=>setModelProgress(r.progress??0,r.text||"下載／載入模型…"));
    setModelProgress(1,"Qwen 已載入 RAM");
    await refreshModelInventory();
    await renderHealth();
    renderQwenStats();
    setAgentStatus("Agent 已可工作。","ok");
  }catch(e){
    els.loadQwenBtn.disabled=false;
    setModelProgress(0,e.message||String(e));
  }
}

async function prepareWhisper(){
  if(isWhisperReady())return true;
  els.skillPackStatus.textContent="載入 Whisper Tiny…";
  await loadWhisper(r=>{els.skillPackStatus.textContent=r?.file||r?.status||"Whisper 下載中…";});
  els.skillPackStatus.textContent="Whisper Tiny 已就緒";
  await renderHealth();
  return true;
}
async function prepareMediaPipe(){
  const types=["face","hand","gesture","pose"];
  for(const type of types){
    els.skillPackStatus.textContent=`載入 MediaPipe ${type}…`;
    await preloadVision(type);
  }
  els.skillPackStatus.textContent="MediaPipe Face / Hand / Gesture / Pose 已就緒";
  await renderHealth();
}
async function prepareVLM(){
  if(isVLMReady())return true;
  els.skillPackStatus.textContent="載入 SmolVLM 256M…";
  await loadVLM(s=>els.skillPackStatus.textContent=s);
  els.skillPackStatus.textContent="SmolVLM 256M 已就緒";
  await renderHealth();
  return true;
}

async function renderTasks(){
  const tasks=await listTasks();
  els.taskCount.textContent=String(tasks.filter(t=>!t.done).length);
  els.taskList.innerHTML=tasks.length?tasks.map(t=>`
    <div class="task ${t.done?"done":""}" data-id="${t.id}">
      <input type="checkbox" ${t.done?"checked":""}>
      <span class="task-title">${escapeHTML(t.title)}</span>
      <button class="ghost task-delete">刪除</button>
    </div>`).join(""):'<p class="muted">目前沒有待辦。讓 Agent 幫你建立一個。</p>';
}

function renderLiveTrace(steps){
  els.agentStepBadge.textContent=`${steps.length} step`;
  els.liveTrace.innerHTML=steps.length?steps.map((s,i)=>`
    <div class="trace-step">
      <b>Step ${i+1} <span class="trace-tool">${escapeHTML(s.tool)}</span></b>
      <div>${escapeHTML(s.reason||"")}</div>
      <pre class="${s.error?"trace-error":""}">${escapeHTML(JSON.stringify(s.result,null,2))}</pre>
    </div>`).join(""):'<p class="muted">尚無工具步驟。</p>';
}

async function renderRunLogs(){
  const runs=await listAgentRuns(50);
  els.runLogs.innerHTML=runs.length?runs.map(run=>{
    const date=new Date(run.createdAt).toLocaleString("zh-TW");
    const steps=(run.steps||[]).map((s,i)=>`<div class="run-step">Step ${i+1}｜<code>${escapeHTML(s.tool)}</code><br>${escapeHTML(s.reason||"")}<br>${escapeHTML(JSON.stringify(s.result))}</div>`).join("");
    return `<details class="run-log">
      <summary><div class="run-goal">${escapeHTML(run.goal)}</div><div class="run-meta">${date}｜${run.steps?.length||0} steps｜${run.success?"完成":"未完成"}</div></summary>
      <div class="run-body"><div class="run-answer">${escapeHTML(run.answer||"")}</div>${steps}</div>
    </details>`;
  }).join(""):'<p class="muted">還沒有 Agent 執行紀錄。</p>';
}

async function ensureCamera(){
  if(cameraActive)return;
  await startCamera(els.agentCameraVideo);
  cameraActive=true;
  els.agentCameraVideo.classList.remove("hidden");
  els.agentCameraBtn.textContent="關相機";
  updateAttachmentStatus();
}
function closeCamera(){
  stopCamera(els.agentCameraVideo);
  cameraActive=false;
  els.agentCameraVideo.classList.add("hidden");
  els.agentCameraBtn.textContent="開相機";
  updateAttachmentStatus();
}
async function captureImage(){
  await ensureCamera();
  attachedImage=await captureCamera(els.agentCameraVideo,els.agentCanvas);
  attachedImage.name="相機照片";
  els.agentCanvas.classList.remove("hidden");
  updateAttachmentStatus();
  return {image:"captured",width:els.agentCanvas.width,height:els.agentCanvas.height};
}

async function translateVisionQuestion(text){
  if(!isModelReady())return "Describe the image briefly.";
  const r=await chat([
    {role:"system",content:"Translate the user's visual question into short English only. Do not answer it."},
    {role:"user",content:text||"描述圖片"}
  ],()=>{},{max_tokens:60,temperature:.05});
  return r.output||"Describe the image briefly.";
}

async function ensureVideoReady(){
  if(!attachedVideo)throw new Error("沒有附加影片");
  if(videoObjectUrl)URL.revokeObjectURL(videoObjectUrl);
  videoObjectUrl=loadVideo(attachedVideo,els.agentVideoPreview);
  els.agentVideoPreview.classList.remove("hidden");
  if(els.agentVideoPreview.readyState>=1)return;
  await new Promise((resolve,reject)=>{
    els.agentVideoPreview.onloadedmetadata=()=>resolve();
    els.agentVideoPreview.onerror=()=>reject(new Error("影片讀取失敗"));
  });
}
async function seekVideo(time){
  await ensureVideoReady();
  const video=els.agentVideoPreview;
  const target=Math.max(0,Math.min(Number(time)||0,Math.max(0,(video.duration||0)-.05)));
  if(Math.abs(video.currentTime-target)<.05)return target;
  await new Promise(resolve=>{
    const done=()=>{video.removeEventListener("seeked",done);resolve();};
    video.addEventListener("seeked",done);
    video.currentTime=target;
  });
  return target;
}
function canvasToBlob(canvas,type="image/png",quality=.92){
  return new Promise(resolve=>canvas.toBlob(resolve,type,quality));
}

async function executeTool(action){
  const tool=action.tool,args=action.args||{};
  if(tool==="task.create"){
    const title=String(args.title||"").trim();
    if(!title)throw new Error("缺少待辦名稱");
    const id=await addTask(title);await renderTasks();
    return {ok:true,id,title};
  }
  if(tool==="task.list"){
    const tasks=await listTasks();
    return {ok:true,tasks:tasks.map(t=>({id:t.id,title:t.title,done:t.done}))};
  }
  if(tool==="task.complete"){
    const item=await completeTaskByQuery(args.query||"");
    await renderTasks();
    return item?{ok:true,completed:item.title}:{ok:false,message:"找不到符合的未完成待辦"};
  }
  if(tool==="task.delete"){
    const item=await deleteTaskByQuery(args.query||"");
    await renderTasks();
    return item?{ok:true,deleted:item.title}:{ok:false,message:"找不到符合待辦"};
  }
  if(tool==="camera.open"){
    await ensureCamera();
    return {ok:true,camera:"open"};
  }
  if(tool==="camera.capture"){
    return {ok:true,...await captureImage()};
  }
  if(["vision.pose","vision.gesture","vision.face","vision.hand"].includes(tool)){
    await ensureCamera();
    const type=tool.split(".")[1];
    const result=await analyzeVision(type,els.agentCameraVideo);
    return {ok:true,...result};
  }
  if(tool==="image.describe"){
    if(!attachedImage)throw new Error("沒有圖片；請先附加圖片或讓 Agent 拍照");
    await prepareVLM();
    const english=await translateVisionQuestion(args.question||"描述這張圖片");
    const text=await analyzeImage(attachedImage,`Describe the image. Focus on this request: ${english}`,s=>els.skillPackStatus.textContent=s);
    return {ok:true,visionText:text};
  }
  if(tool==="image.grayscale"){
    if(!attachedImage)throw new Error("沒有圖片；請先附加圖片或拍照");
    await loadImageToCanvas(attachedImage,els.agentCanvas);
    grayscaleCanvas(els.agentCanvas);
    attachedImage=await canvasToBlob(els.agentCanvas);
    attachedImage.name="灰階結果.png";
    els.agentCanvas.classList.remove("hidden");
    updateAttachmentStatus();
    return {ok:true,message:"圖片已轉成灰階並顯示在 Agent 頁面"};
  }
  if(tool==="video.frame"){
    const time=await seekVideo(args.time??0);
    captureVideoFrame(els.agentVideoPreview,els.agentCanvas);
    attachedImage=await canvasToBlob(els.agentCanvas);
    attachedImage.name=`影片 ${time.toFixed(1)} 秒截圖.png`;
    els.agentCanvas.classList.remove("hidden");
    updateAttachmentStatus();
    return {ok:true,time:Number(time.toFixed(2)),message:"已擷取影片畫面，結果同時成為目前圖片附件"};
  }
  throw new Error(`未知工具：${tool}`);
}

function agentContext(){
  return [
    `圖片附件：${attachedImage?"有":"無"}`,
    `影片附件：${attachedVideo?"有":"無"}`,
    `相機：${cameraActive?"已開啟":"未開啟"}`,
    `Whisper：${isWhisperReady()?"已載入":"未載入"}`,
    `SmolVLM：${isVLMReady()?"已載入":"未載入"}`
  ].join("；");
}

async function repairRefusal(goal,answer){
  if(!looksLikeRefusal(answer))return answer;
  const r=await chat([
    {role:"system",content:CHAT_SYSTEM_PROMPT+"\n上一個回答可能誤拒絕。若這是一般知識問題，直接正常回答。"},
    {role:"user",content:goal}
  ],()=>{},{max_tokens:220,temperature:.3});
  return r.output;
}

async function runAgent(goalInput){
  const goal=String(goalInput??els.agentInput.value).trim();
  if(!goal||agentRunning)return;
  if(!isModelReady()){
    showPage("models");
    setAgentStatus("請先在模型頁啟動 Qwen。","warn");
    els.skillPackStatus.textContent="Qwen 是 Agent 的大腦，必須先載入。";
    return;
  }

  agentRunning=true;
  els.runAgentBtn.disabled=true;
  els.agentAnswer.textContent="Agent 執行中…";
  els.traceDetails.open=true;
  currentSteps=[];
  renderLiveTrace(currentSteps);
  setAgentStatus("Qwen 正在決定第一步…");

  const observations=[];
  let finalAnswer="";
  let success=false;

  try{
    for(let step=1;step<=6;step++){
      setAgentStatus(`Step ${step}：Qwen 正在決定下一步…`);
      const action=await nextAgentAction(chat,{goal,observations,step,context:agentContext()});

      if(isFinishAction(action)){
        finalAnswer=String(action.args?.message||"任務完成");
        finalAnswer=await repairRefusal(goal,finalAnswer);
        finalAnswer=await taiwanize(finalAnswer);
        success=true;
        break;
      }

      const trace={tool:action.tool,args:action.args||{},reason:action.reason||"",raw:action.raw||""};
      const started=performance.now();
      try{
        setAgentStatus(`Step ${step}：執行 ${action.tool}…`);
        trace.result=await executeTool(action);
        trace.ms=Math.round(performance.now()-started);
      }catch(error){
        trace.error=true;
        trace.result={ok:false,error:error?.message||String(error)};
        trace.ms=Math.round(performance.now()-started);
      }

      currentSteps.push(trace);
      observations.push({tool:action.tool,result:trace.result});
      renderLiveTrace(currentSteps);
    }

    if(!finalAnswer){
      finalAnswer="已達 6 步 Agent 上限，這次任務沒有在限制內自行完成。";
    }
    els.agentAnswer.textContent=finalAnswer;
    setAgentStatus(success?`完成｜${currentSteps.length} 個工具步驟`:`停止｜已達步驟上限`,success?"ok":"warn");

    await addAgentRun({goal,answer:finalAnswer,steps:currentSteps,success});
    await renderRunLogs();
    await renderTasks();
    await renderHealth();
  }catch(error){
    finalAnswer=`Agent 執行失敗：${error?.message||error}`;
    els.agentAnswer.textContent=finalAnswer;
    setAgentStatus(finalAnswer,"danger");
    await addAgentRun({goal,answer:finalAnswer,steps:currentSteps,success:false});
    await renderRunLogs();
  }finally{
    agentRunning=false;
    els.runAgentBtn.disabled=false;
  }
}

async function handleAgentFile(file){
  if(!file)return;
  if(file.type.startsWith("image/")){
    attachedImage=file;attachedVideo=null;
    await loadImageToCanvas(file,els.agentCanvas);
    els.agentCanvas.classList.remove("hidden");
    els.agentVideoPreview.classList.add("hidden");
  }else if(file.type.startsWith("video/")){
    attachedVideo=file;attachedImage=null;
    await ensureVideoReady();
    els.agentCanvas.classList.add("hidden");
  }
  updateAttachmentStatus();
}

async function toggleVoiceInput(){
  if(!voiceRecording){
    try{
      setAgentStatus("準備 Whisper…");
      await prepareWhisper();
      await startRecording();
      voiceRecording=true;
      els.agentVoiceBtn.textContent="停止語音";
      setAgentStatus("錄音中…再按一次會停止、轉文字並直接交給 Agent。");
    }catch(e){setAgentStatus(`語音啟動失敗：${e.message||e}`,"danger");}
    return;
  }
  try{
    els.agentVoiceBtn.disabled=true;
    setAgentStatus("Whisper 本機轉錄中…");
    let text=await stopAndTranscribe(r=>setAgentStatus(r?.file||r?.status||"語音處理中…"));
    text=await taiwanize(text);
    els.agentInput.value=text.trim();
    voiceRecording=false;
    els.agentVoiceBtn.textContent="語音輸入";
    els.agentVoiceBtn.disabled=false;
    if(text.trim())await runAgent(text.trim());
  }catch(e){
    voiceRecording=false;
    els.agentVoiceBtn.textContent="語音輸入";
    els.agentVoiceBtn.disabled=false;
    setAgentStatus(`語音失敗：${e.message||e}`,"danger");
  }
}

async function runSkillCard(button){
  const prompt=button.dataset.prompt||"";
  showPage("agent");
  els.agentInput.value=prompt;
  if(prompt.includes("這張圖片")&&!attachedImage){
    setAgentStatus("這個測試需要圖片：先按「＋ 圖片／影片」附加一張圖片。","warn");
    return;
  }
  if(prompt.includes("這支影片")&&!attachedVideo){
    setAgentStatus("這個測試需要影片：先按「＋ 圖片／影片」附加一支影片。","warn");
    return;
  }
  await runAgent(prompt);
}

async function initPWA(){
  await setupPWA({
    onUpdate:reg=>{updateRegistration=reg;els.updateBtn.textContent="立即更新";els.updateStatus.textContent=`目前 v${APP_VERSION}｜新版已準備完成`;},
    onInstallReady:()=>els.installBtn.classList.remove("hidden"),
    onControllerChange:()=>{if(!reloadingForUpdate){reloadingForUpdate=true;location.reload();}}
  });
  const remote=await getRemoteVersion();
  els.updateStatus.textContent=remote&&remote!==APP_VERSION?`目前 v${APP_VERSION}｜最新 v${remote}`:`目前 v${APP_VERSION}｜已是最新版`;
}

async function init(){
  els.versionLabel.textContent=`v${APP_VERSION}`;
  await renderDeviceStats();
  renderQwenStats();
  await refreshModelInventory();
  await renderHealth();
  await renderTasks();
  await renderRunLogs();
  await initPWA();
  taiwanize("初始化");

  els.mainNav.onclick=e=>{const b=e.target.closest("[data-page]");if(b)showPage(b.dataset.page);};
  els.runAgentBtn.onclick=()=>runAgent();
  els.agentFileInput.onchange=()=>handleAgentFile(els.agentFileInput.files?.[0]).catch(e=>setAgentStatus(e.message,"danger"));
  els.clearAttachmentBtn.onclick=()=>{
    attachedImage=null;attachedVideo=null;
    if(videoObjectUrl){URL.revokeObjectURL(videoObjectUrl);videoObjectUrl=null;}
    els.agentCanvas.classList.add("hidden");els.agentVideoPreview.classList.add("hidden");
    if(cameraActive)closeCamera();updateAttachmentStatus();
  };
  els.agentCameraBtn.onclick=async()=>{try{cameraActive?closeCamera():await ensureCamera();}catch(e){setAgentStatus(`相機失敗：${e.message||e}`,"danger");}};
  els.agentVoiceBtn.onclick=toggleVoiceInput;

  els.skillCards.onclick=e=>{const b=e.target.closest(".skill-card");if(b)runSkillCard(b);};

  els.taskForm.onsubmit=async e=>{e.preventDefault();const t=els.taskInput.value.trim();if(!t)return;await addTask(t);els.taskInput.value="";await renderTasks();};
  els.taskList.onclick=async e=>{
    const row=e.target.closest(".task");if(!row)return;
    if(e.target.matches('input[type="checkbox"]'))await toggleTask(row.dataset.id);
    if(e.target.closest(".task-delete"))await deleteTask(row.dataset.id);
    await renderTasks();
  };

  els.clearLogsBtn.onclick=async()=>{if(!confirm("清除所有 Agent 執行紀錄？"))return;await clearAgentRuns();await renderRunLogs();};

  els.loadQwenBtn.onclick=startQwen;
  els.unloadQwenBtn.onclick=async()=>{await unloadModel();setModelProgress(0,"Qwen 已卸載 RAM，模型檔仍在手機。");renderQwenStats();await renderHealth();};
  els.scanModelsBtn.onclick=refreshModelInventory;
  els.cleanupCpuBtn.onclick=async()=>{
    if(!confirm("清理 CPU/WASM Qwen 快取？GPU 版會保留。"))return;
    const r=await deleteCPUModelCache();els.modelScanNote.textContent=`已清理 ${r.deletedEntries} 個 CPU/WASM 快取檔。`;
    await refreshModelInventory();await renderDeviceStats();
  };
  els.loadWhisperBtn.onclick=()=>prepareWhisper().catch(e=>els.skillPackStatus.textContent=`Whisper 失敗：${e.message||e}`);
  els.loadMediaPipeBtn.onclick=()=>prepareMediaPipe().catch(e=>els.skillPackStatus.textContent=`MediaPipe 失敗：${e.message||e}`);
  els.loadVlmBtn.onclick=()=>prepareVLM().catch(e=>els.skillPackStatus.textContent=`SmolVLM 失敗：${e.message||e}`);
  els.offlineCheckBtn.onclick=async()=>{
    const r=await runOfflineChecks(scanModelInventory);
    els.offlineResult.innerHTML=r.map(([a,b])=>stat(a,b,(b.includes("支援")||b.includes("已"))?"ok":"")).join("");
  };

  els.updateBtn.onclick=async()=>{
    if(updateRegistration?.waiting){applyUpdate(updateRegistration);return;}
    els.updateBtn.disabled=true;els.updateBtn.textContent="檢查中…";
    const r=await checkForUpdate();
    if(r.waiting){updateRegistration=r.registration;els.updateBtn.textContent="立即更新";els.updateStatus.textContent=`目前 v${APP_VERSION}｜新版已準備完成`;}
    else if(r.hasUpdate){els.updateBtn.textContent="重新整理更新";els.updateStatus.textContent=`目前 v${APP_VERSION}｜最新 v${r.remoteVersion}`;}
    else{els.updateBtn.textContent="檢查更新";els.updateStatus.textContent=`目前 v${APP_VERSION}｜已是最新版`;}
    els.updateBtn.disabled=false;
  };
  els.installBtn.onclick=async()=>{if(await promptInstall())els.installBtn.classList.add("hidden");};

  updateAttachmentStatus();
  setAgentStatus(isModelReady()?"Agent 已可工作。":"先到「模型」啟動 Qwen。",isModelReady()?"ok":"");
}
init();
