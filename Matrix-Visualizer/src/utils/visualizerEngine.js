import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';

export class VisualizerEngine {
  constructor(mountElement, dim) {
    this.mount = mountElement;
    this.dim = dim;

    // Core Setup
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x0f172a);

    // Camera setup based on dim
    const aspect = this.mount.clientWidth / this.mount.clientHeight;
    this.camera = new THREE.PerspectiveCamera(50, aspect, 0.1, 1000);
    this.setCameraPosition(dim);

    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    this.renderer.setSize(this.mount.clientWidth, this.mount.clientHeight);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    
    // Clear out any existing canvases (React Strict Mode double mount fix)
    while (this.mount.firstChild) {
      this.mount.removeChild(this.mount.firstChild);
    }
    this.mount.appendChild(this.renderer.domElement);

    // Orbit Controls for panning/zooming
    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = false; // Fast and responsive, doesn't need continuous loop
    this.controls.addEventListener('change', () => this.render());

    // Objects storage
    this.gridLines = []; 
    this.baseVectors = [];
    this.animationId = null;

    // Track original geometry
    this.originalGridVertices = [];
    this.currentGridMesh = null;

    this.initGrid(10, dim);
    this.initVectors(dim);

    // Resize handler
    this.handleResize = () => {
      this.camera.aspect = this.mount.clientWidth / this.mount.clientHeight;
      this.camera.updateProjectionMatrix();
      this.renderer.setSize(this.mount.clientWidth, this.mount.clientHeight);
      this.render();
    };
    window.addEventListener('resize', this.handleResize);
    
    this.render();
  }

  setCameraPosition(dim) {
    if (dim === 2) {
      this.camera.position.set(0, 0, 15);
      this.camera.lookAt(0, 0, 0);
    } else {
      this.camera.position.set(10, 8, 15);
      this.camera.lookAt(0, 0, 0);
    }
    if (this.controls) {
      this.controls.target.set(0, 0, 0);
      this.controls.update();
    }
  }

  initGrid(size, dim) {
    if (this.currentGridMesh) {
      this.scene.remove(this.currentGridMesh);
    }

    const material = new THREE.LineBasicMaterial({ 
      color: 0x334155, 
      transparent: true, 
      opacity: 0.8 
    });

    const geometry = new THREE.BufferGeometry();
    const vertices = [];

    const step = 1;
    for (let i = -size; i <= size; i += step) {
      // Horizontal/Vertical lines
      vertices.push(i, -size, 0, i, size, 0); // vertical
      vertices.push(-size, i, 0, size, i, 0); // horizontal

      if (dim === 3) {
        vertices.push(i, 0, -size, i, 0, size); // XZ
        vertices.push(-size, 0, i, size, 0, i); // ZX
        
        // ZY Lines
        vertices.push(0, i, -size, 0, i, size);
        vertices.push(0, -size, i, 0, size, i);
      }
    }

    // Convert array to Float32Array
    const float32Array = new Float32Array(vertices);
    geometry.setAttribute('position', new THREE.BufferAttribute(float32Array, 3));
    
    // Store original for morphing
    this.originalGridVertices = float32Array.slice();

    this.currentGridMesh = new THREE.LineSegments(geometry, material);
    this.scene.add(this.currentGridMesh);
  }

  initVectors(dim) {
    this.baseVectors.forEach(v => this.scene.remove(v.arrow));
    this.baseVectors = [];

    const origin = new THREE.Vector3(0, 0, 0);
    
    // i-hat (Red)
    const iHat = new THREE.ArrowHelper(new THREE.Vector3(1, 0, 0), origin, 1, 0xef4444, 0.2, 0.1);
    this.baseVectors.push({ arrow: iHat, initDir: new THREE.Vector3(1, 0, 0), currentDir: new THREE.Vector3(1, 0, 0) });
    this.scene.add(iHat);

    // j-hat (Green)
    const jHat = new THREE.ArrowHelper(new THREE.Vector3(0, 1, 0), origin, 1, 0x10b981, 0.2, 0.1);
    this.baseVectors.push({ arrow: jHat, initDir: new THREE.Vector3(0, 1, 0), currentDir: new THREE.Vector3(0, 1, 0) });
    this.scene.add(jHat);

    if (dim === 3) {
      // k-hat (Blue)
      const kHat = new THREE.ArrowHelper(new THREE.Vector3(0, 0, 1), origin, 1, 0x3b82f6, 0.2, 0.1);
      this.baseVectors.push({ arrow: kHat, initDir: new THREE.Vector3(0, 0, 1), currentDir: new THREE.Vector3(0, 0, 1) });
      this.scene.add(kHat);
    }

    // Custom vector (yellow/orange)
    if (this.customVectorArrow) {
       this.scene.remove(this.customVectorArrow);
    }
    this.customVectorArrow = new THREE.ArrowHelper(new THREE.Vector3(1,1,0).normalize(), origin, 0, 0xfacc15, 0.2, 0.1);
    this.customVectorArrow.visible = false;
    this.scene.add(this.customVectorArrow);

    // Determinant polygon (blue overlay)
    if (this.detPolygon) {
       this.scene.remove(this.detPolygon);
    }
    const detMat = new THREE.MeshBasicMaterial({ color: 0x3b82f6, transparent: true, opacity: 0.3, side: THREE.DoubleSide });
    const detGeo = new THREE.BufferGeometry();
    const vertices = new Float32Array([0,0,0, 1,0,0, 1,1,0, 0,0,0, 1,1,0, 0,1,0]); // 2 triangles
    detGeo.setAttribute('position', new THREE.BufferAttribute(vertices, 3));
    this.detPolygon = new THREE.Mesh(detGeo, detMat);
    this.detPolygon.visible = false;
    this.scene.add(this.detPolygon);
  }

  transform(matrixA, dim, operation = 'transform', vectorX = null, duration = 1500) {
    if (this.animationId) cancelAnimationFrame(this.animationId);

    const mat = Object.values(matrixA);
    const m = new THREE.Matrix4();
    if (dim === 2) {
      m.set(
        mat[0][0], mat[0][1], 0, 0,
        mat[1][0], mat[1][1], 0, 0,
        0,         0,         1, 0,
        0,         0,         0, 1
      );
    } else {
      m.set(
        mat[0][0], mat[0][1], mat[0][2], 0,
        mat[1][0], mat[1][1], mat[1][2], 0,
        mat[2][0], mat[2][1], mat[2][2], 0,
        0,         0,         0,         1
      );
    }

    console.log("Starting transform with matrix:", m.elements);

    const startVertices = this.currentGridMesh.geometry.attributes.position.array.slice();
    const endVertices = this.originalGridVertices.map((val, i) => {
      // Every 3 values represents [x, y, z]
      return val; 
    });

    // Compute end vertices for grid 
    for (let i = 0; i < this.originalGridVertices.length; i += 3) {
      const v = new THREE.Vector3(
        this.originalGridVertices[i],
        this.originalGridVertices[i+1],
        this.originalGridVertices[i+2]
      );
      v.applyMatrix4(m);
      endVertices[i] = v.x;
      endVertices[i+1] = v.y;
      endVertices[i+2] = v.z;
    }

    const startDirs = this.baseVectors.map((v) => v.currentDir.clone());
    const endDirs = this.baseVectors.map((v) => {
        const cloned = v.initDir.clone();
        cloned.applyMatrix4(m);
        return cloned;
    });

    let customVectorStartDir, customVectorEndDir;
    
    if (operation === 'apply_vector' && vectorX) {
      this.customVectorArrow.visible = true;
      const vx = parseFloat(vectorX[0]) || 0;
      const vy = parseFloat(vectorX[1]) || 0;
      const vz = dim === 3 ? (parseFloat(vectorX[2]) || 0) : 0;
      
      const v = new THREE.Vector3(vx, vy, vz);
      customVectorStartDir = v.clone();
      
      const vEnd = v.clone().applyMatrix4(m);
      customVectorEndDir = vEnd;
    } else {
      this.customVectorArrow.visible = false;
    }

    if (operation === 'det' && dim === 2) {
      this.detPolygon.visible = true;
    } else {
      this.detPolygon.visible = false;
    }

    const startTime = Date.now();

    const animate = () => {
      const now = Date.now();
      const progress = Math.min((now - startTime) / duration, 1.0);
      
      // Easing function (easeOutCubic)
      const e = 1 - Math.pow(1 - progress, 3);

      // Interpolate Grid
      const positions = this.currentGridMesh.geometry.attributes.position.array;
      for (let i = 0; i < positions.length; i++) {
        positions[i] = startVertices[i] + (endVertices[i] - startVertices[i]) * e;
      }
      this.currentGridMesh.geometry.attributes.position.needsUpdate = true;

      // Interpolate Vectors
      this.baseVectors.forEach((b, idx) => {
        const currDir = new THREE.Vector3().lerpVectors(startDirs[idx], endDirs[idx], e);
        const len = currDir.length();
        if (len > 0.0001) {
            const normalized = currDir.clone().normalize();
            b.arrow.setDirection(normalized);
            b.arrow.setLength(len, 0.2, 0.1);
            b.currentDir = currDir.clone();
        } else {
             b.arrow.setLength(0.0001); // Avoid length 0 error
             b.currentDir = currDir.clone();
        }
      });

      if (operation === 'det' && dim === 2) {
        const iVec = new THREE.Vector3().lerpVectors(startDirs[0], endDirs[0], e);
        const jVec = new THREE.Vector3().lerpVectors(startDirs[1], endDirs[1], e);
        const sumVec = new THREE.Vector3().addVectors(iVec, jVec);
        
        const pos = this.detPolygon.geometry.attributes.position.array;
        // Triangle 1: (0,0), i, i+j
        pos[0]=0; pos[1]=0; pos[2]=0;
        pos[3]=iVec.x; pos[4]=iVec.y; pos[5]=iVec.z;
        pos[6]=sumVec.x; pos[7]=sumVec.y; pos[8]=sumVec.z;
        // Triangle 2: (0,0), i+j, j
        pos[9]=0; pos[10]=0; pos[11]=0;
        pos[12]=sumVec.x; pos[13]=sumVec.y; pos[14]=sumVec.z;
        pos[15]=jVec.x; pos[16]=jVec.y; pos[17]=jVec.z;
        this.detPolygon.geometry.attributes.position.needsUpdate = true;
      }

      if (operation === 'apply_vector' && this.customVectorArrow.visible) {
        const currV = new THREE.Vector3().lerpVectors(customVectorStartDir, customVectorEndDir, e);
        const l = currV.length();
        if(l > 0.0001) {
           this.customVectorArrow.setDirection(currV.clone().normalize());
           this.customVectorArrow.setLength(l, 0.2, 0.1);
        } else {
           this.customVectorArrow.setLength(0.0001);
        }
      }

      this.render();

      if (progress < 1.0) {
        this.animationId = requestAnimationFrame(animate);
      } else {
        console.log("Animation completed.");
      }
    };

    console.log("Starting animation loop.");
    animate();
  }

  // Allow resetting immediately to base grid
  reset(dim) {
    if (this.animationId) cancelAnimationFrame(this.animationId);
    this.dim = dim;
    this.setCameraPosition(dim);
    this.initGrid(10, dim);
    this.initVectors(dim);
    this.render();
  }

  render() {
    this.renderer.render(this.scene, this.camera);
  }

  cleanup() {
    if (this.animationId) cancelAnimationFrame(this.animationId);
    window.removeEventListener('resize', this.handleResize);
    this.controls.dispose();
    this.renderer.dispose();
  }
}
