const DB_NAME="private-w-desk";
const DB_VERSION=2;
let dbPromise=null;

function db(){
  if(!dbPromise){
    dbPromise=new Promise((resolve,reject)=>{
      const req=indexedDB.open(DB_NAME,DB_VERSION);
      req.onupgradeneeded=()=>{
        const d=req.result;
        if(!d.objectStoreNames.contains("tasks")){
          const s=d.createObjectStore("tasks",{keyPath:"id",autoIncrement:true});
          s.createIndex("createdAt","createdAt");
        }
        if(!d.objectStoreNames.contains("kv")) d.createObjectStore("kv");
        if(!d.objectStoreNames.contains("agentRuns")){
          const s=d.createObjectStore("agentRuns",{keyPath:"id",autoIncrement:true});
          s.createIndex("createdAt","createdAt");
        }
      };
      req.onsuccess=()=>resolve(req.result);
      req.onerror=()=>reject(req.error);
    });
  }
  return dbPromise;
}

export async function addTask(title){
  const d=await db();
  return new Promise((resolve,reject)=>{
    const req=d.transaction("tasks","readwrite").objectStore("tasks").add({title,done:false,createdAt:Date.now()});
    req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error);
  });
}
export async function listTasks(){
  const d=await db();
  return new Promise((resolve,reject)=>{
    const req=d.transaction("tasks","readonly").objectStore("tasks").getAll();
    req.onsuccess=()=>resolve(req.result.sort((a,b)=>b.createdAt-a.createdAt));req.onerror=()=>reject(req.error);
  });
}
export async function toggleTask(id){
  const d=await db();
  return new Promise((resolve,reject)=>{
    const t=d.transaction("tasks","readwrite"),s=t.objectStore("tasks"),g=s.get(Number(id));
    g.onsuccess=()=>{const x=g.result;if(!x)return; x.done=!x.done;s.put(x);};
    t.oncomplete=()=>resolve(true);t.onerror=()=>reject(t.error);
  });
}
export async function completeTaskByQuery(query){
  const tasks=await listTasks();
  const q=String(query||"").trim();
  const item=tasks.find(t=>!t.done && (!q || t.title.includes(q)));
  if(!item)return null;
  await toggleTask(item.id);
  return {...item,done:true};
}
export async function deleteTask(id){
  const d=await db();
  return new Promise((resolve,reject)=>{
    const req=d.transaction("tasks","readwrite").objectStore("tasks").delete(Number(id));
    req.onsuccess=()=>resolve(true);req.onerror=()=>reject(req.error);
  });
}
export async function deleteTaskByQuery(query){
  const tasks=await listTasks(),q=String(query||"").trim();
  const item=tasks.find(t=>!q||t.title.includes(q));
  if(!item)return null; await deleteTask(item.id); return item;
}
export async function addAgentRun(run){
  const d=await db();
  return new Promise((resolve,reject)=>{
    const req=d.transaction("agentRuns","readwrite").objectStore("agentRuns").add({...run,createdAt:Date.now()});
    req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error);
  });
}
export async function listAgentRuns(limit=50){
  const d=await db();
  return new Promise((resolve,reject)=>{
    const req=d.transaction("agentRuns","readonly").objectStore("agentRuns").getAll();
    req.onsuccess=()=>resolve(req.result.sort((a,b)=>b.createdAt-a.createdAt).slice(0,limit));
    req.onerror=()=>reject(req.error);
  });
}
export async function clearAgentRuns(){
  const d=await db();
  return new Promise((resolve,reject)=>{
    const req=d.transaction("agentRuns","readwrite").objectStore("agentRuns").clear();
    req.onsuccess=()=>resolve(true);req.onerror=()=>reject(req.error);
  });
}
export async function setKV(key,value){
  const d=await db();return new Promise((resolve,reject)=>{const r=d.transaction("kv","readwrite").objectStore("kv").put(value,key);r.onsuccess=()=>resolve(true);r.onerror=()=>reject(r.error);});
}
export async function getKV(key){
  const d=await db();return new Promise((resolve,reject)=>{const r=d.transaction("kv","readonly").objectStore("kv").get(key);r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});
}
