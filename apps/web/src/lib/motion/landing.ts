import gsap from "gsap";

export function playLandingIntro(root: HTMLElement) {
  if (document.documentElement.classList.contains("perf-lite")) return null;

  gsap.from(root.querySelectorAll(".hero-kicker"), {
    y: -16,
    opacity: 0,
    duration: 0.55,
    ease: "power3.out",
  });
  gsap.from(root.querySelectorAll(".hero-title-glitch"), {
    y: 28,
    opacity: 0,
    duration: 0.85,
    ease: "power3.out",
    delay: 0.08,
  });
  gsap.from(root.querySelectorAll(".hero-tagline"), {
    opacity: 0,
    duration: 0.55,
    delay: 0.45,
  });
  gsap.from(root.querySelectorAll(".feature-pill"), {
    y: 12,
    opacity: 0,
    duration: 0.45,
    stagger: 0.05,
    ease: "power2.out",
    delay: 0.65,
  });
  gsap.from(root.querySelectorAll(".console-panel"), {
    y: 28,
    opacity: 0,
    scale: 0.98,
    duration: 0.65,
    ease: "power3.out",
    delay: 0.85,
  });
  gsap.from(root.querySelectorAll(".stat-tile"), {
    y: 10,
    opacity: 0,
    duration: 0.45,
    stagger: 0.08,
    ease: "power2.out",
    delay: 1.1,
  });

  return gsap;
}

export function typewriter(
  text: string,
  onTick: (slice: string) => void,
  onDone: () => void,
  charMs = 35,
) {
  if (document.documentElement.classList.contains("perf-lite")) {
    onTick(text);
    onDone();
    return;
  }
  const tl = gsap.timeline({ delay: 0.55 });
  for (let i = 1; i <= text.length; i++) {
    tl.to({}, { duration: charMs / 1000, onComplete: () => onTick(text.slice(0, i)) });
  }
  tl.call(onDone);
}

export function countUp(
  targets: { models: number; themes: number; tools: number },
  onTick: (v: { models: number; themes: number; tools: number }) => void,
) {
  if (document.documentElement.classList.contains("perf-lite")) {
    onTick(targets);
    return;
  }
  gsap.to(
    {},
    {
      duration: 1.15,
      delay: 1.15,
      ease: "power2.out",
      onUpdate: function () {
        const p = this.progress();
        onTick({
          models: Math.round(targets.models * p),
          themes: Math.round(targets.themes * p),
          tools: Math.round(targets.tools * p),
        });
      },
    },
  );
}

export async function pulseConsole(el: HTMLElement | null) {
  if (!el || document.documentElement.classList.contains("perf-lite")) return;
  await gsap.to(el, {
    scale: 1.02,
    boxShadow: "0 0 60px var(--scifi-primary-glow)",
    duration: 0.16,
    ease: "power2.out",
  });
  gsap.to(el, { scale: 1, duration: 0.18, ease: "power2.out" });
}
