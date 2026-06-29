import { NextResponse } from "next/server";

function getRedirectUrl(request: Request): string {
  const url = new URL("/login", request.url);
  const forwardedHost = request.headers.get("x-forwarded-host");
  const forwardedProto = request.headers.get("x-forwarded-proto");
  if (forwardedHost) {
    url.host = forwardedHost;
    // Strip port if it's default SSL/HTTP
    if (forwardedProto === "https" && url.port === "443") {
      url.port = "";
    }
  }
  if (forwardedProto) {
    // Ensure protocol matches forwarded protocol (e.g. https)
    url.protocol = forwardedProto.endsWith(":") ? forwardedProto : `${forwardedProto}:`;
  }
  return url.toString();
}

export async function POST(request: Request) {
  const redirectUrl = getRedirectUrl(request);
  const response = NextResponse.redirect(redirectUrl);

  // Clear the session cookie
  response.cookies.set("session", "", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    expires: new Date(0),
    path: "/",
  });

  return response;
}

export async function GET(request: Request) {
  const redirectUrl = getRedirectUrl(request);
  const response = NextResponse.redirect(redirectUrl);

  // Clear the session cookie
  response.cookies.set("session", "", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    expires: new Date(0),
    path: "/",
  });

  return response;
}
