// Preloaded texts for Ekphrasis. Every excerpt is quoted exactly from its source
// (see attribution_notes) or is original text written for this demo and labelled
// as such. Do not edit an excerpt without re-verifying it against the source.
// Em dashes inside quoted excerpts are the source punctuation and are kept as is.

export interface PreloadedText {
  id: string;
  title: string;
  author: string;
  year: number | string;
  source: string;
  excerpt: string;
  attribution_notes: string;
  word_count: number;
}

export const PRELOADED_TEXTS: PreloadedText[] = [
  {
    id: "babel",
    title: "The Library of Babel (opening)",
    author: "Jorge Luis Borges, translated by Andrew Hurley",
    year: 1941,
    source: "Ficciones (1944); this translation from Collected Fictions, Penguin, 1998",
    excerpt: "The universe (which others call the Library) is composed of an indefinite, perhaps infinite number of hexagonal galleries. In the center of each gallery is a ventilation shaft, bounded by a low railing. From any hexagon one can see the floors above and below—one after another, endlessly. The arrangement of the galleries is always the same: Twenty bookshelves, five to each side, line four of the hexagon's six sides; the height of the bookshelves, floor to ceiling, is hardly greater than the height of a normal librarian. One of the hexagon's free sides opens onto a narrow sort of vestibule, which in turn opens onto another gallery, identical to the first—identical in fact to all. To the left and right of the vestibule are two tiny compartments. One is for sleeping, upright; the other, for satisfying one's physical necessities. Through this space, too, there passes a spiral staircase, which winds upward and downward into the remotest distance. In the vestibule there is a mirror, which faithfully duplicates appearances. Men often infer from this mirror that the Library is not infinite—if it were, what need would there be for that illusory replication? I prefer to dream that burnished surfaces are a figuration and promise of the infinite.... Light is provided by certain spherical fruits that bear the name \"bulbs.\" There are two of these bulbs in each hexagon, set crosswise. The light they give is insufficient, and unceasing.",
    attribution_notes: "Fair use excerpt: the opening paragraph of a roughly 3,000 word story, quoted from the published Hurley translation for commentary and interpretation. The Spanish original was first published in El jardin de senderos que se bifurcan, 1941.",
    word_count: 237,
  },
  {
    id: "diomira",
    title: "Cities and memory 1 (Diomira)",
    author: "Italo Calvino, translated by William Weaver",
    year: 1972,
    source: "Invisible Cities (Le citta invisibili); English translation Harcourt, 1974",
    excerpt: "Leaving there and proceeding for three days toward the east, you reach Diomira, a city with sixty silver domes, bronze statues of all the gods, streets paved with lead, a crystal theater, a golden cock that crows each morning on a tower. All these beauties will already be familiar to the visitor, who has seen them also in other cities. But the special quality of this city for the man who arrives there on a September evening, when the days are growing shorter and the multicolored lamps are lighted all at once at the doors of the food stalls and from a terrace a woman’s voice cries ooh!, is that he feels envy toward those who now believe they have once before lived an evening identical to this and who think they were happy, that time.",
    attribution_notes: "Fair use excerpt: one complete city description of about 130 words from a book of 55 such descriptions, quoted for commentary and interpretation.",
    word_count: 136,
  },
  {
    id: "masque",
    title: "The seven rooms of the masque",
    author: "Edgar Allan Poe",
    year: 1842,
    source: "The Masque of the Red Death; text from Project Gutenberg",
    excerpt: "The apartments were so irregularly disposed that the vision embraced but little more than one at a time. There was a sharp turn at every twenty or thirty yards, and at each turn a novel effect. To the right and left, in the middle of each wall, a tall and narrow Gothic window looked out upon a closed corridor which pursued the windings of the suite. These windows were of stained glass whose colour varied in accordance with the prevailing hue of the decorations of the chamber into which it opened. That at the eastern extremity was hung, for example in blue—and vividly blue were its windows. The second chamber was purple in its ornaments and tapestries, and here the panes were purple. The third was green throughout, and so were the casements. The fourth was furnished and lighted with orange—the fifth with white—the sixth with violet. The seventh apartment was closely shrouded in black velvet tapestries that hung all over the ceiling and down the walls, falling in heavy folds upon a carpet of the same material and hue. But in this chamber only, the colour of the windows failed to correspond with the decorations. The panes here were scarlet—a deep blood colour.",
    attribution_notes: "Public domain. Text taken from the Project Gutenberg edition of Poe's works; excerpt begins mid paragraph at a sentence boundary; punctuation unchanged.",
    word_count: 204,
  },
  {
    id: "wallpaper",
    title: "The nursery at the top of the house",
    author: "Charlotte Perkins Gilman",
    year: 1892,
    source: "The Yellow Wallpaper; text from Project Gutenberg",
    excerpt: "It is a big, airy room, the whole floor nearly, with windows that look all ways, and air and sunshine galore. It was nursery first and then playground and gymnasium, I should judge; for the windows are barred for little children, and there are rings and things in the walls. The paint and paper look as if a boys’ school had used it. It is stripped off—the paper—in great patches all around the head of my bed, about as far as I can reach, and in a great place on the other side of the room low down. I never saw a worse paper in my life.",
    attribution_notes: "Public domain. Two consecutive paragraphs from the Project Gutenberg edition, unchanged.",
    word_count: 107,
  },
  {
    id: "listing",
    title: "Loft in a converted cotton warehouse",
    author: "Written for this demo",
    year: 2026,
    source: "A real estate listing, authored for Ekphrasis",
    excerpt: "Rare offering in the old mill district. Third floor loft in a converted 1911 cotton warehouse, 1,340 square feet, one bedroom plus alcove. Original heart pine floors throughout, patched in two places with steel plate. Exposed brick on three walls; the fourth is a 22 foot run of steel sash windows facing northeast over the rail yard. Ceilings 14 feet to the underside of the timber joists. Freight elevator retained and operational. Kitchen is a single galley along the interior wall with a soapstone counter and an oversized industrial sink. The bathroom occupies a former elevator shaft and has no window. Radiant heat in the floor, no air conditioning; tenants report the brick holds the cool until midafternoon in July. Water tower on the roof, shared roof access. Trains pass at 6:40 and 11:15 in the evening. Sold as is. Hardware from the original bale hoist remains bolted to the ceiling beam above the bed alcove.",
    attribution_notes: "Original text written by the demo author. Not a real listing. Included to show the tool on plain, non literary description.",
    word_count: 156,
  },
  {
    id: "attic",
    title: "The room at the top of the house",
    author: "Written for this demo",
    year: 2026,
    source: "A childhood memory, authored for Ekphrasis",
    excerpt: "The house on the hill had a room at the very top that no one used, and I found it the summer I was nine. You reached it by a stair that folded down from the hallway ceiling, and the air changed halfway up, going from the cool of the house to something dry and close, like the inside of a hat. The room ran the whole length of the roof. The ceiling came down on both sides until it met the floor, so you could only stand in the middle, and even there my mother would have had to bend. There was one window, round, at the far end, and the light that came through it was the color of weak orange squash and lay on the boards in a single circle that moved from the left wall to the right over the course of an afternoon. Boxes stood in rows under the eaves, tied with string that had gone soft. I remember the sound most: the tick of the roof tiles heating, and once, a long way below, a door closing in a room I could not have named.",
    attribution_notes: "Original text written by the demo author for this demo and presented as such. Not quoted from any published memoir.",
    word_count: 191,
  },
];

export function getPreloadedText(id: string): PreloadedText | undefined {
  return PRELOADED_TEXTS.find((t) => t.id === id);
}
