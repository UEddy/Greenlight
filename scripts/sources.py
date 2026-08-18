"""Source registry for the GreenLight dataset build.

This module is the single place that knows where raw data comes from. Both
scripts/fetch-sources.py and scripts/build-dataset.py import it, so a URL is
never written down twice and cannot drift between the two steps.

Four sources are registered. Three are statistical files that a script parses
into refusal records. The fourth, the Commission table of reference amounts,
is prose rather than a table, one section per state, so it is transcribed by
hand into scripts/financial_requirements.py instead of parsed. It is still
fetched and checksummed here, because the point of the manifest is that a
reviewer can pull the same bytes next year and diff them.
"""

# The 12 countries named in the spec.
#
# Read the label fields carefully, because they do not all mean the same thing.
# uk_label and us_label are applicant nationalities: what passport someone
# holds. schengen_label is a consulate location: which country someone is
# applying from. The Schengen file has no applicant nationality column at all.
# The two are different questions and the UI must never blend them, which is
# why the datasets carry an explicit axis field.
#
# Each source's exact label is recorded rather than derived, because the
# sources disagree on casing and we refuse to guess a match by transforming
# strings. If a label stops matching, the build fails loudly.
COUNTRIES = [
    {"name": "Nigeria",     "iso3": "NGA", "uk_label": "Nigeria",     "us_label": "NIGERIA",     "schengen_label": "NIGERIA"},
    {"name": "Ghana",       "iso3": "GHA", "uk_label": "Ghana",       "us_label": "GHANA",       "schengen_label": "GHANA"},
    {"name": "Kenya",       "iso3": "KEN", "uk_label": "Kenya",       "us_label": "KENYA",       "schengen_label": "KENYA"},
    {"name": "India",       "iso3": "IND", "uk_label": "India",       "us_label": "INDIA",       "schengen_label": "INDIA"},
    {"name": "Pakistan",    "iso3": "PAK", "uk_label": "Pakistan",    "us_label": "PAKISTAN",    "schengen_label": "PAKISTAN"},
    {"name": "Bangladesh",  "iso3": "BGD", "uk_label": "Bangladesh",  "us_label": "BANGLADESH",  "schengen_label": "BANGLADESH"},
    {"name": "Vietnam",     "iso3": "VNM", "uk_label": "Vietnam",     "us_label": "VIETNAM",     "schengen_label": "VIETNAM"},
    {"name": "Philippines", "iso3": "PHL", "uk_label": "Philippines", "us_label": "PHILIPPINES", "schengen_label": "PHILIPPINES"},
    {"name": "Egypt",       "iso3": "EGY", "uk_label": "Egypt",       "us_label": "EGYPT",       "schengen_label": "EGYPT"},
    {"name": "Morocco",     "iso3": "MAR", "uk_label": "Morocco",     "us_label": "MOROCCO",     "schengen_label": "MOROCCO"},
    {"name": "Indonesia",   "iso3": "IDN", "uk_label": "Indonesia",   "us_label": "INDONESIA",   "schengen_label": "INDONESIA"},
    {"name": "Nepal",       "iso3": "NPL", "uk_label": "Nepal",       "us_label": "NEPAL",       "schengen_label": "NEPAL"},
]

# Kept so existing imports do not break. The list is the same 12 countries,
# read as nationalities by the UK and US builders.
NATIONALITIES = COUNTRIES

# Browser User-Agent. travel.state.gov sits behind a filter that returns 403 to
# default library agents, and it returns an HTML error body rather than a clear
# failure, so a naive fetch looks like a corrupt PDF instead of a refusal. The
# header is applied to every download for consistency.
USER_AGENT = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36"
)

UK_METHODOLOGY = (
    "UK Home Office table Vis_D02, outcomes of entry clearance visa "
    "applications. Counts are decisions taken in the period, not unique "
    "applicants, so one person can appear more than once across quarters. "
    "The refusal rate published here is refused divided by issued plus "
    "refused. Withdrawn and lapsed cases are reported separately in "
    "outcome_counts and are excluded from the denominator. This is a "
    "per decision rate and is not comparable to the US per person adjusted "
    "rate without saying so."
)

US_METHODOLOGY = (
    "US Department of State Visa Waiver Program adjusted refusal rate for B "
    "visas, worldwide, by nationality. The Department identifies multiple "
    "applications from a unique applicant and omits all but the last action, "
    "so an applicant is counted only once each fiscal year and is assigned "
    "the status in which the year ended. Someone refused in April and issued "
    "in July counts only as an issuance. The published formula is refusals "
    "minus overcomes, divided by issuances plus refusals minus overcomes. "
    "The Department publishes the rate only, so numerator and denominator "
    "are null for this source. This is a per person end of year rate and is "
    "not comparable to the UK per decision rate without saying so."
)

SCHENGEN_METHODOLOGY = (
    "EU Commission Schengen visa statistics for consulates, compiled from "
    "returns made by the Schengen States under Visa Code Article 46 and "
    "Annex XII. The axis is application location, not nationality: this file "
    "has no applicant nationality column anywhere, so a record says what "
    "happened at the consulates in a city, not what happens to a given "
    "passport. A Nigerian applying in Dubai appears in the Dubai rows. "
    "The measure is uniform visas not issued divided by uniform visas applied "
    "for. Not issued is broader than refused: it includes withdrawn and "
    "inadmissible applications, so this rate runs above a true refusal rate "
    "and must not be labelled as one. Counts are applications, not people. "
    "Not comparable to the US per person adjusted rate or the UK per decision "
    "rate without saying so."
)

SCHENGEN_CYPRUS_METHODOLOGY = (
    "Cyprus did not fully apply the Schengen acquis in 2025 and is reported "
    "on a separate sheet with its own layout. The source states that the "
    "visas applied for at Cyprus consulates are national visas, not Schengen "
    "uniform visas, so a Cyprus record does not describe Schengen access and "
    "is excluded from every aggregate in this dataset. Otherwise the measure "
    "and its caveats match the main Schengen methodology."
)

SCHENGEN_FINANCIAL_METHODOLOGY = (
    "Reference amounts for means of subsistence fixed by each national "
    "authority and notified to the European Commission, published as Annex 25 "
    "of the Practical Handbook for Border Guards, which the same document "
    "states is also Annex 18 of the Visa Code Handbook. The axis is "
    "destination: the amount is set by the state being travelled to, so it is "
    "not a figure about a passport and not a figure about a consulate "
    "location, and it must never be put on the same axis as the refusal "
    "datasets. The amounts are what a traveller must show to cross the "
    "external border, and the Commission publishes the same table to "
    "consulates assessing means of subsistence on a short stay visa "
    "application. Many states publish more than one amount for the same day "
    "depending on whether the traveller holds a host declaration, a prepaid "
    "booking or a hotel reservation. Where that happens the headline amount "
    "recorded here is the one required of a traveller paying their own way "
    "with no host declaration, because that is the case this product is "
    "asked about, and every other amount the state publishes is kept in "
    "variants. Amounts are recorded as published. They are never converted "
    "between currencies, never summed across separate requirements such as "
    "subsistence and accommodation, and never uprated for inflation."
)

UK_FINANCIAL_METHODOLOGY = (
    "The United Kingdom publishes no financial threshold for visitors. "
    "Appendix V: Visitor requires at V 4.2(e) that the applicant have "
    "sufficient funds to cover all reasonable costs in relation to their "
    "visit without working or accessing public funds, including the cost of "
    "the return or onward journey, any costs relating to their dependants "
    "and the cost of planned activities. The appendix states no amount, in "
    "sterling or per day, anywhere in its text. The Home Office caseworker "
    "guidance, Visit guidance version 17.0 published 25 February 2026, says "
    "in terms that there is no set level of funds required for an applicant "
    "to show this, and directs the caseworker to weigh the likely cost of "
    "the stay against the applicant's income or savings minus their ongoing "
    "financial commitments. Adequacy is assessed case by case. Any per day "
    "sterling figure quoted elsewhere for UK visitor visas is not a "
    "published requirement, and this record states the absence rather than "
    "substituting one."
)

US_FINANCIAL_METHODOLOGY = (
    "The United States publishes no financial threshold for B visitor visas. "
    "The Foreign Affairs Manual at 9 FAM 402.2-2(E) requires that the "
    "arrangements the applicant has made for defraying the expenses of their "
    "visit and return abroad be adequate to prevent their obtaining unlawful "
    "employment in the United States. The B visa chapter states no dollar "
    "amount and no minimum bank balance anywhere in its text. Adequacy is "
    "judged by the consular officer case by case, alongside the INA 214(b) "
    "presumption that every applicant is an intending immigrant until they "
    "overcome it. Any dollar figure or minimum balance quoted elsewhere for "
    "B visas is not a published requirement, and this record states the "
    "absence rather than substituting one."
)

# Meeting the number is not the same as getting the visa. This travels with
# the data for the same reason BASE_RATE_CAVEAT does, so a UI layer cannot
# drop it.
FINANCIAL_THRESHOLD_CAVEAT = (
    "A published reference amount is a minimum condition for entry, not a "
    "prediction of the decision. Showing the amount does not make a visa "
    "likely, and most refusals turn on purpose of travel, ties and "
    "credibility rather than on the balance shown. Where a state publishes "
    "no amount, the requirement is still real and is assessed case by case."
)

SOURCES = [
    {
        "id": "uk_home_office_vis_d02",
        "title": "UK Home Office, entry clearance visa applications and outcomes, table Vis_D02",
        "description": (
            "Outcomes of UK entry clearance visa applications by nationality, "
            "visa type and outcome, quarterly from 2005."
        ),
        "destination": "United Kingdom",
        "axis": "nationality",
        "format": "xlsx",
        "landing_url": "https://www.gov.uk/government/statistical-data-sets/immigration-system-statistics-data-tables",
        "download_url": "https://assets.publishing.service.gov.uk/media/6a1d5a9f916cd732dcdaad5c/entry-clearance-visa-outcomes-datasets-mar-2026.xlsx",
        "raw_filename": "uk-entry-clearance-visa-outcomes-mar-2026.xlsx",
        "publication": (
            "Immigration system statistics, year ending March 2026. "
            "Published 21 May 2026, data tables updated 10 June 2026, "
            "next update 27 August 2026."
        ),
        "source_year": 2025,
        "year_basis": "calendar_year",
        "methodology": UK_METHODOLOGY,
        "url_stability_note": (
            "The download path contains a hashed media segment that changes "
            "every time the Home Office republishes. If the download returns "
            "404, open landing_url, find the current Vis_D02 entry clearance "
            "visa outcomes file, and update download_url in scripts/sources.py."
        ),
        "extra_files": [],
    },
    {
        "id": "us_state_b_visa_adjusted_refusal_rates",
        "title": "US Department of State, adjusted refusal rates for B visas by nationality",
        "description": (
            "Visa Waiver Program adjusted refusal rate for B visitor visas, "
            "worldwide, one rate per nationality per fiscal year."
        ),
        "destination": "United States",
        "axis": "nationality",
        "format": "pdf",
        "landing_url": "https://travel.state.gov/content/travel/en/legal/visa-law0/visa-statistics/nonimmigrant-visa-statistics/nonimmigrant-b-visa-adjusted-refusal-rates-by-nationality.html",
        "download_url": "https://travel.state.gov/content/dam/visas/Statistics/Non-Immigrant-Statistics/RefusalRates/FY25.pdf",
        "raw_filename": "us-b-visa-adjusted-refusal-rates-fy25.pdf",
        "publication": (
            "Fiscal year 2025 table. US fiscal year 2025 ran from 1 October "
            "2024 to 30 September 2025. FY26.pdf returns 404 and is not "
            "expected until after 30 September 2026."
        ),
        "source_year": 2025,
        "year_basis": "us_fiscal_year",
        "methodology": US_METHODOLOGY,
        "url_stability_note": (
            "Stable path pattern. Swap FY25 for FY26 in download_url once the "
            "next fiscal year is published. Requires a browser User-Agent, "
            "otherwise the host returns 403 with an HTML body."
        ),
        "extra_files": [
            {
                "role": "methodology",
                "url": "https://travel.state.gov/content/dam/visas/Statistics/Non-Immigrant-Statistics/refusalratelanguage.pdf",
                "raw_filename": "us-adjusted-refusal-rate-methodology.pdf",
                "description": (
                    "Department of State note explaining how the adjusted "
                    "refusal rate is calculated. Source of the methodology "
                    "string recorded on every US record."
                ),
            }
        ],
    },
    {
        "id": "eu_commission_schengen_consulates",
        "title": "EU Commission, Schengen visa statistics for consulates",
        "description": (
            "Short stay uniform visas applied for, issued and not issued at "
            "Schengen state consulates worldwide, by the country and city the "
            "consulate sits in."
        ),
        "destination": "Schengen area",
        "axis": "application_location",
        "format": "xlsx",
        "landing_url": "https://home-affairs.ec.europa.eu/policies/schengen-borders-and-visa/visa-policy/short-stay-visas-issued-schengen-countries_en",
        "download_url": "https://home-affairs.ec.europa.eu/document/download/56816949-e59f-442b-9091-5d03360bf860_en",
        "raw_filename": "eu-schengen-visa-statistics-consulates-2025.xlsx",
        "publication": (
            "2025 compilation, covering the 28 states fully applying the "
            "Schengen acquis plus a separate sheet for Cyprus. Earlier years "
            "back to 2019 are listed on the same landing page."
        ),
        "source_year": 2025,
        "year_basis": "calendar_year",
        "methodology": SCHENGEN_METHODOLOGY,
        "url_stability_note": (
            "The download path is an opaque document id with no year in it, "
            "and the Commission publishes a new one each year, usually in "
            "spring. If the file no longer says 2025, open landing_url and "
            "take the current 'visa statistics for consulates' link."
        ),
        "extra_files": [],
    },
    {
        "id": "eu_commission_reference_amounts_annex_25",
        "title": (
            "European Commission, reference amounts required for the crossing "
            "of the external border fixed by national authorities, Annex 25 "
            "of the Practical Handbook for Border Guards"
        ),
        "description": (
            "Means of subsistence amounts fixed by each Schengen state and "
            "notified to the Commission, one prose section per state, also "
            "published as Annex 18 of the Visa Code Handbook."
        ),
        "destination": "Schengen area",
        "axis": "destination",
        "format": "pdf",
        "landing_url": "https://home-affairs.ec.europa.eu/policies/schengen/border-crossing_en",
        "download_url": "https://home-affairs.ec.europa.eu/document/download/7130e21d-c1c8-41fd-9c83-b6fe312d4f5c_en",
        "raw_filename": "eu-commission-reference-amounts-annex-25.pdf",
        "publication": (
            "Version dated 01/04/2026 in the running header of every page. "
            "Covers the 29 states fully applying the Schengen acquis plus a "
            "section for Cyprus."
        ),
        "source_year": 2026,
        "year_basis": "publication_version_date",
        "methodology": SCHENGEN_FINANCIAL_METHODOLOGY,
        "url_stability_note": (
            "The document id has been stable across versions: the same id "
            "served the 21/03/2024 version and now serves the 01/04/2026 "
            "one. The Commission replaces the file in place, so the URL "
            "changing is not the failure mode here. The version date in the "
            "page header is the only version marker, and it is transcribed "
            "into every record as source_version. If that header no longer "
            "reads 01/04/2026, a state may have moved its amount: re-read "
            "the annex against scripts/financial_requirements.py before "
            "trusting the curated figures."
        ),
        "extra_files": [],
    },
]
