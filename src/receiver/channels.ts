// The channel layouts (lutzseverino/receiver#10): home, projects, the wire
// and reply each draw their pages as round 13 settles them. NO SIGNAL, and
// any page no layout claims, is drawn by the generic text layout.
import { homeLayout } from "./channels/home.ts";
import { projectsLayout } from "./channels/projects.ts";
import { replyLayout } from "./channels/reply.ts";
import { wireLayout } from "./channels/wire.ts";
import type { ChannelLayout, LayoutContext } from "./layout.ts";

export const channelLayouts = (context: LayoutContext): ChannelLayout[] => [
  homeLayout(context),
  projectsLayout(context),
  wireLayout(context),
  replyLayout(context),
];
