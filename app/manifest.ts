import type { MetadataRoute } from "next";

/** Installabile sulla schermata Home (Android e iPhone): a tutto schermo, con la sua icona. */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Saldi",
    short_name: "Saldi",
    description: "Tutti i conti in un posto",
    start_url: "/",
    scope: "/",
    display: "standalone",
    lang: "it",
    background_color: "#f2f4f1",
    theme_color: "#17684b",
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
      { src: "/icons/maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
