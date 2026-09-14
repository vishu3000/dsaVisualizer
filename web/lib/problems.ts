// The seeded problem list. Every entry ships with a recorded trace in
// /fixtures and its source in /examples, so the sidebar works before Pyodide
// has ever loaded.

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

export const PROBLEM_GROUPS: ProblemGroup[] = [
  {
    label: 'Searching',
    problems: [
      {
        slug: 'binary_search',
        title: 'Binary search',
        blurb: 'lo/hi converge, mid probes the midpoint',
      },
      {
        slug: 'heap_ops',
        title: 'Heap operations',
        blurb: 'push, pop and heapify a binary heap',
      },
    ],
  },
  {
    label: 'Pointers & windows',
    problems: [
      {
        slug: 'two_pointer',
        title: 'Two pointers',
        blurb: 'converge from both ends of a sorted list',
      },
      {
        slug: 'sliding_window',
        title: 'Sliding window',
        blurb: 'longest run with no repeated character',
      },
    ],
  },
  {
    label: 'Graphs',
    problems: [
      {
        slug: 'bfs_graph',
        title: 'Breadth-first search',
        blurb: 'queue, visited set and distance map',
      },
      {
        slug: 'dfs_recursive',
        title: 'Depth-first search',
        blurb: 'recursion, and the call stack that goes with it',
      },
    ],
  },
  {
    label: 'Dynamic programming',
    problems: [
      {
        slug: 'dp_table',
        title: 'Longest common subsequence',
        blurb: 'fill a 2D table row by row',
      },
    ],
  },
  {
    label: 'Structures',
    problems: [
      {
        slug: 'linked_list_reverse',
        title: 'Reverse a linked list',
        blurb: 'prev / cur / nxt leapfrog through nodes',
      },
      {
        slug: 'bst_insert',
        title: 'Binary search tree',
        blurb: 'recursive insert, then an in-order walk',
      },
    ],
  },
  {
    label: 'Backtracking',
    problems: [
      {
        slug: 'backtracking_subsets',
        title: 'All subsets',
        blurb: 'every choice undone on the way out',
      },
    ],
  },
]

export const PROBLEMS: Problem[] = PROBLEM_GROUPS.flatMap((group) => group.problems)

export const PROBLEM_SLUGS: string[] = PROBLEMS.map((problem) => problem.slug)

export function findProblem(slug: string): Problem | undefined {
  return PROBLEMS.find((problem) => problem.slug === slug)
}
