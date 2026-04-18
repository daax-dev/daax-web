import { OllamaContainer } from "@testcontainers/ollama";
import { smokeTest } from "../helper";

// Ollama container does not pull any model by default; this smoke-test verifies
// only that the runtime starts and exposes the API port.
smokeTest("ollama", "starts ollama/ollama:0.20.2", () => new OllamaContainer("ollama/ollama:0.20.2"));
