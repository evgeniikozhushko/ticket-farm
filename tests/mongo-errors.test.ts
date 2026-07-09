import { describe, expect, it } from "vitest";
import {
  duplicateErrorIncludesField,
  isDuplicateKeyError,
} from "@/lib/mongo-errors";

describe("mongo error helpers", () => {
  it("detects duplicate key errors by Mongo error code", () => {
    expect(isDuplicateKeyError({ code: 11000 })).toBe(true);
    expect(isDuplicateKeyError({ code: 121 })).toBe(false);
    expect(isDuplicateKeyError(new Error("duplicate key"))).toBe(false);
  });

  it("detects fields from top-level duplicate key metadata", () => {
    expect(
      duplicateErrorIncludesField({ keyPattern: { ticketId: 1 } }, "ticketId")
    ).toBe(true);
    expect(
      duplicateErrorIncludesField({ keyValue: { slug: "farm" } }, "slug")
    ).toBe(true);
    expect(
      duplicateErrorIncludesField({ index: "orgId_date_ticketNumber_unique_idx" }, "ticketNumber")
    ).toBe(true);
    expect(
      duplicateErrorIncludesField({ message: "duplicate key ticketId" }, "ticketId")
    ).toBe(true);
  });

  it("detects fields from nested bulk write duplicate errors", () => {
    const err = {
      code: 11000,
      writeErrors: [
        {
          err: {
            keyPattern: { ticketId: 1 },
            errmsg: "duplicate key error",
          },
        },
      ],
    };

    expect(duplicateErrorIncludesField(err, "ticketId")).toBe(true);
    expect(duplicateErrorIncludesField(err, "email")).toBe(false);
  });
});
