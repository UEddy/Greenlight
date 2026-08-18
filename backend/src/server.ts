/**
 * POST /assess. Boring on purpose.
 *
 * Failure modes are answered honestly rather than smoothed over. Missing
 * coverage returns the gap. A rejected model response returns the retrieved
 * records without a verdict, so the caller can still show sourced facts and
 * say plainly that no verdict was produced.
 */

import express from "express";
import { ZodError } from "zod";
import { assess, ModelOutputRejectedError } from "./assess";
import {
  COVERED_APPLICATION_LOCATIONS,
  COVERED_NATIONALITIES,
  COVERED_SCHENGEN_STATES,
  SUPPORTED_DESTINATIONS,
  dataset,
} from "./dataset";
import { ModelRefusedError, ModelUnparseableError, type ModelClient } from "./model";
import { createModelClient } from "./provider";
import { CoverageError } from "./retrieval";
import { ProfileSchema } from "./types";

export function createServer(model: ModelClient = createModelClient()) {
  const app = express();
  app.use(express.json({ limit: "64kb" }));

  app.get("/health", (_req, res) => {
    res.json({ ok: true });
  });

  /** What the picker may offer. Anything absent is unsupported, not coming. */
  app.get("/coverage", (_req, res) => {
    res.json({
      destinations: SUPPORTED_DESTINATIONS,
      nationalities: COVERED_NATIONALITIES,
      applicationLocations: COVERED_APPLICATION_LOCATIONS,
      schengenStates: COVERED_SCHENGEN_STATES,
      unsupportedNote:
        "The UAE, Singapore, Turkey, Thailand and South Korea are not offered because " +
        "they do not publish visa refusal statistics by nationality in any usable form. " +
        "That is a gap in what exists, not a gap in this product's roadmap.",
      axisWarnings: {
        schengen: dataset.schengenAxisWarning,
        financial: dataset.financialAxisWarning,
      },
    });
  });

  app.post("/assess", async (req, res) => {
    let profile;
    try {
      profile = ProfileSchema.parse(req.body);
    } catch (error) {
      if (error instanceof ZodError) {
        res.status(400).json({
          error: "invalid_profile",
          message: "The profile did not validate.",
          issues: error.issues.map((i) => ({
            path: i.path.join("."),
            message: i.message,
          })),
        });
        return;
      }
      throw error;
    }

    try {
      const result = await assess(profile, model);
      res.json(result);
    } catch (error) {
      if (error instanceof CoverageError) {
        res.status(422).json({
          error: "coverage_missing",
          message: error.message,
          coverageNotes: error.notes,
          note: "No verdict is produced without retrieved data. This service does not estimate.",
        });
        return;
      }
      if (error instanceof ModelOutputRejectedError) {
        // The retrieved facts are still true and still sourced, so they are
        // returned. What is withheld is the verdict, because the only thing
        // that could have produced one failed its checks.
        res.status(502).json({
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
        });
        return;
      }
      if (error instanceof ModelRefusedError || error instanceof ModelUnparseableError) {
        res.status(502).json({ error: "model_unavailable", message: error.message });
        return;
      }
      const message = error instanceof Error ? error.message : "Unknown error.";
      // eslint-disable-next-line no-console
      console.error("[assess] unhandled", error);
      res.status(500).json({ error: "internal_error", message });
    }
  });

  return app;
}

const isDirectRun =
  process.argv[1] !== undefined && import.meta.url.endsWith(process.argv[1].replace(/\\/g, "/"));

if (isDirectRun) {
  const port = Number(process.env["PORT"] ?? 8787);
  createServer().listen(port, () => {
    // eslint-disable-next-line no-console
    console.log(`greenlight backend listening on ${port}`);
  });
}
