"use client";

const FRECUENTES = ["🚗", "🛡️", "✅", "⚠️", "📄", "🔔", "🔴", "🟡", "🟢", "⚪", "⭐", "💶", "🔧", "📞"];

/**
 * Ayuda para escribir emoticonos en un campo de texto: el atajo de teclado de cada sistema y una fila de emoticonos frecuentes que se añaden con un clic
 * (`alInsertar` recibe el emoticono para ponerlo al final del texto).
 */
export default function AyudaEmoticonos({ alInsertar }: { alInsertar: (emoticono: string) => void }) {
  return (
    <details style={{ fontSize: "0.76rem", color: "var(--text-secondary)" }}>
      <summary style={{ cursor: "pointer", fontWeight: 600 }}>😀 ¿Cómo pongo un emoticono?</summary>
      <div style={{ display: "flex", flexDirection: "column", gap: "8px", padding: "8px 0 2px" }}>
        <span>
          Con el cursor dentro del campo, pulsa: <strong>en Windows</strong>, la tecla de Windows + <kbd style={{ border: "1px solid var(--border-light)", borderRadius: "4px", padding: "0 5px" }}>.</kbd> (punto); <strong>en Mac</strong>, <kbd style={{ border: "1px solid var(--border-light)", borderRadius: "4px", padding: "0 5px" }}>Control</kbd> + <kbd style={{ border: "1px solid var(--border-light)", borderRadius: "4px", padding: "0 5px" }}>Cmd ⌘</kbd> + <kbd style={{ border: "1px solid var(--border-light)", borderRadius: "4px", padding: "0 5px" }}>Espacio</kbd>; <strong>en el móvil</strong>, la carita del teclado. Elige el emoticono y se escribe solo.
        </span>
        <span>O pulsa uno de estos para añadirlo al final:</span>
        <span style={{ display: "flex", gap: "4px", flexWrap: "wrap" }}>
          {FRECUENTES.map((e) => (
            <button key={e} type="button" onClick={() => alInsertar(e)} aria-label={`Añadir ${e}`} className="btn btn-secondary" style={{ padding: "2px 8px", fontSize: "1rem", lineHeight: 1.3 }}>
              {e}
            </button>
          ))}
        </span>
      </div>
    </details>
  );
}
