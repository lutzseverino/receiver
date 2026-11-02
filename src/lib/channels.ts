// The dial: the receiver's channels, their paths and frequencies. The HTML
// layer names a channel through its catalog entry, `common.channel.<id>`, and
// never prints its frequency, which only the display shows (ADR 0001).

export type ChannelId = "home" | "projects" | "wire" | "reply";

export type Channel = {
  id: ChannelId;
  /** The channel's path in the default locale. */
  path: string;
  /** Its frequency, as the display shows it, in MHz. */
  frequency: string;
};

/** The channels in the order the navigation lists them. */
export const CHANNELS: readonly Channel[] = [
  { id: "home", path: "/", frequency: "100.0" },
  { id: "projects", path: "/projects/", frequency: "105.0" },
  { id: "wire", path: "/blog/", frequency: "97.0" },
  { id: "reply", path: "/contact/", frequency: "108.0" },
];

export function channel(id: ChannelId): Channel {
  return CHANNELS.find((candidate) => candidate.id === id)!;
}

/** The channel a path in the default locale belongs to, if any. */
export function channelOf(path: string): Channel | undefined {
  return [...CHANNELS]
    .reverse()
    .find((candidate) =>
      candidate.path === "/" ? path === "/" : path.startsWith(candidate.path),
    );
}
