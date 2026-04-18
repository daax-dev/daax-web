import { ToxiProxyContainer } from "@testcontainers/toxiproxy";
import { smokeTest } from "../helper";

smokeTest(
  "toxiproxy",
  "starts ghcr.io/shopify/toxiproxy:2.12.0",
  () => new ToxiProxyContainer("ghcr.io/shopify/toxiproxy:2.12.0"),
);
