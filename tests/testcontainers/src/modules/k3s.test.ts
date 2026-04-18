import { K3sContainer } from "@testcontainers/k3s";
import { smokeTest } from "../helper";

smokeTest("k3s", "starts rancher/k3s:v1.35.3-k3s1", () => new K3sContainer("rancher/k3s:v1.35.3-k3s1"));
