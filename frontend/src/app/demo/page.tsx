import { loadFixtures } from "@/lib/fixtures";
import { ISO3 } from "@/lib/coverage";
import { DemoGallery } from "@/components/DemoGallery";
import type { MrzInput } from "@/lib/mrz";

/**
 * Every card state, from saved responses, with no network call.
 *
 * This route exists so the card can be designed and reviewed against real
 * output. It includes the withheld state, which is the one that would
 * otherwise only be seen when something went wrong and so would never get
 * looked at properly.
 */
export default function Page() {
  const fixtures = loadFixtures();

  const cards = fixtures.map((fixture) => {
    const mrz: MrzInput = {
      passportIso3: ISO3[fixture.profile.passportCountry] ?? "XXX",
      passportCountry: fixture.profile.passportCountry,
      residenceCountry: fixture.profile.residenceCountry,
      residenceCity: fixture.profile.residenceCity,
      destination: fixture.profile.destination,
      schengenState: fixture.profile.schengenState,
      purpose: fixture.profile.purpose,
      tripLengthDays: fixture.profile.tripLengthDays,
      verdict: fixture.response.verdict,
      sourceYear: fixture.response.sourceYear,
    };
    return { name: fixture.name, response: fixture.response, mrz };
  });

  return <DemoGallery cards={cards} empty={fixtures.length === 0} />;
}
