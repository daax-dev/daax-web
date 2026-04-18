import { CockroachDbContainer } from "@testcontainers/cockroachdb";
import { smokeTest } from "../helper";

smokeTest(
  "cockroachdb",
  "starts cockroachdb/cockroach:v26.1.1",
  () => new CockroachDbContainer("cockroachdb/cockroach:v26.1.1"),
);
