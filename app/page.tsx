import { ArrowRight, GitBranch, GitCommitHorizontal, GitMerge, GitPullRequest, Laptop, RotateCcw, ShieldCheck } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { CommandBlock, Commands } from '@/components/commands'
import { DestinationStage } from '@/components/destination-stage'
import { GithubMark } from '@/components/github-mark'
import { Walkthrough } from '@/components/walkthrough'
import { saved, stays } from '@/lib/example'

const repoUrl = (process.env.GITBACKUP_REPO_URL ?? '').replace(/\.git$/, '')

const facts = [
  { icon: Laptop, title: 'Runs on your computer', body: 'You clone it and start it yourself. No account, no server in between.' },
  { icon: ShieldCheck, title: 'Your keys stay there', body: 'The GitHub token and bucket keys are read on your machine. This website never sees them.' },
  { icon: RotateCcw, title: 'You can get it back', body: 'One command restores every repository as a git directory you can clone.' },
]

const savedIcons = [GitBranch, GitCommitHorizontal, GitPullRequest, GitMerge]

function Section({ id, title, intro, children }: { id: string, title: string, intro: string, children: React.ReactNode }) {
  return (
    <section id={id} className="mt-24">
      <h2 className="text-3xl sm:text-4xl">{title}</h2>
      <p className="mt-2 max-w-2xl text-muted-foreground">{intro}</p>
      {children}
    </section>
  )
}

export default function HomePage() {
  return (
    <>
      <div className="max-w-3xl animate-rise">
        <Badge variant="outline" className="gap-1.5 rounded-full bg-card px-3 py-1 text-muted-foreground">
          <span className="size-1.5 rounded-full bg-primary" /> Open source, MIT licensed
        </Badge>
        <h1 className="mt-5 text-5xl leading-[1.05] sm:text-7xl">Save the repositories you created.</h1>
        <p className="mt-5 max-w-2xl text-lg text-muted-foreground sm:text-xl">
          gitbackup copies your GitHub repositories, with every branch, tag, and note, to Amazon S3, Cloudflare R2, or Google Drive. It runs on your computer, on a schedule if you like.
        </p>
        <div className="mt-8 flex flex-wrap gap-3">
          <Button asChild size="lg" className="rounded-full">
            <a href="#run">Get started <ArrowRight /></a>
          </Button>
          {repoUrl ? (
            <Button asChild size="lg" variant="outline" className="rounded-full bg-card">
              <a href={repoUrl}><GithubMark className="size-4" /> View on GitHub</a>
            </Button>
          ) : null}
        </div>
      </div>

      <ul className="mt-14 grid gap-3 sm:grid-cols-3">
        {facts.map(({ icon: Icon, title, body }, index) => (
          <li key={title} className="rounded-xl border bg-card p-5 shadow-soft animate-rise" style={{ animationDelay: `${120 + index * 80}ms` }}>
            <span className="grid size-9 place-items-center rounded-lg bg-accent text-accent-foreground"><Icon className="size-4.5" aria-hidden /></span>
            <strong className="mt-3 block font-semibold">{title}</strong>
            <span className="mt-1 block text-sm text-muted-foreground">{body}</span>
          </li>
        ))}
      </ul>

      <Section id="how" title="How it works" intro="Once it runs on your computer, the app walks you through four screens.">
        <Walkthrough />
      </Section>

      <Section id="save" title="What gets saved" intro="A finished run writes the repositories you selected, plus a short record of your account.">
        <ul className="mt-6 grid gap-3 sm:grid-cols-2">
          {saved.map((item, index) => {
            const Icon = savedIcons[index]
            return (
              <li key={item.title} className="flex gap-4 rounded-xl border bg-card p-5">
                <Icon className="mt-0.5 size-5 shrink-0 text-primary" aria-hidden />
                <div>
                  <h3 className="font-semibold">{item.title}</h3>
                  <p className="mt-1 text-sm text-muted-foreground">{item.body}</p>
                </div>
              </li>
            )
          })}
        </ul>
        <div className="mt-3 rounded-xl border border-dashed p-5">
          <h3 className="font-semibold">Left on GitHub</h3>
          <ul className="mt-2 grid gap-1.5 text-sm text-muted-foreground">
            {stays.map((line) => <li key={line} className="flex gap-2"><span className="mt-2 size-1 shrink-0 rounded-full bg-muted-foreground" />{line}</li>)}
          </ul>
        </div>
      </Section>

      <Section id="destination" title="Where it goes" intro="Pick a destination to see what a run stores there. Each run writes to the one place named in .env.">
        <DestinationStage />
      </Section>

      <Section id="run" title="Run it on your computer" intro="Four steps in a terminal, about five minutes.">
        <Commands />
      </Section>

      <Section id="restore" title="Get it back" intro="Pick the same destination and an empty folder. Each repository comes back as a bare git directory you can clone.">
        <CommandBlock command={'npx gitbackup restore --to s3 --out ./restored\ngit clone ./restored/my-repo.git my-repo'} />
        <p className="mt-3 text-sm text-muted-foreground">Use <code>--to r2</code> or <code>--to drive</code> for the other destinations.</p>
      </Section>

      <footer className="mt-24 flex flex-wrap items-center justify-between gap-3 border-t pt-6 text-sm text-muted-foreground">
        <span>gitbackup is free and open source under the MIT license.</span>
        {repoUrl ? <a href={repoUrl} className="inline-flex items-center gap-1.5 hover:text-foreground"><GithubMark className="size-4" /> Source on GitHub</a> : null}
      </footer>
    </>
  )
}
