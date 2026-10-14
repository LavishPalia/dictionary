'use client';

import React, { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { BookPage } from '@/lib/types';
import { pageTextureManager } from '@/lib/page-texture';
import { soundEngine } from '@/lib/audio';

interface BookCanvas3DProps {
  leftPage: BookPage | null;
  rightPage: BookPage | null;
  targetLeftPage: BookPage | null;
  targetRightPage: BookPage | null;
  highlightedWord?: string;
  isFlipping: boolean;
  flipDirection: 'forward' | 'backward';
  isRiffle: boolean;
  jumpDistance: number;
  flipDuration?: number; // duration in ms (default: 1000ms)
  onFlipComplete: () => void;
  onInteractiveDragStart?: () => void;
  onInteractiveDragEnd?: (completed: boolean) => void;
}

const PAGE_WIDTH = 6.95;
const PAGE_HEIGHT = 8.0;

export const BookCanvas3D: React.FC<BookCanvas3DProps> = ({
  leftPage,
  rightPage,
  targetLeftPage,
  targetRightPage,
  highlightedWord,
  isFlipping,
  flipDirection,
  isRiffle,
  jumpDistance,
  flipDuration = 1000,
  onFlipComplete,
  onInteractiveDragStart,
  onInteractiveDragEnd,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);

  // Mesh references
  const leftBaseMeshRef = useRef<THREE.Mesh | null>(null);
  const rightBaseMeshRef = useRef<THREE.Mesh | null>(null);
  const singleTurningMeshRef = useRef<THREE.Mesh | null>(null);
  const cascadeGroupRef = useRef<THREE.Group | null>(null);

  const animFrameRef = useRef<number | null>(null);
  const isDraggingRef = useRef(false);
  const dragProgressRef = useRef(0);

  // Setup Three.js Scene
  useEffect(() => {
    if (!containerRef.current) return;
    const container = containerRef.current;
    const width = container.clientWidth || 1120;
    const height = container.clientHeight || 640;

    const scene = new THREE.Scene();
    sceneRef.current = scene;

    const camera = new THREE.PerspectiveCamera(38, width / height, 0.1, 100);
    camera.position.set(0, 0, 14.5);
    camera.lookAt(0, 0, 0);
    cameraRef.current = camera;

    const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true, powerPreference: 'high-performance' });
    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    rendererRef.current = renderer;

    container.appendChild(renderer.domElement);

    // Warm ambient and directional lighting
    const ambientLight = new THREE.AmbientLight(0xffecd0, 1.3);
    scene.add(ambientLight);

    const dirLight = new THREE.DirectionalLight(0xfff6e6, 1.4);
    dirLight.position.set(-6, 8, 12);
    dirLight.castShadow = true;
    dirLight.shadow.mapSize.width = 1024;
    dirLight.shadow.mapSize.height = 1024;
    scene.add(dirLight);

    const softFill = new THREE.DirectionalLight(0xa8845a, 0.5);
    softFill.position.set(6, -6, 8);
    scene.add(softFill);

    // Maroon cover backing
    const coverGeo = new THREE.BoxGeometry(14.3, 8.25, 0.18);
    const coverMat = new THREE.MeshStandardMaterial({
      color: 0x5b1f19,
      roughness: 0.85,
      metalness: 0.1,
    });
    const coverMesh = new THREE.Mesh(coverGeo, coverMat);
    coverMesh.position.set(0, 0, -0.12);
    coverMesh.receiveShadow = true;
    scene.add(coverMesh);

    // Left Base Page (Static resting bed)
    const baseGeoLeft = new THREE.PlaneGeometry(PAGE_WIDTH, PAGE_HEIGHT);
    const baseMatLeft = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.9 });
    const leftBase = new THREE.Mesh(baseGeoLeft, baseMatLeft);
    leftBase.position.set(-PAGE_WIDTH / 2 - 0.02, 0, 0);
    leftBase.receiveShadow = true;
    scene.add(leftBase);
    leftBaseMeshRef.current = leftBase;

    // Right Base Page (Static resting bed)
    const baseGeoRight = new THREE.PlaneGeometry(PAGE_WIDTH, PAGE_HEIGHT);
    const baseMatRight = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.9 });
    const rightBase = new THREE.Mesh(baseGeoRight, baseMatRight);
    rightBase.position.set(PAGE_WIDTH / 2 + 0.02, 0, 0);
    rightBase.receiveShadow = true;
    scene.add(rightBase);
    rightBaseMeshRef.current = rightBase;

    // Single Turning Leaf Rig (Subdivided 64 x 48 for authentic thumb peel)
    const turnGeo = new THREE.PlaneGeometry(PAGE_WIDTH, PAGE_HEIGHT, 64, 48);
    // Anchor geometry at left edge (spine at x = 0)
    turnGeo.translate(PAGE_WIDTH / 2, 0, 0);

    const turnMatFront = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.9, side: THREE.FrontSide });
    const turnMatBack = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.9, side: THREE.BackSide });

    const singleTurningMesh = new THREE.Mesh(turnGeo, [turnMatFront, turnMatBack]);
    singleTurningMesh.position.set(0, 0, 0.03);
    singleTurningMesh.castShadow = true;
    singleTurningMesh.receiveShadow = true;
    singleTurningMesh.visible = false;
    scene.add(singleTurningMesh);
    singleTurningMeshRef.current = singleTurningMesh;

    // Cascade Riffle Group (Container for multi-leaf wave)
    const cascadeGroup = new THREE.Group();
    cascadeGroup.visible = false;
    scene.add(cascadeGroup);
    cascadeGroupRef.current = cascadeGroup;

    // Render loop
    const render = () => {
      renderer.render(scene, camera);
      animFrameRef.current = requestAnimationFrame(render);
    };
    render();

    const handleResize = () => {
      if (!container || !renderer || !camera) return;
      const w = container.clientWidth || 1120;
      const h = container.clientHeight || 640;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
    };
    window.addEventListener('resize', handleResize);

    return () => {
      window.removeEventListener('resize', handleResize);
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
      if (container.contains(renderer.domElement)) {
        container.removeChild(renderer.domElement);
      }
      renderer.dispose();
      pageTextureManager.disposeAll();
    };
  }, []);

  // Update base resting textures
  useEffect(() => {
    let isCancelled = false;

    const updateBaseTextures = async () => {
      await pageTextureManager.ensureFontsLoaded();
      if (isCancelled) return;

      const leftTex = pageTextureManager.getOrCreateTexture(leftPage, true, highlightedWord);
      const rightTex = pageTextureManager.getOrCreateTexture(rightPage, false, highlightedWord);

      if (leftBaseMeshRef.current) {
        (leftBaseMeshRef.current.material as THREE.MeshStandardMaterial).map = leftTex;
        (leftBaseMeshRef.current.material as THREE.MeshStandardMaterial).needsUpdate = true;
      }

      if (rightBaseMeshRef.current) {
        (rightBaseMeshRef.current.material as THREE.MeshStandardMaterial).map = rightTex;
        (rightBaseMeshRef.current.material as THREE.MeshStandardMaterial).needsUpdate = true;
      }
    };

    updateBaseTextures();
    return () => { isCancelled = true; };
  }, [leftPage, rightPage, highlightedWord]);

  // Execute Page Turn / Cascading Riffle Animation
  useEffect(() => {
    if (!isFlipping) return;

    const turnMesh = singleTurningMeshRef.current;
    const cascadeGroup = cascadeGroupRef.current;
    const leftBase = leftBaseMeshRef.current;
    const rightBase = rightBaseMeshRef.current;
    if (!turnMesh || !cascadeGroup || !leftBase || !rightBase) return;

    if (isRiffle) {
      // ========================================================
      // TRUE MULTI-PAGE CASCADING RIFFLE WAVE
      // 5 sequential pages peeling and flying across the spine
      // ========================================================
      soundEngine.playRiffle(jumpDistance);

      // Clear any prior cascade meshes
      while (cascadeGroup.children.length > 0) {
        const child = cascadeGroup.children[0] as THREE.Mesh;
        cascadeGroup.remove(child);
        child.geometry.dispose();
      }

      cascadeGroup.visible = true;
      const numLeaves = 5;
      const leaves: {
        mesh: THREE.Mesh;
        basePositions: THREE.BufferAttribute;
        delay: number;
        soundPlayed: boolean;
      }[] = [];

      const leafDuration = Math.max(500, flipDuration * 0.7);
      const staggerDelay = 130; // ms between consecutive page lift-offs
      const totalAnimationTime = (numLeaves - 1) * staggerDelay + leafDuration;

      // Update underlying base beds:
      // If moving forward, right bed immediately reveals target right page
      if (flipDirection === 'forward') {
        const targetRightTex = pageTextureManager.getOrCreateTexture(targetRightPage, false, highlightedWord);
        (rightBase.material as THREE.MeshStandardMaterial).map = targetRightTex;
        (rightBase.material as THREE.MeshStandardMaterial).needsUpdate = true;
      } else {
        const targetLeftTex = pageTextureManager.getOrCreateTexture(targetLeftPage, true, highlightedWord);
        (leftBase.material as THREE.MeshStandardMaterial).map = targetLeftTex;
        (leftBase.material as THREE.MeshStandardMaterial).needsUpdate = true;
      }

      for (let k = 0; k < numLeaves; k++) {
        const geo = new THREE.PlaneGeometry(PAGE_WIDTH, PAGE_HEIGHT, 48, 32);
        geo.translate(PAGE_WIDTH / 2, 0, 0);

        // First leaf has current page texture; last leaf has target page texture; middle leaves have vintage book texture
        const isFirst = k === 0;
        const isLast = k === numLeaves - 1;

        let frontTex: THREE.CanvasTexture;
        let backTex: THREE.CanvasTexture;

        if (flipDirection === 'forward') {
          frontTex = isFirst
            ? pageTextureManager.getOrCreateTexture(rightPage, false, highlightedWord)
            : pageTextureManager.getIntermediateRiffleTexture(k * 10 + 1, false);
          backTex = isLast
            ? pageTextureManager.getOrCreateTexture(targetLeftPage, true, highlightedWord)
            : pageTextureManager.getIntermediateRiffleTexture(k * 10 + 2, true);
        } else {
          frontTex = isLast
            ? pageTextureManager.getOrCreateTexture(targetRightPage, false, highlightedWord)
            : pageTextureManager.getIntermediateRiffleTexture(k * 10 + 2, false);
          backTex = isFirst
            ? pageTextureManager.getOrCreateTexture(leftPage, true, highlightedWord)
            : pageTextureManager.getIntermediateRiffleTexture(k * 10 + 1, true);
        }

        const matFront = new THREE.MeshStandardMaterial({ map: frontTex, roughness: 0.9, side: THREE.FrontSide });
        const matBack = new THREE.MeshStandardMaterial({ map: backTex, roughness: 0.9, side: THREE.BackSide });

        const mesh = new THREE.Mesh(geo, [matFront, matBack]);
        mesh.position.set(0, 0, 0.02 + k * 0.005);
        mesh.castShadow = true;
        mesh.receiveShadow = true;

        if (flipDirection === 'forward') {
          mesh.rotation.y = 0; // Starts flat on right
        } else {
          mesh.rotation.y = -Math.PI; // Starts flat on left
        }

        cascadeGroup.add(mesh);
        leaves.push({
          mesh,
          basePositions: geo.attributes.position.clone() as THREE.BufferAttribute,
          delay: k * staggerDelay,
          soundPlayed: false,
        });
      }

      let startTime: number | null = null;

      const stepCascade = (time: number) => {
        if (!startTime) startTime = time;
        const elapsed = time - startTime;

        leaves.forEach((leaf, i) => {
          if (elapsed < leaf.delay) {
            // Not started yet
            return;
          }

          const leafProgress = Math.min(1, Math.max(0, (elapsed - leaf.delay) / leafDuration));

          // Natural non-linear s-curve easing
          const p = leafProgress < 0.5
            ? 4 * leafProgress * leafProgress * leafProgress
            : 1 - Math.pow(-2 * leafProgress + 2, 3) / 2;

          // Full 180° rotation around spine
          if (flipDirection === 'forward') {
            leaf.mesh.rotation.y = -p * Math.PI;
          } else {
            leaf.mesh.rotation.y = -Math.PI + p * Math.PI;
          }

          // Gentle flutter curl
          const geo = leaf.mesh.geometry as THREE.PlaneGeometry;
          const pos = geo.attributes.position;
          const base = leaf.basePositions;
          const curlAmount = Math.sin(p * Math.PI) * (1.2 + (i % 2) * 0.3);

          for (let idx = 0; idx < pos.count; idx++) {
            const bx = base.getX(idx);
            const by = base.getY(idx);
            const u = bx / PAGE_WIDTH;
            const v = (by + PAGE_HEIGHT / 2) / PAGE_HEIGHT;
            const thumbWeight = 1.0 + (1.0 - v) * 0.6;
            const z = Math.sin(u * Math.PI * 0.85) * curlAmount * thumbWeight;
            pos.setZ(idx, z);
          }
          pos.needsUpdate = true;
          geo.computeVertexNormals();

          // Sound trigger near vertical apex
          if (p >= 0.45 && !leaf.soundPlayed) {
            leaf.soundPlayed = true;
            soundEngine.playPageTurn();
          }
        });

        if (elapsed < totalAnimationTime) {
          requestAnimationFrame(stepCascade);
        } else {
          cascadeGroup.visible = false;
          // Commit target textures on beds
          const finalLeftTex = pageTextureManager.getOrCreateTexture(targetLeftPage, true, highlightedWord);
          const finalRightTex = pageTextureManager.getOrCreateTexture(targetRightPage, false, highlightedWord);
          (leftBase.material as THREE.MeshStandardMaterial).map = finalLeftTex;
          (rightBase.material as THREE.MeshStandardMaterial).map = finalRightTex;
          (leftBase.material as THREE.MeshStandardMaterial).needsUpdate = true;
          (rightBase.material as THREE.MeshStandardMaterial).needsUpdate = true;
          onFlipComplete();
        }
      };

      requestAnimationFrame(stepCascade);

    } else {
      // ========================================================
      // SINGLE REALISTIC PAGE TURN WITH BOTTOM-RIGHT THUMB PEEL
      // Genuine 180° sweep with reverse page revelation
      // ========================================================
      soundEngine.playPageTurn();
      turnMesh.visible = true;

      // Prepare textures for the moving sheet:
      // In forward flip:
      // Front of sheet is rightPage (lifting off).
      // Back of sheet is targetLeftPage (lands facing up on the left).
      // Underneath right bed immediately reveals targetRightPage!
      // In backward flip:
      // Back of sheet is leftPage (lifting off).
      // Front of sheet is targetRightPage (lands facing up on the right).
      // Underneath left bed immediately reveals targetLeftPage!

      let frontTex: THREE.CanvasTexture;
      let backTex: THREE.CanvasTexture;

      if (flipDirection === 'forward') {
        frontTex = pageTextureManager.getOrCreateTexture(rightPage, false, highlightedWord);
        backTex = pageTextureManager.getOrCreateTexture(targetLeftPage, true, highlightedWord);

        // Reveal what lies beneath on the right immediately
        const revealedRightTex = pageTextureManager.getOrCreateTexture(targetRightPage, false, highlightedWord);
        (rightBase.material as THREE.MeshStandardMaterial).map = revealedRightTex;
        (rightBase.material as THREE.MeshStandardMaterial).needsUpdate = true;
      } else {
        frontTex = pageTextureManager.getOrCreateTexture(targetRightPage, false, highlightedWord);
        backTex = pageTextureManager.getOrCreateTexture(leftPage, true, highlightedWord);

        // Reveal what lies beneath on the left immediately
        const revealedLeftTex = pageTextureManager.getOrCreateTexture(targetLeftPage, true, highlightedWord);
        (leftBase.material as THREE.MeshStandardMaterial).map = revealedLeftTex;
        (leftBase.material as THREE.MeshStandardMaterial).needsUpdate = true;
      }

      const mats = turnMesh.material as THREE.MeshStandardMaterial[];
      mats[0].map = frontTex;
      mats[1].map = backTex;
      mats[0].needsUpdate = true;
      mats[1].needsUpdate = true;

      const geo = turnMesh.geometry as THREE.PlaneGeometry;
      const pos = geo.attributes.position;
      const basePositions = pos.clone() as THREE.BufferAttribute;

      let start: number | null = null;
      const duration = flipDuration; // User configurable: 650ms to 1400ms

      const stepSingle = (time: number) => {
        if (!start) start = time;
        const progress = Math.min(1, (time - start) / duration);

        // Smooth natural easing (slow peel lift -> accelerated glide over spine -> soft landing)
        const p = progress < 0.5
          ? 4 * progress * progress * progress
          : 1 - Math.pow(-2 * progress + 2, 3) / 2;

        // TRUE 180° ROTATION FROM ONE SIDE TO THE OTHER
        if (flipDirection === 'forward') {
          turnMesh.rotation.y = -p * Math.PI; // 0 to -180 deg
        } else {
          turnMesh.rotation.y = -Math.PI + p * Math.PI; // -180 deg to 0
        }

        // ASYMMETRIC THUMB PEEL DEFORMATION (Bottom-Right corner lifts first)
        const curlScale = Math.sin(p * Math.PI) * 1.85;

        for (let i = 0; i < pos.count; i++) {
          const bx = basePositions.getX(i);
          const by = basePositions.getY(i);
          const u = bx / PAGE_WIDTH; // 0 (spine) to 1 (outer edge)
          const v = (by + PAGE_HEIGHT / 2) / PAGE_HEIGHT; // 0 (bottom) to 1 (top)

          // Thumb lifts at bottom-right corner (u=1, v=0)
          // Lower v (bottom) gets higher displacement during initial half
          const thumbWeight = 1.0 + (1.0 - v) * 0.85;
          const zOffset = Math.sin(u * Math.PI * 0.88) * curlScale * thumbWeight;

          pos.setZ(i, zOffset);
        }
        pos.needsUpdate = true;
        geo.computeVertexNormals();

        if (progress < 1) {
          requestAnimationFrame(stepSingle);
        } else {
          turnMesh.visible = false;
          // Flatten vertices back to 0
          for (let i = 0; i < pos.count; i++) pos.setZ(i, 0);
          pos.needsUpdate = true;

          // Commit target textures to left & right base beds
          const finalLeftTex = pageTextureManager.getOrCreateTexture(targetLeftPage, true, highlightedWord);
          const finalRightTex = pageTextureManager.getOrCreateTexture(targetRightPage, false, highlightedWord);
          (leftBase.material as THREE.MeshStandardMaterial).map = finalLeftTex;
          (rightBase.material as THREE.MeshStandardMaterial).map = finalRightTex;
          (leftBase.material as THREE.MeshStandardMaterial).needsUpdate = true;
          (rightBase.material as THREE.MeshStandardMaterial).needsUpdate = true;

          onFlipComplete();
        }
      };

      requestAnimationFrame(stepSingle);
    }
  }, [isFlipping, isRiffle, flipDirection, jumpDistance, flipDuration, leftPage, rightPage, targetLeftPage, targetRightPage, highlightedWord, onFlipComplete]);

  // Corner Drag Interaction
  const handlePointerDown = (e: React.PointerEvent) => {
    if (isFlipping) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    if (x > rect.width * 0.82) {
      isDraggingRef.current = true;
      dragProgressRef.current = 0;
      onInteractiveDragStart?.();
    }
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (!isDraggingRef.current) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const totalW = rect.width / 2;
    const dragDist = rect.width - x;
    const p = Math.max(0, Math.min(1, dragDist / totalW));
    dragProgressRef.current = p;

    const turnMesh = singleTurningMeshRef.current;
    if (turnMesh) {
      turnMesh.visible = true;
      turnMesh.rotation.y = -p * Math.PI;
    }
  };

  const handlePointerUp = () => {
    if (!isDraggingRef.current) return;
    isDraggingRef.current = false;
    const p = dragProgressRef.current;
    const completed = p > 0.35;

    const turnMesh = singleTurningMeshRef.current;
    if (turnMesh) {
      turnMesh.visible = false;
    }
    onInteractiveDragEnd?.(completed);
  };

  return (
    <div
      ref={containerRef}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerUp}
      style={{
        position: 'absolute',
        inset: 0,
        width: '1120px',
        height: '640px',
        cursor: 'grab',
        zIndex: isFlipping ? 30 : 5,
        pointerEvents: isFlipping ? 'all' : 'none',
      }}
    />
  );
};
