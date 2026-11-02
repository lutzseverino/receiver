<div align="center">
  <h1>Repo Canon</h1>
  <p>Shared documentation, contribution, and coding-agent conventions for maintainers who want consistent repositories.</p>
  <p>
    <img src="https://img.shields.io/badge/JavaScript-F7DF1E?logo=javascript&logoColor=black" alt="JavaScript">
    <img src="https://img.shields.io/badge/Node.js-24%20%7C%2026-5FA04E?logo=node.js&logoColor=white" alt="Node.js 24 or 26">
  </p>
</div>

Adopting Repo Canon installs contribution and agent instructions, rules,
skills, templates, and validation workflows into a repository. This process is
called adoption, and a profile is the set of conventions it applies. Rules are
the installed requirements that a repository's files keep satisfying after
adoption.

## Installation

On macOS or Linux, use Node.js 24 or 26, npm, and Git 2.32.0 or newer. To adopt Repo
Canon, give your coding agent this prompt in your repository:

```text
Run `npx --yes @lutzseverino/repo-standards adopt https://github.com/lutzseverino/repo-canon --json` in this repository and follow what it prints.
```

[Repository Standards](https://github.com/lutzseverino/repo-standards) is the
tool that applies Repo Canon, and `npx` runs it without a separate
installation. To run it yourself, use this command in a terminal, from a clean,
committed working tree of your repository:

```sh
npx @lutzseverino/repo-standards adopt https://github.com/lutzseverino/repo-canon
```

In a terminal, `adopt` asks its questions and guides your edits. For an
agent, it prints an answers file to fill in with you and its next steps.

## Features

- Install contribution guidance, agent configuration, and issue and PR templates.
- Validate issue contracts (a change's agreed scope and acceptance criteria) and pull request metadata in GitHub workflows.
- Offer opt-in daily adoption updates through one rolling pull request or issue.
- Ship the workflow skills as Repo Canon's own into `.agents/skills/`, sixteen of them taken from [Matt Pocock's skills](https://github.com/mattpocock/skills), those the shared workflow relies on, each crediting the upstream release it was reconciled with and saying whether and how it differs.
- Ship a `triage` skill, taken from his and reworked, that routes each request by where its uncertainty lies: an independent review of its researched issue contract, or the owner's answers before one is written.
- Ship a `babysit` skill that takes an opened pull request through review to its merge.
- Ship an `orchestrate` skill that turns a feature or problem into a plan the owner approves, keeps it in a workbench of plain Markdown, and runs it to an announced close.
- Offer a `factory` profile that adds factory workflow rules, configuration and the toolchain image a host-installed factory, an unattended ticket-running service, needs to serve the repository.
- Offer a `workbench` profile that installs only the workflow skills into the orchestrating agent's private workbench, with no rules, CI or branch requirements.
- Set up triage labels, squash-only merging, and a required `PR metadata` check where GitHub's plan offers one.
- Check the repository introduction, component introductions, and documentation navigation.
- Offer optional Node.js, Astro and Vite tool conventions for matching code, leaving existing differing code for separate migrations.
- Install rules for the documentation tree, the repository and component introductions, the license, and the GitHub configuration.

## Usage

Adoption installs Repo Canon's files, skills, and rules, then has you or your
agent bring the README, license, documentation, and agent instructions in line
with the rules. Your repository-specific agent instructions move to
`docs/agents/project.md`. It also sets up GitHub labels and merge rules; this
remote setup can be deferred when GitHub access is missing, so adoption
completes locally. Review the changes `adopt` leaves and commit them.

Pick the `standard` profile, `factory` for a repository a factory serves, or
`workbench` for the orchestrating agent's workbench; the
[adoption guide](docs/usage/adopt-repo-canon.md) explains the choice and what
remote setup needs. To update, read the
[release notes](https://github.com/lutzseverino/repo-canon/releases) since your
adopted release, then run the command without the URL:

```sh
npx @lutzseverino/repo-standards adopt
```

Repo Canon makes no stability promise and releases frequently. Every release,
including a breaking one, is adoptable from the previous release in one
`adopt`. Stay current by running `adopt`, or opt in to the installed
[scheduled update workflow](docs/usage/adopt-repo-canon.md#automated-updates).
The [versioning guide](docs/usage/versioning.md) explains compatibility and
release notes.

## Documentation

[Documentation](docs/README.md)

## Contributing

[Contribution guidelines](CONTRIBUTING.md)

## License

[MIT License](LICENSE)
