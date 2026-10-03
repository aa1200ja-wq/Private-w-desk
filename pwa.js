export const APP_VERSION = "0.2.0";
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
  } catch (_) {
    return null;
  }
}

function waitForWaiting(reg, timeout = 5000) {
  return new Promise((resolve) => {
    if (reg?.waiting) return resolve(true);
    const end = Date.now() + timeout;
    const timer = setInterval(() => {
      if (reg?.waiting) {
        clearInterval(timer);
        resolve(true);
      } else if (Date.now() >= end) {
        clearInterval(timer);
        resolve(false);
      }
    }, 200);
  });
}

export async function checkForUpdate() {
  const remoteVersion = await getRemoteVersion();
  if (registration) await registration.update().catch(() => {});
  if (remoteVersion && remoteVersion !== APP_VERSION && registration) {
    await waitForWaiting(registration);
  }
  return {
    remoteVersion,
    registration,
    waiting: Boolean(registration?.waiting),
    hasUpdate: Boolean(remoteVersion && remoteVersion !== APP_VERSION),
  };
}