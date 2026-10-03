export async function runOfflineChecks(scanModelInventory) {
  const out = [];
  out.push(["目前網路", navigator.onLine ? "線上" : "離線"]);
  out.push(["Service Worker", navigator.serviceWorker?.controller ? "已接管" : "未接管"]);
  out.push(["Cache Storage", "caches" in window ? "支援" : "不支援"]);
  out.push(["IndexedDB", "indexedDB" in window ? "支援" : "不支援"]);
  out.push(["OPFS", navigator.storage?.getDirectory ? "支援" : "不支援"]);
  try {
    const inv = await scanModelInventory();
    out.push(["GPU 模型快取", inv.gpu.installed ? "已安裝" : inv.gpu.partial ? "部分殘留" : "未安裝"]);
    out.push(["CPU 模型快取", inv.cpu.installed ? "已安裝" : inv.cpu.partial ? "部分殘留" : "未安裝"]);
  } catch (_) {
    out.push(["模型快取", "檢查失敗"]);
  }
  try {
    const keys = await caches.keys();
    out.push(["Cache 數量", String(keys.length)]);
  } catch (_) {}
  return out;
}
