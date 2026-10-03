let pc=null, channel=null;

export async function createPeerOffer(onMessage) {
  pc = new RTCPeerConnection();
  channel = pc.createDataChannel("pwd");
  channel.onmessage = e => onMessage?.(e.data);
  await pc.setLocalDescription(await pc.createOffer());
  await waitIce(pc);
  return JSON.stringify(pc.localDescription);
}

export async function applyRemoteDescription(text, onMessage) {
  if (!pc) {
    pc = new RTCPeerConnection();
    pc.ondatachannel = e => {
      channel=e.channel;
      channel.onmessage = ev => onMessage?.(ev.data);
    };
  }
  const desc=JSON.parse(text);
  await pc.setRemoteDescription(desc);
  if(desc.type==="offer"){
    await pc.setLocalDescription(await pc.createAnswer());
    await waitIce(pc);
    return JSON.stringify(pc.localDescription);
  }
  return "";
}

function waitIce(peer){
  if(peer.iceGatheringState==="complete") return Promise.resolve();
  return new Promise(resolve=>{
    const f=()=>{ if(peer.iceGatheringState==="complete"){peer.removeEventListener("icegatheringstatechange",f); resolve();}};
    peer.addEventListener("icegatheringstatechange",f);
    setTimeout(resolve,5000);
  });
}

export function sendPeerMessage(text){
  if(!channel || channel.readyState!=="open") throw new Error("P2P 尚未連線");
  channel.send(text);
}
