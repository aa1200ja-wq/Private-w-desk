const VERSION="1.0.1";
const WASM=`https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@${VERSION}/wasm`;
const MODELS={
  face:"https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task",
  hand:"https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task",
  gesture:"https://storage.googleapis.com/mediapipe-models/gesture_recognizer/gesture_recognizer/float16/1/gesture_recognizer.task",
  pose:"https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task",
};
let lib=null, fileset=null, instances={}, stream=null;

async function getLib(){
  if(!lib) lib=await import(`https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@${VERSION}/+esm`);
  if(!fileset) fileset=await lib.FilesetResolver.forVisionTasks(WASM);
  return lib;
}

export async function startCamera(video){
  if(stream) return stream;
  stream=await navigator.mediaDevices.getUserMedia({video:{facingMode:"user"},audio:false});
  video.srcObject=stream; await video.play(); return stream;
}
export function stopCamera(video){
  stream?.getTracks().forEach(t=>t.stop()); stream=null;
  if(video) video.srcObject=null;
}

async function instance(type){
  if(instances[type]) return instances[type];
  const L=await getLib();
  const baseOptions={modelAssetPath:MODELS[type],delegate:"GPU"};
  try{
    if(type==="face") instances[type]=await L.FaceLandmarker.createFromOptions(fileset,{baseOptions,runningMode:"IMAGE",numFaces:1});
    if(type==="hand") instances[type]=await L.HandLandmarker.createFromOptions(fileset,{baseOptions,runningMode:"IMAGE",numHands:2});
    if(type==="gesture") instances[type]=await L.GestureRecognizer.createFromOptions(fileset,{baseOptions,runningMode:"IMAGE",numHands:2});
    if(type==="pose") instances[type]=await L.PoseLandmarker.createFromOptions(fileset,{baseOptions,runningMode:"IMAGE",numPoses:1});
  }catch(_){
    baseOptions.delegate="CPU";
    if(type==="face") instances[type]=await L.FaceLandmarker.createFromOptions(fileset,{baseOptions,runningMode:"IMAGE",numFaces:1});
    if(type==="hand") instances[type]=await L.HandLandmarker.createFromOptions(fileset,{baseOptions,runningMode:"IMAGE",numHands:2});
    if(type==="gesture") instances[type]=await L.GestureRecognizer.createFromOptions(fileset,{baseOptions,runningMode:"IMAGE",numHands:2});
    if(type==="pose") instances[type]=await L.PoseLandmarker.createFromOptions(fileset,{baseOptions,runningMode:"IMAGE",numPoses:1});
  }
  return instances[type];
}

export async function preloadVision(type){ await instance(type); return true; }\nexport function getVisionStatus(){ return Object.fromEntries(["face","hand","gesture","pose"].map(k=>[k,Boolean(instances[k])])); }\n\nexport async function analyzeVision(type, source){
  const m=await instance(type);
  const r= type==="gesture" ? m.recognize(source) : m.detect(source);
  if(type==="face") return {faces:r.faceLandmarks?.length||0,landmarks:r.faceLandmarks?.[0]?.length||0};
  if(type==="hand") return {hands:r.landmarks?.length||0,landmarks:r.landmarks?.[0]?.length||0};
  if(type==="gesture") return {hands:r.gestures?.length||0,gesture:r.gestures?.[0]?.[0]?.categoryName||"None",score:r.gestures?.[0]?.[0]?.score||0};
  if(type==="pose") return {poses:r.landmarks?.length||0,landmarks:r.landmarks?.[0]?.length||0};
  return {};
}

export function captureCamera(video,canvas){
  const w=video.videoWidth||640,h=video.videoHeight||480;
  canvas.width=w; canvas.height=h; canvas.getContext("2d").drawImage(video,0,0,w,h);
  return new Promise(resolve=>canvas.toBlob(resolve,"image/jpeg",.9));
}
