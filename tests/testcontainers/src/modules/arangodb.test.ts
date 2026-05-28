import { ArangoDBContainer } from "@testcontainers/arangodb";
import { smokeTest } from "../helper";

smokeTest(
  "arangodb",
  "starts arangodb:3.12.8",
  () => new ArangoDBContainer("arangodb:3.12.8"),
);
