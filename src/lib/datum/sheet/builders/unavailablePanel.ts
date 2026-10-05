// Builder for the unavailable and loading panel. SPEC.md section 8 rule 4.
//
// Every other builder routes an absent or unavailable envelope here, so the
// framed box, the UNAVAILABLE stamp, and the verbatim reason are written in one
// place and every panel reads the same on screen and in the export.

import { unavailablePanel } from "../panel";

export interface UnavailableOpts {
  sourceName?: string | null;
  status?: "unavailable" | "loading";
  /** When the group id is not also a zone id (a group sharing a grid cell). */
  zoneId?: string;
}

export function build(
  groupId: string,
  title: string,
  message: string,
  opts?: UnavailableOpts,
): string {
  return unavailablePanel(groupId, title, message, opts);
}
