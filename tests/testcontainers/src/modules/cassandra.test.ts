import { CassandraContainer } from "@testcontainers/cassandra";
import { smokeTest } from "../helper";

smokeTest(
  "cassandra",
  "starts cassandra:5.0.7",
  () => new CassandraContainer("cassandra:5.0.7"),
);
