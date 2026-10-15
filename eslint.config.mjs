import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

export default defineConfig([
  ...nextVitals,
  ...nextTs,
  globalIgnores(["coverage/**", ".next/**", "out/**", "build/**", "next-env.d.ts", "referencia/**", "node_modules/**"]),
]);
