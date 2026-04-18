import { OpenSearchContainer } from "@testcontainers/opensearch";
import { smokeTest } from "../helper";

smokeTest(
  "opensearch",
  "starts opensearchproject/opensearch:3.5.0",
  () => new OpenSearchContainer("opensearchproject/opensearch:3.5.0"),
);
