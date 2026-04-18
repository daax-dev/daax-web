import { RabbitMQContainer } from "@testcontainers/rabbitmq";
import { smokeTest } from "../helper";

smokeTest(
  "rabbitmq",
  "starts rabbitmq:4.2.5-management-alpine",
  () => new RabbitMQContainer("rabbitmq:4.2.5-management-alpine"),
);
