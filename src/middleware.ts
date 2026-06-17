import { NextResponse } from "next/server";
import { auth } from "@/auth";

export default auth((req) => {
  const { nextUrl } = req;
  const isAuthed = !!req.auth;
  const isAuthRoute =
    nextUrl.pathname === "/signin" ||
    nextUrl.pathname.startsWith("/signin/") ||
    nextUrl.pathname.startsWith("/api/auth");
  const isPublicAsset =
    nextUrl.pathname.startsWith("/_next") ||
    nextUrl.pathname.startsWith("/favicon") ||
    nextUrl.pathname.startsWith("/logo");

  if (isAuthRoute || isPublicAsset) return NextResponse.next();
  if (!isAuthed) {
    const url = new URL("/signin", nextUrl);
    url.searchParams.set("callbackUrl", nextUrl.pathname);
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
});

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|logo.*).*)"],
};
