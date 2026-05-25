import { HiveMQContainer } from "@testcontainers/hivemq";
import { smokeTest } from "../helper";

smokeTest(
  "hivemq",
  "starts hivemq/hivemq-ce:2025.5",
  () => new HiveMQContainer("hivemq/hivemq-ce:2025.5"),
);
