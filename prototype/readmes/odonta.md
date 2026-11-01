<div align="center">
  <h1>Odonta</h1>
  <p>A web platform that helps dental practices manage patient records, appointments, and odontograms.</p>
  <p>
    <img src="https://img.shields.io/badge/TypeScript-5-3178C6?logo=typescript&logoColor=white" alt="TypeScript" />
    <a href="https://nodejs.org/"><img src="https://img.shields.io/badge/Node.js-24-5FA04E?logo=node.js&logoColor=white" alt="Node.js 24" /></a>
    <a href="https://adoptium.net/"><img src="https://img.shields.io/badge/Java-21-007396?logo=openjdk&logoColor=white" alt="Java 21" /></a>
  </p>
</div>

## Installation

Odonta is a pnpm monorepo. Install [pnpm](https://pnpm.io/), then install the JavaScript workspace from the repository root:

```bash
pnpm install
pnpm --filter @odonta/landing exec playwright install chromium
```

Building and testing `services/odonta` needs a JDK and runs through the Maven wrapper; no separate Maven install is required:

```bash
pnpm compile:service
pnpm test:service
```

## Features

- Manages patient records across dental practices.
- Schedules and tracks appointments.
- Captures dental charts through interactive odontograms.
- Plans and follows treatment across visits.
- Presents the public acquisition experience and registration entry points.

## Usage

Run the product surfaces and checks from the repository root:

```bash
pnpm dev:web
pnpm dev:landing
pnpm check
```

The product application runs on `http://localhost:3000` and the landing application on `http://localhost:3002`. To run the full backend stack (PostgreSQL, Keycloak, the identity and billing services, the Odonta service, and the local API gateway), start it before the frontends:

```bash
pnpm dev:backend
```

The product application proxies `/api` to the gateway on `http://localhost:8088`. Stop the stack without deleting PostgreSQL data with `pnpm dev:backend:down`.

## Configuration

The development database includes a fixture staff member `dev@odonta.local` who signs in with `odonta-dev-sign-in`. Staff passwords follow the rules described in the [staff sign-in security guide](services/odonta/docs/usage/staff-sign-in-security.md); run `sh docker/dev/harden-sign-in.sh` once on any stack to apply them, including the breached-password list.

## Documentation

[Documentation](docs/README.md)

## Contributing

[Contributing](CONTRIBUTING.md)

## License

[All rights reserved](LICENSE)
