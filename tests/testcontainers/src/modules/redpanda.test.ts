import { RedpandaContainer } from "@testcontainers/redpanda";
import { smokeTest } from "../helper";

smokeTest(
  "redpanda",
  "starts redpanda:v26.1.2",
  () => new RedpandaContainer("docker.redpanda.com/redpandadata/redpanda:v26.1.2"),
);
