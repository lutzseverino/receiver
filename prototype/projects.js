// Generated from each repository README (header, tagline, badges, lead) + GitHub metadata, 2026-11-01.
// In the real site a build step does this, so the projects channel needs no upkeep beyond the READMEs.
window.PROJECT_DATA = [
 {
  "id": "repo-standards",
  "name": "Repo Standards",
  "tagline": "A CLI and agent skills for maintainers who publish and apply versioned repository standards.",
  "stack": [
   "TypeScript",
   "Node.js 24 or 26",
   "Python 3"
  ],
  "lead": [
   "Repo Standards gives a repository a maintainer's shared conventions in one command: contribution and agent instructions, skills, templates, and checks that keep files in line, taken from a published, versioned set. [Repo Canon](https://github.com/lutzseverino/repo-canon) is a ready-made set of conventions to start from.",
   "A standards source is a repository's published, versioned conventions; Repo Canon is one. A profile selects a complete set of those conventions. Adoption applies that set: it installs shared files and skills, adapts project documentation, and runs the publisher's checks and setup commands. An inspection previews those changes; an update applies a new selection to an already configured repository. Rules are the installed requirements that files must keep satisfying."
  ],
  "repo": "https://github.com/lutzseverino/repo-standards",
  "site": "https://repo-standards.com/",
  "since": "2026",
  "private": false,
  "release": {
   "tag": "v10.0.0",
   "date": "2026-10-22"
  },
  "updated": "2026-10-31"
 },
 {
  "id": "repo-canon",
  "name": "Repo Canon",
  "tagline": "Shared documentation, contribution, and coding-agent conventions for maintainers who want consistent repositories.",
  "stack": [
   "JavaScript",
   "Node.js 24 or 26"
  ],
  "lead": [
   "Adopting Repo Canon installs contribution and agent instructions, rules, skills, templates, and validation workflows into a repository. This process is called adoption, and a profile is the set of conventions it applies. Rules are the installed requirements that a repository's files keep satisfying after adoption."
  ],
  "repo": "https://github.com/lutzseverino/repo-canon",
  "site": "https://repo-standards.com/sources/lutzseverino/repo-canon/",
  "since": "2026",
  "private": false,
  "release": {
   "tag": "v0.21.0",
   "date": "2026-11-01"
  },
  "updated": "2026-11-01"
 },
 {
  "id": "scriptorium",
  "name": "Scriptorium",
  "tagline": "A self-hosted service that implements ready GitHub issues with coding agents in sandboxes, for maintainers who run it on their own machine.",
  "stack": [
   "TypeScript",
   "Node.js 24 or 26"
  ],
  "lead": [
   "Scriptorium is a factory: one process on a host serves every repository its host configuration lists. It picks up issues a person marked ready and runs each one's agent in a sandbox, a container built from the repository's own toolchain image with the factory's agent layer of Git, the GitHub CLI and the agent CLIs on top. A provider is an agent CLI and the subscription behind it, such as Claude Code or Codex. Releases are published here as `scriptorium-vX.Y.Z` tags. The stream began in Repo Canon, the shared repository conventions this repository follows, where Scriptorium lived until `scriptorium-v1.0.5`."
  ],
  "repo": "https://github.com/lutzseverino/scriptorium",
  "site": null,
  "since": "2026",
  "private": false,
  "release": {
   "tag": "v3.0.0",
   "date": "2026-11-01"
  },
  "updated": "2026-11-01"
 },
 {
  "id": "postern",
  "name": "Postern",
  "tagline": "Postern is a Node.js library that gives developers building tools one interface to code hosting platforms such as GitHub, for issues, pull requests, releases and access, and reports only facts the platform states.",
  "stack": [
   "TypeScript",
   "Node.js 24 or 26"
  ],
  "lead": [
   "Each of those four areas is a **port**, one stable interface for one concept, and each hosting platform sits behind its own **adapter**. Postern reports what the platform records and decides nothing: readiness, ordering, authorization and what a label means stay with your tool. GitHub is the only adapter so far."
  ],
  "repo": "https://github.com/lutzseverino/postern",
  "site": null,
  "since": "2026",
  "private": false,
  "release": {
   "tag": "v1.3.0",
   "date": "2026-10-31"
  },
  "updated": "2026-10-31"
 },
 {
  "id": "hemiciclo",
  "name": "Hemiciclo",
  "tagline": "Hemiciclo is the working code name for a planned app that gives readers a neutral, at-a-glance view of every country's political situation.",
  "stack": [
   "Node.js 24"
  ],
  "lead": [],
  "repo": "https://github.com/lutzseverino/hemiciclo",
  "site": null,
  "since": "2026",
  "private": false,
  "release": null,
  "updated": "2026-10-31"
 },
 {
  "id": "odonta",
  "name": "Odonta",
  "tagline": "A web platform that helps dental practices manage patient records, appointments, and odontograms.",
  "stack": [
   "TypeScript",
   "Node.js 24",
   "Java 21"
  ],
  "lead": [],
  "repo": "https://github.com/zarcerog/odonta",
  "site": null,
  "since": "2026",
  "private": true,
  "release": null,
  "updated": "2026-11-01"
 }
];
