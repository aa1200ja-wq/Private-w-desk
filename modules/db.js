const DB_NAME = "private-w-desk";
const DB_VERSION = 1;
let dbPromise = null;

function db() {
  if (!dbPromise) {
    dbPromise = new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = () => {
        const d = req.result;
        if (!d.objectStoreNames.contains("tasks")) {
          const store = d.createObjectStore("tasks", { keyPath: "id", autoIncrement: true });
          store.createIndex("createdAt", "createdAt");
        }
        if (!d.objectStoreNames.contains("kv")) d.createObjectStore("kv");
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }
  return dbPromise;
}

function tx(storeName, mode, fn) {
  return db().then(d => new Promise((resolve, reject) => {
    const t = d.transaction(storeName, mode);
    const store = t.objectStore(storeName);
    let result;
    try { result = fn(store); } catch (e) { reject(e); return; }
    t.oncomplete = () => resolve(result);
    t.onerror = () => reject(t.error);
  }));
}

export async function addTask(title) {
  const d = await db();
  return new Promise((resolve,reject) => {
    const t = d.transaction("tasks","readwrite");
    const req = t.objectStore("tasks").add({ title, done:false, createdAt:Date.now() });
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function listTasks() {
  const d = await db();
  return new Promise((resolve,reject) => {
    const req = d.transaction("tasks","readonly").objectStore("tasks").getAll();
    req.onsuccess = () => resolve(req.result.sort((a,b)=>b.createdAt-a.createdAt));
    req.onerror = () => reject(req.error);
  });
}

export async function toggleTask(id) {
  const d = await db();
  return new Promise((resolve,reject) => {
    const t = d.transaction("tasks","readwrite");
    const s = t.objectStore("tasks");
    const get = s.get(Number(id));
    get.onsuccess = () => {
      const item = get.result;
      if (!item) return resolve(false);
      item.done = !item.done;
      s.put(item);
    };
    t.oncomplete = () => resolve(true);
    t.onerror = () => reject(t.error);
  });
}

export async function deleteTask(id) {
  return tx("tasks","readwrite", s => s.delete(Number(id)));
}

export async function setKV(key, value) {
  const d = await db();
  return new Promise((resolve,reject) => {
    const req=d.transaction("kv","readwrite").objectStore("kv").put(value,key);
    req.onsuccess=()=>resolve(true); req.onerror=()=>reject(req.error);
  });
}

export async function getKV(key) {
  const d = await db();
  return new Promise((resolve,reject) => {
    const req=d.transaction("kv","readonly").objectStore("kv").get(key);
    req.onsuccess=()=>resolve(req.result); req.onerror=()=>reject(req.error);
  });
}

export async function writeOPFSDemo(text) {
  if (!navigator.storage?.getDirectory) throw new Error("此瀏覽器不支援 OPFS");
  const root = await navigator.storage.getDirectory();
  const handle = await root.getFileHandle("private-w-desk-demo.txt", { create:true });
  const writable = await handle.createWritable();
  await writable.write(text);
  await writable.close();
  return "private-w-desk-demo.txt";
}

export async function readOPFSDemo() {
  if (!navigator.storage?.getDirectory) throw new Error("此瀏覽器不支援 OPFS");
  const root = await navigator.storage.getDirectory();
  const handle = await root.getFileHandle("private-w-desk-demo.txt");
  const file = await handle.getFile();
  return file.text();
}
