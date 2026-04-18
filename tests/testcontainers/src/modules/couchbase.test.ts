import { CouchbaseContainer } from "@testcontainers/couchbase";
import { smokeTest } from "../helper";

smokeTest(
  "couchbase",
  "starts couchbase/server:enterprise-8.0.1",
  () => new CouchbaseContainer("couchbase/server:enterprise-8.0.1"),
);
