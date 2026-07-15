export function isDuplicateKeyError(err: unknown): boolean {
  return (
    typeof err === "object" &&
    err !== null &&
    "code" in err &&
    (err as { code?: unknown }).code === 11000
  );
}

export function duplicateErrorIncludesField(
  err: unknown,
  field: string
): boolean {
  if (!err || typeof err !== "object") return false;

  const error = err as {
    keyPattern?: Record<string, unknown>;
    keyValue?: Record<string, unknown>;
    index?: string;
    message?: string;
    writeErrors?: Array<{
      err?: {
        keyPattern?: Record<string, unknown>;
        keyValue?: Record<string, unknown>;
        index?: string;
        errmsg?: string;
      };
      keyPattern?: Record<string, unknown>;
      keyValue?: Record<string, unknown>;
      index?: string;
      errmsg?: string;
    }>;
  };

  if (error.keyPattern && field in error.keyPattern) return true;
  if (error.keyValue && field in error.keyValue) return true;
  if (error.index?.includes(field)) return true;
  if (error.message?.includes(field)) return true;

  return Boolean(
    error.writeErrors?.some((writeError) => {
      const nested = writeError.err ?? writeError;
      return (
        Boolean(nested.keyPattern && field in nested.keyPattern) ||
        Boolean(nested.keyValue && field in nested.keyValue) ||
        Boolean(nested.index?.includes(field)) ||
        Boolean(nested.errmsg?.includes(field))
      );
    })
  );
}
