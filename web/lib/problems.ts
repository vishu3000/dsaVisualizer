// The seeded problem list.
//
// The data lives in catalog.ts so this file stays types and lookups. Every
// entry ships with a recorded trace in /fixtures and its source in /examples,
// so the samples modal works before Pyodide has ever loaded.

import { CATALOG } from './catalog.ts'

export type Problem = {
  /** Matches the fixture and example filename. */
  slug: string
  title: string
  blurb: string
}

export type ProblemGroup = {
  label: string
  problems: Problem[]
}

export const PROBLEM_GROUPS: ProblemGroup[] = CATALOG

export const PROBLEMS: Problem[] = PROBLEM_GROUPS.flatMap((group) => group.problems)

export const PROBLEM_SLUGS: string[] = PROBLEMS.map((problem) => problem.slug)

export const CATEGORY_LABELS: string[] = PROBLEM_GROUPS.map((group) => group.label)

export function findProblem(slug: string): Problem | undefined {
  return PROBLEMS.find((problem) => problem.slug === slug)
}
