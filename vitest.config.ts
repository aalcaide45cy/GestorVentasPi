import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";
import { urlPruebas } from "./tests/urls";

export default defineConfig({
  resolve: { alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) } },
  test: {
    include: ["src/**/*.test.ts"],
    environment: "node",
    globalSetup: ["./tests/global-setup.ts"],
    env: { DATABASE_URL: urlPruebas },
    fileParallelism: false,
    testTimeout: 20000,
  },
});
