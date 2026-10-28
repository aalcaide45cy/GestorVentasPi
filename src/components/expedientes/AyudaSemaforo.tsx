"use client";

/** Explicación, en lenguaje sencillo, de cómo funciona el semáforo de los expedientes (Seguro…). Se usa en Ajustes y en la ventana de la etiqueta. */
export default function AyudaSemaforo({ abierta = false, completa = true }: { abierta?: boolean; completa?: boolean }) {
  return (
    <details open={abierta} style={{ border: "1px solid var(--border-light)", borderRadius: "var(--radius-sm)", padding: "8px 12px", fontSize: "0.82rem", lineHeight: 1.5, color: "var(--text-secondary)" }}>
      <summary style={{ cursor: "pointer", fontWeight: 700, color: "var(--text-primary)" }}>ℹ️ ¿Cómo funciona el semáforo?</summary>
      <div style={{ display: "flex", flexDirection: "column", gap: "8px", marginTop: "8px" }}>
        <p style={{ margin: 0 }}>
          Un <strong>semáforo</strong> es un apunte que tienen todos los expedientes (por ejemplo, el <strong>Seguro</strong>) y que puede estar en varios <strong>estados</strong>. Cada estado tiene un <strong>color</strong> y un <strong>significado</strong>: 🔴 aún no solicitado, 🟡 solicitado pero sin terminar, 🟢 terminado, ⚪ no lleva.
        </p>
        <p style={{ margin: 0 }}>
          En la lista de Expedientes sale como una <strong>etiqueta</strong> junto al icono del cliente, con el color del estado en que está ese expediente. Pasa el ratón por encima para ver qué significa.
        </p>
        <strong style={{ color: "var(--text-primary)" }}>Cómo cambiar el estado</strong>
        <ul style={{ margin: 0, paddingLeft: "18px" }}>
          <li>De uno en uno: <strong>pulsa la etiqueta</strong> en la lista y elige el estado.</li>
          <li>De varios a la vez: selecciona los expedientes, pulsa <strong>Editar</strong> (edición en masa) y elige el estado en la lista del semáforo.</li>
          <li>Dentro de un expediente: en el apartado <strong>Apuntes</strong>.</li>
        </ul>
        {completa && (
          <>
            <strong style={{ color: "var(--text-primary)" }}>Qué se configura aquí (para todos los expedientes)</strong>
            <ul style={{ margin: 0, paddingLeft: "18px" }}>
              <li><strong>Texto de la etiqueta</strong>: lo que se lee en la lista. Puedes poner <strong>emoticonos</strong> (por ejemplo «🚗 SEGURO»); son opcionales.</li>
              <li><strong>Estilo</strong>: cápsula con relleno de color, o texto en color. Con «texto en color» puedes decidir si los emoticonos también se pintan del color del estado o conservan los suyos.</li>
              <li><strong>Estados</strong>: de 2 a 5, cada uno con su color y su significado. «Tenue» hace que la etiqueta se vea apagada (útil para «no lleva seguro»). «Restablecer los colores» vuelve al rojo, amarillo, verde y gris.</li>
              <li><strong>Estado en el que empiezan</strong> los expedientes y <strong>Lo llevan todos los expedientes</strong>: así cada expediente nuevo lo trae solo.</li>
              <li><strong>Lado del icono del cliente</strong>: a la izquierda o a la derecha.</li>
            </ul>
          </>
        )}
        <p style={{ margin: 0 }}>Todo se guarda en la base de datos, así que se ve igual desde cualquier equipo.</p>
      </div>
    </details>
  );
}
