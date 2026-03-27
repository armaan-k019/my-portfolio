export interface Photo {
  src: string;
  alt: string;
  caption?: string;
}

export interface Album {
  slug: string;
  title: string;
  location: string;
  cover: string;
  coverGradient: string; // CSS gradient for placeholder
  caption: string;
  photos: Photo[];
}

export const albums: Album[] = [
  {
    slug: "japan",
    title: "Two Weeks in Japan",
    location: "Tokyo, Kyoto, Osaka",
    cover: "/photos/japan/cover.svg",
    coverGradient: "linear-gradient(135deg, #C1513A 0%, #8B3A2A 100%)",
    caption: "Temples, neon, and everything in between. A visual diary from two weeks wandering through Japan in autumn.",
    photos: [
      { src: "/photos/japan/cover.svg", alt: "Fushimi Inari shrine gates", caption: "The endless torii gates of Fushimi Inari at dawn" },
      { src: "/photos/japan/02.svg", alt: "Tokyo streets at night", caption: "Shinjuku backstreets after rain" },
      { src: "/photos/japan/03.svg", alt: "Bamboo grove", caption: "Arashiyama bamboo grove, early morning" },
      { src: "/photos/japan/04.svg", alt: "Street food stall", caption: "Takoyaki vendor in Dotonbori, Osaka" },
      { src: "/photos/japan/05.svg", alt: "Train platform", caption: "Waiting for the Shinkansen at Kyoto Station" },
      { src: "/photos/japan/06.svg", alt: "Temple garden", caption: "Zen garden at Ryoan-ji" },
    ],
  },
  {
    slug: "pacific-northwest",
    title: "Pacific Northwest",
    location: "Oregon & Washington",
    cover: "/photos/pacific-northwest/cover.svg",
    coverGradient: "linear-gradient(135deg, #2D5016 0%, #1A3A0A 100%)",
    caption: "Misty forests, rugged coastlines, and the quiet beauty of the PNW.",
    photos: [
      { src: "/photos/pacific-northwest/cover.svg", alt: "Misty forest trail", caption: "Hoh Rainforest, Olympic National Park" },
      { src: "/photos/pacific-northwest/02.svg", alt: "Coastal rocks", caption: "Cannon Beach at low tide" },
      { src: "/photos/pacific-northwest/03.svg", alt: "Mountain lake", caption: "Crater Lake on a clear day" },
      { src: "/photos/pacific-northwest/04.svg", alt: "Waterfall", caption: "Multnomah Falls from the bridge" },
      { src: "/photos/pacific-northwest/05.svg", alt: "Coffee shop", caption: "Morning pour-over in Portland" },
    ],
  },
  {
    slug: "new-york",
    title: "New York Minutes",
    location: "New York City",
    cover: "/photos/new-york/cover.svg",
    coverGradient: "linear-gradient(135deg, #4A5568 0%, #2D3748 100%)",
    caption: "A weekend of street photography in Manhattan and Brooklyn.",
    photos: [
      { src: "/photos/new-york/cover.svg", alt: "Brooklyn Bridge at sunset", caption: "Brooklyn Bridge, golden hour" },
      { src: "/photos/new-york/02.svg", alt: "Subway platform", caption: "Waiting underground at 14th Street" },
      { src: "/photos/new-york/03.svg", alt: "Central Park", caption: "Central Park in late autumn" },
      { src: "/photos/new-york/04.svg", alt: "Fire escape patterns", caption: "Fire escapes in SoHo" },
    ],
  },
  {
    slug: "golden-hour",
    title: "Golden Hour",
    location: "American Southwest",
    cover: "/photos/golden-hour/cover.svg",
    coverGradient: "linear-gradient(135deg, #D4A96A 0%, #C1513A 100%)",
    caption: "Chasing the last light across red rock canyons and desert highways.",
    photos: [
      { src: "/photos/golden-hour/cover.svg", alt: "Desert sunset", caption: "Monument Valley at golden hour" },
      { src: "/photos/golden-hour/02.svg", alt: "Red rocks", caption: "Sedona vortex trail" },
      { src: "/photos/golden-hour/03.svg", alt: "Highway", caption: "Route 66 heading west" },
    ],
  },
  {
    slug: "campus-fragments",
    title: "Campus Fragments",
    location: "Georgia Tech, Atlanta",
    cover: "/photos/campus-fragments/cover.svg",
    coverGradient: "linear-gradient(135deg, #1E3A5F 0%, #0F1F33 100%)",
    caption: "Architectural details and quiet moments around the Georgia Tech campus.",
    photos: [
      { src: "/photos/campus-fragments/cover.svg", alt: "Tech Tower", caption: "Tech Tower at dusk" },
      { src: "/photos/campus-fragments/02.svg", alt: "Clough Commons", caption: "Inside Clough Commons" },
      { src: "/photos/campus-fragments/03.svg", alt: "Campus walkway", caption: "Cherry blossoms on Tech Green" },
    ],
  },
  {
    slug: "street-level",
    title: "Street Level",
    location: "Various Cities",
    cover: "/photos/street-level/cover.svg",
    coverGradient: "linear-gradient(135deg, #6B8F6E 0%, #3D5940 100%)",
    caption: "Everyday scenes from sidewalks, storefronts, and street corners around the world.",
    photos: [
      { src: "/photos/street-level/cover.svg", alt: "Street corner", caption: "Morning light, Chicago" },
      { src: "/photos/street-level/02.svg", alt: "Market stall", caption: "Pike Place Market, Seattle" },
      { src: "/photos/street-level/03.svg", alt: "Bike lane", caption: "Amsterdam canal-side" },
    ],
  },
];
