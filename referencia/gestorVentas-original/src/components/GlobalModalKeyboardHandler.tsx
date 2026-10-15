"use client";

import { useEffect } from "react";

export default function GlobalModalKeyboardHandler() {
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key !== "Escape" && e.key !== "Enter") return;

      // Buscar todos los contenedores div
      const divs = Array.from(document.querySelectorAll("div"));
      
      // Encontrar el modal activo basándose en propiedades de estilo de superposición fullscreen
      const activeModal = divs.find(div => {
        const computedStyle = window.getComputedStyle(div);
        const position = computedStyle.position;
        const zIndex = parseInt(computedStyle.zIndex, 10) || 0;
        
        // El modal suele ser fixed/absolute, ocupar toda la pantalla, z-index alto, y ser visible
        const isOverlay = position === "fixed" || position === "absolute";
        const isFullScreen = div.offsetHeight >= window.innerHeight * 0.9 && div.offsetWidth >= window.innerWidth * 0.9;
        const isVisible = computedStyle.display !== "none" && computedStyle.opacity !== "0" && computedStyle.visibility !== "hidden";
        
        return isOverlay && isFullScreen && isVisible && (zIndex >= 100 || div.classList.contains("modal-backdrop") || div.classList.contains("backdrop"));
      });

      if (!activeModal) return;

      // Comprobar elemento enfocado actualmente
      const activeEl = document.activeElement;
      
      if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        
        // Buscar botón de cancelación (Cancelar, Cerrar, No, Volver, o aspa de cerrar)
        const buttons = Array.from(activeModal.querySelectorAll("button"));
        const cancelButton = buttons.find(btn => {
          const txt = btn.textContent?.toLowerCase() || "";
          const title = btn.getAttribute("title")?.toLowerCase() || "";
          const ariaLabel = btn.getAttribute("aria-label")?.toLowerCase() || "";
          
          return (
            txt.includes("cancelar") ||
            txt.includes("cerrar") ||
            txt.trim() === "no" ||
            txt.includes("volver") ||
            txt.includes("atrás") ||
            txt.includes("atras") ||
            txt.includes("x") ||
            txt.includes("❌") ||
            title.includes("cerrar") ||
            ariaLabel.includes("close")
          );
        });

        if (cancelButton) {
          cancelButton.click();
        } else {
          // Fallback a cualquier botón secundario o con icono de cruz
          const fallbackBtn = activeModal.querySelector(".btn-secondary, [class*='close'], .close-button") as HTMLElement;
          if (fallbackBtn) fallbackBtn.click();
        }
      } else if (e.key === "Enter") {
        // No interferir si el foco está en un textarea
        if (activeEl && activeEl.tagName === "TEXTAREA") return;

        e.preventDefault();
        e.stopPropagation();
        
        // Buscar botón de confirmación (Aceptar, Guardar, Confirmar, Sí, Registrar, Crear, Importar, o primario)
        const buttons = Array.from(activeModal.querySelectorAll("button"));
        const acceptButton = buttons.find(btn => {
          const txt = btn.textContent?.toLowerCase() || "";
          const isPrimary = btn.classList.contains("btn-primary") || btn.classList.contains("btn-success");
          
          const hasAcceptText = 
            txt.includes("aceptar") ||
            txt.includes("guardar") ||
            txt.includes("confirmar") ||
            txt.trim() === "sí" ||
            txt.trim() === "si" ||
            txt.includes("registrar") ||
            txt.includes("crear") ||
            txt.includes("importar") ||
            txt.includes("subir") ||
            txt.includes("sí, eliminar") ||
            txt.includes("si, eliminar") ||
            txt.includes("corregir");
            
          return hasAcceptText || isPrimary;
        });

        if (acceptButton) {
          acceptButton.click();
        }
      }
    };

    window.addEventListener("keydown", handleKeyDown, true);
    return () => {
      window.removeEventListener("keydown", handleKeyDown, true);
    };
  }, []);

  return null;
}
