import type { Metadata } from "next";
import Script from "next/script";
import "./globals.css";
import AyudaEmergente from "@/components/AyudaEmergente";
import GlobalModalKeyboardHandler from "@/components/GlobalModalKeyboardHandler";

export const metadata: Metadata = {
  title: "Gestor de Ventas | Concesionarios",
  description:
    "Plataforma de seguimiento y control de expedientes de ventas, clientes y catálogo de vehículos.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="es" suppressHydrationWarning>
      <body>
        {/* El script del tema se sirve como archivo (/api/tema): un <script> escrito en línea dentro de un componente avisa en React 19 */}
        <Script id="script-tema" strategy="beforeInteractive" src="/api/tema" />
        <GlobalModalKeyboardHandler />
        <AyudaEmergente />
        {children}
      </body>
    </html>
  );
}
