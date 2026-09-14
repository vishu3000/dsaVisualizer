// The seeded problem list.
//
// The data lives in catalog.ts rather than in this file so the app's
// New-fixture modal can add an entry by rewriting one array, instead of trying
// to splice code. Every entry ships with a recorded trace in /fixtures and its
// source in /examples, so the sidebar works before Pyodide has ever loaded.

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

/** Add a problem to a group, creating the group when it is new. */
export function withProblem(
  groups: ProblemGroup[],
  label: string,
  problem: Problem,
): ProblemGroup[] {
  const existing = groups.find((group) => group.label === label)
  if (!existing) return [...groups, { label, problems: [problem] }]

  return groups.map((group) =>
    group.label === label ? { ...group, problems: [...group.problems, problem] } : group,
  )
}
