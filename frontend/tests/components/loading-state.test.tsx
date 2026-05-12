import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { LoadingState } from "@/components/ui/loading-state";

describe("LoadingState", () => {
  it("renders nothing when not active", () => {
    const { container } = render(
      <LoadingState active={false} label="Loading…" />,
    );
    expect(container.firstChild).toBeNull();
  });

  it("shows spinner label when active", () => {
    render(<LoadingState active label="Joining game…" />);
    expect(screen.getByText("Joining game…")).toBeInTheDocument();
  });
});
