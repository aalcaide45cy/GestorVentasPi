"use client";

import { useRef, useState } from "react";
import Modal from "@/components/Modal";
import { useToast } from "@/components/Toast";
import { contextoDelNavegador, vigilanteActivo } from "@/lib/incidencias-cliente";

/** Reduce una imagen (de la pantalla o del equipo) a un JPEG de como mucho 1600 px de ancho, para que la captura ocupe poco. */
async function reducir(origen: CanvasImageSource, ancho: number, alto: number): Promise<string> {
  const k = Math.min(1, 1600 / ancho);
  const c = document.createElement("canvas");
  c.width = Math.round(ancho * k);
  c.height = Math.round(alto * k);
  c.getContext("2d")?.drawImage(origen, 0, 0, c.width, c.height);
  return c.toDataURL("image/jpeg", 0.82);
}

async function dataUrlDeArchivo(f: File): Promise<string> {
  const bmp = await createImageBitmap(f);
  const r = await reducir(bmp, bmp.width, bmp.height);
  bmp.close();
  return r;
}

interface Props {
  alCerrar: () => void;
  version: string | null;
  /** Texto con el que se abre (por ejemplo, el error de una pantalla rota). */
  textoInicial?: string;
}

/**
 * «Avisar de un fallo»: la persona cuenta qué ha pasado y, si quiere, adjunta una captura (de esta pantalla, un archivo o pegada del portapapeles).
 * Se envía con lo que se estaba haciendo (últimos pasos, pantalla, navegador), así no hace falta explicar nada más.
 */
export default function AvisarFallo({ alCerrar, version, textoInicial = "" }: Props) {
  const { mostrar } = useToast();
  const [texto, setTexto] = useState(textoInicial);
  const [captura, setCaptura] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [oculto, setOculto] = useState(false);
  const entrada = useRef<HTMLInputElement>(null);
  const puedeCapturar = typeof navigator !== "undefined" && !!navigator.mediaDevices?.getDisplayMedia;

  const capturarPantalla = async () => {
    try {
      setOculto(true);
      const flujo = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: false, preferCurrentTab: true } as DisplayMediaStreamOptions);
      const video = document.createElement("video");
      video.srcObject = flujo;
      video.muted = true;
      await video.play();
      // Un instante para que la ventana de este aviso ya no salga en la imagen
      await new Promise((r) => setTimeout(r, 500));
      setCaptura(await reducir(video, video.videoWidth, video.videoHeight));
      flujo.getTracks().forEach((t) => t.stop());
    } catch {
      mostrar("No se ha podido capturar la pantalla (el navegador la ha rechazado). Puedes adjuntar una imagen o pegarla con Ctrl+V.", "aviso");
    } finally {
      setOculto(false);
    }
  };

  const adjuntar = async (f: File | null | undefined) => {
    if (!f || !f.type.startsWith("image/")) return;
    try {
      setCaptura(await dataUrlDeArchivo(f));
    } catch {
      mostrar("No se ha podido leer esa imagen.", "error");
    }
  };

  const enviar = async () => {
    if (!texto.trim()) return mostrar("Cuenta qué ha pasado, aunque sea en una frase.", "aviso");
    setEnviando(true);
    try {
      const colector = vigilanteActivo();
      const r = await fetch("/api/incidencias", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ version, manual: { texto, ruta: location.pathname, captura, contexto: { ...contextoDelNavegador(version), pasos: colector?.ultimosPasos(20) ?? [] } } }),
      });
      const j = (await r.json().catch(() => ({}))) as { message?: string; id?: number };
      if (!r.ok) throw new Error(j.message ?? `Error ${r.status}`);
      mostrar(`Gracias: el fallo ha quedado anotado${j.id ? ` (nº ${j.id})` : ""} con lo que estabas haciendo. Se revisará.`);
      alCerrar();
    } catch (e) {
      mostrar(e instanceof Error ? e.message : "No se ha podido enviar el aviso.", "error");
    } finally {
      setEnviando(false);
    }
  };

  return (
    <div style={oculto ? { display: "none" } : undefined}>
      <Modal
        titulo="🐞 Avisar de un fallo"
        ancho="640px"
        pie={
          <>
            <button type="button" className="btn btn-secondary" onClick={alCerrar} disabled={enviando}>
              Cancelar
            </button>
            <button type="button" className="btn btn-primary" onClick={() => void enviar()} disabled={enviando || !texto.trim()}>
              {enviando ? "Enviando…" : "Enviar aviso"}
            </button>
          </>
        }
      >
        <div style={{ display: "flex", flexDirection: "column", gap: "12px", fontSize: "0.9rem" }}>
          <div style={{ color: "var(--text-secondary)", lineHeight: 1.5 }}>
            Cuéntalo con tus palabras: qué esperabas y qué ha pasado. Con el aviso se guardan solos la pantalla en la que estás, la hora y los últimos pasos que has dado (qué botones pulsaste y qué peticiones se hicieron), pero <b>nunca lo que hayas escrito en los formularios</b>.
          </div>
          <textarea
            className="form-input"
            rows={5}
            autoFocus
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
            onPaste={(e) => {
              const f = Array.from(e.clipboardData.files).find((x) => x.type.startsWith("image/"));
              if (f) {
                e.preventDefault();
                void adjuntar(f);
              }
            }}
            placeholder="Ej.: al pulsar «Guardar» en el cliente no pasa nada y la ventana se queda abierta…"
            style={{ width: "100%" }}
            maxLength={5000}
          />
          <div style={{ display: "flex", gap: "8px", flexWrap: "wrap", alignItems: "center" }}>
            {puedeCapturar && (
              <button type="button" className="btn btn-secondary" style={{ padding: "6px 12px", fontSize: "0.82rem" }} disabled={enviando} onClick={() => void capturarPantalla()} title="El navegador te pedirá elegir la pestaña: elige esta">
                📸 Capturar esta pantalla
              </button>
            )}
            <button type="button" className="btn btn-secondary" style={{ padding: "6px 12px", fontSize: "0.82rem" }} disabled={enviando} onClick={() => entrada.current?.click()}>
              📎 Adjuntar una imagen
            </button>
            <input ref={entrada} type="file" accept="image/*" style={{ display: "none" }} onChange={(e) => { void adjuntar(e.target.files?.[0]); e.target.value = ""; }} />
            <span style={{ fontSize: "0.78rem", color: "var(--text-muted)" }}>También puedes pegar una captura aquí con Ctrl+V (⌘V en Mac).</span>
          </div>
          {captura && (
            <div style={{ position: "relative", alignSelf: "flex-start" }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={captura} alt="Captura que se enviará" style={{ maxWidth: "100%", maxHeight: "260px", borderRadius: "var(--radius-sm)", border: "1px solid var(--border-light)" }} />
              <button type="button" className="btn btn-secondary" onClick={() => setCaptura(null)} style={{ position: "absolute", top: "6px", right: "6px", padding: "2px 8px" }} title="Quitar la captura">
                ✕
              </button>
            </div>
          )}
        </div>
      </Modal>
    </div>
  );
}
