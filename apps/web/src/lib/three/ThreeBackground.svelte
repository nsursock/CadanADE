<script lang="ts">
  import { onDestroy, onMount } from "svelte";
  import * as THREE from "three";

  let canvas: HTMLCanvasElement;
  let raf = 0;
  let renderer: THREE.WebGLRenderer | null = null;

  onMount(() => {
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(60, 1, 0.1, 100);
    camera.position.z = 4;

    renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: false });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));

    const count = 400;
    const positions = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      positions[i * 3] = (Math.random() - 0.5) * 10;
      positions[i * 3 + 1] = (Math.random() - 0.5) * 6;
      positions[i * 3 + 2] = (Math.random() - 0.5) * 8;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    const mat = new THREE.PointsMaterial({
      size: 0.02,
      color: new THREE.Color("var(--scifi-primary)" as string) || 0xff2e9a,
      transparent: true,
      opacity: 0.55,
    });
    // CSS vars don't resolve in Three — sample computed primary
    const style = getComputedStyle(document.documentElement);
    const primary = style.getPropertyValue("--scifi-primary").trim() || "#ff2e9a";
    mat.color = new THREE.Color(primary);

    const points = new THREE.Points(geo, mat);
    scene.add(points);

    const resize = () => {
      const w = window.innerWidth;
      const h = window.innerHeight;
      renderer!.setSize(w, h, false);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
    };
    resize();
    window.addEventListener("resize", resize);

    const tick = () => {
      points.rotation.y += 0.0008;
      points.rotation.x += 0.0003;
      renderer!.render(scene, camera);
      raf = requestAnimationFrame(tick);
    };
    tick();

    return () => {
      window.removeEventListener("resize", resize);
      cancelAnimationFrame(raf);
      geo.dispose();
      mat.dispose();
      renderer?.dispose();
    };
  });

  onDestroy(() => {
    cancelAnimationFrame(raf);
    renderer?.dispose();
  });
</script>

<canvas
  bind:this={canvas}
  class="pointer-events-none fixed inset-0 -z-10 opacity-70"
  aria-hidden="true"
></canvas>
