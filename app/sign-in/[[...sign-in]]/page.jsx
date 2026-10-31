import { Suspense } from "react";
import AuthPage from "@/components/AuthPage";

export default function SignInPage() {
  return (
    <Suspense>
      <AuthPage mode="sign-in" />
    </Suspense>
  );
}
