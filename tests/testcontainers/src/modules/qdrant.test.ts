import { QdrantContainer } from "@testcontainers/qdrant";
import { smokeTest } from "../helper";

smokeTest(
  "qdrant",
  "starts qdrant/qdrant:v1.17.1",
  () => new QdrantContainer("qdrant/qdrant:v1.17.1"),
);
