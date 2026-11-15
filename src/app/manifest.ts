import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Finnance",
    short_name: "Finnance",
    description: "Your personal finance dashboard.",
    start_url: "/",
    display: "standalone",
    background_color: "#f6f4ef",
    theme_color: "#1f3a5f",
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
      { src: "/icons/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
