"""Curated financial requirement records, the fourth source in the spec.

Why this one is hand transcribed and the other three are parsed.

The refusal sources are tables. A script reads a cell and the number is the
number. This source is prose, one section per state, written by that state's
own administration and notified to the Commission. Belgium gives two amounts
depending on where you sleep. Italy gives a grid keyed on trip length. Germany
and Norway say plainly that no mandatory amount exists and then offer a figure
anyway. Austria says there is no figure at all. Turning that into a number per
state is a reading, not a parse, so it is done here in the open where it can be
checked line by line against the annex, rather than hidden in a regex that
would quietly pick the wrong euro sign.

Scope is the three destinations the product supports. The asymmetry is the
finding, not a gap: the Schengen states each publish a per day amount, and the
UK and US publish none and assess adequacy case by case. Where nothing is
published the record says so. No rule of thumb, no forum figure and no number
from a visa agency site is ever substituted for a missing one.

Every amount below was read from an official government page. The Schengen
figures come from the Commission annex, which is the states' own notified
amounts. Five states were also checked against their own national page, and
where the two disagree the national page wins, because a state is the
authority on its own amount. That check is recorded per record in
national_source so a reviewer can see exactly which figures rest on the
Commission compilation alone.
"""

# The Commission annex, shared by every Schengen record. Kept here rather than
# read from the manifest so this file states its own provenance and can be
# reviewed without running anything.
ANNEX_SOURCE_URL = (
    "https://home-affairs.ec.europa.eu/document/download/"
    "7130e21d-c1c8-41fd-9c83-b6fe312d4f5c_en"
)
ANNEX_LANDING_URL = "https://home-affairs.ec.europa.eu/policies/schengen/border-crossing_en"
ANNEX_VERSION = "01/04/2026"
ANNEX_YEAR = 2026

RETRIEVED_AT = "2026-08-18"

# basis, the field the spec asks for. Every record carries exactly one.
#   per_day                     one amount for each day of the stay
#   per_day_and_per_entry       a daily amount plus a fixed amount per entry
#   per_day_tiered_by_duration  the daily rule changes at a length of stay
#   per_trip_tiered_by_duration a whole trip amount that changes with length
#   none_published              the state publishes no amount
BASES = {
    "per_day",
    "per_day_and_per_entry",
    "per_day_tiered_by_duration",
    "per_trip_tiered_by_duration",
    "none_published",
}

# amount_status, how much weight the figure carries in the state's own words.
#   binding                 the state cites a law, decree or regulation fixing it
#   administrative_practice the state calls it its practice, not a fixed rule
#   indicative              the state says no mandatory amount is set, then
#                           offers a figure only as an indication
#   none_published          no figure at all
AMOUNT_STATUSES = {
    "binding",
    "administrative_practice",
    "indicative",
    "none_published",
}


def schengen(
    state,
    iso3,
    basis,
    amount_status,
    currency=None,
    per_day=None,
    per_entry=None,
    trip_minimum=None,
    applies_to=None,
    variants=(),
    legal_basis=None,
    notes=None,
    national_source=None,
    in_schengen_area=True,
):
    """One Schengen state's requirement, as published in the Commission annex."""
    return {
        "jurisdiction": "Schengen area",
        "state": state,
        "iso3": iso3,
        "in_schengen_area": in_schengen_area,
        "basis": basis,
        "currency": currency,
        "per_day_amount": per_day,
        "per_entry_amount": per_entry,
        "trip_minimum_amount": trip_minimum,
        "amount_status": amount_status,
        "applies_to": applies_to,
        "variants": list(variants),
        "legal_basis": legal_basis,
        "notes": notes,
        "source_url": ANNEX_SOURCE_URL,
        "source_landing_url": ANNEX_LANDING_URL,
        "source_version": ANNEX_VERSION,
        "source_year": ANNEX_YEAR,
        "national_source": national_source,
    }


def variant(
    condition,
    basis,
    amount=None,
    currency="EUR",
    note=None,
    min_days=None,
    max_days=None,
    participants=None,
    applies_to_iso3=None,
):
    """Another amount the same state publishes for a different situation.

    min_days, max_days, participants and applies_to_iso3 exist so a caller can
    select the right variant without parsing the English in condition. Italy
    keys its grid on trip length and party size, Poland changes rule at 4 days,
    and Romania routes some nationalities through an inviting party. A backend
    that had to regex "1 to 5 days" out of prose would eventually pick the
    wrong row silently, which is the failure this product cannot afford. The
    fields restate what condition already says, they never add a requirement
    the source does not state.
    """
    return {
        "condition": condition,
        "basis": basis,
        "amount": amount,
        "currency": currency,
        "note": note,
        "min_days": min_days,
        "max_days": max_days,
        "participants": participants,
        "applies_to_iso3": applies_to_iso3,
    }


# The five states checked against their own national page as well as the
# annex. Recorded as structures so the JSON carries the check, not just a
# claim in a comment.
ES_NATIONAL = {
    "publisher": "Ministerio del Interior",
    "url": (
        "https://www.interior.gob.es/opencms/es/servicios-al-ciudadano/"
        "tramites-y-gestiones/extranjeria/regimen-general/"
        "entrada-requisitos-y-condiciones/"
    ),
    "checked_on": RETRIEVED_AT,
    "states_an_amount": True,
    "agrees_with_annex": False,
    "note": (
        "The ministry page reads: the minimum amount to be shown is 121.10 "
        "euros per person per day, with a minimum of 1,098.90 euros, with "
        "effect from 1 January 2026. The Commission annex says 122.10 euros "
        "per day with the same 1,098.90 minimum. The national figure is "
        "recorded here because a state is the authority on its own amount. "
        "Note also that the daily figure is defined as 10 percent of the "
        "gross minimum wage and the floor as 90 percent of it, and the two "
        "published numbers do not sit on the same monthly wage. Both are "
        "recorded as published rather than recomputed, because the "
        "arithmetic is the ministry's to do, not this repository's."
    ),
}

FR_NATIONAL = {
    "publisher": "Service-Public, Direction de l'information legale et administrative",
    "url": "https://www.service-public.gouv.fr/particuliers/vosdroits/F21921?lang=fr",
    "checked_on": RETRIEVED_AT,
    "states_an_amount": True,
    "agrees_with_annex": True,
    "note": (
        "Page verified 12 October 2025, giving the same three amounts as the "
        "annex: 32.50 euros with an attestation d'accueil, 65 euros with a "
        "hotel reservation, 120 euros with no proof of accommodation. Worth "
        "the check because the annex anchors the 65 euro figure to the daily "
        "SMIC as of 1 January 2012, which reads as stale even though the "
        "operative amounts are current."
    ),
}

CZ_NATIONAL = {
    "publisher": "Ministry of Foreign Affairs of the Czech Republic",
    "url": (
        "https://mzv.gov.cz/ottawa/en/visa_and_consular_services/"
        "specific_visa_information_for_foreigners/short_term_visas/"
        "financial_means_for_the_stay.html"
    ),
    "checked_on": RETRIEVED_AT,
    "states_an_amount": True,
    "agrees_with_annex": True,
    "note": (
        "Page last updated 21 July 2025, confirming 1,565 CZK per day against "
        "a subsistence minimum of 3,130 CZK. Checked because the annex ties "
        "the amount to a subsistence minimum quoted as of 1 January 2023, so "
        "the figure moves whenever that minimum moves."
    ),
}

PT_NATIONAL = {
    "publisher": "Ministerio dos Negocios Estrangeiros, Portuguese visa portal",
    "url": (
        "https://vistos.mne.gov.pt/en/short-stay-visas-schengen/"
        "required-documentation/means-of-subsistence"
    ),
    "checked_on": RETRIEVED_AT,
    "states_an_amount": True,
    "agrees_with_annex": True,
    "note": (
        "The visa portal gives 75 euros for each entry and 40 euros for each "
        "day, matching the annex."
    ),
}

LU_NATIONAL = {
    "publisher": "Guichet.lu, Luxembourg government portal",
    "url": (
        "https://guichet.public.lu/en/citoyens/immigration/moins-3-mois/"
        "ressortissant-tiers/entree-visa.html"
    ),
    "checked_on": RETRIEVED_AT,
    "states_an_amount": False,
    "agrees_with_annex": None,
    "note": (
        "The national page, last updated 17 November 2025, asks for proof of "
        "sufficient means of subsistence and publishes no amount at all. The "
        "67 euro figure recorded here exists only in the Commission annex, "
        "where it is tied to the minimum wage for an unskilled worker as of "
        "1 January 2018. Treat it as the weakest figure in this dataset."
    ),
}


# One record per state, in the order the annex prints them.
SCHENGEN_RECORDS = [
    schengen(
        "Belgium", "BEL", "per_day", "administrative_practice",
        currency="EUR", per_day=95.0,
        applies_to="traveller staying at a hotel who cannot show any other credit",
        variants=[
            variant(
                "staying with a private individual, with no other credit at all",
                "per_day", 45.0,
            ),
            variant(
                "host signs a letter of guarantee authenticated by their municipality",
                "none", None,
                note=(
                    "The declaration covers stay, health care, accommodation and "
                    "repatriation. Personal funds may still be asked for."
                ),
            ),
        ],
        legal_basis="Belgian law requires adequate means. The amounts are administrative practice.",
        notes="A return travel ticket is required in most cases.",
    ),
    schengen(
        "Bulgaria", "BGR", "per_day", "binding",
        currency="EUR", per_day=50.0, trip_minimum=500.0,
        applies_to="subsistence for each day of the stay requested in the application",
        variants=[
            variant(
                "accommodation, charged separately from subsistence",
                "per_day", 50.0,
                note=(
                    "A second requirement of not less than 50 euros per day, or "
                    "prepaid hotel nights, or an invitation declaration. It is "
                    "not added to the subsistence amount here: the state states "
                    "two requirements and this dataset does not do arithmetic "
                    "across them."
                ),
            ),
            variant("transit", "per_trip", 50.0),
        ],
        legal_basis=(
            "Article 17 of the Ordinance on the Terms and Conditions for Issuing "
            "Visas and Determining the Visa Regime, Decree No 198 of 11 July 2011, "
            "last amended 13 May 2022."
        ),
        notes=(
            "Amounts may be shown in BGN or another freely convertible currency. "
            "Proof of funds to leave the country, or a ticket, is also required."
        ),
    ),
    schengen(
        "Croatia", "HRV", "per_day", "binding",
        currency="EUR", per_day=70.0,
        applies_to="traveller with no letter of guarantee and no tourist booking",
        variants=[
            variant(
                "holds a certified letter of guarantee or proof of a tourist booking",
                "per_day", 30.0,
            ),
            variant(
                "guarantor assumes all costs of stay and departure",
                "none", None,
                note="Exempt from showing means entirely.",
            ),
        ],
        legal_basis=(
            "Article 9 of the Regulation on the Visa Regime, Official Gazette of "
            "the Republic of Croatia No 92/2021."
        ),
    ),
    schengen(
        "Czech Republic", "CZE", "per_day", "binding",
        currency="CZK", per_day=1565.0,
        applies_to="stays not exceeding 30 days",
        variants=[
            variant(
                "stays exceeding 30 days",
                "per_trip", 46950.0, currency="CZK",
                note="Plus 6,260 CZK for each whole month of the intended stay.",
                min_days=31,
            ),
            variant(
                "traveller under 18",
                "per_day", None, currency="CZK",
                note=(
                    "Half the amounts above. The amount is null because the "
                    "state publishes a rule and not a figure, and halving it "
                    "here would put a number in this dataset that no "
                    "government printed."
                ),
            ),
        ],
        legal_basis=(
            "Section 13 of Act No 326/1999 Coll. read with Section 5 of Act No "
            "110/2006 Coll. on living and subsistence minimum. The daily figure "
            "is 0.5 times the subsistence minimum of 3,130 CZK."
        ),
        notes=(
            "The amount tracks the subsistence minimum, so it moves whenever "
            "that minimum is revised."
        ),
        national_source=CZ_NATIONAL,
    ),
    schengen(
        "Denmark", "DNK", "per_day", "administrative_practice",
        currency="DKK", per_day=350.0,
        applies_to="each 24 hours of the stay",
        legal_basis="Danish Aliens Law. The figure is set by the administration, in principle.",
        notes=(
            "Border control makes a specific appraisal of the traveller's "
            "economic situation. Means for the return journey, for example a "
            "return ticket, are required on top."
        ),
    ),
    schengen(
        "Germany", "DEU", "per_day", "indicative",
        currency="EUR", per_day=45.0,
        applies_to=(
            "traveller who cannot evidence their circumstances or make credible "
            "statements about them"
        ),
        legal_basis="Article 15(2) of the Residence Act of 30 July 2004.",
        notes=(
            "Germany states plainly that mandatory reference amounts per day "
            "have not been set and that officials examine each case "
            "individually, weighing the nature and purpose of the journey, the "
            "length of stay, whether the traveller is staying with relatives or "
            "friends, and subsistence costs. The 45 euro figure is the fallback "
            "when nothing else can be shown, not a threshold to clear."
        ),
    ),
    schengen(
        "Estonia", "EST", "per_day", "binding",
        currency="EUR", per_day=70.0,
        applies_to="each day allowed",
        legal_basis="Estonian law on entry, means to cover stay and departure.",
    ),
    schengen(
        "Greece", "GRC", "per_day", "binding",
        currency="EUR", per_day=50.0, trip_minimum=300.0,
        applies_to="each person per day, with a floor for stays up to 5 days",
        variants=[
            variant(
                "minors", "per_day", None,
                note=(
                    "The decision reduces the amounts by 50 percent. Recorded "
                    "as a rule rather than a computed figure."
                ),
            ),
        ],
        legal_basis="Common Ministerial Decision No 3021/22/10-f of 24 December 2007.",
        notes="The 300 euro floor is stated for a stay of up to 5 days.",
    ),
    schengen(
        "Spain", "ESP", "per_day", "binding",
        currency="EUR", per_day=121.10, trip_minimum=1098.90,
        applies_to="each person per day, with a floor regardless of length of stay",
        legal_basis=(
            "Order PRE/1282/2007 of 10 May 2007. The daily amount is 10 percent "
            "of the gross national minimum wage and the floor is 90 percent of "
            "it, so both move when that wage moves."
        ),
        notes=(
            "The highest daily amount in the Schengen area by a wide margin, and "
            "the one most likely to decide a marginal case. The figure recorded "
            "is the ministry's, effective 1 January 2026, and differs from the "
            "Commission annex by one euro. See national_source."
        ),
        national_source=ES_NATIONAL,
    ),
    schengen(
        "France", "FRA", "per_day", "binding",
        currency="EUR", per_day=120.0,
        applies_to="traveller with no proof of accommodation",
        variants=[
            variant("hotel reservation covering the period", "per_day", 65.0),
            variant("holds an attestation d'accueil", "per_day", 32.50),
        ],
        legal_basis=(
            "Reference amount tied to the guaranteed minimum wage, SMIC, with "
            "the accommodation based amounts applying from 19 June 2014."
        ),
        notes=(
            "Where a hotel reservation covers only part of the stay, 65 euros "
            "applies to the covered period and 120 euros to the rest. Insurance "
            "covering medical, hospital and repatriation costs is also required."
        ),
        national_source=FR_NATIONAL,
    ),
    schengen(
        "Italy", "ITA", "per_trip_tiered_by_duration", "binding",
        currency="EUR",
        applies_to="tourism, one participant, amount depends on the length of the trip",
        variants=[
            variant(
                "1 to 5 days, one participant", "per_trip", 269.60,
                min_days=1, max_days=5, participants="one",
            ),
            variant(
                "1 to 5 days, two or more participants, each", "per_trip", 212.81,
                min_days=1, max_days=5, participants="two_or_more",
            ),
            variant(
                "6 to 10 days, one participant", "per_day", 44.93,
                min_days=6, max_days=10, participants="one",
            ),
            variant(
                "6 to 10 days, two or more participants, each", "per_day", 26.33,
                min_days=6, max_days=10, participants="two_or_more",
            ),
            variant(
                "11 to 20 days, one participant", "per_trip", 51.64,
                note="Fixed sum of 51.64 euros plus 36.67 euros per day.",
                min_days=11, max_days=20, participants="one",
            ),
            variant(
                "11 to 20 days, two or more participants, each", "per_trip", 25.82,
                note="Fixed sum of 25.82 euros plus 22.21 euros per day.",
                min_days=11, max_days=20, participants="two_or_more",
            ),
            variant(
                "more than 20 days, one participant", "per_trip", 206.58,
                note="Fixed sum of 206.58 euros plus 27.89 euros per day.",
                min_days=21, max_days=None, participants="one",
            ),
            variant(
                "more than 20 days, two or more participants, each", "per_trip", 118.79,
                note="Fixed sum of 118.79 euros plus 17.04 euros per day.",
                min_days=21, max_days=None, participants="two_or_more",
            ),
        ],
        legal_basis=(
            "Article 4(3) of Legislative Decree No 286 of 28 July 1998, with the "
            "directive of 1 March 2000 defining means of support, Table A."
        ),
        notes=(
            "per_day_amount is null on purpose. Italy publishes a grid, not a "
            "daily rate: below 6 days the requirement is a single fixed sum, and "
            "above 10 days it is a fixed sum plus a daily rate. Collapsing that "
            "to one number would misstate it for most trip lengths, so the grid "
            "is kept in variants and the caller must read the trip length."
        ),
    ),
    schengen(
        "Cyprus", "CYP", "none_published", "none_published",
        applies_to=None,
        legal_basis="Aliens and Immigration Regulations, Regulation 9(2)(B).",
        notes=(
            "Cyprus publishes no reference amount. Entry is at the discretion of "
            "immigration officers case by case, weighing purpose and length of "
            "stay, hotel reservations and hospitality by residents. Cyprus does "
            "not fully apply the Schengen acquis and issues national visas "
            "rather than Schengen uniform visas, so this record is kept out of "
            "every Schengen aggregate, matching the treatment in the consulate "
            "dataset."
        ),
        in_schengen_area=False,
    ),
    schengen(
        "Latvia", "LVA", "per_day", "binding",
        currency="EUR", per_day=14.0,
        applies_to="stays not exceeding 30 days",
        variants=[
            variant(
                "stays exceeding 30 days", "per_trip", 700.0,
                note="No less than the minimum monthly wage.",
                min_days=31,
            ),
            variant(
                "inviting party registered as covering the costs",
                "none", None,
                note="No proof of means required from the traveller.",
            ),
        ],
        legal_basis="Law on Immigration, with Cabinet Regulation No 225.",
        notes=(
            "The lowest daily amount in the Schengen area. The means must cover "
            "the stay in Latvia and in other Schengen states where the trip "
            "continues, plus the return or onward journey."
        ),
    ),
    schengen(
        "Lithuania", "LTU", "per_day", "binding",
        currency="EUR", per_day=50.0,
        applies_to="each day of the intended stay",
        variants=[
            variant(
                "formal invitation submitted through MIGRIS",
                "none", None,
                note=(
                    "The inviting person takes on responsibility for "
                    "accommodation and financial support for the requested stay."
                ),
            ),
        ],
        legal_basis=(
            "Paragraph 8 of the Order of the Minister of Foreign Affairs No "
            "V-227 of 4 July 2023."
        ),
        notes="Does not apply to a minor travelling with an adult family member.",
    ),
    schengen(
        "Luxembourg", "LUX", "per_day", "administrative_practice",
        currency="EUR", per_day=67.0,
        applies_to="each day of the planned stay",
        variants=[
            variant(
                "statement of financial liability endorsed by the Luxembourg "
                "Office for Passports, Visas and Legalisation",
                "none", None,
            ),
        ],
        legal_basis=(
            "Reference amount is the minimum wage for an unskilled worker, "
            "quoted in the annex as approximately 67 euros per day as of "
            "1 January 2018."
        ),
        notes=(
            "The weakest figure in this dataset. It is stated as approximate, "
            "it is anchored to a 2018 wage, and Luxembourg's own national page "
            "publishes no amount at all. See national_source."
        ),
        national_source=LU_NATIONAL,
    ),
    schengen(
        "Hungary", "HUN", "per_day", "binding",
        currency="EUR", per_day=40.0,
        applies_to="each day of planned stay",
        legal_basis=(
            "Article 24 of Decree of the Minister of Interior No 9 of 2024, "
            "implementing Act XC of 2023."
        ),
    ),
    schengen(
        "Malta", "MLT", "per_day", "administrative_practice",
        currency="EUR", per_day=48.0,
        applies_to="each day of the visit",
        legal_basis="Stated as the practice, with no instrument cited.",
    ),
    schengen(
        "Netherlands", "NLD", "per_day", "administrative_practice",
        currency="EUR", per_day=55.0,
        applies_to="each person per day",
        legal_basis="The basis border control officials use when checking means.",
        notes=(
            "Applied flexibly. The state says the required amount is determined "
            "on the planned duration, the reason for the visit and the personal "
            "circumstances of the traveller."
        ),
    ),
    schengen(
        "Austria", "AUT", "none_published", "none_published",
        applies_to=None,
        legal_basis="Article 41(2) of the Aliens Act.",
        notes=(
            "Austria states there are no reference amounts. Decisions are made "
            "case by case on the purpose, type and duration of the stay. Cash, "
            "travellers cheques, credit cards, bank guarantees and letters of "
            "guarantee from solvent residents may all be accepted as proof."
        ),
    ),
    schengen(
        "Poland", "POL", "per_day_tiered_by_duration", "binding",
        currency="PLN", per_day=75.0,
        applies_to="stays longer than 4 days",
        variants=[
            variant(
                "stays of 4 days or less", "per_trip", 300.0, currency="PLN",
                min_days=1, max_days=4,
            ),
            variant(
                "participant in a tourist event, youth camp or sports event, or "
                "stay already paid for",
                "per_day", 20.0, currency="PLN",
                note="No less than 100 PLN in total.",
            ),
            variant(
                "return journey funds, arriving from a non EU country",
                "per_trip", 2500.0, currency="PLN",
                note=(
                    "A separate requirement on top of subsistence. 500 PLN from "
                    "another EU member state, 200 PLN from a neighbouring "
                    "country."
                ),
            ),
        ],
        legal_basis=(
            "Regulation of the Minister of the Interior of 23 February 2015, "
            "Journal of Laws of 2017, item 2122."
        ),
        notes=(
            "The return journey amount matters here: a traveller arriving from "
            "outside the EU must show 2,500 PLN for the return on top of the "
            "daily subsistence figure. The two are not summed in this record."
        ),
    ),
    schengen(
        "Portugal", "PRT", "per_day_and_per_entry", "binding",
        currency="EUR", per_day=40.0, per_entry=75.0,
        applies_to="each day on the territory, plus a fixed amount for each entry",
        variants=[
            variant(
                "board and lodging proven to be guaranteed for the stay",
                "none", None,
            ),
        ],
        national_source=PT_NATIONAL,
    ),
    schengen(
        "Romania", "ROU", "per_day", "binding",
        currency="EUR", per_day=50.0, trip_minimum=500.0,
        applies_to=(
            "short stay visa for tourism, visit, business, cultural or "
            "scientific activity, humanitarian or medical purposes"
        ),
        variants=[
            variant(
                "nationals subject to the invitation procedure",
                "per_day", 30.0,
                note=(
                    "Made available by the inviting person or company rather "
                    "than held by the traveller. The list in Order of the "
                    "Minister of Foreign Affairs No 1743/2010 includes seven of "
                    "the twelve passports this product covers: Bangladesh, "
                    "Egypt, India, Indonesia, Morocco, Nigeria and Pakistan. "
                    "applies_to_iso3 carries only those seven, not the whole "
                    "order, because the other countries on it are outside this "
                    "product's coverage."
                ),
                applies_to_iso3=["BGD", "EGY", "IND", "IDN", "MAR", "NGA", "PAK"],
            ),
            variant(
                "mission, professional transport or sport related activity",
                "none", None,
                note="Possible without showing proof of means of subsistence.",
            ),
        ],
        legal_basis="Aliens Act No 194/2002.",
        notes=(
            "Read the invitation procedure variant before using the headline "
            "figure for our passports. For most of the nationalities this "
            "product covers, Romania routes the requirement through an inviting "
            "party at 30 euros per day rather than 50 euros held by the "
            "traveller."
        ),
    ),
    schengen(
        "Slovenia", "SVN", "per_day", "binding",
        currency="EUR", per_day=70.0,
        applies_to="traveller with no secured means such as a sponsorship declaration",
        variants=[
            variant(
                "minors accompanied by a parent or legal representative",
                "per_day", None,
                note=(
                    "50 percent of the adult amount. Recorded as a rule rather "
                    "than a computed figure."
                ),
            ),
        ],
        legal_basis=(
            "Article 2 of the Rules implementing the Schengen Borders Code, "
            "Official Gazette of the Republic of Slovenia No 29/07."
        ),
        notes=(
            "The daily amount is used only where the traveller has no "
            "declaration of sponsorship, letter of guarantee or paid "
            "accommodation as part of a tourist arrangement."
        ),
    ),
    schengen(
        "Slovakia", "SVK", "per_day", "binding",
        currency="EUR", per_day=56.0,
        applies_to="each person per day",
        variants=[
            variant(
                "certified invitation or a hosting agreement",
                "none", None,
            ),
        ],
        legal_basis=(
            "Section 1(1) of Implementing Decree No 499/2011 of the Slovak "
            "Ministry of the Interior."
        ),
        notes=(
            "The state itemises the 56 euros: 30 for accommodation, 4 for "
            "breakfast, 7.50 for lunch, 7.50 for dinner and 7 spending money. "
            "Partial coverage of costs is taken into account at the border."
        ),
    ),
    schengen(
        "Finland", "FIN", "per_day", "indicative",
        currency="EUR", per_day=50.0,
        applies_to="in addition to funds or tickets for departure and accommodation",
        legal_basis="Aliens Act 301/2004, paragraph 11.",
        notes=(
            "Finland states that funds are considered sufficient case by case "
            "and that approximately 50 euros per day is considered necessary "
            "depending on accommodation arrangements and any sponsor. The "
            "figure sits on top of departure and accommodation costs rather "
            "than covering them."
        ),
    ),
    schengen(
        "Sweden", "SWE", "per_day", "binding",
        currency="SEK", per_day=450.0,
        applies_to="each day of the stay",
        legal_basis="Set by Swedish legislation as of 15 November 2011.",
    ),
    schengen(
        "Iceland", "ISL", "per_day_and_per_entry", "administrative_practice",
        currency="ISK", per_day=8000.0, per_entry=40000.0,
        applies_to="each person per day, with a total minimum for each entry",
        variants=[
            variant(
                "expenses borne by a third party",
                "per_day", None, currency="ISK",
                note=(
                    "The state says the amount is halved. Recorded as a rule "
                    "rather than a computed figure."
                ),
            ),
        ],
        legal_basis="Icelandic law requires means for the stay and the return journey.",
        notes=(
            "per_entry_amount here is a floor on the total, not a fee: the "
            "annex calls it the total minimum amount for each entry."
        ),
    ),
    schengen(
        "Norway", "NOR", "per_day", "indicative",
        currency="NOK", per_day=500.0,
        applies_to="visitors not staying with relations or friends",
        legal_basis="Section 17(f) of the Norwegian Immigration Act.",
        notes=(
            "Norway states that amounts are fixed individually and decided case "
            "by case on the length of stay, whether the traveller stays with "
            "family or friends, whether they hold a return ticket and whether a "
            "guarantee has been given. The 500 NOK figure is offered only as an "
            "indication."
        ),
    ),
    schengen(
        "Switzerland", "CHE", "per_day", "administrative_practice",
        currency="CHF", per_day=100.0,
        applies_to="foreign nationals bearing their own costs",
        variants=[
            variant(
                "student with a valid student card",
                "per_day", 30.0, currency="CHF",
            ),
            variant(
                "staying with a private individual who signs a declaration of liability",
                "none", None,
                note=(
                    "The declaration is an acknowledgement of an irrecoverable "
                    "debt set at 30,000 CHF, covering subsistence, accident and "
                    "sickness costs and the cost of return."
                ),
            ),
        ],
        legal_basis=(
            "Swiss Aliens Act of 16 December 2005, RS 142.20, which requires "
            "necessary financial resources without specifying details. The "
            "amounts are administrative practice."
        ),
    ),
    schengen(
        "Liechtenstein", "LIE", "per_day", "administrative_practice",
        currency="CHF", per_day=100.0,
        applies_to="third country nationals bearing their own costs",
        variants=[
            variant(
                "student with a valid student ID",
                "per_day", 30.0, currency="CHF",
            ),
            variant(
                "living at a private residence with a signed Verpflichtungserklaerung",
                "none", None,
                note=(
                    "The host's formal undertaking carries an irrevocable "
                    "liability of 30,000 CHF."
                ),
            ),
        ],
        legal_basis="National practice as notified to the Commission.",
    ),
]


# The two destinations that publish nothing. The absence is the record.
NON_SCHENGEN_RECORDS = [
    {
        "jurisdiction": "United Kingdom",
        "state": "United Kingdom",
        "iso3": "GBR",
        "in_schengen_area": False,
        "basis": "none_published",
        "currency": None,
        "per_day_amount": None,
        "per_entry_amount": None,
        "trip_minimum_amount": None,
        "amount_status": "none_published",
        "applies_to": None,
        "variants": [],
        "legal_basis": (
            "Immigration Rules Appendix V: Visitor, paragraphs V 4.2(e) and "
            "V 4.3. Funds relied on must be held in a financial institution "
            "permitted under FIN 2.1 of Appendix Finance."
        ),
        "notes": (
            "Checked directly: the text of Appendix V contains no sterling "
            "figure and no per day figure anywhere. The caseworker guidance is "
            "explicit that there is no set level of funds. Third party support "
            "is allowed only where the third party has a genuine professional "
            "or personal relationship with the applicant, is not in breach of "
            "immigration laws, and can and will support them for the stay."
        ),
        "source_url": (
            "https://www.gov.uk/guidance/immigration-rules/"
            "immigration-rules-appendix-v-visitor"
        ),
        "source_landing_url": (
            "https://www.gov.uk/government/publications/visit-guidance"
        ),
        "source_version": "Visit guidance version 17.0, published 25 February 2026",
        "source_year": 2026,
        "national_source": {
            "publisher": "UK Home Office, Visit guidance for caseworkers",
            "url": "https://www.gov.uk/government/publications/visit-guidance",
            "checked_on": RETRIEVED_AT,
            "states_an_amount": False,
            "agrees_with_annex": None,
            "note": (
                "Version 17.0, published for Home Office staff on 25 February "
                "2026, reads: check the applicant has access to sufficient "
                "resources to maintain and accommodate themselves adequately "
                "for the whole of their planned visit. There is no set level of "
                "funds required for an applicant to show this."
            ),
        },
    },
    {
        "jurisdiction": "United States",
        "state": "United States",
        "iso3": "USA",
        "in_schengen_area": False,
        "basis": "none_published",
        "currency": None,
        "per_day_amount": None,
        "per_entry_amount": None,
        "trip_minimum_amount": None,
        "amount_status": "none_published",
        "applies_to": None,
        "variants": [],
        "legal_basis": (
            "INA 101(a)(15)(B) with 9 FAM 402.2-2(E), which requires that the "
            "arrangements made for defraying the expenses of the visit and "
            "return abroad be adequate to prevent the applicant obtaining "
            "unlawful employment in the United States."
        ),
        "notes": (
            "Checked directly: the B visa chapter of the Foreign Affairs Manual "
            "contains no dollar figure anywhere. Funds are weighed by the "
            "consular officer alongside the INA 214(b) presumption of immigrant "
            "intent. For medical treatment cases the manual asks for projected "
            "costs and evidence they can be met, which is a case specific test "
            "rather than a threshold."
        ),
        "source_url": "https://fam.state.gov/fam/09FAM/09FAM040202.html",
        "source_landing_url": "https://fam.state.gov/fam/09FAM/09FAM040202.html",
        "source_version": "9 FAM 402.2, CT:VISA-2193, 19 March 2026",
        "source_year": 2026,
        "national_source": {
            "publisher": "US Department of State, Foreign Affairs Manual",
            "url": "https://fam.state.gov/fam/09FAM/09FAM040202.html",
            "checked_on": RETRIEVED_AT,
            "states_an_amount": False,
            "agrees_with_annex": None,
            "note": (
                "The Foreign Affairs Manual is cited rather than the visitor "
                "visa page on travel.state.gov. That page sits behind bot "
                "verification and could not be read, so it is not cited here: "
                "nothing in this dataset points at a page that was not "
                "actually retrieved. The manual is the instruction consular "
                "officers work from, so it is the better source in any case."
            ),
        },
    },
]

RECORDS = SCHENGEN_RECORDS + NON_SCHENGEN_RECORDS
