// Things the guides say unprompted. Jokes about the birds themselves, not
// claims about Armaan, so none of them can be wrong about him. Lines that point
// at a page carry its href so the bubble can link there. A reply is the other
// bird answering, shown right after.

export type BirdId = "huginn" | "muninn";

export interface Quip {
  text: string;
  // Who says it. Left out, Muninn (memory) usually takes it.
  who?: BirdId;
  href?: string;
  reply?: string;
}

export const FIRST_QUIP: Quip = {
  who: "huginn",
  text: "Click on us to ask us anything about Armaan.",
  reply: "I'm Muninn, he's Huginn. Thought and memory. Odin's ravens, now in green.",
};

export const QUIPS: Quip[] = [
  { text: "I am technically a bird. I have filed the paperwork." },
  { text: "Raven? Robot? Egg with ambition? Yes." },
  { text: "My flippers are decorative. My opinions are load-bearing." },
  { text: "We were built in a research lab. We mostly research snacks." },
  { text: "I have no legs to speak of. I waddle on pure confidence." },
  { who: "huginn", text: "If you click us we answer questions. If you don't, we keep waddling. Your call." },
  { text: "I contain zero polygons with hard edges. My therapist says that is a lot of pressure." },
  { who: "huginn", text: "Ask me where Armaan's projects are. I know a shortcut.", href: "/home#projects" },
  { text: "There is a contact form down there. We have never been allowed to use it.", href: "/home#contact" },
  { text: "Rumor has it there are publications on this site. Rumor is me. I am the rumor.", href: "/home#research" },
  { text: "The demos page is where the fun computers live.", href: "/demos" },
  { text: "Antenna status: picking up mostly vibes." },
  { text: "I blink every three to six seconds. It is in my source code. I did not choose this." },
  { text: "Squash and stretch is not a workout plan. Or is it." },
  { who: "huginn", text: "Fun fact: I am rendered in real time. Every frame of me is a fresh frame of me." },
  { text: "Do not tell anyone, but my belly panel is just very confident paint." },
  { text: "I would fly, but I was rigged by an architect. Structural concerns." },
  { text: "Hello from the bottom right corner. Lovely down here. Great views of your scroll bar." },
  { text: "My beak is mostly for emphasis." },
  { text: "Sometimes I sneeze sparkles. I am told that is normal for a bird." },
  { who: "huginn", text: "I do my best thinking while walking in small circles." },
  { text: "The journal has essays. I have read them. I nodded at the good parts.", href: "/journal" },
  // Two-bird bits.
  { who: "huginn", text: "I am Thought.", reply: "I am Memory. I remember you said you'd click us." },
  { who: "huginn", text: "Odin sent us out to gather news of the world.", reply: "We got as far as this website. It has good snacks." },
  { who: "muninn", text: "Huginn, what were we doing?", reply: "Thinking. That is literally my whole job." },
  { who: "huginn", text: "Ravens are supposed to be black.", reply: "We are green. It was a design decision. Do not ask." },
  { who: "muninn", text: "I remember every page on this site.", reply: "He also remembers every time I tripped. Unfortunately." },
  { who: "huginn", text: "Are we a flock now?", reply: "Two is a flock if you believe hard enough." },
  { who: "muninn", text: "Huginn thinks. I remember. Together we forget nothing and overthink everything." },
];
