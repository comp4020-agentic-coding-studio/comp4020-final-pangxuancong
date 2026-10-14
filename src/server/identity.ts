import { createHash } from "node:crypto";

// Who someone is, as others may know it (docs/decisions/0003-who-may-change-what.md).
//
// A browser's playerId is its secret: whoever presents it is that player, and
// can take their seat. It never leaves the server. Everyone else, and the
// logs, see a short public tag derived from it, shown as "Chicken#3fa9" like
// a Riot ID: the character says what they play, the tag tells two Chickens
// apart. A hash, so a tag cannot be turned back into the id.
const SALT = "chain-reaction/tag/v1";
export const tagOf = (playerId: string): string => createHash("sha256").update(SALT).update(playerId).digest("hex").slice(0, 4);
