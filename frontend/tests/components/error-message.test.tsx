import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ErrorMessage } from "@/components/ui/error-message";

describe("ErrorMessage", () => {
  it("renders nothing when message is null", () => {
    const { container } = render(<ErrorMessage message={null} />);
    expect(container.firstChild).toBeNull();
  });

  it("shows title and message when provided", () => {
    render(
      <ErrorMessage message="Something broke" title="Error" />,
    );
    expect(screen.getByRole("alert")).toHaveTextContent("Error");
    expect(screen.getByRole("alert")).toHaveTextContent("Something broke");
  });
});
