import { beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
const { navigate } = vi.hoisted(() => ({ navigate: vi.fn() }));
vi.mock("@tanstack/react-router", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@tanstack/react-router")>()),
  useNavigate: () => navigate,
}));
import { SignIn } from "@/routes/index";
import { Connect } from "@/routes/connect";
import { loadDemo } from "@/lib/demo-store";
beforeEach(() => {
  cleanup();
  localStorage.clear();
  navigate.mockClear();
});
describe("Presentation preview screens", () => {
  it("opens a populated preview without credentials and preserves variety editing", async () => {
    const login = render(<SignIn />);
    fireEvent.click(screen.getByRole("button", { name: "تجربة تمرة" }));
    expect(navigate).toHaveBeenLastCalledWith({ to: "/home" });
    expect(loadDemo().analyses).toHaveLength(4);
    // Five current readings plus the temperature an hour earlier (for the advice engine).
    expect(loadDemo().sensors).toHaveLength(6);
    login.unmount();
    const setup = render(<Connect />);
    expect(await screen.findByText("أضيفي نخلتك")).toBeTruthy();
    expect(screen.queryByText("مرحلة النمو")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "عجوة" }));
    fireEvent.click(screen.getByRole("button", { name: "ابدأ المتابعة" }));
    expect(loadDemo().palm?.variety).toBe("عجوة");
    expect(loadDemo().device?.palmId).toBe(loadDemo().palm?.id);
    setup.unmount();
    render(<SignIn />);
    fireEvent.click(screen.getByRole("button", { name: "تجربة تمرة" }));
    expect(navigate).toHaveBeenLastCalledWith({ to: "/home" });
  });
});
