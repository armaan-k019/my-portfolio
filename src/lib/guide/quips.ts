// Things the guide says unprompted. Jokes about the bird itself, not claims
// about Armaan, so none of them can be wrong about him. Lines that point at a
// page carry its href so the bubble can link there.

export interface Quip {
  text: string;
  href?: string;
}

export const QUIPS: Quip[] = [
  { text: "I am technically a bird. I have filed the paperwork." },
  { text: "Penguin? Robot? Egg with ambition? Yes." },
  { text: "My flippers are decorative. My opinions are load-bearing." },
  { text: "I was built in a research lab. I mostly research snacks." },
  { text: "I have no legs to speak of. I waddle on pure confidence." },
  { text: "If you click me I will answer questions. If you don't, I will keep waddling. Your call." },
  { text: "I contain zero polygons with hard edges. My therapist says that is a lot of pressure." },
  { text: "Ask me where Armaan's projects are. I know a shortcut.", href: "/home#projects" },
  { text: "There is a contact form down there. I have never been allowed to use it.", href: "/home#contact" },
  { text: "Rumor has it there are publications on this site. Rumor is me. I am the rumor.", href: "/home#research" },
  { text: "The demos page is where the fun computers live.", href: "/demos" },
  { text: "Antenna status: picking up mostly vibes." },
  { text: "I blink every three to six seconds. It is in my source code. I did not choose this." },
  { text: "Squash and stretch is not a workout plan. Or is it." },
  { text: "Fun fact: I am rendered in real time. Every frame of me is a fresh frame of me." },
  { text: "Do not tell anyone, but my belly panel is just very confident paint." },
  { text: "I would fly, but I was rigged by an architect. Structural concerns." },
  { text: "Hello from the bottom right corner. It is lovely down here. Great views of your scroll bar." },
  { text: "My beak is mostly for emphasis." },
  { text: "Sometimes I sneeze sparkles. I am told that is normal for a bird." },
  { text: "I do my best thinking while walking in small circles." },
  { text: "Have you tried asking me something? I have been practicing." },
  { text: "Every pixel of me was computed. Nobody drew me. I drew myself, kind of." },
  { text: "The journal has essays. I have read them. I nodded at the good parts.", href: "/journal" },
];
