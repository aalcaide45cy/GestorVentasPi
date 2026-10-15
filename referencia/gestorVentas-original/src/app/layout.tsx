import type { Metadata } from "next";
import { ClerkProvider } from "@clerk/nextjs";
import { esES } from "@clerk/localizations";
import "./globals.css";
import GlobalModalKeyboardHandler from "@/components/GlobalModalKeyboardHandler";

export const metadata: Metadata = {
  title: "Gestor de Ventas | Concesionarios",
  description: "Plataforma de seguimiento y control de expedientes de ventas, clientes y catálogo de vehículos.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <ClerkProvider localization={esES}>
      <html lang="es">
        <head>
          <script
            dangerouslySetInnerHTML={{
              __html: `
                (function() {
                  try {
                    var theme = localStorage.getItem('theme') || 'dark';
                    document.documentElement.setAttribute('data-theme', theme);
                  } catch (e) {}
                })()
              `,
            }}
          />
        </head>
        <body>
          <GlobalModalKeyboardHandler />
          {children}
        </body>
      </html>
    </ClerkProvider>
  );
}

