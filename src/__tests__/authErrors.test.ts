import { describeAuthError } from "../utils/authErrors";

describe("describeAuthError", () => {
  it("treats Apple's cancel code as a cancel even though the message never contains it", () => {
    const error = Object.assign(new Error("The user canceled the authorization attempt"), { code: "ERR_REQUEST_CANCELED" });
    expect(describeAuthError(error, "native")).toEqual({ kind: "cancelled", detail: "" });
  });

  it("keeps the native error code and message for the dialog", () => {
    const error = Object.assign(new Error("The authorization attempt failed for an unknown reason"), { code: "ERR_REQUEST_UNKNOWN" });
    expect(describeAuthError(error, "native")).toEqual({
      kind: "native",
      detail: "ERR_REQUEST_UNKNOWN: The authorization attempt failed for an unknown reason",
    });
  });

  it("reports a Supabase rejection as a cloud failure with its status", () => {
    const error = { name: "AuthApiError", message: "Unacceptable audience in id_token: [com.mystodev.booklio]", status: 400 };
    expect(describeAuthError(error, "cloud")).toEqual({
      kind: "cloud",
      detail: "Unacceptable audience in id_token: [com.mystodev.booklio] (400)",
    });
  });

  it("never returns an empty detail", () => {
    expect(describeAuthError(undefined, "native").detail).toBe("unknown error");
  });
});
