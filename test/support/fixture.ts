// The tests that build or serve the site read the projects from the
// committed fixture (`test/fixtures/github/`), never live GitHub data. Import
// this before building or serving.
process.env.SITE_PROJECTS = "fixture";
