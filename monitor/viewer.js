// Full-screen output viewer: zoomable images, playable video/audio, orbitable 3D.
// three.js and the splat renderer load from the CDN only when a 3D file is opened.
const $ = id => document.getElementById(id);
export const fileUrl = file =>
    "files/" + [...(file.subfolder || "").split(/[\\/]+/).filter(Boolean), file.filename].map(encodeURIComponent).join("/");

let files = [], index = 0, cleanup = null, token = 0;

export function openViewer(list, at) {
    files = list;
    index = at;
    $("viewer").hidden = false;
    document.body.style.overflow = "hidden";
    show();
}
function close() {
    teardown();
    $("viewer").hidden = true;
    document.body.style.overflow = "";
}
function teardown() {
    token++;
    try { cleanup?.(); } catch (error) { console.warn(error); }
    cleanup = null;
    $("vStage").replaceChildren();
    $("vHint").textContent = "";
}
function step(delta) {
    if (files.length < 2) return;
    index = (index + delta + files.length) % files.length;
    show();
}

function show() {
    teardown();
    const file = files[index], url = fileUrl(file);
    $("vTitle").textContent = file.filename;
    $("vCount").textContent = files.length > 1 ? `${index + 1} / ${files.length}` : "";
    $("vOpen").href = url;
    $("vOpen").setAttribute("download", file.filename);
    $("vPrev").hidden = $("vNext").hidden = files.length < 2;
    const kind = file.kind || "image";
    if (kind === "image") showImage(url);
    else if (kind === "video" || kind === "audio") {
        const media = document.createElement(kind);
        Object.assign(media, { src: url, controls: true, autoplay: true, loop: kind === "video", playsInline: true });
        media.className = "vMedia";
        $("vStage").append(media);
        cleanup = () => { media.pause(); media.removeAttribute("src"); media.load(); };
    } else if (kind === "mesh") show3D(file, url, showMesh);
    else if (kind === "splat") show3D(file, url, showSplat);
    else $("vStage").innerHTML = `<p class="vMsg">No preview for this file type. Use ⬇ to download it.</p>`;
}

// ---------- images: pinch / wheel zoom, drag to pan, double-tap to toggle ----------
function showImage(url) {
    const img = new Image();
    img.src = url;
    img.className = "vImage";
    img.draggable = false;
    $("vStage").append(img);
    $("vHint").textContent = "Pinch or double-tap to zoom · drag to pan";
    let scale = 1, x = 0, y = 0, lastTap = 0;
    const pointers = new Map();
    let pinch = null;
    const apply = () => {
        scale = Math.min(12, Math.max(1, scale));
        if (scale === 1) x = y = 0;
        img.style.transform = `translate(${x}px, ${y}px) scale(${scale})`;
    };
    const zoomAt = (factor, cx, cy) => {
        const rect = $("vStage").getBoundingClientRect();
        const ox = cx - rect.left - rect.width / 2, oy = cy - rect.top - rect.height / 2;
        const next = Math.min(12, Math.max(1, scale * factor));
        x = ox - (ox - x) * (next / scale);
        y = oy - (oy - y) * (next / scale);
        scale = next;
        apply();
    };
    const stage = $("vStage");
    const down = event => {
        stage.setPointerCapture(event.pointerId);
        pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
        if (pointers.size === 2) {
            const [a, b] = [...pointers.values()];
            pinch = { distance: Math.hypot(a.x - b.x, a.y - b.y), scale };
        } else if (event.pointerType !== "mouse" || event.button === 0) {
            const now = Date.now();
            if (now - lastTap < 300) zoomAt(scale > 1 ? 1 / scale : 3, event.clientX, event.clientY);
            lastTap = now;
        }
    };
    const move = event => {
        const previous = pointers.get(event.pointerId);
        if (!previous) return;
        const current = { x: event.clientX, y: event.clientY };
        pointers.set(event.pointerId, current);
        if (pointers.size === 2 && pinch) {
            const [a, b] = [...pointers.values()];
            const factor = (pinch.scale * Math.hypot(a.x - b.x, a.y - b.y) / pinch.distance) / scale;
            zoomAt(factor, (a.x + b.x) / 2, (a.y + b.y) / 2);
        } else if (pointers.size === 1 && scale > 1) {
            x += current.x - previous.x;
            y += current.y - previous.y;
            apply();
        }
    };
    const up = event => { pointers.delete(event.pointerId); if (pointers.size < 2) pinch = null; };
    const wheel = event => { event.preventDefault(); zoomAt(Math.exp(-event.deltaY * 0.0015), event.clientX, event.clientY); };
    stage.addEventListener("pointerdown", down);
    stage.addEventListener("pointermove", move);
    stage.addEventListener("pointerup", up);
    stage.addEventListener("pointercancel", up);
    stage.addEventListener("wheel", wheel, { passive: false });
    cleanup = () => {
        stage.removeEventListener("pointerdown", down);
        stage.removeEventListener("pointermove", move);
        stage.removeEventListener("pointerup", up);
        stage.removeEventListener("pointercancel", up);
        stage.removeEventListener("wheel", wheel);
    };
}

// ---------- 3D ----------
async function show3D(file, url, render) {
    const mine = token;
    const box = document.createElement("div");
    box.className = "v3d";
    $("vStage").append(box);
    $("vHint").textContent = "Loading 3D…";
    try {
        const dispose = await render(box, file, url, () => mine !== token);
        if (mine !== token) { dispose?.(); return; }
        cleanup = dispose;
        $("vHint").textContent = "Drag to orbit · pinch or scroll to zoom · two fingers to pan";
    } catch (error) {
        if (mine !== token) return;
        console.error(error);
        $("vHint").textContent = "";
        box.innerHTML = `<p class="vMsg">Couldn't open this 3D file (${String(error.message || error).slice(0, 160)}).</p>`;
    }
}

async function showMesh(box, file, url, cancelled) {
    const THREE = await import("three");
    const { OrbitControls } = await import("three/addons/controls/OrbitControls.js");
    const ext = file.filename.split(".").pop().toLowerCase();
    const loaders = {
        glb: () => import("three/addons/loaders/GLTFLoader.js").then(m => new m.GLTFLoader()),
        gltf: () => import("three/addons/loaders/GLTFLoader.js").then(m => new m.GLTFLoader()),
        obj: () => import("three/addons/loaders/OBJLoader.js").then(m => new m.OBJLoader()),
        fbx: () => import("three/addons/loaders/FBXLoader.js").then(m => new m.FBXLoader()),
        stl: () => import("three/addons/loaders/STLLoader.js").then(m => new m.STLLoader()),
        ply: () => import("three/addons/loaders/PLYLoader.js").then(m => new m.PLYLoader()),
    };
    const loader = await loaders[ext]();
    const loaded = await loader.loadAsync(url, event => {
        if (event.total) $("vHint").textContent = `Loading 3D… ${Math.round(event.loaded / event.total * 100)}%`;
    });
    if (cancelled()) return null;

    let object = loaded.scene || loaded;
    if (object.isBufferGeometry) {
        const geometry = object;
        if (!geometry.attributes.normal && geometry.index) geometry.computeVertexNormals();
        const colors = !!geometry.attributes.color;
        object = geometry.index || ext === "stl"
            ? new THREE.Mesh(geometry, new THREE.MeshStandardMaterial({ color: colors ? 0xffffff : 0xb9bec7, vertexColors: colors, roughness: 0.7, side: THREE.DoubleSide }))
            : new THREE.Points(geometry, new THREE.PointsMaterial({ size: 0.004, sizeAttenuation: true, vertexColors: colors, color: colors ? 0xffffff : 0xb9bec7 }));
    }

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    box.append(renderer.domElement);
    const scene = new THREE.Scene();
    // OBJ/STL usually arrive with per-face normals, which render faceted. Creased
    // normals smooth curved surfaces but keep edges sharper than 40° hard.
    if (ext === "obj" || ext === "stl") {
        const { toCreasedNormals } = await import("three/addons/utils/BufferGeometryUtils.js");
        object.traverse(node => {
            if (!node.isMesh || !node.geometry || node.geometry.index) return;
            node.geometry = toCreasedNormals(node.geometry, THREE.MathUtils.degToRad(40));
            for (const material of [node.material].flat()) {   // OBJLoader turns on flat shading
                if (material?.flatShading) { material.flatShading = false; material.needsUpdate = true; }
            }
        });
    }
    scene.add(new THREE.HemisphereLight(0xffffff, 0x2a2d33, 1.1));
    const sun = new THREE.DirectionalLight(0xffffff, 1.4);
    const fill = new THREE.DirectionalLight(0xc8d4ff, 0.45);
    scene.add(sun, fill, object);

    // Frame the model whatever its units or offset.
    const bounds = new THREE.Box3().setFromObject(object);
    const size = bounds.getSize(new THREE.Vector3()).length() || 1;
    const center = bounds.getCenter(new THREE.Vector3());
    if (object.isPoints) object.material.size = size / 400;
    const camera = new THREE.PerspectiveCamera(40, 1, size / 1000, size * 100);
    camera.position.copy(center).add(new THREE.Vector3(0.6, 0.45, 1).normalize().multiplyScalar(size * 1.5));
    sun.position.copy(center).add(new THREE.Vector3(1, 1.6, 1.2).multiplyScalar(size));
    fill.position.copy(center).add(new THREE.Vector3(-1.2, -0.4, -0.8).multiplyScalar(size));
    sun.target.position.copy(center);
    fill.target.position.copy(center);
    scene.add(sun.target, fill.target);
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.target.copy(center);
    controls.enableDamping = true;
    controls.update();

    const resize = () => {
        const { clientWidth: w, clientHeight: h } = box;
        renderer.setSize(w, h, false);
        camera.aspect = w / Math.max(h, 1);
        camera.updateProjectionMatrix();
    };
    const observer = new ResizeObserver(resize);
    observer.observe(box);
    resize();
    renderer.setAnimationLoop(() => { controls.update(); renderer.render(scene, camera); });
    return () => {
        renderer.setAnimationLoop(null);
        observer.disconnect();
        controls.dispose();
        scene.traverse(node => {
            node.geometry?.dispose();
            for (const material of [node.material].flat().filter(Boolean)) {
                for (const value of Object.values(material)) if (value?.isTexture) value.dispose();
                material.dispose();
            }
        });
        renderer.dispose();
        renderer.forceContextLoss();
    };
}

async function showSplat(box, file, url, cancelled) {
    const GS = await import("@mkkellogg/gaussian-splats-3d");
    const ext = file.filename.split(".").pop().toLowerCase();
    const format = { ply: GS.SceneFormat.Ply, splat: GS.SceneFormat.Splat, ksplat: GS.SceneFormat.KSplat, spz: GS.SceneFormat.Spz }[ext];
    // Most 3DGS exports (INRIA, SHARP) use the OpenCV camera: y down, looking along +z
    // from the origin. Starting there shows the scene the way it was captured.
    const viewer = new GS.Viewer({
        rootElement: box,
        cameraUp: [0, -1, 0],
        initialCameraPosition: [0, 0, 0],
        initialCameraLookAt: [0, 0, 2],
        sharedMemoryForWorkers: false,   // no cross-origin isolation on a LAN page
        gpuAcceleratedSort: false,
        sphericalHarmonicsDegree: 0,     // keeps phone memory in check
        ignoreDevicePixelRatio: devicePixelRatio > 2,
        logLevel: GS.LogLevel?.None ?? 0,
    });
    const hint = setInterval(() => { if (!cancelled()) $("vHint").textContent = "Loading splat…"; }, 500);
    try {
        await viewer.addSplatScene(url, { format, showLoadingUI: true, progressiveLoad: false, splatAlphaRemovalThreshold: 5 });
    } catch (error) {
        clearInterval(hint);
        viewer.dispose().catch(() => {});
        throw error;
    }
    clearInterval(hint);
    if (cancelled()) { viewer.dispose().catch(() => {}); return null; }
    // Orbit around the splat's real middle (median of sampled centres), not a guess,
    // so dragging turns the subject instead of swinging round to its empty back.
    try {
        const THREE = await import("three");
        const mesh = viewer.getSplatMesh(), count = mesh.getSplatCount();
        const xs = [], ys = [], zs = [], point = new THREE.Vector3();
        for (let i = 0; i < count; i += Math.max(1, Math.floor(count / 4000))) {
            mesh.getSplatCenter(i, point);
            xs.push(point.x); ys.push(point.y); zs.push(point.z);
        }
        const median = values => values.sort((a, b) => a - b)[values.length >> 1] ?? 0;
        const controls = viewer.controls ?? viewer.perspectiveControls;
        if (controls && xs.length) {
            controls.target.set(median(xs), median(ys), median(zs));
            controls.rotateSpeed = 0.5;
            controls.update();
        }
    } catch (error) { console.debug("splat framing skipped", error); }
    viewer.start();
    return () => { viewer.dispose().catch(() => {}); };
}

// ---------- wiring ----------
$("vClose").addEventListener("click", close);
$("vPrev").addEventListener("click", () => step(-1));
$("vNext").addEventListener("click", () => step(1));
document.addEventListener("keydown", event => {
    if ($("viewer").hidden) return;
    if (event.key === "Escape") close();
    else if (event.key === "ArrowLeft") step(-1);
    else if (event.key === "ArrowRight") step(1);
});
