import type { Metadata } from "next";
import { cookies } from "next/headers";
import type { CSSProperties } from "react";
import "./globals.css";
import AplicadorTema from "@/components/AplicadorTema";
import AyudaEmergente from "@/components/AyudaEmergente";
import GlobalModalKeyboardHandler from "@/components/GlobalModalKeyboardHandler";
import { COOKIE_TEMA, TEMA_OSCURO, esTemaValido, variablesTema } from "@/lib/temas";

export const metadata: Metadata = {
  title: "Gestor de Ventas | Concesionarios",
  description:
    "Plataforma de seguimiento y control de expedientes de ventas, clientes y catálogo de vehículos.",
};

export default async function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  // El tema elegido viene en una cookie: la primera vista ya sale con sus colores, sin ejecutar ningún script
  const guardado = (await cookies()).get(COOKIE_TEMA)?.value;
  const { claro, vars } = variablesTema(esTemaValido(guardado) ? guardado : TEMA_OSCURO);
  return (
    <html lang="es" data-theme={claro ? "light" : "dark"} style={vars as CSSProperties} suppressHydrationWarning>
      <body>
        <AplicadorTema />
        <GlobalModalKeyboardHandler />
        <AyudaEmergente />
        {children}
      </body>
    </html>
  );
}
