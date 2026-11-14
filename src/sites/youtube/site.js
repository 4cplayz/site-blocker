// YouTube: desktop (www), mobile (m.) and embeds (youtube-nocookie.com).
// Selectors were cross-checked in November 2026 against YouTube's own page
// data and front-end bundles (web 2.20261112, mweb 2.20261113) and against
// maintained filter lists and extensions.
export default {
  id: "youtube",
  name: "YouTube",
  // youtube-nocookie.com serves the privacy-mode embeds other sites use;
  // without it the black zone would leave every such embed playing.
  domains: ["youtube.com", "youtube-nocookie.com"],
  // Marks the "Shorts" filter chip, the one element CSS cannot single out.
  scripts: ["classify.js"],
  features: [
    {
      id: "shorts",
      label: "Shorts",
      description:
        "Shorts disappear everywhere (menu and mobile-bar entries, shelves, cards in feeds and search, the channel tab, the filter chip, notifications) and a Shorts page sends you to the home page.",
      css: "shorts.css",
      paths: [
        {
          // /shorts and /shorts/<id>, a channel's Shorts tab, /feed/shorts,
          // the subscriptions Shorts feed, hashtag and sound ("source") pages.
          regex:
            "^/(shorts|(@[^/?#]+|(channel|c|user|hashtag|source)/[^/?#]+|feed|feed/subscriptions)/shorts)([/?#]|$)",
          redirect: "/",
        },
      ],
      network: [
        // reel_item_watch and reel_watch_sequence: the Shorts player's own
        // InnerTube calls, used by nothing else on the site.
        { urlFilter: "||youtube.com/youtubei/v1/reel/", resourceTypes: ["xmlhttprequest"] },
      ],
    },
    {
      id: "videos",
      label: "Videos",
      description:
        "Video cards disappear from home, subscriptions, search, channel pages and the watch-page sidebar, so a video only plays from a link or from your own playlists, Watch later and history.",
      css: "videos.css",
    },
    {
      id: "images",
      label: "Posts",
      description:
        "Community posts (image, poll and text) disappear from feeds, channel pages and notifications, with the Posts tab, and a post page sends you to the home page.",
      css: "images.css",
      paths: [
        {
          // /post/<id>, and a channel's Posts tab (formerly Community).
          regex: "^/(post/[^/?#]+|(@[^/?#]+|(channel|c|user)/[^/?#]+)/(posts|community))([/?#]|$)",
          redirect: "/",
        },
      ],
    },
    {
      id: "home",
      label: "Home feed",
      description:
        "The recommendations on the home page disappear, leaving the search bar and the menu.",
      css: "home.css",
    },
    {
      id: "related",
      label: "Up next",
      description: "The list of suggested videos beside or under the player disappears.",
      css: "related.css",
    },
    {
      id: "endscreen",
      label: "End screens",
      description:
        "The suggested-video wall at the end of a video, the end-screen and info cards over it, and the paused-embed \"More videos\" strip disappear; the autoplay countdown stays so you can cancel it.",
      css: "endscreen.css",
    },
    {
      id: "comments",
      label: "Comments",
      description: "Comments under videos, Shorts and posts disappear; live chat stays.",
      css: "comments.css",
    },
  ],
};
