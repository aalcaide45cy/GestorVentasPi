"use client";

import { SignUp } from "@clerk/nextjs";
import { useState } from "react";

export default function SignUpPage() {
  const [invitationCode, setInvitationCode] = useState("");
  const [isValidated, setIsValidated] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleValidateCode = (e: React.FormEvent) => {
    e.preventDefault();
    if (invitationCode === "GESTOR_VIP_2026") {
      setIsValidated(true);
      setError(null);
    } else {
      setError("Código de invitación inválido. Contacta al administrador.");
    }
  };

  return (
    <div style={{
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      justifyContent: "center",
      minHeight: "100vh",
      padding: "24px",
      position: "relative",
      background: "radial-gradient(circle at top right, rgba(99, 102, 241, 0.1), transparent 40%)"
    }}>
      <div className="glow-bg"></div>
      
      <div style={{
        zIndex: 1,
        width: "100%",
        maxWidth: "480px",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: "24px"
      }}>
        {/* Branding */}
        <div style={{ display: "flex", alignItems: "center", gap: "12px", marginBottom: "8px" }}>
          <div style={{
            width: "40px",
            height: "40px",
            borderRadius: "10px",
            background: "linear-gradient(135deg, var(--primary), var(--secondary))",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            boxShadow: "var(--shadow-glow)"
          }}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M3 3v18h18" />
              <path d="m19 9-5 5-4-4-3 3" />
            </svg>
          </div>
          <h2 style={{ fontSize: "1.8rem", margin: 0, fontWeight: 700 }}>GestorVentas</h2>
        </div>

        {!isValidated ? (
          <form onSubmit={handleValidateCode} className="glass-panel" style={{
            width: "100%",
            padding: "32px",
            display: "flex",
            flexDirection: "column",
            gap: "20px",
            boxShadow: "0 15px 35px rgba(0,0,0,0.2)"
          }}>
            <div style={{ textAlign: "center", marginBottom: "8px" }}>
              <h3 style={{ margin: "0 0 8px 0", fontSize: "1.25rem", color: "var(--text-primary)" }}>Registro Privado</h3>
              <p style={{ margin: 0, fontSize: "0.85rem", color: "var(--text-secondary)", lineHeight: "1.4" }}>
                El acceso a este sistema está restringido. Introduce tu código de invitación para crear una cuenta.
              </p>
            </div>

            {error && (
              <div style={{
                color: "var(--danger)",
                background: "rgba(239, 68, 68, 0.05)",
                border: "1px solid rgba(239, 68, 68, 0.15)",
                padding: "10px 14px",
                borderRadius: "var(--radius-sm)",
                fontSize: "0.8rem",
                display: "flex",
                alignItems: "center",
                gap: "8px"
              }}>
                <span>⚠️</span> {error}
              </div>
            )}

            <div className="form-group" style={{ marginBottom: 0 }}>
              <label className="form-label">Código de Invitación</label>
              <input
                type="text"
                className="form-input"
                placeholder="Ingresa el código..."
                value={invitationCode}
                onChange={(e) => setInvitationCode(e.target.value)}
                autoFocus
                style={{ textAlign: "center", letterSpacing: "2px", fontSize: "1.05rem" }}
              />
            </div>

            <button type="submit" className="btn btn-primary" style={{ width: "100%", padding: "12px" }}>
              Validar y Registrarse
            </button>
          </form>
        ) : (
          <SignUp
            appearance={{
              elements: {
                card: "glass-panel",
                headerTitle: "form-label",
                headerSubtitle: "form-label",
                socialButtonsBlockButton: "btn btn-secondary",
                formButtonPrimary: "btn btn-primary",
                formFieldInput: "form-input",
                footerActionLink: "a"
              }
            }}
            path="/sign-up"
            signInUrl="/sign-in"
            forceRedirectUrl="/dashboard"
          />
        )}
      </div>
    </div>
  );
}
