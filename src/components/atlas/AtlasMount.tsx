"use client";

import dynamic from "next/dynamic";

// Lazy load the WebGL map after first paint so three.js stays out of the
// initial bundle. ssr:false because the renderer needs the DOM and a GL context.
const LatentAtlasMap = dynamic(() => import("./LatentAtlasMap"), { ssr: false });

export default function AtlasMount() {
  return <LatentAtlasMap />;
}
