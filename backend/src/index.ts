/**
 * The public surface of this package, for the Next route that wraps it.
 *
 * Nothing here is new logic. assess, the guards, the retrieval and the
 * provider selection are the same modules the tests run against, so the
 * deployed route and `npm test` exercise one implementation.
 */

export { assess, ModelOutputRejectedError } from "./assess";
export { CoverageError } from "./retrieval";
export { createModelClient, detectProvider, describeProvider } from "./provider";
export { ModelRefusedError, ModelUnparseableError, type ModelClient } from "./model";
export { ProfileSchema, type Profile, type AssessResponse } from "./types";
export {
  COVERED_APPLICATION_LOCATIONS,
  COVERED_NATIONALITIES,
  COVERED_SCHENGEN_STATES,
  SUPPORTED_DESTINATIONS,
  dataset,
} from "./dataset";
