"use client";

import { useState } from "react";
import Modal from "@/components/Modal";
import { useToast } from "@/components/Toast";
import { textoError } from "@/components/comisiones/api";
import { TEXTO_SEGUNDO_CLIC, useDobleConfirmacion } from "@/components/useDobleConfirmacion";
import { lanzarTarea } from "@/lib/tareas-cliente";

const FRASE = "BORRAR ABSOLUTAMENTE TODO";

/**
 * «Borrar absolutamente todo»: deja la aplicación como de fábrica, sin dejar un solo byte (ni Papelera, ni historial, ni documentos, ni copias). Tiene TRES
 * confirmaciones seguidas (sin escribir nada) y una casilla para no hacer copia previa.
 */
export default function PanelBorradoTotal() {
  const { mostrar, notificar } = useToast();
  const [paso, setPaso] = useState<0 | 1 | 2 | 3>(0);
  const [hacerCopia, setHacerCopia] = useState(true);
  const [trabajando, setTrabajando] = useState(false);

  const ejecutar = async () => {
    setTrabajando(true);
    try {
      await lanzarTarea("/api/admin/vaciar/total", { confirmacion: FRASE, hacerCopia });
      setPaso(0);
      void notificar({ titulo: "Se está borrando todo, en segundo plano", texto: "La aplicación se está dejando como de fábrica.", detalles: ["Verás el avance en la barra de tareas de arriba (no se puede cancelar).", "Al terminar, recarga la página: solo quedará el administrador, las marcas, los modelos y las plantillas base."] });
    } catch (e) {
      mostrar(textoError(e), "error");
    } finally {
      setTrabajando(false);
    }
  };
  const doble = useDobleConfirmacion(() => void ejecutar());

  const cerrar = () => {
    setPaso(0);
    setHacerCopia(true);
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "14px", padding: "18px", border: "2px solid var(--danger)", borderRadius: "var(--radius-sm)" }}>
      <h3 style={{ fontSize: "1.15rem", color: "var(--danger)" }}>☢️ Borrar absolutamente todo</h3>
      <p style={{ color: "var(--text-secondary)", fontSize: "0.9rem", margin: 0, lineHeight: 1.5 }}>
        Deja la aplicación <b>como de fábrica</b>, sin un solo byte de lo anterior: también se van lo que hay en la <b>Papelera</b>, el historial de deshacer, la auditoría, <b>todos los documentos</b> (PDF, fotos, Excel), la Biblioteca, las rejillas, las incidencias, las <b>copias de seguridad guardadas</b> y <b>todos los usuarios menos el administrador</b>. Solo se conservan, grabados a fuego, <b>las marcas y los modelos (con sus colores) y las plantillas base de comisiones y de tarifas</b> (que se pueden editar y borrar a mano cuando quieras, y vienen de serie en una instalación nueva), y la configuración del equipo (cifrado, motores de OCR, copias de seguridad y Google Drive con su conexión). A diferencia de «Borrar todos los datos», esto no se puede deshacer salvo con la copia previa, y esa copia es opcional.
      </p>
      <div>
        <button type="button" className="btn btn-danger" onClick={() => setPaso(1)}>
          ☢️ Borrar absolutamente todo…
        </button>
      </div>

      {paso === 1 && (
        <Modal
          titulo="☢️ Confirmación 1 de 3"
          ancho="560px"
          peligro
          pie={
            <>
              <button type="button" className="btn btn-secondary" onClick={cerrar}>
                Cancelar
              </button>
              <button type="button" className="btn btn-danger" onClick={() => setPaso(2)}>
                Entiendo, continuar
              </button>
            </>
          }
        >
          <p style={{ margin: 0, lineHeight: 1.5 }}>
            Vas a dejar la aplicación <b>como si acabara de instalarse</b>. Se borrarán <b>todos</b> los clientes, expedientes, comisiones, documentos, biblioteca, rejillas, planes, historial, Papelera, incidencias, copias de seguridad guardadas y usuarios (salvo tú).
          </p>
          <label style={{ display: "flex", gap: "8px", alignItems: "flex-start", fontSize: "0.9rem" }}>
            <input type="checkbox" checked={hacerCopia} onChange={(e) => setHacerCopia(e.target.checked)} style={{ marginTop: "3px", accentColor: "var(--primary)" }} />
            <span>
              Guardar antes una <b>copia de seguridad completa</b> (recomendado). Es lo único que quedaría: si la desmarcas, <b>no queda nada</b> y no hay vuelta atrás.
            </span>
          </label>
        </Modal>
      )}

      {paso === 2 && (
        <Modal
          titulo="☢️ Confirmación 2 de 3"
          ancho="560px"
          peligro
          pie={
            <>
              <button type="button" className="btn btn-secondary" onClick={cerrar}>
                No, cancelar
              </button>
              <button type="button" className="btn btn-danger" onClick={() => setPaso(3)}>
                Sí, estoy seguro
              </button>
            </>
          }
        >
          <p style={{ margin: 0, lineHeight: 1.5 }}>
            <b>¿Seguro?</b> Se perderá todo esto, también de la Papelera:
          </p>
          <ul style={{ margin: 0, paddingLeft: "20px", lineHeight: 1.7, fontSize: "0.9rem" }}>
            <li>Clientes, expedientes, pedidos y pagos RCI</li>
            <li>Todos los PDF, fotos y Excel (documentos y Biblioteca)</li>
            <li>Planes, liquidaciones, puntos, rejillas y pendientes de cobro</li>
            <li>Historial de deshacer, auditoría, incidencias y la Papelera entera</li>
            <li>Copias de seguridad guardadas (la configuración de Drive y de las copias se conserva)</li>
            <li>Todos los usuarios menos el tuyo</li>
          </ul>
          <p style={{ margin: 0, fontSize: "0.88rem", color: "var(--text-secondary)" }}>Se conservan solo las marcas, los modelos, las plantillas base de comisiones y tu usuario.</p>
        </Modal>
      )}

      {paso === 3 && (
        <Modal
          titulo="☢️ Confirmación 3 de 3: la última"
          ancho="560px"
          peligro
          pie={
            <>
              <button type="button" className="btn btn-secondary" onClick={cerrar} disabled={trabajando}>
                Cancelar
              </button>
              <button type="button" className="btn btn-danger" onClick={doble.pulsar} disabled={trabajando} style={doble.armado ? { outline: "3px solid var(--danger)" } : undefined}>
                {trabajando ? "Empezando…" : doble.armado ? TEXTO_SEGUNDO_CLIC : "Borrar absolutamente todo"}
              </button>
            </>
          }
        >
          <p style={{ margin: 0, lineHeight: 1.5 }}>
            {hacerCopia ? (
              <>
                Se guardará primero una copia de seguridad completa y después se borrará todo. <b>Esa copia será lo único que quede.</b>
              </>
            ) : (
              <>
                <b style={{ color: "var(--danger)" }}>Has elegido NO guardar copia:</b> no quedará absolutamente nada y no se podrá recuperar.
              </>
            )}
          </p>
          <p style={{ margin: 0, fontSize: "0.9rem" }}>
            Para confirmar, <b>pulsa el botón rojo dos veces seguidas</b>.
          </p>
        </Modal>
      )}
    </div>
  );
}
