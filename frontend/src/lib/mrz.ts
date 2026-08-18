/**
 * The machine readable zone along the bottom edge of the verdict card.
 *
 * Two lines of 44 characters in the TD3 shape you find under a passport photo
 * page, with the real ICAO 9303 check digit algorithm, generated from the
 * profile actually assessed.
 *
 * One deliberate departure. A real TD3 first line begins "P<" for passport,
 * and the second line carries a document number, date of birth and sex. This
 * zone begins "GL" and carries none of those. The card is a product graphic,
 * not a travel document, and building something that reads as a genuine
 * passport MRZ, with a document number in the right columns, would be making a
 * prop that could be mistaken for the real thing. The visual language is the
 * point; imitating the document is not. So the fields here are the ones this
 * product actually knows: nationality, where the application is made,
 * destination, purpose, trip length, verdict and the source year.
 */

const FILLER = "<";
const LINE_LENGTH = 44;

/** ICAO 9303 weighting: 7, 3, 1 repeating, letters as A=10 through Z=35. */
function checkDigit(input: string): string {
  const weights = [7, 3, 1];
  let sum = 0;
  for (let i = 0; i < input.length; i += 1) {
    const char = input[i]!;
    let value: number;
    if (char >= "0" && char <= "9") value = char.charCodeAt(0) - 48;
    else if (char >= "A" && char <= "Z") value = char.charCodeAt(0) - 55;
    else value = 0; // The filler character is worth zero.
    sum += value * weights[i % 3]!;
  }
  return String(sum % 10);
}

/** Uppercase, strip anything outside the MRZ alphabet, spaces become filler. */
function sanitise(value: string): string {
  return value
    .toUpperCase()
    .replace(/[^A-Z0-9 ]/g, "")
    .trim()
    .replace(/\s+/g, FILLER);
}

function pad(value: string, length: number): string {
  return value.slice(0, length).padEnd(length, FILLER);
}

/** Numeric fields in a real MRZ are zero padded on the left, not filler padded. */
function padNumber(value: number, length: number): string {
  return String(Math.max(0, Math.trunc(value))).slice(-length).padStart(length, "0");
}

export interface MrzInput {
  passportIso3: string;
  passportCountry: string;
  residenceCountry: string;
  residenceCity?: string | undefined;
  destination: string;
  schengenState?: string | undefined;
  purpose: string;
  tripLengthDays: number;
  verdict: string;
  sourceYear: number;
}

/** Three letter code for the destination, in the same spirit as a state code. */
function destinationCode(destination: string, state?: string): string {
  if (state) return pad(sanitise(state), 3);
  if (destination === "United Kingdom") return "GBR";
  if (destination === "United States") return "USA";
  if (destination === "Schengen area") return "SCH";
  return pad(sanitise(destination), 3);
}

export function buildMrz(input: MrzInput): [string, string] {
  const destCode = destinationCode(input.destination, input.schengenState);
  const place = sanitise(input.residenceCity ?? input.residenceCountry);

  // Line one: document type, destination, and the holder identity fields this
  // product actually holds, which are a nationality and a place of application.
  const line1Body =
    `GL${destCode}` +
    pad(sanitise(input.passportCountry), 16) +
    FILLER +
    FILLER +
    pad(place, 21);
  const line1 = pad(line1Body, LINE_LENGTH);

  // Line two: the assessment itself, each field followed by its check digit,
  // then a composite check digit over the whole run, exactly as 9303 does it.
  const nationality = pad(sanitise(input.passportIso3), 3);
  const purpose = pad(sanitise(input.purpose), 10);
  const days = padNumber(input.tripLengthDays, 3);
  const year = pad(String(input.sourceYear), 4);
  const verdict = pad(sanitise(input.verdict), 8);

  const composite = `${nationality}${purpose}${days}${year}`;
  const line2Body =
    nationality +
    checkDigit(nationality) +
    purpose +
    checkDigit(purpose) +
    days +
    checkDigit(days) +
    year +
    checkDigit(year) +
    verdict +
    checkDigit(composite);
  const line2 = pad(line2Body, LINE_LENGTH);

  return [line1, line2];
}
