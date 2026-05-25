import { MySqlContainer } from "@testcontainers/mysql";
import { smokeTest } from "../helper";

smokeTest(
  "mysql",
  "starts mysql:9.6.0",
  () => new MySqlContainer("mysql:9.6.0"),
);
