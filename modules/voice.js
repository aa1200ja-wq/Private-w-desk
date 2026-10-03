let recorder=null, chunks=[], stream=null, worker=null, pending=null, ready=false;

function resample(input, inRate, outRate=16000){
  if(inRate===outRate) return input;
  const ratio=inRate/outRate, length=Math.round(input.length/ratio), out=new Float32Array(length);
  for(let i=0;i<length;i++){
    const pos=i*ratio, a=Math.floor(pos), b=Math.min(a+1,input.length-1), t=pos-a;
    out[i]=input[a]*(1-t)+input[b]*t;
  }
  return out;
}

async function blobTo16k(blob){
  const ctx=new (window.AudioContext||window.webkitAudioContext)();
  const buf=await ctx.decodeAudioData(await blob.arrayBuffer());
  const ch=buf.getChannelData(0);
  const audio=resample(ch,buf.sampleRate,16000);
  await ctx.close();
  return audio;
}

function ensureWorker(onProgress){
  if(worker) return;
  worker=new Worker(new URL("../whisper-worker.js",import.meta.url),{type:"module"});
  worker.onmessage=({data})=>{
    if(data.type==="progress") onProgress?.(data.report);
    if(data.type==="ready"){ ready=true; pending?.resolve?.("ready"); }
    if(data.type==="result") pending?.resolve?.(data.text);
    if(data.type==="error") pending?.reject?.(new Error(data.message));
  };
}

export async function loadWhisper(onProgress){
  ensureWorker(onProgress);
  return new Promise((resolve,reject)=>{
    pending={resolve,reject}; worker.postMessage({type:"load"});
  });
}

export async function startRecording(){
  stream=await navigator.mediaDevices.getUserMedia({audio:true});
  recorder=new MediaRecorder(stream); chunks=[];
  recorder.ondataavailable=e=>{ if(e.data.size) chunks.push(e.data); };
  recorder.start();
}

export async function stopAndTranscribe(onProgress){
  if(!recorder) throw new Error("尚未開始錄音");
  const blob=await new Promise(resolve=>{
    recorder.onstop=()=>resolve(new Blob(chunks,{type:recorder.mimeType||"audio/mp4"}));
    recorder.stop();
  });
  stream?.getTracks().forEach(t=>t.stop()); stream=null; recorder=null;
  const audio=await blobTo16k(blob);
  ensureWorker(onProgress);
  return new Promise((resolve,reject)=>{
    pending={resolve,reject};
    worker.postMessage({type:"transcribe",audio},[audio.buffer]);
  });
}

export function isWhisperReady(){ return ready; }
export function unloadWhisper(){ worker?.terminate(); worker=null; pending=null; ready=false; }
