import { KafkaContainer } from "@testcontainers/kafka";
import { smokeTest } from "../helper";

smokeTest("kafka", "starts confluentinc/cp-kafka:8.2.0", () => new KafkaContainer("confluentinc/cp-kafka:8.2.0"));
