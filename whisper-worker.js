import { pipeline, env } from "https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.8.1";
const MODEL="Xenova/whisper-tiny";
let pipe=null, loading=null;
env.allowLocalModels=false;
env.useBrowserCache=true;
env.useWasmCache=true;

async function getPipe(){
  if(pipe) return pipe;
  if(!loading){
    loading=pipeline("automatic-speech-recognition",MODEL,{
      device:"wasm",dtype:"q8",
      progress_callback:(report)=>self.postMessage({type:"progress",report})
    }).then(p=>{pipe=p;self.postMessage({type:"ready"});return p;}).finally(()=>loading=null);
  }
  return loading;
}

self.onmessage=async({data})=>{
  try{
    if(data.type==="load"){ await getPipe(); return; }
    if(data.type==="transcribe"){
      const p=await getPipe();
      const result=await p(new Float32Array(data.audio),{language:"chinese",task:"transcribe"});
      self.postMessage({type:"result",text:result.text||""});
    }
  }catch(e){self.postMessage({type:"error",message:e?.message||String(e)});}
};
