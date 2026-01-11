// Selection Compute Shader
// Pass 1: Count vertices inside selection
// Pass 2: Write selected vertex positions

struct SelectionQuad {
    p0: vec2<f32>,
    p1: vec2<f32>,
    p2: vec2<f32>,
    p3: vec2<f32>,
    enabled: f32,
    time: f32,
    _pad2: f32,
    _pad3: f32,
};

// Vertex struct matching TERRAIN_BUFFER_LAYOUT (8 floats)
// position (3) + normal (3) + uv (2)
struct Vertex {
    px: f32,  // position.x
    py: f32,  // position.y
    pz: f32,  // position.z
    nx: f32,  // normal.x
    ny: f32,  // normal.y
    nz: f32,  // normal.z
    u: f32,   // texcoord.u
    v: f32,   // texcoord.v
};

struct CountBuffer {
    count: atomic<u32>,
};

struct OutputVertex {
    x: f32,
    y: f32,
    z: f32,
};

// Bindings
@group(0) @binding(0) var<uniform> selection: SelectionQuad;
@group(0) @binding(1) var<storage, read> vertices: array<Vertex>;
@group(0) @binding(2) var<storage, read_write> countBuffer: CountBuffer;
@group(0) @binding(3) var<storage, read_write> outputVertices: array<OutputVertex>;

// ========== Point-in-triangle functions ==========

fn sign2D(p1: vec2<f32>, p2: vec2<f32>, p3: vec2<f32>) -> f32 {
    return (p1.x - p3.x) * (p2.y - p3.y) - (p2.x - p3.x) * (p1.y - p3.y);
}

fn pointInTriangle(pt: vec2<f32>, v1: vec2<f32>, v2: vec2<f32>, v3: vec2<f32>) -> bool {
    let d1 = sign2D(pt, v1, v2);
    let d2 = sign2D(pt, v2, v3);
    let d3 = sign2D(pt, v3, v1);
    
    let hasNeg = (d1 < 0.0) || (d2 < 0.0) || (d3 < 0.0);
    let hasPos = (d1 > 0.0) || (d2 > 0.0) || (d3 > 0.0);
    
    return !(hasNeg && hasPos);
}

fn isInsideSelection(pt: vec2<f32>) -> bool {
    if (selection.enabled < 0.5) {
        return false;
    }
    
    let inTri1 = pointInTriangle(pt, selection.p0, selection.p1, selection.p2);
    let inTri2 = pointInTriangle(pt, selection.p0, selection.p2, selection.p3);
    
    return inTri1 || inTri2;
}

// ========== Slope calculation ==========

const MAX_SLOPE_DEGREES: f32 = 15.0;  // Maximum allowed slope for panel placement
const PI: f32 = 3.14159265;

// Calculate slope angle from normal (degrees)
fn getSlopeAngle(nx: f32, ny: f32, nz: f32) -> f32 {
    // normal.z = cos(angle) for ground plane XY, height Z
    let cosAngle = clamp(abs(nz), 0.0, 1.0);
    return acos(cosAngle) * (180.0 / PI);
}

// Check if vertex is suitable for panel placement
fn isValidForPanel(vertex: Vertex) -> bool {
    let pt = vec2<f32>(vertex.px, vertex.py);
    
    // Must be inside selection
    if (!isInsideSelection(pt)) {
        return false;
    }
    
    // Must have acceptable slope (≤10°)
    let slopeAngle = getSlopeAngle(vertex.nx, vertex.ny, vertex.nz);
    if (slopeAngle > MAX_SLOPE_DEGREES) {
        return false;
    }
    
    return true;
}

// ========== Pass 1: Count ==========

@compute @workgroup_size(256)
fn count_main(@builtin(global_invocation_id) global_id: vec3<u32>) {
    let idx = global_id.x;
    let vertexCount = arrayLength(&vertices);
    
    if (idx >= vertexCount) {
        return;
    }
    
    let vertex = vertices[idx];
    
    if (isValidForPanel(vertex)) {
        atomicAdd(&countBuffer.count, 1u);
    }
}

// ========== Pass 2: Write ==========

@compute @workgroup_size(256)
fn write_main(@builtin(global_invocation_id) global_id: vec3<u32>) {
    let idx = global_id.x;
    let vertexCount = arrayLength(&vertices);
    
    if (idx >= vertexCount) {
        return;
    }
    
    let vertex = vertices[idx];
    
    if (isValidForPanel(vertex)) {
        let writeIdx = atomicAdd(&countBuffer.count, 1u);
        outputVertices[writeIdx] = OutputVertex(vertex.px, vertex.py, vertex.pz);
    }
}

