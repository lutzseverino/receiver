# Development

This guide covers setting up, validating, and maintaining this repository.

## Setup and validation

The repository holds no website code yet: no package manifest, build, or test
command exists. The commands below cover the Repository Standards tooling the
repository holds today.

Prerequisites:

- Git.
- Node.js 24 or 26, which runs the pinned Repository Standards CLI and the
  installed validator scripts.
- npm, which installs the pinned CLI.

After cloning, install the pinned Repository Standards CLI from the repository
root:

```sh
npm ci --ignore-scripts --prefix .repo-standards/runtime
```

Before requesting review, run the adopted standards checks from the repository
root; every check must pass:

```sh
.repo-standards/runtime/node_modules/.bin/repo-standards check --json
```
