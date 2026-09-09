/*
 * Service worker de Kuni.
 *
 * Regla de oro para una app clínica: NO se cachea ningún dato de paciente.
 * Solo se guardan los recursos estáticos con hash en el nombre
 * (`/_next/static/*`, iconos, marca) y la página `/offline`. Cualquier
 * navegación o llamada a la API va SIEMPRE a la red; si no hay conexión se
 * muestra `/offline` en vez de servir una versión vieja de un expediente,
 * que es justo lo que podría llevar a una decisión clínica equivocada.
 *
 * Al cambiar este archivo, sube SHELL_CACHE: el navegador reemplaza el SW
 * viejo y `activate` borra las cachés con otro nombre.
 */
const SHELL_CACHE = "kuni-shell-v2";
const OFFLINE_URL = "/offline";
const PRECACHE = [OFFLINE_URL, "/icons/icon-192.png", "/brand/kuni-mark.png"];

// Rutas cuyo contenido depende de la sesión o de datos clínicos vivos.
const NEVER_CACHE = [/^\/api\//, /^\/login/, /^\/auth\//];

function isCacheableAsset(url) {
  return (
    url.pathname.startsWith("/_next/static/") ||
    url.pathname.startsWith("/icons/") ||
    url.pathname.startsWith("/brand/") ||
    url.pathname === "/favicon.ico"
  );
}

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(SHELL_CACHE)
      .then((cache) => cache.addAll(PRECACHE))
      // Si un recurso del precache falla (p. ej. un deploy a medias), la
      // instalación no debe abortar: el SW igual sirve para el resto.
      .catch(() => undefined)
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== SHELL_CACHE).map((key) => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("message", (event) => {
  // Lo manda `service-worker-register.tsx` cuando el usuario acepta actualizar.
  if (event.data === "kuni:skip-waiting") self.skipWaiting();
});

let offlineRefreshed = false;

function refreshOfflinePage() {
  if (offlineRefreshed) return;
  offlineRefreshed = true;
  fetch(OFFLINE_URL, { cache: "reload" })
    .then((response) => {
      if (response.ok) return caches.open(SHELL_CACHE).then((cache) => cache.put(OFFLINE_URL, response));
    })
    .catch(() => undefined);
}

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (NEVER_CACHE.some((pattern) => pattern.test(url.pathname))) return;

  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request)
        .then((response) => {
          // Una copia vieja de /offline se quedaría pegada hasta el próximo
          // cambio de SHELL_CACHE, así que se refresca una vez por cada vez
          // que el worker despierta: una petición mínima, con red disponible.
          refreshOfflinePage();
          return response;
        })
        .catch(async () => {
          const offline = await caches.match(OFFLINE_URL);
          return (
            offline ??
            new Response("Sin conexión", { status: 503, headers: { "Content-Type": "text/plain; charset=utf-8" } })
          );
        })
    );
    return;
  }

  if (!isCacheableAsset(url)) return;

  // Cache-first: estos archivos llevan hash en el nombre o son la marca, así
  // que una copia guardada nunca queda "desactualizada" de forma peligrosa.
  event.respondWith(
    caches.match(request).then(
      (cached) =>
        cached ??
        fetch(request).then((response) => {
          if (response.ok && response.type === "basic") {
            const copy = response.clone();
            caches.open(SHELL_CACHE).then((cache) => cache.put(request, copy));
          }
          return response;
        })
    )
  );
});
