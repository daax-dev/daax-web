import { ChromaDBContainer } from "@testcontainers/chromadb";
import { smokeTest } from "../helper";

smokeTest(
  "chromadb",
  "starts chromadb/chroma:1.5.5",
  () => new ChromaDBContainer("chromadb/chroma:1.5.5"),
);
