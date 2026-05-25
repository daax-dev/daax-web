import { ScyllaContainer } from "@testcontainers/scylladb";
import { smokeTest } from "../helper";

smokeTest(
  "scylladb",
  "starts scylladb/scylla:6.2.3",
  () => new ScyllaContainer("scylladb/scylla:6.2.3"),
);
