import { MariaDbContainer } from "@testcontainers/mariadb";
import { smokeTest } from "../helper";

smokeTest(
  "mariadb",
  "starts mariadb:12.2.2",
  () => new MariaDbContainer("mariadb:12.2.2"),
);
