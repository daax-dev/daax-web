import { ElasticsearchContainer } from "@testcontainers/elasticsearch";
import { smokeTest } from "../helper";

smokeTest(
  "elasticsearch",
  "starts elasticsearch:9.3.2",
  () => new ElasticsearchContainer("elasticsearch:9.3.2"),
);
