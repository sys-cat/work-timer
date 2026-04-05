import { describe, it, expect } from "vitest";
import { formatMinutes, formatTimeShort } from "./api";

describe("formatMinutes", () => {
  it("0分は 0:00 を返す", () => {
    expect(formatMinutes(0)).toBe("0:00");
  });

  it("60分は 1:00 を返す", () => {
    expect(formatMinutes(60)).toBe("1:00");
  });

  it("90分は 1:30 を返す", () => {
    expect(formatMinutes(90)).toBe("1:30");
  });

  it("分が1桁の場合はゼロ埋めする", () => {
    expect(formatMinutes(65)).toBe("1:05");
  });

  it("大きな値（1500分）は 25:00 を返す", () => {
    expect(formatMinutes(1500)).toBe("25:00");
  });
});

describe("formatTimeShort", () => {
  it("HH:MM:SS から HH:MM を返す", () => {
    expect(formatTimeShort("09:00:00")).toBe("09:00");
  });

  it("午後の時刻も正しく返す", () => {
    expect(formatTimeShort("14:30:45")).toBe("14:30");
  });

  it("23:59:59 は 23:59 を返す", () => {
    expect(formatTimeShort("23:59:59")).toBe("23:59");
  });
});
