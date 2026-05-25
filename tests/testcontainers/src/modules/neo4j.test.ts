import { Neo4jContainer } from "@testcontainers/neo4j";
import { smokeTest } from "../helper";

smokeTest(
  "neo4j",
  "starts neo4j:5.26.24",
  () => new Neo4jContainer("neo4j:5.26.24"),
);
