export function loadImageToCanvas(file,canvas){
  return new Promise((resolve,reject)=>{
    const img=new Image(), url=URL.createObjectURL(file);
    img.onload=()=>{canvas.width=img.naturalWidth;canvas.height=img.naturalHeight;canvas.getContext("2d").drawImage(img,0,0);URL.revokeObjectURL(url);resolve();};
    img.onerror=reject;img.src=url;
  });
}
export function grayscaleCanvas(canvas){
  const c=canvas.getContext("2d"),d=c.getImageData(0,0,canvas.width,canvas.height);
  for(let i=0;i<d.data.length;i+=4){const y=.299*d.data[i]+.587*d.data[i+1]+.114*d.data[i+2];d.data[i]=d.data[i+1]=d.data[i+2]=y;}
  c.putImageData(d,0,0);
}
export function exportCanvas(canvas){
  const a=document.createElement("a");a.download="private-w-desk.png";a.href=canvas.toDataURL("image/png");a.click();
}
export async function playAudioFile(file,gainValue=1,rate=1){
  const ctx=new (window.AudioContext||window.webkitAudioContext)();
  const buf=await ctx.decodeAudioData(await file.arrayBuffer());
  const src=ctx.createBufferSource(),gain=ctx.createGain();src.buffer=buf;src.playbackRate.value=rate;gain.gain.value=gainValue;
  src.connect(gain).connect(ctx.destination);src.start();return {ctx,src,duration:buf.duration};
}
export function loadVideo(file,video){
  const url=URL.createObjectURL(file);video.src=url;video.load();return url;
}
export function captureVideoFrame(video,canvas){
  canvas.width=video.videoWidth||640;canvas.height=video.videoHeight||360;
  canvas.getContext("2d").drawImage(video,0,0,canvas.width,canvas.height);
}
