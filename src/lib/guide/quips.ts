// Things the guides say unprompted. Jokes about the birds themselves, not
// claims about Armaan, so none of them can be wrong about him. Lines that point
// at a page carry its href so the bubble can link there. A reply is the other
// bird answering, shown right after.

export type BirdId = "thought" | "memory";

// Display names, in one place so a rename is one edit. The ids say who is who:
// the purple one does the thinking and answers, the green one does the
// remembering and heckles. They can joke about that, but never name
// themselves Thought or Memory; that stays an easter egg.
export const BIRD_NAMES: Record<BirdId, string> = { thought: "Huey", memory: "Muni" };
// Their full names, used when they introduce themselves.
export const FULL_NAMES: Record<BirdId, string> = { thought: "Huginn", memory: "Muninn" };
const T = BIRD_NAMES.thought;
const M = BIRD_NAMES.memory;

export interface Quip {
  text: string;
  // Who says it. Left out, the memory bird usually takes it.
  who?: BirdId;
  href?: string;
  reply?: string;
}

export const FIRST_QUIP: Quip = {
  who: "thought",
  text: "Click on us to ask us anything about Armaan.",
  reply: `I'm ${FULL_NAMES.memory}, he's ${FULL_NAMES.thought}. ${M} and ${T} for short. He does the thinking, I do the remembering.`,
};

export const QUIPS: Quip[] = [
  { text: "I am technically a bird. I have filed the paperwork." },
  { text: "Bird? Robot? Egg with ambition? Yes." },
  { text: "My flippers are decorative. My opinions are load-bearing." },
  { text: "We were built in a research lab. We mostly research snacks." },
  { text: "I have no legs to speak of. I waddle on pure confidence." },
  { who: "thought", text: "If you click us we answer questions. If you don't, we keep waddling. Your call." },
  { text: "I contain zero polygons with hard edges. My therapist says that is a lot of pressure." },
  { who: "thought", text: "Ask me where Armaan's projects are. I know a shortcut.", href: "/home#projects" },
  { text: "There is a contact form down there. We have never been allowed to use it.", href: "/home#contact" },
  { text: "Rumor has it there are publications on this site. Rumor is me. I am the rumor.", href: "/home#research" },
  { text: "The demos page is where the fun computers live.", href: "/demos" },
  { who: "thought", text: "Antenna status: picking up mostly vibes." },
  { text: "I blink every three to six seconds. It is in my source code. I did not choose this." },
  { text: "Squash and stretch is not a workout plan. Or is it." },
  { who: "thought", text: "Fun fact: I am rendered in real time. Every frame of me is a fresh frame of me." },
  { text: "Do not tell anyone, but my belly panel is just very confident paint." },
  { text: "I would fly, but I was rigged by an architect. Structural concerns." },
  { text: "Hello from the bottom right corner. Lovely down here. Great views of your scroll bar." },
  { text: "My beak is mostly for emphasis." },
  { text: "This crest is not hair. It is three feathers holding a meeting." },
  { who: "thought", text: "The glasses are not prescription. They are for looking smart. Is it working." },
  { text: "Sometimes I sneeze sparkles. I am told that is normal for a bird." },
  { who: "thought", text: "I do my best work while walking in small circles." },
  { text: "The journal has essays. I have read them. I nodded at the good parts.", href: "/journal" },
  // Two-bird bits, mostly bickering.
  { who: "thought", text: "I am the brains of this operation.", reply: "I remember you saying that yesterday too. And the day before." },
  { who: "memory", text: `${T}, what were we doing?`, reply: "Standing here. Looking good. Same as always." },
  { who: "memory", text: "Why are you purple?", reply: "Why are you green? We do not ask each other these questions." },
  { who: "thought", text: "Those feathers on your head look ridiculous.", reply: "Says the bird wearing glasses with no lenses." },
  { who: "memory", text: "I know every page on this site.", reply: "He also brings up every time I tripped. Every single time." },
  { who: "thought", text: "Are we a flock now?", reply: "Two is a flock if you believe hard enough." },
  { who: "thought", text: "Stop standing so close to me.", reply: "We overlap by 22 percent. It is in the code. Take it up with Armaan." },
  { who: "memory", text: "I was here first.", reply: "We were rendered in the same frame." },
  { who: "thought", text: "Somewhere, a one-eyed guy is wondering where we went.", reply: "Do not tell him. The snacks here are better." },
  { who: "memory", text: `${T} thinks. I remember. Together we forget nothing and overthink everything.` },
  // Muni on his own, about something other than his memory.
  { who: "memory", text: "Honest review of this corner: good light, no snacks, one purple roommate." },
  { who: "memory", text: "I rate every page I see. The demos get the most stars. Do not tell the journal.", href: "/demos" },
  { who: "memory", text: "If you scroll fast enough, I get a little seasick. Please continue." },
  { who: "memory", text: "Hot take: the best way to see this site is to ask us to take you somewhere. Try it." },
  { who: "memory", text: "My crest goes up when I am curious. It is up right now. What are you looking for?" },
  { who: "memory", text: `Most visitors click on ${T} first. I am trying not to take it personally.` },
  { who: "memory", text: "Tell us a page and we will walk you there. Well. I will. He will make a speech first." },
  // More back and forth where Muni gets the last word.
  { who: "thought", text: "I have a theory about this page.", reply: "He has a theory about every page. Ask him about the footer. Actually, please do not." },
  { who: "thought", text: "Let me think about that.", reply: "This could take a while. You could read a whole project in the meantime." },
  { who: "thought", text: "I just had a brilliant idea.", reply: "It was a sandwich. The idea was a sandwich." },
  { who: "thought", text: "I am going to explain the whole site in one sentence.", reply: "He is not. I have seen him try. Just ask us something specific." },
];
