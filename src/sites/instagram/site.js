// Instagram. Class names are generated per build, so every rule here keys on
// hrefs, element names, role/aria attributes and data-pagelet.
// Glyph labels checked in Instagram's own en_US and fr_FR bundles (Nov 2026):
// "Reel" (Explore tile, both languages), "Clip" (profile tile and DM share,
// both), "Video" / "Vidéo" (profile tile), "Carousel" / "Carrousel".
export default {
  id: "instagram",
  name: "Instagram",
  domains: ["instagram.com"],
  // Marks grid cells only (data-sb): CSS cannot reach the wrapper of a photo
  // tile, see classify.js. Feed posts and everything else are pure CSS.
  scripts: ["classify.js"],
  features: [
    {
      id: "shorts",
      label: "Reels",
      description:
        "Reels everywhere: the Reels button, the Reels tab and any single reel page (sent back to the home feed, also when opened from a link or a message), the Reels tab on profiles, reels in the home feed, reel tiles in Explore and profile grids, and reels shared in messages.",
      css: "shorts.css",
      paths: [
        // The Reels tab, its /reels/<code>/ entries, audio and effect pages.
        { regex: "^/reels(/|$)", redirect: "/" },
        // A single reel, from a link, a share or a DM.
        { regex: "^/reel/", redirect: "/" },
        // The same, in the /<username>/reel/<code>/ form grids now link to.
        { regex: "^/[^/]+/reel/", redirect: "/" },
      ],
      network: [
        // Reels that use a given song (the audio page); nothing else calls it.
        { urlFilter: "||instagram.com/api/v1/clips/music/", resourceTypes: ["xmlhttprequest"] },
        // Reels that use a given camera effect (the effect page).
        { urlFilter: "||instagram.com/api/v1/clips/effect/", resourceTypes: ["xmlhttprequest"] },
      ],
    },
    {
      id: "videos",
      label: "Videos",
      description:
        "Every post whose media is a video, which on Instagram today is nearly always a reel: video posts in the home feed and video tiles in Explore and profile grids (the Reels tab itself is the Reels switch).",
      css: "videos.css",
    },
    {
      id: "images",
      label: "Photos",
      description:
        "Photo posts and photo carousels in the home feed, and photo and carousel tiles in Explore, profile and hashtag grids.",
      css: "images.css",
    },
    {
      id: "stories",
      label: "Stories",
      description:
        "The stories tray at the top of the home feed, and the story viewer (sent back to the home feed).",
      css: "stories.css",
      paths: [{ regex: "^/stories/", redirect: "/" }],
    },
  ],
};
