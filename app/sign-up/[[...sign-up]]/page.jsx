import { Suspense } from "react";
import AuthPage from "@/components/AuthPage";

export default function SignUpPage() {
  return (
    <Suspense>
      <AuthPage mode="sign-up" />
    </Suspense>
  );
}
