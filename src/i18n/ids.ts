// The message IDs, from the default locale's catalogs. Types only.
import type common from "./messages/en/common.json";
import type copy from "./messages/en/copy.json";
import type projects from "./messages/en/projects.json";
import type reply from "./messages/en/reply.json";
import type signal from "./messages/en/signal.json";
import type wire from "./messages/en/wire.json";

type Ids<Area extends string, Catalog> = `${Area}.${keyof Catalog & string}`;

/** `<area>.<key>`: the catalog file and the key within it. */
export type MessageId =
  | Ids<"common", typeof common>
  | Ids<"copy", typeof copy>
  | Ids<"projects", typeof projects>
  | Ids<"reply", typeof reply>
  | Ids<"signal", typeof signal>
  | Ids<"wire", typeof wire>;
