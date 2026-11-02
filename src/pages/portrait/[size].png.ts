// The reply page's portrait, Atkinson-dithered at build at every size the
// display draws it (lib/portrait.ts).
import type { APIRoute } from "astro";
import { ditheredPortrait, PORTRAIT_SIZES } from "@/lib/portrait";

const source = Object.values(
  import.meta.glob<string>("/src/assets/portrait.png", {
    eager: true,
    query: "?inline",
    import: "default",
  }),
)[0]!;

export function getStaticPaths() {
  return PORTRAIT_SIZES.map((size) => ({ params: { size: String(size) } }));
}

export const GET: APIRoute = async ({ params }) =>
  new Response(
    new Uint8Array(
      await ditheredPortrait(
        Buffer.from(source.slice(source.indexOf(",") + 1), "base64"),
        Number(params.size),
      ),
    ),
    { headers: { "content-type": "image/png" } },
  );
