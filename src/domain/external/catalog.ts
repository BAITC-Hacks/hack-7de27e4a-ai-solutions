import rawCatalog from "../../../data/external_courses.json";

import type { NormalizedDataset } from "@/lib/contracts";

import {
  parseExternalCourseCatalog,
  type ExternalCourseCatalog,
} from "./schema";

/** The catalog is bundled and parsed locally. Runtime never calls an external provider API. */
export function loadExternalCourseCatalog(
  dataset: Pick<NormalizedDataset, "skillsById">,
): ExternalCourseCatalog {
  return parseExternalCourseCatalog(rawCatalog, dataset.skillsById);
}
