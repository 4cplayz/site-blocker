// TikTok. Hooks come from TikTok's own webapp-desktop bundles (Nov 2026):
// data-e2e / data-testid attributes, element ids and the route table.
// Feed pages are closed by path and sent to /messages (logged out, TikTok
// itself sends /messages on to /login: no loop). What stays reachable:
// search, profiles, single video and photo links, messages, upload and
// TikTok Studio.
const XHR = ["xmlhttprequest"];

export default {
  id: "tiktok",
  name: "TikTok",
  domains: ["tiktok.com"],
  // The page rules hold on the app only: support., ads., developers. and
  // shop.tiktok.com are other products, and "/en" is the Help Center's home.
  pathHosts: ["www.tiktok.com", "tiktok.com", "m.tiktok.com"],
  features: [
    {
      id: "shorts",
      label: "Feeds",
      description:
        "The For You, Following, Friends, Explore, LIVE and short-drama feeds and their menu entries disappear (those pages open Messages instead), and a video opened from a link plays alone, without 'You may like' or the next videos; search, profiles, messages, upload and TikTok Studio stay reachable.",
      css: "shorts.css",
      paths: [
        // For You: "/", "/foryou" and the language homes ("/en", "/fr", "/fr-CA", "/zh-Hant-TW", "/ceb-PH").
        // No counted repeats ({2,4}): Chrome compiles each rule into at most 2 KB.
        {
          regex: "^/(foryou|([a-z][a-z]|ceb|fil)(-[A-Za-z0-9]+)?(-[A-Za-z0-9]+)?)?/?$",
          redirect: "/messages",
        },
        // Following, Friends, Explore and the short-drama library and episodes.
        { regex: "^/(following|friends|explore|shortdrama)(/|$)", redirect: "/messages" },
        // LIVE discovery and its category feeds; LIVE Producer, subscriptions and events stay.
        { regex: "^/live/?$", redirect: "/messages" },
        {
          regex: "^/live/(following|category|gaming|lifestyle|explore|mena-action)(/|$)",
          redirect: "/messages",
        },
      ],
      network: [
        // For You items (the page is closed above).
        { urlFilter: "||tiktok.com/api/recommend/item_list/", resourceTypes: XHR },
        { urlFilter: "||tiktok.com/api/prefetch/recommend/item_list/", resourceTypes: XHR },
        // Explore, Following and Friends items (pages closed above).
        { urlFilter: "||tiktok.com/api/explore/item_list/", resourceTypes: XHR },
        { urlFilter: "||tiktok.com/api/prefetch/explore/item_list/", resourceTypes: XHR },
        { urlFilter: "||tiktok.com/api/following/item_list/", resourceTypes: XHR },
        { urlFilter: "||tiktok.com/api/friends/item_list/", resourceTypes: XHR },
        // "You may like" / next videos of a single video; the video itself comes with the page.
        { urlFilter: "||tiktok.com/api/related/item_list/", resourceTypes: XHR },
      ],
    },
    {
      id: "videos",
      label: "Videos",
      description:
        "Video tiles disappear from every grid (a creator's profile, search results, hashtag, sound and discover pages) and from the related list beside a video, while a video opened from a direct link still plays.",
      css: "videos.css",
    },
    {
      id: "images",
      label: "Photo posts",
      description:
        "Photo posts (photo carousels, /photo/ links) disappear from profiles, search results, hashtag and sound pages and feeds, and a photo post opened from a link shows no photos.",
      css: "images.css",
    },
    {
      id: "comments",
      label: "Comments",
      description: "Comment threads, the comment box and the comment button disappear under and beside every video.",
      css: "comments.css",
    },
    {
      id: "live",
      label: "LIVE",
      description:
        "Every LIVE page and stream closes (LIVE discovery, categories, LIVE Producer and any creator's /live open Messages instead), and LIVE menu entries, LIVE links and LIVE search results disappear.",
      css: "live.css",
      paths: [
        { regex: "^/live(/|$)", redirect: "/messages" },
        { regex: "^/@[^/]+/live(/|$)", redirect: "/messages" },
      ],
    },
  ],
};
