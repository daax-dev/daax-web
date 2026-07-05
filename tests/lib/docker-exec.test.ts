import { describe, it, expect } from "vitest";
import {
  isDockerUnavailableError,
  dockerUnavailableResponse,
} from "@/lib/docker-exec";

/**
 * The docker-unavailable classifier + 503 helper back the F3 split (#100)
 * degradation: the web plane holds no Docker socket, so every docker-backed
 * route must return the same structured 503 as /api/containers instead of a
 * raw 500.
 */

describe("isDockerUnavailableError", () => {
  it("classifies a missing docker CLI (ENOENT) as unavailable", () => {
    const err = Object.assign(new Error("spawn docker ENOENT"), {
      code: "ENOENT",
    });
    expect(isDockerUnavailableError(err)).toBe(true);
  });

  it("classifies the missing-socket daemon error (message) as unavailable", () => {
    expect(
      isDockerUnavailableError(
        new Error(
          "Command failed: docker ps\nCannot connect to the Docker daemon at unix:///var/run/docker.sock. Is the docker daemon running?",
        ),
      ),
    ).toBe(true);
  });

  it("classifies the daemon error carried on stderr as unavailable", () => {
    const err = Object.assign(new Error("Command failed: docker inspect x"), {
      code: 1,
      stderr:
        "Cannot connect to the Docker daemon at unix:///var/run/docker.sock. Is the docker daemon running?",
    });
    expect(isDockerUnavailableError(err)).toBe(true);
  });

  it("classifies a socket permission error as unavailable", () => {
    expect(
      isDockerUnavailableError(
        new Error(
          "permission denied while trying to connect to the Docker daemon socket at unix:///var/run/docker.sock",
        ),
      ),
    ).toBe(true);
  });

  it("does NOT classify an ordinary docker command failure", () => {
    const err = Object.assign(new Error("Command failed: docker rm -f x"), {
      code: 1,
      stderr: "Error response from daemon: No such container: x",
    });
    expect(isDockerUnavailableError(err)).toBe(false);
  });

  it("tolerates non-Error values", () => {
    expect(isDockerUnavailableError("boom")).toBe(false);
    expect(isDockerUnavailableError(undefined)).toBe(false);
  });
});

describe("dockerUnavailableResponse", () => {
  it("returns the /api/containers-shaped 503", async () => {
    const res = dockerUnavailableResponse(new Error("daemon down"));
    expect(res.status).toBe(503);
    const body = await res.json();
    expect(body).toEqual({
      error: "Docker daemon not available",
      details: "daemon down",
      hint: "Make sure Docker is running and the socket is accessible.",
    });
  });
});
