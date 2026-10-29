import { BufferAttribute, BufferGeometry, RawShaderMaterial } from 'three'

/** M2's accepted 24 × 16 topology, kept here as the sole production primitive. */
export function sphereGeometry(): BufferGeometry {
  const positions: number[] = []
  const normals: number[] = []
  const indices: number[] = []
  for (let y = 0; y <= 16; y++) {
    const phi = (Math.PI * y) / 16
    for (let x = 0; x <= 24; x++) {
      const theta = (2 * Math.PI * x) / 24
      const normal = [
        Math.sin(phi) * Math.cos(theta),
        Math.cos(phi),
        Math.sin(phi) * Math.sin(theta)
      ]
      positions.push(...normal)
      normals.push(...normal)
    }
  }
  for (let y = 0; y < 16; y++) {
    for (let x = 0; x < 24; x++) {
      const a = y * 25 + x
      const b = a + 25
      if (y > 0) indices.push(a, a + 1, b)
      if (y < 15) indices.push(a + 1, b + 1, b)
    }
  }
  return geometry(positions, normals, indices)
}

/** Unit-height, radius-one, 16-sided capped cylinder along the positive y axis. */
export function cylinderGeometry(): BufferGeometry {
  const positions: number[] = []
  const normals: number[] = []
  const indices: number[] = []
  for (let segment = 0; segment <= 16; segment++) {
    const angle = (2 * Math.PI * segment) / 16
    const x = Math.cos(angle)
    const z = Math.sin(angle)
    positions.push(x, -0.5, z, x, 0.5, z)
    normals.push(x, 0, z, x, 0, z)
    if (segment < 16) {
      const a = segment * 2
      indices.push(a, a + 1, a + 2, a + 1, a + 3, a + 2)
    }
  }
  for (const y of [-0.5, 0.5]) {
    const center = positions.length / 3
    positions.push(0, y, 0)
    normals.push(0, Math.sign(y), 0)
    for (let segment = 0; segment <= 16; segment++) {
      const angle = (2 * Math.PI * segment) / 16
      positions.push(Math.cos(angle), y, Math.sin(angle))
      normals.push(0, Math.sign(y), 0)
      if (segment < 16) {
        const a = center + 1 + segment
        if (y < 0) indices.push(center, a, a + 1)
        else indices.push(center, a + 1, a)
      }
    }
  }
  return geometry(positions, normals, indices)
}

function geometry(positions: number[], normals: number[], indices: number[]): BufferGeometry {
  const result = new BufferGeometry()
  result.setAttribute('position', new BufferAttribute(new Float32Array(positions), 3))
  result.setAttribute('normal', new BufferAttribute(new Float32Array(normals), 3))
  result.setIndex(new BufferAttribute(new Uint16Array(indices), 1))
  result.computeBoundingBox()
  result.computeBoundingSphere()
  return result
}

/** Colors are already linear RGB. No tone mapping or second color conversion is applied. */
export function instanceMaterial(highlight = false): RawShaderMaterial {
  return new RawShaderMaterial({
    vertexShader: `
precision highp float;
attribute vec3 position;
attribute vec3 normal;
attribute mat4 instanceMatrix;
attribute vec3 instanceColor;
uniform mat4 modelMatrix;
uniform mat4 viewMatrix;
uniform mat4 projectionMatrix;
varying vec3 vColor;
varying vec3 vNormal;
void main() {
  mat3 basis = mat3(instanceMatrix);
  vec3 scaleSquared = vec3(dot(basis[0], basis[0]), dot(basis[1], basis[1]), dot(basis[2], basis[2]));
  vNormal = normalize(mat3(modelMatrix) * basis * (normal / max(scaleSquared, vec3(1e-20))));
  vColor = instanceColor;
  gl_Position = projectionMatrix * viewMatrix * modelMatrix * instanceMatrix * vec4(position, 1.0);
}`,
    fragmentShader: `
precision highp float;
varying vec3 vColor;
varying vec3 vNormal;
void main() {
  vec3 light = normalize(vec3(-0.4, 0.8, 1.0));
  float intensity = 0.25 + 0.75 * max(dot(normalize(vNormal), light), 0.0);
  gl_FragColor = vec4(vColor * intensity, 1.0);
}`,
    depthTest: !highlight,
    depthWrite: !highlight,
    transparent: false,
    toneMapped: false,
    wireframe: highlight
  })
}
