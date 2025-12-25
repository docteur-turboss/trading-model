jest.mock("utils/validate", () => ({
  isObject: (v: any) => v !== null && typeof v === "object",
  isNonEmptyString: (v: any) =>
    typeof v === "string" && v.trim().length > 0,
  isValidIP: (v: any) => typeof v === "string" && v.length > 0,
  isValidPort: (v: any) => typeof v === "number" && v > 0,
}));