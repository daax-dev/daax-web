import { ClickHouseContainer } from "@testcontainers/clickhouse";
import { smokeTest } from "../helper";

smokeTest(
  "clickhouse",
  "starts clickhouse-server:26.3-alpine",
  () => new ClickHouseContainer("clickhouse/clickhouse-server:26.3-alpine"),
);
