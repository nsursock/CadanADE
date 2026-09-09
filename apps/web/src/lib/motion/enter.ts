import gsap from "gsap";

export function enterShell(root: HTMLElement) {
  if (document.documentElement.classList.contains("perf-lite")) return;
  gsap.from(root.querySelectorAll("[data-enter]"), {
    opacity: 0,
    y: 10,
    duration: 0.45,
    stagger: 0.06,
    ease: "power2.out",
  });
}
