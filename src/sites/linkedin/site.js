// LinkedIn: www and the country subdomains (fr.linkedin.com, ...).
// Two feed front ends are live in November 2026 and a member gets one of
// them: the Ember app (hand-written BEM classes, data-id / data-urn) and the
// rebuilt server-driven app (generated classes; componentkey, data-testid,
// role and, on some accounts, data-view-name). Every feature covers both.
// Selectors come from maintained extensions and filter lists (LinkOff,
// News Feed Eradicator, LinkedIn Media Toggle, Feed Guard, Bouncer,
// EasyList's LinkedIn list) and captured feed markup; not yet checked live.
// No classifier: media kinds show in the markup and in media addresses, so
// CSS tells them apart even before the video player mounts.
export default {
  id: "linkedin",
  name: "LinkedIn",
  domains: ["linkedin.com"],
  features: [
    {
      id: "shorts",
      label: "Short videos",
      description:
        "The \"Videos for you\" strip of vertical videos in the feed and any Video tab in the top bar disappear, and a video-feed address sends you to the home feed.",
      css: "shorts.css",
      paths: [
        {
          // /video, /videos, /feed/video, /feed/videos: the addresses a
          // vertical-video feed would take. LinkedIn Live (/video/live/...)
          // and video events (/video/event/...) do not match.
          regex: "^/(feed/)?videos?/?$",
          redirect: "/feed/",
        },
      ],
    },
    {
      id: "videos",
      label: "Video posts",
      description:
        "Posts that carry a video (LinkedIn's own player, or an embedded YouTube or Vimeo video) disappear from the feed, profiles, company pages and search.",
      css: "videos.css",
    },
    {
      id: "images",
      label: "Image posts",
      description:
        "Posts whose main content is a photo, several photos or a document (a PDF slide carousel) disappear from the feed, profiles, company pages and search.",
      css: "images.css",
    },
    {
      id: "home",
      label: "Home feed",
      description:
        "The home page shows no posts, only the \"Start a post\" box; messaging, jobs, search, notifications and single posts keep working.",
      css: "home.css",
      network: [
        // The home feed's own data, Ember app: the next pages of posts.
        {
          urlFilter: "||linkedin.com/voyager/api/graphql?*queryId=voyagerFeedDashMainFeed.",
          resourceTypes: ["xmlhttprequest"],
        },
        {
          urlFilter: "||linkedin.com/voyager/api/voyagerFeedDashMainFeed",
          resourceTypes: ["xmlhttprequest"],
        },
        // The home feed's own pager, server-driven app (the first page
        // comes with the document and is hidden by the CSS).
        {
          urlFilter:
            "||linkedin.com/flagship-web/rsc-action/actions/pagination?*sduiid=com.linkedin.sdui.pagers.feed.mainFeed",
          resourceTypes: ["xmlhttprequest"],
        },
      ],
    },
    {
      id: "news",
      label: "LinkedIn News",
      description:
        "The LinkedIn News headlines in the right column disappear, and a news story page sends you to the home feed.",
      css: "news.css",
      paths: [{ regex: "^/news(/|$)", redirect: "/feed/" }],
    },
    {
      id: "games",
      label: "Puzzles",
      description:
        "LinkedIn's daily puzzles disappear from the right column, My Network and shared results in the feed, and a game page sends you to the home feed.",
      css: "games.css",
      paths: [{ regex: "^/games(/|$)", redirect: "/feed/" }],
    },
  ],
};
