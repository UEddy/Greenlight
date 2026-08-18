import { NextResponse } from "next/server";
import {
  assess,
  CoverageError,
  createModelClient,
  ModelOutputRejectedError,
  ModelRefusedError,
  ModelUnparseableError,
  ProfileSchema,
} from "greenlight-backend";

/**
 * POST /api/assess. A thin wrapper, deliberately.
 *
 * Every decision this endpoint appears to make was already made in the backend
 * package: retrieval, the prompt, the guards, the retry and the assembly. This
 * file validates the request, calls assess, and maps the errors it can throw
 * onto status codes. Nothing here reimplements any of it, so the deployed
 * route and the 116 tests in backend/ exercise one implementation rather than
 * two that agree today.
 *
 * The status codes match what backend/src/server.ts returns, because the
 * frontend already branches on them and the Express server stays useful for
 * local work.
 */

// Node, not edge: the model SDK and the guards are Node code.
export const runtime = "nodejs";
// Never cached. Two identical profiles can legitimately produce different
// prose, and a cached verdict would be a stale judgement presented as fresh.
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  // safeParse rather than parse, so the route needs no direct dependency on
  // zod: the schema and its error shape both arrive through the backend
  // package, which is the only place the contract is defined.
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: "invalid_profile", message: "The request body was not readable JSON." },
      { status: 400 },
    );
  }

  const parsed = ProfileSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      {
        error: "invalid_profile",
        message: "The profile did not validate.",
        issues: parsed.error.issues.map((issue) => ({
          path: issue.path.join("."),
          message: issue.message,
        })),
      },
      { status: 400 },
    );
  }
  const profile = parsed.data;

  try {
    const result = await assess(profile, createModelClient());
    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof CoverageError) {
      return NextResponse.json(
        {
          error: "coverage_missing",
          message: error.message,
          coverageNotes: error.notes,
          note: "No verdict is produced without retrieved data. This service does not estimate.",
        },
        { status: 422 },
      );
    }

    if (error instanceof ModelOutputRejectedError) {
      // The retrieved facts are still sourced and still true, so they are
      // returned. Only the judgement is withheld.
      return NextResponse.json(
        {
          error: "model_output_rejected",
          message:
            "A verdict was not produced. The model's answer failed the output guards and was discarded rather than shown.",
          violations: error.violations,
          retrieved: {
            refusalRate: {
              nationality: error.retrieved.nationalityRate,
              applicationLocation: error.retrieved.applicationLocationRate,
            },
            financialRequirement: error.retrieved.financial,
            coverageNotes: error.retrieved.coverageNotes,
          },
        },
        { status: 502 },
      );
    }

    if (error instanceof ModelRefusedError || error instanceof ModelUnparseableError) {
      return NextResponse.json(
        { error: "model_unavailable", message: error.message },
        { status: 502 },
      );
    }

    const message = error instanceof Error ? error.message : "Unknown error.";
    // eslint-disable-next-line no-console
    console.error("[api/assess]", error);
    return NextResponse.json({ error: "internal_error", message }, { status: 500 });
  }
}
