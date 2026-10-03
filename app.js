import {
  loadModel, unloadModel, isModelReady, chat,
  isModelInstalled, getStoredBackend, getStorageLocation,
  scanModelInventory, deleteCPUModelCache, preferredBackend, getBackendMode, getModelProfile
} from "./ai.js";
import { APP_VERSION, setupPWA, promptInstall, applyUpdate, isStandalone, getRemoteVersion, checkForUpdate } from "./pwa.js";
import { taiwanize, looksLikeRefusal, CHAT_SYSTEM_PROMPT } from "./modules/i18n.js";
import { addTask, listTasks, toggleTask, deleteTask, writeOPFSDemo, readOPFSDemo } from "./modules/db.js";
import { planToolCall } from "./modules/agent.js";
import { loadWhisper, startRecording, stopAndTranscribe } from "./modules/voice.js";
import { startCamera, stopCamera, analyzeVision, captureCamera } from "./modules/vision.js";
import { loadVLM, analyzeImage } from "./modules/vlm.js";
import { loadImageToCanvas, grayscaleCanvas, exportCanvas, playAudioFile, loadVideo, captureVideoFrame } from "./modules/media.js";
import { createPeerOffer, applyRemoteDescription, sendPeerMessage } from "./modules/p2p.js";
import { startWebGLDemo } from "./modules/gpu.js";
import { runLLMBenchmark } from "./modules/benchmark.js";
import { runOfflineChecks } from "./modules/offline.js";

const $=id=>document.getElementById(id);
const els={}; document.querySelectorAll("[id]").forEach(el=>els[el.id]=el);

const history=[{role:"system",content:CHAT_SYSTEM_PROMPT}];
let updateRegistration=null,reloadingForUpdate=false,modelInventory=null,lastVisionBlob=null;
let audioPlayback=null;

const FEATURES=[
"1. PWA 安裝／離線","2. WebGPU 裝置檢測","3. 模型管理中心","4. Qwen 本機聊天",
"5. Qwen Tool Calling","6. 待辦／資料操作","7. Whisper 語音","8. 相機",
"9. Face","10. Hand","11. Gesture","12. Pose","13. SmolVLM 圖片理解",
"14. Canvas 圖片處理","15. WebAudio","16. 影片抽 Frame","17. OPFS／IndexedDB",
"18. P2P","19. 3D / GPU Demo","20. Benchmark","21. 完全離線測試"
];

function stat(label,value,cls=""){return `<div class="stat"><dt>${label}</dt><dd class="${cls}">${value}</dd></div>`;}
function setProgress(v,text){const p=Math.max(0,Math.min(100,Math.round((v??0)*100)));els.progressBar.style.width=`${p}%`;els.progressPct.textContent=`${p}%`;if(text)els.progressText.textContent=text;}
function addMessage(role,text=""){const n=document.createElement("div");n.className=`message ${role}`;n.textContent=text;els.messages.append(n);els.messages.scrollTop=els.messages.scrollHeight;return n;}
function showPage(name){
  document.querySelectorAll(".page").forEach(x=>x.classList.toggle("active",x.dataset.pagePanel===name));
  document.querySelectorAll("#tabs button").forEach(x=>x.classList.toggle("active",x.dataset.page===name));
  window.scrollTo({top:0,behavior:"smooth"});
}
function renderFeatureGrid(){
  els.featureGrid.innerHTML=FEATURES.map((x,i)=>{
    const state=i<6?"底座已架":i<13?"可按需測試":i<20?"實驗入口已架":"待離線實測";
    return `<div class="feature-item"><b>${x}</b><span>${state}</span></div>`;
  }).join("");
}

function configureEngineUI(){
  if(preferredBackend()==="webgpu"){
    els.modeBadge.textContent="WebGPU 高速模式";
    els.engineDescription.textContent="WebGPU + WebLLM；Qwen 約 290MB，模型存在手機瀏覽器快取。";
    els.loadModelBtn.textContent=isModelInstalled()?"從本機啟動 AI":"下載／啟動 AI（約 290MB）";
    els.progressText.textContent=isModelInstalled()?"模型已在手機裡，目前尚未載入 RAM。":"尚未下載 GPU 模型";
  }else{
    els.modeBadge.textContent="CPU 相容模式";
    els.engineDescription.textContent="沒有 WebGPU 時改用 CPU/WASM；完全本機但較慢。";
    els.loadModelBtn.textContent=isModelInstalled()?"從本機啟動 AI":"下載 CPU 版 AI（約 520MB）";
    els.progressText.textContent=isModelInstalled()?"模型已在手機裡，待載入 RAM。":"首次下載約 520MB";
  }
}

async function renderDeviceStats(){
  const e=navigator.storage?.estimate?await navigator.storage.estimate():null;
  const used=e?.usage?`${(e.usage/1048576).toFixed(0)} MB`:"未知";
  const quota=e?.quota?`${(e.quota/1073741824).toFixed(1)} GB`:"未知";
  els.deviceStats.innerHTML=[
    stat("WebGPU",navigator.gpu?"支援":"不支援",navigator.gpu?"ok":"warn"),
    stat("CPU/WASM 備援","支援","ok"),stat("PWA 模式",isStandalone()?"已安裝":"瀏覽器",isStandalone()?"ok":"warn"),
    stat("CPU 執行緒",navigator.hardwareConcurrency??"未知"),stat("網站已用空間",used),stat("網站可用額度",quota)
  ].join("");
}

function renderAIStats(){
  const p=getModelProfile(),installed=isModelInstalled(),ready=isModelReady(),stored=getStoredBackend();
  const rows=[
    stat("模型","Qwen2.5 0.5B"),stat("本機安裝",installed?"已下載到手機":"尚未下載",installed?"ok":"warn"),
    stat("儲存位置",installed?getStorageLocation():"—"),stat("目前模型容量",p.download),
    stat("下載時引擎",stored==="wasm"?"CPU/WASM":stored==="webgpu"?"WebGPU":"尚未"),
    stat("目前引擎",p.mode,ready?"ok":""),stat("執行狀態",ready?"已載入 RAM，可聊天":installed?"已下載，待啟動":"未啟動",ready?"ok":"warn"),
    stat("量化",p.quant)
  ];
  if(modelInventory){
    const cpu=modelInventory.cpu.installed?"已安裝":modelInventory.cpu.partial?"部分殘留":"未發現";
    const gpu=modelInventory.gpu.installed?"已安裝":modelInventory.gpu.partial?"部分殘留":"未發現";
    rows.push(stat("GPU Q4F16 版",gpu,modelInventory.gpu.installed?"ok":modelInventory.gpu.partial?"warn":""));
    rows.push(stat("CPU/WASM Q8 版",cpu,(modelInventory.cpu.installed||modelInventory.cpu.partial)?"warn":""));
    rows.push(stat("完整模型版本",`${modelInventory.packageCount} 套`,modelInventory.packageCount>1?"warn":"ok"));
    rows.push(stat("精確重複檔",modelInventory.exactDuplicateUrls.length?`${modelInventory.exactDuplicateUrls.length} 個`:"未發現",modelInventory.exactDuplicateUrls.length?"danger":"ok"));
  }
  els.aiStats.innerHTML=rows.join("");
}

async function refreshModelInventory(){
  els.modelScanBtn.disabled=true;els.modelScanBtn.textContent="掃描中…";
  try{
    modelInventory=await scanModelInventory();renderAIStats();
    const hasCpu=modelInventory.cpu.installed||modelInventory.cpu.partial;
    els.cleanupCpuBtn.classList.toggle("hidden",!hasCpu||!navigator.gpu);
    if(modelInventory.exactDuplicateUrls.length) els.modelScanNote.textContent=`發現 ${modelInventory.exactDuplicateUrls.length} 個完全相同的重複快取檔。`;
    else if(modelInventory.gpu.installed&&hasCpu) els.modelScanNote.textContent=modelInventory.cpu.installed?"GPU 與 CPU/WASM 兩套格式並存；不會打架，可清理 CPU 版。":"GPU 完整；另有 CPU/WASM 部分殘留，可清理。";
    else els.modelScanNote.textContent="目前沒有偵測到模型衝突或重複檔。";
  }catch(e){els.modelScanNote.textContent=`掃描失敗：${e.message||e}`;}
  finally{els.modelScanBtn.disabled=false;els.modelScanBtn.textContent="重新掃描本機模型";}
}

async function startModel(){
  els.loadModelBtn.disabled=true;els.modeBadge.textContent="AI 啟動中";
  setProgress(.01,preferredBackend()==="webgpu"?"準備 WebLLM…":"準備 CPU/WASM…");
  try{
    await loadModel(r=>setProgress(r.progress??0,r.text||"下載／載入模型…"));
    setProgress(1,"AI 已就緒｜模型已載入 RAM");
    els.modeBadge.textContent=getBackendMode()==="webgpu"?"WebGPU AI 已啟動":"CPU/WASM AI 已啟動";
    els.modeBadge.classList.add("ok");els.chatInput.disabled=false;els.sendBtn.disabled=false;els.unloadBtn.disabled=false;els.loadModelBtn.textContent="AI 已啟動";
    await refreshModelInventory();await renderDeviceStats();
  }catch(e){els.loadModelBtn.disabled=false;els.modeBadge.textContent="啟動失敗";setProgress(0,e.message||String(e));}
}

async function getSafeReply(userText){
  const first=await chat(history,()=>{});
  let result=first;
  if(looksLikeRefusal(first.output)){
    result=await chat([
      {role:"system",content:CHAT_SYSTEM_PROMPT+"\n上一輪可能誤判。請重新理解使用者原句；若是一般知識問題直接回答。"},
      {role:"user",content:userText}
    ],()=>{},{max_tokens:240,temperature:.45});
  }
  result.output=await taiwanize(result.output);
  return result;
}

async function sendChat(e){
  e.preventDefault();const text=els.chatInput.value.trim();if(!text||!isModelReady())return;
  els.chatInput.value="";addMessage("user",text);history.push({role:"user",content:text});
  const reply=addMessage("assistant","生成中…");els.sendBtn.disabled=true;
  try{
    const result=await getSafeReply(text);reply.textContent=result.output;history.push({role:"assistant",content:result.output});
    const first=result.firstTokenMs?`首字 ${result.firstTokenMs}ms｜`:"";
    els.perfText.textContent=`${first}總耗時 ${result.totalMs}ms｜${result.runtime||getModelProfile().mode}`;
  }catch(err){reply.textContent=`錯誤：${err.message||err}`;}finally{els.sendBtn.disabled=false;}
}

async function renderTasks(){
  const tasks=await listTasks();
  els.taskList.innerHTML=tasks.length?tasks.map(t=>`<div class="task ${t.done?"done":""}" data-id="${t.id}"><input type="checkbox" ${t.done?"checked":""}><span class="task-title">${escapeHTML(t.title)}</span><button class="ghost task-delete">刪除</button></div>`).join(""):'<p class="muted">目前沒有待辦。</p>';
}
function escapeHTML(s){return String(s).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));}

async function executeAgent(){
  if(!isModelReady()) throw new Error("請先啟動 Qwen");
  const input=els.agentInput.value.trim();if(!input)return;
  els.agentResult.textContent="AI 判斷中…";
  const plan=await planToolCall(chat,input);
  let result="未執行工具";
  if(plan.tool==="task.create"){await addTask(plan.args?.title||input);await renderTasks();result="已新增待辦";}
  else if(plan.tool==="task.complete"){
    const tasks=await listTasks(),q=plan.args?.title||"";const found=tasks.find(t=>!t.done&&t.title.includes(q));
    if(found){await toggleTask(found.id);await renderTasks();result=`已完成：${found.title}`;}else result="找不到符合的未完成待辦";
  }else if(plan.tool==="page.open"){showPage(plan.args?.target||"home");result=`已切換到 ${plan.args?.target||"home"}`;}
  else if(plan.tool==="camera.open"){showPage("vision");await startCamera(els.cameraVideo);result="已開啟相機";}
  els.agentResult.textContent=JSON.stringify({plan,result},null,2);
}

async function visionAnalyze(type){
  els.visionResult.textContent=`${type} 模型載入／分析中…`;
  try{const r=await analyzeVision(type,els.cameraVideo);els.visionResult.textContent=JSON.stringify(r,null,2);}catch(e){els.visionResult.textContent=`錯誤：${e.message||e}`;}
}

async function vlmAnalyze(){
  const blob=lastVisionBlob||els.visionFile.files?.[0];if(!blob){els.vlmResult.textContent="請先拍照或選圖片";return;}
  els.vlmResult.textContent="SmolVLM 分析中…";
  try{
    let text=await analyzeImage(blob,els.visionPrompt.value, s=>els.vlmStatus.textContent=s);
    if(isModelReady()){
      const translated=await chat([{role:"system",content:CHAT_SYSTEM_PROMPT},{role:"user",content:`將以下圖片分析整理成台灣繁體中文，保留事實：\n${text}`}],()=>{},{max_tokens:180,temperature:.2});
      text=translated.output;
    }
    els.vlmResult.textContent=await taiwanize(text);
  }catch(e){els.vlmResult.textContent=`錯誤：${e.message||e}`;}
}

function setupInstallUI(){
  els.installHint.textContent=isStandalone()?"已用 PWA 模式執行；模型與程式更新分開管理。":/iphone|ipad|ipod/i.test(navigator.userAgent)?"iPhone：Safari 分享 → 加入主畫面。":"可安裝成 PWA。";
}

async function init(){
  els.versionLabel.textContent=`v${APP_VERSION}`;renderFeatureGrid();setupInstallUI();configureEngineUI();
  await renderDeviceStats();renderAIStats();await refreshModelInventory();await renderTasks();taiwanize("初始化");

  els.tabs.addEventListener("click",e=>{const b=e.target.closest("button[data-page]");if(b)showPage(b.dataset.page);});

  await setupPWA({
    onUpdate:reg=>{updateRegistration=reg;els.updateBtn.textContent="立即更新";els.updateStatus.textContent=`目前 v${APP_VERSION}｜新版已準備完成`;},
    onInstallReady:()=>els.installBtn.classList.remove("hidden"),
    onControllerChange:()=>{if(!reloadingForUpdate){reloadingForUpdate=true;location.reload();}}
  });
  const remote=await getRemoteVersion();els.updateStatus.textContent=remote&&remote!==APP_VERSION?`目前 v${APP_VERSION}｜最新 v${remote}`:`目前 v${APP_VERSION}｜已是最新版`;

  els.updateBtn.onclick=async()=>{
    if(updateRegistration?.waiting){applyUpdate(updateRegistration);return;}
    els.updateBtn.disabled=true;els.updateBtn.textContent="檢查中…";const r=await checkForUpdate();
    if(r.waiting){updateRegistration=r.registration;els.updateBtn.textContent="立即更新";els.updateStatus.textContent=`目前 v${APP_VERSION}｜新版已準備完成`;}
    else if(r.hasUpdate){els.updateBtn.textContent="重新整理更新";els.updateStatus.textContent=`目前 v${APP_VERSION}｜最新 v${r.remoteVersion}`;}
    else{els.updateBtn.textContent="檢查更新";els.updateStatus.textContent=`目前 v${APP_VERSION}｜已是最新版`;}
    els.updateBtn.disabled=false;
  };
  els.installBtn.onclick=async()=>{if(await promptInstall())els.installBtn.classList.add("hidden");};

  els.loadModelBtn.onclick=startModel;
  els.unloadBtn.onclick=async()=>{await unloadModel();els.chatInput.disabled=true;els.sendBtn.disabled=true;els.unloadBtn.disabled=true;els.loadModelBtn.disabled=false;els.modeBadge.classList.remove("ok");configureEngineUI();renderAIStats();};
  els.modelScanBtn.onclick=refreshModelInventory;
  els.cleanupCpuBtn.onclick=async()=>{if(!confirm("清理 CPU/WASM Qwen 快取？GPU 版會保留。"))return;const r=await deleteCPUModelCache();els.modelScanNote.textContent=`已清理 ${r.deletedEntries} 個 CPU/WASM 快取檔。`;await refreshModelInventory();await renderDeviceStats();};

  els.chatForm.onsubmit=sendChat;els.clearChatBtn.onclick=()=>{history.splice(1);els.messages.innerHTML='<div class="message assistant">對話已清除。</div>';};
  els.agentRunBtn.onclick=()=>executeAgent().catch(e=>els.agentResult.textContent=`錯誤：${e.message||e}`);

  els.taskForm.onsubmit=async e=>{e.preventDefault();const t=els.taskInput.value.trim();if(!t)return;await addTask(t);els.taskInput.value="";await renderTasks();};
  els.taskList.onclick=async e=>{const row=e.target.closest(".task");if(!row)return;if(e.target.matches('input[type="checkbox"]'))await toggleTask(row.dataset.id);if(e.target.closest(".task-delete"))await deleteTask(row.dataset.id);await renderTasks();};

  els.whisperLoadBtn.onclick=async()=>{els.voiceStatus.textContent="載入 Whisper…";try{await loadWhisper(r=>els.voiceStatus.textContent=r?.file||r?.status||"下載中…");els.voiceStatus.textContent="Whisper 已就緒";}catch(e){els.voiceStatus.textContent=`錯誤：${e.message||e}`;}};
  els.recordBtn.onclick=async()=>{try{await startRecording();els.recordBtn.disabled=true;els.stopRecordBtn.disabled=false;els.voiceStatus.textContent="錄音中…";}catch(e){els.voiceStatus.textContent=`錯誤：${e.message||e}`;}};
  els.stopRecordBtn.onclick=async()=>{els.stopRecordBtn.disabled=true;els.voiceStatus.textContent="轉錄中…";try{const t=await stopAndTranscribe(r=>els.voiceStatus.textContent=r?.file||r?.status||"處理中…");els.voiceResult.textContent=await taiwanize(t);els.voiceStatus.textContent="完成";}catch(e){els.voiceResult.textContent=`錯誤：${e.message||e}`;}finally{els.recordBtn.disabled=false;}};

  els.cameraStartBtn.onclick=()=>startCamera(els.cameraVideo).catch(e=>els.visionResult.textContent=`錯誤：${e.message||e}`);
  els.cameraStopBtn.onclick=()=>stopCamera(els.cameraVideo);
  document.querySelectorAll("[data-vision]").forEach(b=>b.onclick=()=>visionAnalyze(b.dataset.vision));
  els.cameraCaptureBtn.onclick=async()=>{try{lastVisionBlob=await captureCamera(els.cameraVideo,els.cameraCanvas);els.cameraCanvas.classList.remove("hidden");els.vlmStatus.textContent="已拍照，可交給 SmolVLM。";}catch(e){els.vlmStatus.textContent=`錯誤：${e.message||e}`;}};
  els.visionFile.onchange=()=>{lastVisionBlob=els.visionFile.files?.[0]||null;};
  els.vlmLoadBtn.onclick=async()=>{els.vlmStatus.textContent="載入 SmolVLM…";try{await loadVLM(s=>els.vlmStatus.textContent=s);els.vlmStatus.textContent="SmolVLM 已就緒";}catch(e){els.vlmStatus.textContent=`錯誤：${e.message||e}`;}};
  els.vlmAnalyzeBtn.onclick=vlmAnalyze;

  els.imageFile.onchange=async()=>{const f=els.imageFile.files?.[0];if(f)await loadImageToCanvas(f,els.imageCanvas);};
  els.grayBtn.onclick=()=>grayscaleCanvas(els.imageCanvas);els.exportImageBtn.onclick=()=>exportCanvas(els.imageCanvas);
  els.audioPlayBtn.onclick=async()=>{const f=els.audioFile.files?.[0];if(!f)return;try{audioPlayback?.ctx?.close();audioPlayback=await playAudioFile(f,Number(els.audioGain.value),Number(els.audioRate.value));els.audioStatus.textContent=`播放中｜${audioPlayback.duration.toFixed(1)} 秒`;}catch(e){els.audioStatus.textContent=`錯誤：${e.message||e}`;}};
  els.videoFile.onchange=()=>{const f=els.videoFile.files?.[0];if(f)loadVideo(f,els.videoPreview);};
  els.videoPreview.onloadedmetadata=()=>{els.videoSeek.max=String(els.videoPreview.duration||100);};
  els.videoSeek.oninput=()=>{els.videoPreview.currentTime=Number(els.videoSeek.value);};els.frameBtn.onclick=()=>captureVideoFrame(els.videoPreview,els.frameCanvas);

  els.opfsWriteBtn.onclick=async()=>{try{const n=await writeOPFSDemo(els.opfsText.value);els.opfsResult.textContent=`已寫入：${n}`;}catch(e){els.opfsResult.textContent=`錯誤：${e.message||e}`;}};
  els.opfsReadBtn.onclick=async()=>{try{els.opfsResult.textContent=await readOPFSDemo();}catch(e){els.opfsResult.textContent=`錯誤：${e.message||e}`;}};
  els.offerBtn.onclick=async()=>{try{els.localSdp.value=await createPeerOffer(m=>els.peerResult.textContent=`收到：${m}`);els.peerResult.textContent="邀請已建立，把 SDP 給另一台裝置。";}catch(e){els.peerResult.textContent=`錯誤：${e.message||e}`;}};
  els.applySdpBtn.onclick=async()=>{try{const answer=await applyRemoteDescription(els.remoteSdp.value,m=>els.peerResult.textContent=`收到：${m}`);if(answer)els.localSdp.value=answer;els.peerResult.textContent="已套用對方 SDP。";}catch(e){els.peerResult.textContent=`錯誤：${e.message||e}`;}};
  els.peerSendBtn.onclick=()=>{try{sendPeerMessage(els.peerMsg.value);els.peerResult.textContent="已傳送";}catch(e){els.peerResult.textContent=`錯誤：${e.message||e}`;}};

  els.gpuStartBtn.onclick=()=>startWebGLDemo(els.gpuCanvas,els.gpuStatus);
  els.benchmarkBtn.onclick=async()=>{if(!isModelReady()){els.benchmarkResult.textContent="請先啟動 Qwen";return;}els.benchmarkResult.textContent="測試中…";try{const r=await runLLMBenchmark(chat);r.output=await taiwanize(r.output);els.benchmarkResult.textContent=JSON.stringify(r,null,2);}catch(e){els.benchmarkResult.textContent=`錯誤：${e.message||e}`;}};
  els.offlineCheckBtn.onclick=async()=>{const r=await runOfflineChecks(scanModelInventory);els.offlineResult.innerHTML=r.map(([a,b])=>stat(a,b,b.includes("支援")||b.includes("已")?"ok":"")).join("");};
}
init();
