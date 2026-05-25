import { PostgreSqlContainer } from "@testcontainers/postgresql";
import { smokeTest } from "../helper";

smokeTest(
  "postgresql",
  "starts postgres:18.3-alpine",
  () => new PostgreSqlContainer("postgres:18.3-alpine"),
);
