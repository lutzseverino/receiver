// A post's images, dithered at build to the display's colours at the size
// the display shows them (lib/dither.ts), beside the post's English page.
// Every version of the post shows the same files.
import type { APIRoute } from "astro";
import { loadPosts, type PostImage } from "@/data/posts";
import { ditheredPng } from "@/lib/dither";

export async function getStaticPaths() {
  const images = new Map<string, { slug: string; image: PostImage }>();
  for (const post of await loadPosts())
    for (const image of post.images)
      images.set(`${post.slug}/${image.name}`, { slug: post.slug, image });
  return [...images.values()].map(({ slug, image }) => ({
    params: { slug, image: image.name },
    props: { image },
  }));
}

export const GET: APIRoute<{ image: PostImage }> = async ({ props }) => {
  const { source, width, height } = props.image;
  return new Response(
    new Uint8Array(await ditheredPng(source, width, height)),
    {
      headers: { "content-type": "image/png" },
    },
  );
};
