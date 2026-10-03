let worker=null,pending=null,ready=false;
function ensure(onStatus){
  if(worker) return;
  worker=new Worker(new URL("../smolvlm-worker.js",import.meta.url),{type:"module"});
  worker.onmessage=({data})=>{
    if(data.type==="status") onStatus?.(data.text);
    if(data.type==="progress") onStatus?.(data.report?.status||data.report?.file||"下載中…");
    if(data.type==="ready"){ ready=true; pending?.resolve?.("ready"); }
    if(data.type==="result") pending?.resolve?.(data.text);
    if(data.type==="error") pending?.reject?.(new Error(data.message));
  };
}
export function loadVLM(onStatus){
  if(!navigator.gpu) return Promise.reject(new Error("SmolVLM 此版需要 WebGPU"));
  ensure(onStatus);return new Promise((resolve,reject)=>{pending={resolve,reject};worker.postMessage({type:"load"});});
}
export function analyzeImage(blob,prompt,onStatus){
  if(!navigator.gpu) return Promise.reject(new Error("SmolVLM 此版需要 WebGPU"));
  ensure(onStatus);return new Promise((resolve,reject)=>{pending={resolve,reject};worker.postMessage({type:"analyze",blob,prompt});});
}
export function isVLMReady(){return ready;}\nexport function unloadVLM(){worker?.terminate();worker=null;pending=null;ready=false;}
