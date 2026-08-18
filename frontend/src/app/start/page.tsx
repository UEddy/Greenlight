import { headers } from "next/headers";
import { GEO_HEADER } from "@/lib/geo";
import { countryFromCode } from "@/lib/coverage";
import { Onboarding } from "@/components/Onboarding";

/**
 * The onboarding conversation. A conversation, not a form.
 *
 * The country guess is read from the header the edge already set. This server
 * component never sees an IP address and never logs anything about the
 * request.
 */
export default async function Page() {
  const headerList = await headers();
  const guess = countryFromCode(headerList.get(GEO_HEADER));

  return <Onboarding guessedCountry={guess} />;
}
