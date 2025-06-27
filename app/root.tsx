import {
  Links,
  Meta,
  Outlet,
  Scripts,
  ScrollRestoration,
  type ShouldRevalidateFunctionArgs,
} from "react-router";

import "./app.css";

import { type LoaderFunctionArgs, redirect } from "react-router";
import { Toaster } from "./components/ui/toaster";
import { auth } from "./lib/auth";

export async function loader({ request }: LoaderFunctionArgs) {
  let session = await auth.api.getSession({
    headers: request.headers,
  });
  if (session && new URL(request.url).pathname === "/") {
    throw redirect("/track-cattle");
  }
}

export function shouldRevalidate({
  formAction,
  currentUrl,
  nextUrl,
}: ShouldRevalidateFunctionArgs) {
  // Check for form actions
  if (formAction && ["/login", "/signup"].includes(formAction)) {
    return true;
  }

  // Check for logout parameter in the URL
  const nextUrlObj = new URL(nextUrl);
  if (nextUrlObj.searchParams.get("logout") === "true") {
    return true;
  }

  return false;
}

export default function App() {
  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <Meta />
        <Links />

        {/*Favicon*/}
        <link
          rel="icon"
          type="image/png"
          href="/favicon/favicon-96x96.png"
          sizes="96x96"
        />
        <link rel="icon" type="image/svg+xml" href="/favicon/favicon.svg" />
        <link rel="shortcut icon" href="/favicon/favicon.ico" />
        <link
          rel="apple-touch-icon"
          sizes="180x180"
          href="/favicon/apple-touch-icon.png"
        />
        <meta name="apple-mobile-web-app-title" content="Cattle Track" />
        <link rel="manifest" href="/favicon/site.webmanifest" />
      </head>
      <body className="h-screen bg-slate-100 text-slate-900">
        <div className="h-full flex flex-col min-h-0">
          <div className="flex-grow min-h-0 h-full">
            <Outlet />
            <Toaster />
          </div>
        </div>

        <ScrollRestoration />
        <Scripts />
      </body>
    </html>
  );
}
