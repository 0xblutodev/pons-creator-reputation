import "dotenv/config";
import { runIndex } from "./chain/indexer.js";
import { loadConfig } from "./config.js";
import { Store } from "./store.js";

const config = loadConfig();
const store = new Store(config.dbPath);
try {
  await runIndex(store, config);
} catch (error) {
  console.error("[index] failed", error);
  process.exitCode = 1;
} finally {
  store.close();
}
