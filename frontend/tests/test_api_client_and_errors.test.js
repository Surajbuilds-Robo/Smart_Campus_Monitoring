import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { getApiErrorMessage, setUnauthorizedHandler } from "../src/services/apiClient.js";

describe("Frontend API Client & Error Foundation", () => {
  it("extracts direct response message", () => {
    const error = {
      response: {
        data: {
          message: "Invalid campus credentials supplied",
        },
      },
    };
    assert.equal(getApiErrorMessage(error), "Invalid campus credentials supplied");
  });

  it("extracts validation errors array message", () => {
    const error = {
      response: {
        data: {
          errors: [{ message: "Email is required" }, { message: "Password is too short" }],
        },
      },
    };
    assert.equal(getApiErrorMessage(error), "Email is required");
  });

  it("extracts generic Error.message when response data is absent", () => {
    const error = new Error("Network timeout contacting gateway");
    assert.equal(getApiErrorMessage(error), "Network timeout contacting gateway");
  });

  it("returns fallback message when error structure is empty or null", () => {
    assert.equal(
      getApiErrorMessage(null, "Custom fallback"),
      "Custom fallback"
    );
    assert.equal(
      getApiErrorMessage({}, "Default fallback"),
      "Default fallback"
    );
  });

  it("accepts string error arguments directly", () => {
    assert.equal(getApiErrorMessage("Direct error string"), "Direct error string");
  });

  it("registers and clears unauthorized handler safely", () => {
    let triggered = false;
    const handler = () => {
      triggered = true;
    };

    setUnauthorizedHandler(handler);
    setUnauthorizedHandler(null);
    assert.equal(triggered, false);
  });
});
