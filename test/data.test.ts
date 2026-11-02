// The channels, the published posts, of which the site launches with none,
// the posts each wire lists, and the analytics beacon. The projects are
// projects.test.ts's.
import assert from "node:assert/strict";
import { test } from "node:test";
import { loadPosts, wirePosts, type Post } from "../src/data/posts.ts";
import { analyticsBeacon } from "../src/lib/analytics.ts";
import { channelOf } from "../src/lib/channels.ts";

test("a path belongs to its channel", () => {
  assert.equal(channelOf("/")?.id, "home");
  assert.equal(channelOf("/projects/repo-canon/")?.id, "projects");
  assert.equal(channelOf("/blog/")?.id, "wire");
  assert.equal(channelOf("/contact/")?.id, "reply");
  assert.equal(channelOf("/404.html"), undefined);
});

test("there are no posts yet", async () => {
  assert.deepEqual(await loadPosts(), []);
});

const post = (slug: string, locale: Post["locale"], date: string): Post => ({
  slug,
  locale,
  title: `${slug} ${locale}`,
  date,
  summary: "",
  tags: [],
  body: "",
  minutes: 1,
  images: [],
  locales: ["en"],
});

test("a wire lists each post in its language when translated, else in English, newest first", () => {
  const posts = [
    post("old", "en", "2026-01-02"),
    post("new", "en", "2026-03-04"),
    post("new", "es", "2026-03-04"),
    post("old", "ca", "2026-01-02"),
  ];
  assert.deepEqual(
    wirePosts(posts, "es").map((p) => [p.slug, p.locale]),
    [
      ["new", "es"],
      ["old", "en"],
    ],
  );
  assert.deepEqual(
    wirePosts(posts, "ca").map((p) => [p.slug, p.locale]),
    [
      ["new", "en"],
      ["old", "ca"],
    ],
  );
  assert.deepEqual(
    wirePosts(posts, "en").map((p) => p.locale),
    ["en", "en"],
  );
});

test("the beacon is left out until a site token is configured", () => {
  assert.equal(analyticsBeacon(undefined), null);
  assert.equal(analyticsBeacon(""), null);
  assert.deepEqual(analyticsBeacon("abc123"), {
    src: "https://static.cloudflareinsights.com/beacon.min.js",
    "data-cf-beacon": '{"token":"abc123"}',
  });
});
