// Facebook. Class names are generated per build, so every rule here keys on
// hrefs, element names, ARIA attributes and the few data- attributes
// Facebook keeps (data-commentid, data-focus-target). Checked live on a
// signed-in French account in November 2026 (home feed, groups feed, a
// Page); the English aria-labels were not seen live.
// - every feed post is an [aria-posinset] element, in groups inside a
//   role="feed" list, on the home feed inside an unnamed one;
// - the Video tab is gone: the top bar's third entry is Reels
//   ("/reel/?s=tab", aria-label "Reels" in both languages), and "/watch/"
//   now opens the Reels viewer;
// - a video post's <video> has a poster frame; a photo post with music has
//   a <video> too, 0 by 0 and without one; a photo post links its
//   /photo/ page, a video post never does.
export default {
  id: "facebook",
  name: "Facebook",
  domains: ["facebook.com"],
  // The page rules hold on the app only: business., developers. and the
  // other subdomains are other products with paths of their own.
  pathHosts: ["www.facebook.com", "facebook.com", "m.facebook.com", "web.facebook.com"],
  // Marks the slot around a hidden post, which holds the gap to the next
  // one and has no name CSS could use, see classify.js.
  scripts: ["classify.js"],
  features: [
    {
      id: "images",
      label: "Photos",
      description:
        "Photo posts (one photo, several, or a photo with music) disappear from the home feed, groups, Pages and profiles, with the Photos tab of Pages and profiles; a photo opened from a link still shows.",
      css: "images.css",
    },
    {
      id: "videos",
      label: "Videos",
      description:
        "Video posts disappear from the home feed, groups, Pages and profiles (reels and shared YouTube videos included), and a video page, a Page's Videos or Live tab sends you to the home feed.",
      css: "videos.css",
      paths: [
        // The video section and single videos: /watch/, /watch/?v=<id>,
        // /watch/<id>/, /watch/live/.
        { regex: "^/watch(/|$)", redirect: "/" },
        // A Page's or profile's Videos and Live tabs, and its single videos
        // (/<page>/videos/<id>/).
        { regex: "^/[^/]+/(videos|live_videos)(/|$)", redirect: "/" },
      ],
    },
    {
      id: "shorts",
      label: "Reels",
      description:
        "Reels everywhere: the Reels entry in the top bar and the left column, the Reels shelf and reel posts in feeds, and any reel page (sent back to the home feed, also from a link or a message).",
      css: "shorts.css",
      paths: [
        // The Reels tab (/reel/?s=tab), a single reel (/reel/<id>/), /reels/.
        { regex: "^/reels?(/|$)", redirect: "/" },
        // A Page's or profile's Reels tab.
        { regex: "^/[^/]+/reels(/|$)", redirect: "/" },
      ],
    },
    {
      id: "stories",
      label: "Stories",
      description:
        "The stories tray at the top of the home feed disappears, and the story viewer sends you to the home feed (also from the ring around a profile picture).",
      css: "stories.css",
      paths: [{ regex: "^/stories(/|$)", redirect: "/" }],
    },
    {
      id: "home",
      label: "Home feed",
      description:
        "The home page shows no posts, only the post box at the top; groups, Pages, profiles, messages, notifications and search keep working.",
      css: "home.css",
    },
    {
      id: "comments",
      label: "Comments",
      description:
        "Comments and replies disappear under every post, in feeds and on opened posts and videos; the comment box stays.",
      css: "comments.css",
    },
    {
      id: "suggestions",
      label: "Suggestions",
      description:
        "The \"People you may know\" and suggested-groups strips disappear from the feed, and the friend suggestions page sends you to the home feed; friend requests stay.",
      css: "suggestions.css",
      paths: [{ regex: "^/friends/suggestions(/|$)", redirect: "/" }],
    },
    {
      id: "marketplace",
      label: "Marketplace",
      description:
        "The Marketplace entry in the top bar and the left column and Marketplace listings in the feed disappear, and a Marketplace page sends you to the home feed.",
      css: "marketplace.css",
      paths: [{ regex: "^/marketplace(/|$)", redirect: "/" }],
    },
  ],
};
