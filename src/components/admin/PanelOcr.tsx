"use client";

import { useEffect, useState } from "react";
import { useToast } from "@/components/Toast";
import { llamar, textoError } from "@/components/comisiones/api";
import type { AjustesOcrDto } from "@/app/api/admin/ocr/route";

/** «Lectura de pedidos»: motor de OCR (Tesseract, RapidOCR en CPU o en GPU) y cuántos pedidos se leen a la vez. */
export default function PanelOcr() {
  const { mostrar } = useToast();
  const [a, setA] = useState<AjustesOcrDto | null>(null);
  const [guardando, setGuardando] = useState(false);
  const [probando, setProbando] = useState(false);
  const [aVez, setAVez] = useState("0");

  useEffect(() => {
    let vivo = true;
    llamar<AjustesOcrDto>("/api/admin/ocr")
      .then((r) => {
        if (!vivo) return;
        setA(r.data);
        setAVez(String(r.data.simultaneas));
      })
      .catch((e: unknown) => vivo && mostrar(textoError(e), "error"));
    return () => {
      vivo = false;
    };
  }, [mostrar]);

  const guardar = async (cambios: { motor?: string; simultaneas?: number }, mensaje: string) => {
    setGuardando(true);
    try {
      const { data } = await llamar<AjustesOcrDto>("/api/admin/ocr", { method: "PUT", cuerpo: cambios });
      setA(data);
      setAVez(String(data.simultaneas));
      mostrar(mensaje);
    } catch (e) {
      mostrar(textoError(e), "error");
    } finally {
      setGuardando(false);
    }
  };

  const probar = async () => {
    if (!a) return;
    setProbando(true);
    try {
      const { data } = await llamar<{ ok: boolean; usado?: string; motivo?: string }>("/api/admin/ocr", { method: "POST", cuerpo: { motor: a.motor } });
      mostrar(data.ok ? `Funciona en este equipo (usa: ${data.usado === "cpu" ? "CPU" : data.usado === "dml" ? "GPU con DirectML" : data.usado === "cuda" ? "GPU con CUDA" : data.usado}).` : `No se puede usar en este equipo: ${data.motivo ?? "sin motivo"}`, data.ok ? undefined : "error");
    } catch (e) {
      mostrar(textoError(e), "error");
    } finally {
      setProbando(false);
    }
  };

  if (!a) return <p style={{ color: "var(--text-muted)", fontSize: "0.85rem" }}>Cargando lectura de pedidos…</p>;
  const actual = a.opciones.find((o) => o.id === a.motor);
  const equipo = a.equipo;
  const aVezNumero = Number(aVez);
  const aVezValido = Number.isInteger(aVezNumero) && aVezNumero >= 0 && aVezNumero <= a.maximoSimultaneas;

  return (
    <div>
      <h3 style={{ fontSize: "1.15rem", marginBottom: "8px" }}>👁 Lectura de pedidos (OCR)</h3>
      <p style={{ color: "var(--text-secondary)", fontSize: "0.9rem", lineHeight: "1.5", marginBottom: "16px" }}>
        Elige con qué motor se lee el texto de los pedidos escaneados y cuántos se leen a la vez. El cambio vale para las lecturas siguientes.
      </p>
      <div className="glass-panel" style={{ padding: "20px", display: "flex", flexDirection: "column", gap: "18px", backgroundColor: "rgba(255, 255, 255, 0.01)" }}>
        <div style={{ fontSize: "0.82rem", color: "var(--text-muted)" }} title="Datos del equipo donde corre la aplicación, con los que se recomienda el motor">
          Este equipo: {equipo.plataforma === "win32" ? "Windows" : equipo.plataforma === "linux" ? "Linux" : equipo.plataforma} · {equipo.arquitectura === "arm64" ? "ARM64" : equipo.arquitectura === "x64" ? "AMD64" : equipo.arquitectura}
          {equipo.esRaspberry ? " (Raspberry Pi)" : ""} · {equipo.nucleos} núcleos · {equipo.memoriaGb} GB de memoria · {equipo.nvidia ? `GPU NVIDIA ${equipo.nvidia}` : "sin GPU NVIDIA detectada"}
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
          <label htmlFor="motor-ocr" style={{ fontSize: "0.95rem", fontWeight: 600 }}>
            Motor de lectura
          </label>
          <div style={{ display: "flex", gap: "10px", flexWrap: "wrap", alignItems: "center" }}>
            <select
              id="motor-ocr"
              className="form-input"
              value={a.motor}
              disabled={guardando}
              onChange={(e) => void guardar({ motor: e.target.value }, "Motor de lectura cambiado.")}
              title="Motor con el que se lee el texto de los pedidos. Entre paréntesis, el equipo en el que va mejor"
              style={{ minWidth: "min(100%, 420px)" }}
            >
              {a.opciones.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.nombre} ({o.equipo})
                  {o.recomendado ? " ★" : ""}
                </option>
              ))}
            </select>
            <button type="button" className="btn btn-secondary" disabled={probando} onClick={() => void probar()} title="Comprueba que el motor elegido arranca en este equipo y con qué lo hace (CPU o GPU)">
              {probando ? "Probando…" : "🧪 Probar este motor"}
            </button>
          </div>
          {actual && <span style={{ fontSize: "0.85rem", color: "var(--text-muted)", lineHeight: 1.5 }}>{actual.detalle}</span>}
          <span style={{ fontSize: "0.8rem", color: "var(--text-muted)" }}>★ = el que se recomienda para este equipo. Si RapidOCR no puede arrancar, se lee con Tesseract para no dejar de leer.</span>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
          <label htmlFor="ocr-simultaneas" style={{ fontSize: "0.95rem", fontWeight: 600 }}>
            Pedidos que se leen a la vez
          </label>
          <div style={{ display: "flex", gap: "10px", flexWrap: "wrap", alignItems: "center" }}>
            <input
              id="ocr-simultaneas"
              className="form-input"
              type="number"
              min={0}
              max={a.maximoSimultaneas}
              value={aVez}
              onChange={(e) => setAVez(e.target.value)}
              style={{ width: "100px" }}
              title={`0 = automático (se ajusta solo según CPU y memoria). De 1 a ${a.maximoSimultaneas} fija cuántos pedidos se leen a la vez`}
            />
            <button type="button" className="btn btn-secondary" disabled={guardando || !aVezValido || aVezNumero === a.simultaneas} onClick={() => void guardar({ simultaneas: aVezNumero }, aVezNumero === 0 ? "Lecturas a la vez: automático." : `Se leerán ${aVezNumero} pedidos a la vez.`)}>
              Guardar
            </button>
            <button type="button" className="btn btn-secondary" disabled={guardando || a.simultaneas === 0} onClick={() => void guardar({ simultaneas: 0 }, "Lecturas a la vez: automático.")} title="Vuelve a dejar que la aplicación decida según CPU y memoria libres">
              Automático
            </button>
          </div>
          <span style={{ fontSize: "0.85rem", color: "var(--text-muted)", lineHeight: 1.5 }}>
            {a.simultaneas === 0 ? `Ahora mismo: automático (sube poco a poco mientras el equipo vaya sobrado, hasta ${equipo.esRaspberry ? "2 o 3 en una Raspberry" : "6 por defecto"}).` : `Ahora mismo: ${a.simultaneas} a la vez, fijo.`} En la Raspberry conviene 1 o 2; en un PC potente, más. Pon 0 para automático (máximo {a.maximoSimultaneas}).
          </span>
        </div>
      </div>
    </div>
  );
}
