import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

export function proxy(request: NextRequest) {
  const path = request.nextUrl.pathname;
  const hasSession = request.cookies.has("session");

  // Protect dashboard routes
  if (path.startsWith("/dashboard")) {
    if (!hasSession) {
      // Redirect to landing/login page
      const loginUrl = new URL("/login", request.url);
      const forwardedHost = request.headers.get("x-forwarded-host");
      const forwardedProto = request.headers.get("x-forwarded-proto");
      if (forwardedHost) {
        loginUrl.host = forwardedHost;
      }
      if (forwardedProto) {
        loginUrl.protocol = forwardedProto.endsWith(":") ? forwardedProto : `${forwardedProto}:`;
      }
      if (forwardedHost || forwardedProto) {
        loginUrl.port = "";
      }
      return NextResponse.redirect(loginUrl);
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/", "/dashboard/:path*"],
};
