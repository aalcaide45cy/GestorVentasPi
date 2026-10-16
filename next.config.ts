import type { NextConfig } from "next";

const esDesarrollo = process.env.NODE_ENV !== "production";

/**
 * Content-Security-Policy (6.2). Next.js y el script del tema usan fragmentos en línea, por lo que
 * se permiten `'unsafe-inline'` (scripts y estilos) en lugar de nonces; el resto va restringido al propio origen.
 * En desarrollo se añade `'unsafe-eval'` y el websocket del recargado en caliente.
 */
const csp = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${esDesarrollo ? " 'unsafe-eval'" : ""}`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self' data:",
  `connect-src 'self'${esDesarrollo ? " ws: wss:" : ""}`,
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
].join("; ");

/**
 * Los adjuntos (imágenes y PDF con tipo y firma comprobados) se enseñan dentro de la propia aplicación en un iframe del
 * mismo origen. Su CSP solo restringe quién puede incrustarlos: con `object-src 'none'` el visor de PDF del navegador
 * quedaría bloqueado.
 */
const cabecerasAdjuntos = (base: { key: string; value: string }[]) =>
  base.map((c) =>
    c.key === "X-Frame-Options" ? { ...c, value: "SAMEORIGIN" } : c.key === "Content-Security-Policy" ? { ...c, value: "frame-ancestors 'self'; base-uri 'none'; form-action 'none'" } : c,
  );

const cabeceras = [
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "same-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
  { key: "Content-Security-Policy", value: csp },
];

const nextConfig: NextConfig = {
  output: "standalone",
  // OCR de la rejilla (Tesseract en WebAssembly, lectura de PDF y lienzo nativo): se cargan desde node_modules en tiempo de ejecución
  serverExternalPackages: ["tesseract.js", "pdfjs-dist", "@napi-rs/canvas"],
  outputFileTracingIncludes: {
    "/api/documentos/leer": [
      "./node_modules/tesseract.js/**/*",
      "./node_modules/tesseract.js-core/**/*",
      // El trabajador de Tesseract carga estas dependencias en tiempo de ejecución (no las ve el trazado automático)
      "./node_modules/{bmp-js,idb-keyval,is-url,node-fetch,regenerator-runtime,wasm-feature-detect,zlibjs,whatwg-url,tr46,webidl-conversions}/**/*",
      "./node_modules/@tesseract.js-data/spa/4.0.0_best_int/**/*",
      "./node_modules/pdfjs-dist/legacy/build/**/*",
      "./node_modules/pdfjs-dist/standard_fonts/**/*",
      "./node_modules/pdfjs-dist/wasm/**/*",
      "./node_modules/@napi-rs/canvas*/**/*",
    ],
    "/api/comisiones/rejillas/ocr": [
      "./node_modules/tesseract.js/**/*",
      "./node_modules/tesseract.js-core/**/*",
      // El trabajador de Tesseract carga estas dependencias en tiempo de ejecución (no las ve el trazado automático)
      "./node_modules/{bmp-js,idb-keyval,is-url,node-fetch,regenerator-runtime,wasm-feature-detect,zlibjs,whatwg-url,tr46,webidl-conversions}/**/*",
      "./node_modules/@tesseract.js-data/spa/4.0.0_best_int/**/*",
      "./node_modules/pdfjs-dist/legacy/build/**/*",
      "./node_modules/pdfjs-dist/standard_fonts/**/*",
      "./node_modules/pdfjs-dist/wasm/**/*",
      "./node_modules/@napi-rs/canvas*/**/*",
    ],
  },
  poweredByHeader: false,
  async headers() {
    return [
      { source: "/((?!api/adjuntos).*)", headers: cabeceras },
      { source: "/api/adjuntos", headers: cabecerasAdjuntos(cabeceras) },
    ];
  },
};

export default nextConfig;
