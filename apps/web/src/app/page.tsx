import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import jwt from "jsonwebtoken";

export const metadata = {
  title: "ObservabilityOS",
  description: "Self-hosted telemetry and log aggregation dashboard.",
};

export default async function LandingPage() {
  const cookieStore = await cookies();
  const token = cookieStore.get("session")?.value;

  if (token) {
    const jwtSecret = process.env.JWT_SECRET;
    if (jwtSecret) {
      try {
        jwt.verify(token, jwtSecret);
        // Session is valid, redirect directly to dashboard
        redirect("/dashboard");
      } catch {
        // Invalid session token, proceed to redirect to login
      }
    }
  }

  // Unauthenticated, redirect to login page
  redirect("/login");
}
