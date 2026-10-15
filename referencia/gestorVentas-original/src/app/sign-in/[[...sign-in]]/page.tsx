import { SignIn } from "@clerk/nextjs";

export default function SignInPage() {
  return (
    <div style={{
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      justifyContent: "center",
      minHeight: "100vh",
      padding: "24px",
      position: "relative"
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

        <SignIn
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
          path="/sign-in"
          signUpUrl="/sign-up"
          forceRedirectUrl="/dashboard"
        />
      </div>
    </div>
  );
}
