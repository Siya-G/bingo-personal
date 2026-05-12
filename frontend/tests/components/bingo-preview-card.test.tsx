import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { BingoPreviewCard } from "@/components/game/bingo-preview-card";

describe("BingoPreviewCard", () => {
  it("renders a 3x3 grid of cells", () => {
    render(<BingoPreviewCard />);
    expect(screen.getByText("AI")).toBeInTheDocument();
    expect(screen.getByText("WIN")).toBeInTheDocument();
    const cells = screen.getAllByText(/^(AI|LIVE|B-7|FREE|WOW|N-4|HYPE|G-9|WIN)$/);
    expect(cells).toHaveLength(9);
  });
});
