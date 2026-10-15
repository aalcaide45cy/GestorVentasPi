import type { Metadata } from "next";
import Script from "next/script";
import "./globals.css";
import GlobalModalKeyboardHandler from "@/components/GlobalModalKeyboardHandler";

export const metadata: Metadata = {
  title: "Gestor de Ventas | Concesionarios",
  description:
    "Plataforma de seguimiento y control de expedientes de ventas, clientes y catálogo de vehículos.",
};

const SCRIPT_TEMA =
  "(function(){try{var t=localStorage.getItem('theme')||'dark';document.documentElement.setAttribute('data-theme',t);}catch(e){}})()";

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="es" suppressHydrationWarning>
      <body>
        <Script id="script-tema" strategy="beforeInteractive" dangerouslySetInnerHTML={{ __html: SCRIPT_TEMA }} />
        <GlobalModalKeyboardHandler />
        {children}
      </body>
    </html>
  );
}
