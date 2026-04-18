import { WeaviateContainer } from "@testcontainers/weaviate";
import { smokeTest } from "../helper";

smokeTest(
  "weaviate",
  "starts semitechnologies/weaviate:1.36.9",
  () => new WeaviateContainer("semitechnologies/weaviate:1.36.9"),
);
