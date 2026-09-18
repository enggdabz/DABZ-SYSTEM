import { Suspense } from "react";
import { LoginForm } from "./login-form";

export default function LoginPage() {
  return (
    <main>
      <h1>Sign in</h1>
      <p className="muted">DABZ System</p>
      <Suspense>
        <LoginForm />
      </Suspense>
    </main>
  );
}
