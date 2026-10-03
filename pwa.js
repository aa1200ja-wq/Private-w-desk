export const APP_VERSION = "0.1.0";
let deferredInstall = null;
let registration = null;

export function isStandalone() {
  return window.matchMedia("(display-mode: standalone)").matches || window.navigator.standalone === true;
}

export async function setupPWA({ onUpdate, onInstallReady, onControllerChange }) {
  window.addEventListener("beforeinstallprompt", (event) => {
    event.preventDefault();
    deferredInstall = event;
    onInstallReady?.();
  });

  if (!("serviceWorker" in navigator)) return null;
  registration = await navigator.serviceWorker.register("./sw.js", { updateViaCache: "none" });
  await registration.update().catch(() => {});

  if (registration.waiting) onUpdate?.(registration);
  registration.addEventListener("updatefound", () => {
    const installing = registration.installing;
    installing?.addEventListener("statechange", () => {
      if (installing.state === "installed" && navigator.serviceWorker.controller) onUpdate?.(registration);
    });
  });
  navigator.serviceWorker.addEventListener("controllerchange", () => onControllerChange?.());
  return registration;
}

export async function promptInstall() {
  if (!deferredInstall) return false;
  await deferredInstall.prompt();
  const result = await deferredInstall.userChoice;
  deferredInstall = null;
  return result.outcome === "accepted";
}

export function applyUpdate(reg = registration) {
  reg?.waiting?.postMessage({ type: "SKIP_WAITING" });
}

export async function getRemoteVersion() {
  try {
    const res = await fetch(`./version.json?t=${Date.now()}`, { cache: "no-store" });
    if (!res.ok) return null;
    return (await res.json()).version ?? null;
  } catch (_) { return null; }
}
