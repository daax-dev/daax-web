import { MockserverContainer } from "@testcontainers/mockserver";
import { smokeTest } from "../helper";

smokeTest(
  "mockserver",
  "starts mockserver/mockserver:5.15.0",
  () => new MockserverContainer("mockserver/mockserver:5.15.0"),
);
