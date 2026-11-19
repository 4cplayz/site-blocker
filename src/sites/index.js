// The registry: the order here is the order on the settings page.
// Adding a site is a folder (CLAUDE.md, Site module contract) and a line here.
import instagram from "./instagram/site.js";
import facebook from "./facebook/site.js";
import youtube from "./youtube/site.js";
import x from "./x/site.js";
import tiktok from "./tiktok/site.js";
import linkedin from "./linkedin/site.js";

export const SITES = [instagram, facebook, youtube, x, tiktok, linkedin];

/** The two part blockers offered on any site the owner adds by hand. */
export const GENERIC = {
  images: "sites/generic/images.css",
  videos: "sites/generic/videos.css",
};
