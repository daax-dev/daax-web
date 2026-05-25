import { SeleniumContainer } from "@testcontainers/selenium";
import { smokeTest } from "../helper";

// selenium/standalone-chrome is linux/amd64-only. On arm64 hosts we use the
// community seleniarm image (pinned slightly older 124.0 tag — flagged in RESULTS.md).
const image =
  process.arch === "arm64"
    ? "seleniarm/standalone-chromium:124.0"
    : "selenium/standalone-chrome:145.0";

smokeTest("selenium", `starts ${image}`, () => new SeleniumContainer(image));
