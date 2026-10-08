import "dotenv/config";
import { loadConfig } from "./config.js";
import { startServer } from "./server.js";
import { Store } from "./store.js";

const config = loadConfig();
const store = new Store(config.dbPath);
startServer(store, config);

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.on(signal, () => {
    store.close();
    process.exit(0);
  });
}
