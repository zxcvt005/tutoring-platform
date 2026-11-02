/**
 * Точный origin локального HTTPS sidecar для видеолаборатории.
 * Только development. Не использовать в production.
 */
export const DEV_LAN_HTTPS_HOST = "192.168.1.116";
export const DEV_LAN_HTTPS_PORT = 43128;
export const DEV_LAN_HTTP_UPSTREAM_HOST = "127.0.0.1";
export const DEV_LAN_HTTP_UPSTREAM_PORT = 43127;
export const DEV_LAN_HTTPS_ORIGIN = `https://${DEV_LAN_HTTPS_HOST}:${DEV_LAN_HTTPS_PORT}`;
