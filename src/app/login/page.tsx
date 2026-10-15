import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/sesion";
import LoginForm from "./LoginForm";

export default async function LoginPage() {
  const usuario = await getCurrentUser();
  if (usuario) redirect("/dashboard");
  return (
    <div
      style={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "40px 24px",
        position: "relative",
        background:
          "radial-gradient(circle at top right, rgba(99, 102, 241, 0.15), transparent 40%), radial-gradient(circle at bottom left, rgba(236, 72, 153, 0.1), transparent 40%)",
      }}
    >
      <LoginForm />
    </div>
  );
}
