import { NatsContainer } from "@testcontainers/nats";
import { smokeTest } from "../helper";

smokeTest(
  "nats",
  "starts nats:2.12.6-alpine",
  () => new NatsContainer("nats:2.12.6-alpine"),
);
