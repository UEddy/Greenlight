import { NextResponse, type NextRequest } from "next/server";

/**
 * Reads a country code at the edge and passes it on. Nothing else.
 *
 * The rule from section 7 of the spec, restated because it is the kind of rule
 * that erodes: this application is about to hold, in one row, a person's
 * nationality, their immigration intent, their financial position and their
 * location. That is a genuinely sensitive record and a bad one to leak.
 *
 * So: no third party geolocation API is called, and the IP address is never
 * read, forwarded, stored or logged. The only thing taken is the two letter
 * country code the edge already computed, from `x-vercel-ip-country` on Vercel
 * or `cf-ipcountry` behind Cloudflare. It is passed to the page as a header,
 * not written to a cookie, because it is a guess to be confirmed rather than a
 * fact worth persisting. Only the country the user confirms is ever kept, and
 * that is kept by the client.
 *
 * Expect the guess to be wrong often. Crypto people live behind VPNs, which is
 * exactly why the interface confirms rather than assumes.
 */

import { GEO_HEADER } from "@/lib/geo";

export default function proxy(request: NextRequest) {
  const country =
    request.headers.get("x-vercel-ip-country") ??
    request.headers.get("cf-ipcountry") ??
    "";

  const headers = new Headers(request.headers);
  if (/^[A-Z]{2}$/i.test(country) && country.toUpperCase() !== "XX") {
    headers.set(GEO_HEADER, country.toUpperCase());
  } else {
    headers.delete(GEO_HEADER);
  }

  return NextResponse.next({ request: { headers } });
}

export const config = {
  matcher: ["/", "/assess"],
};
