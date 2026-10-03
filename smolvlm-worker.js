import {
  AutoProcessor, AutoModelForVision2Seq, RawImage
} from "https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.8.1";

const MODEL="HuggingFaceTB/SmolVLM-256M-Instruct";
let processor=null,model=null,loading=null;

async function load(){
  if(model&&processor) return;
  if(!loading){
    loading=(async()=>{
      self.postMessage({type:"status",text:"載入 SmolVLM processor…"});
      processor=await AutoProcessor.from_pretrained(MODEL);
      self.postMessage({type:"status",text:"下載／載入 SmolVLM 256M…"});
      model=await AutoModelForVision2Seq.from_pretrained(MODEL,{
        dtype:{embed_tokens:"q4",vision_encoder:"q4",decoder_model_merged:"q4"},
        device:"webgpu",
        progress_callback:r=>self.postMessage({type:"progress",report:r}),
      });
      self.postMessage({type:"ready"});
    })().finally(()=>loading=null);
  }
  return loading;
}

self.onmessage=async({data})=>{
  try{
    if(data.type==="load"){await load();return;}
    if(data.type==="analyze"){
      await load();
      const image=await RawImage.fromBlob(data.blob);
      const messages=[{role:"user",content:[{type:"image"},{type:"text",text:data.prompt||"Describe this image briefly."}]}];
      const text=processor.apply_chat_template(messages,{add_generation_prompt:true});
      const inputs=await processor(text,[image],{do_image_splitting:false});
      const ids=await model.generate({...inputs,max_new_tokens:96});
      const start=inputs.input_ids.dims.at(-1);
      const decoded=processor.batch_decode(ids.slice(null,[start,null]),{skip_special_tokens:true});
      self.postMessage({type:"result",text:decoded[0]||""});
    }
  }catch(e){self.postMessage({type:"error",message:e?.message||String(e)});}
};
