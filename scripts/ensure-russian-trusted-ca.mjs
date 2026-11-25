#!/usr/bin/env node
/**
 * Скачивает Russian Trusted Root/Sub CA с официального источника Госуслуг
 * и собирает бандл для NODE_EXTRA_CA_CERTS.
 *
 *   npm run certs:russian-trusted
 */
import {
  ensureRussianTrustedCaBundle,
  GOSUSLUGI_CRT_PAGE,
  OFFICIAL_CA_URLS,
} from "./lib/russian-trusted-ca.mjs";

const file = await ensureRussianTrustedCaBundle();
console.log("Russian Trusted CA bundle ready:");
console.log(`  ${file}`);
console.log(`Source page: ${GOSUSLUGI_CRT_PAGE}`);
console.log(`Root URL: ${OFFICIAL_CA_URLS.root}`);
console.log(`Sub URL:  ${OFFICIAL_CA_URLS.sub}`);
console.log(`Set before Node start: NODE_EXTRA_CA_CERTS=${file}`);
