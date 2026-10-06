// The four seats each come with a character (docs/ART_DIRECTION.md). The
// server hands them out so everyone sees the same one; a character's colour
// marks that player everywhere else (roster, previews, scores).
export const CHARACTERS = [
  { key: "chicken", name: "Chicken", colour: "#d0493b" },
  { key: "dog", name: "Big Dog", colour: "#c28a3c" },
  { key: "horse", name: "Pot Horse", colour: "#6fae25" },
  { key: "dabai", name: "Dabai", colour: "#2f86d9" },
] as const;

export type CharacterKey = (typeof CHARACTERS)[number]["key"];
export const SPECTATOR = { name: "Visitor", colour: "#9a948a" };
