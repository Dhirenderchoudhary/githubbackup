export type DestinationKind = 's3' | 'r2' | 'drive'

export interface ExampleRun {
  repoCount: number
  commitCount: number
  openSourceContributionCount: number
  mergedPullRequestCount: number
  destination: DestinationKind
  status: 'published'
}

export function exampleRun(destination: DestinationKind): ExampleRun {
  return {
    repoCount: 18,
    commitCount: 640,
    openSourceContributionCount: 11,
    mergedPullRequestCount: 7,
    destination,
    status: 'published',
  }
}

export function destinationCopy(kind: DestinationKind): { name: string, detail: string } {
  if (kind === 'drive') return { name: 'Google Drive', detail: 'One zip of the repositories in the run.' }
  if (kind === 'r2') return { name: 'Cloudflare R2', detail: 'Each repository as its own archive in your bucket.' }
  return { name: 'Amazon S3', detail: 'Each repository as its own archive in your bucket.' }
}

export function reportText(run: ExampleRun): string {
  return [
    `personal repos ${run.repoCount}`,
    `commits ${run.commitCount}`,
    `open source contributions ${run.openSourceContributionCount}`,
    `merged pull requests ${run.mergedPullRequestCount}`,
    `destination ${run.destination}`,
    run.status,
  ].join('\n')
}

export const saved = [
  { title: 'Your repositories', body: 'The git history of each repository you select, with branches, tags, and notes. Repositories you created that are not forks start selected.' },
  { title: 'Your commits', body: 'Commits you authored in those repositories.' },
  { title: 'Open-source pull requests', body: 'Pull requests you opened on public repositories you do not own. The code of those repositories stays where it is.' },
  { title: 'Merged pull requests', body: 'How many of those pull requests merged, and which repositories they were on.' },
]

export const stays = [
  'Organization, starred, forked, and collaborator repositories you leave unticked',
  'Issues, wikis, releases, and gists',
  'The code of a repository where you only opened a pull request',
]
